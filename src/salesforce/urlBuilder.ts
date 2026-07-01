import { MetadataRef, MetadataType } from '../metadata/types';
import { SfRecord, ToolingQuery } from './types';

/**
 * Builds the relative Salesforce Setup path for a piece of metadata, performing any
 * required Tooling-API id lookups through an injected `query` function.
 *
 * This module is free of `vscode` and Node process dependencies so it is unit-testable:
 * the id lookups are supplied via the `ToolingQuery` callback.
 */
export interface ResolvedTarget {
  /** How to open the page: either by handing a source file to `sf org open -f`, or by a URL path. */
  open: { sourceFile: string } | { path: string };
  /** A relative Setup path suitable for "Copy Setup URL" (always present, may be a list page). */
  copyPath: string;
  /** True when the exact item was resolved; false when we fell back to a list/home page. */
  exact: boolean;
}

const API_NAME_RE = /^[A-Za-z0-9_]+$/;

export function isValidApiName(name: string | undefined): boolean {
  return !!name && API_NAME_RE.test(name);
}

/** Escapes a value for safe inclusion inside a SOQL single-quoted string literal. */
export function escapeSoql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Wraps a record id into the classic-in-Lightning Setup `page?address=` form. */
function addressOf(id: string): string {
  return `page?address=${encodeURIComponent('/' + id)}`;
}

/**
 * Pure mapping from a metadata ref (+ optionally a resolved record id) to a relative Setup path.
 * Returns the exact `path` when it can be built, plus a `fallback` list/home page.
 */
export function buildRelativePath(
  ref: MetadataRef,
  id?: string,
): { path?: string; fallback: string } {
  switch (ref.type) {
    case MetadataType.ApexClass:
      return {
        path: id ? `/lightning/setup/ApexClasses/${addressOf(id)}` : undefined,
        fallback: '/lightning/setup/ApexClasses/home',
      };
    case MetadataType.ApexTrigger:
      return {
        path: id ? `/lightning/setup/ApexTriggers/${addressOf(id)}` : undefined,
        fallback: '/lightning/setup/ApexTriggers/home',
      };
    case MetadataType.VisualforcePage:
      return {
        path: id ? `/lightning/setup/ApexPages/${addressOf(id)}` : undefined,
        fallback: '/lightning/setup/ApexPages/home',
      };
    case MetadataType.Flow:
      // Flow is opened via `sf org open -f` (Flow Builder); no stable Setup deep link.
      return { path: undefined, fallback: '/lightning/setup/Flows/home' };
    case MetadataType.CustomObject:
      return {
        path: `/lightning/setup/ObjectManager/${ref.objectApiName}/Details/view`,
        fallback: '/lightning/setup/ObjectManager/home',
      };
    case MetadataType.CustomField:
      return {
        path: id
          ? `/lightning/setup/ObjectManager/${ref.objectApiName}/FieldsAndRelationships/${id}/view`
          : undefined,
        fallback: `/lightning/setup/ObjectManager/${ref.objectApiName}/FieldsAndRelationships/view`,
      };
    case MetadataType.ValidationRule:
      return {
        path: id
          ? `/lightning/setup/ObjectManager/${ref.objectApiName}/ValidationRules/${id}/view`
          : undefined,
        fallback: `/lightning/setup/ObjectManager/${ref.objectApiName}/ValidationRules/view`,
      };
    default: {
      const exhaustive: never = ref.type;
      throw new Error(`Unsupported metadata type: ${String(exhaustive)}`);
    }
  }
}

/** Returns the single Tooling-API SOQL used to resolve a record id, or undefined when none is needed. */
export function toolingQueryFor(ref: MetadataRef): string | undefined {
  switch (ref.type) {
    case MetadataType.ApexClass:
      return `SELECT Id FROM ApexClass WHERE Name = '${escapeSoql(ref.name)}'`;
    case MetadataType.ApexTrigger:
      return `SELECT Id FROM ApexTrigger WHERE Name = '${escapeSoql(ref.name)}'`;
    case MetadataType.VisualforcePage:
      return `SELECT Id FROM ApexPage WHERE Name = '${escapeSoql(ref.name)}'`;
    case MetadataType.ValidationRule:
      return (
        `SELECT Id FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = ` +
        `'${escapeSoql(ref.objectApiName ?? '')}' AND ValidationName = '${escapeSoql(ref.name)}'`
      );
    default:
      return undefined;
  }
}

/** Relative path that opens the Salesforce Developer Console. */
export const DEVELOPER_CONSOLE_PATH = '/_ui/common/apex/debug/ApexCSIPage';

/**
 * Developer Console `extent` (entity) value per supported metadata type. The Developer Console
 * can open these file types directly; objects/fields/flows have no representation in it.
 */
const DEV_CONSOLE_EXTENT: Partial<Record<MetadataType, string>> = {
  [MetadataType.ApexClass]: 'ApexClass',
  [MetadataType.ApexTrigger]: 'ApexTrigger',
  [MetadataType.VisualforcePage]: 'ApexPage',
};

/** True if the Developer Console can open this metadata type as a file. */
export function devConsoleSupportsType(type: MetadataType): boolean {
  return DEV_CONSOLE_EXTENT[type] !== undefined;
}

/**
 * Builds a Developer Console URL. With a supported ref and a resolved record id, it deep-links to
 * open that file inside the console using the (unofficial) `ApexCSIPage?action=openFile` form;
 * otherwise it returns the path that simply opens the console.
 *
 * The `name` parameter is a best-effort hint for the file tab label: on a freshly-opened (cold)
 * console Salesforce can show the tab as `undefined.apxc` until it resolves the name from the id.
 * The param is undocumented and may be ignored, but it is harmless when it is.
 */
export function developerConsolePath(ref?: MetadataRef, id?: string): string {
  if (ref && id) {
    const extent = DEV_CONSOLE_EXTENT[ref.type];
    if (extent) {
      return (
        `${DEVELOPER_CONSOLE_PATH}?action=openFile&extent=${extent}` +
        `&Id=${encodeURIComponent(id)}&name=${encodeURIComponent(ref.name)}`
      );
    }
  }
  return DEVELOPER_CONSOLE_PATH;
}

/**
 * Splits a Salesforce API name into its optional namespace prefix and bare developer name,
 * dropping any custom suffix. In the Tooling API, `DeveloperName` is the bare name with NEITHER
 * the namespace prefix NOR the `__c`/`__r`/… suffix (the namespace lives in `NamespacePrefix`).
 *
 * Examples: `ns__Region__c` → { namespace: 'ns', developerName: 'Region' };
 * `Customer_Status__c` → { developerName: 'Customer_Status' }; `Account` → { developerName: 'Account' }.
 */
export function parseApiName(apiName: string): { namespace?: string; developerName: string } {
  const parts = apiName.split('__');
  // Drop a trailing custom-suffix token (lowercase, e.g. c, r, e, b, x, mdt).
  if (parts.length > 1 && /^[a-z]+$/.test(parts[parts.length - 1])) {
    parts.pop();
  }
  if (parts.length >= 2) {
    return { namespace: parts[0], developerName: parts.slice(1).join('__') };
  }
  return { developerName: parts[0] };
}

/** True when the object API name is a custom entity (ends with a `__x`-style suffix). */
function isCustomEntity(objectApiName: string): boolean {
  return /__[a-z]+$/i.test(objectApiName);
}

/** Builds a `DeveloperName = … [AND NamespacePrefix = …]` clause for a parsed API name. */
function developerNameClause(parsed: { namespace?: string; developerName: string }): string {
  const base = `DeveloperName = '${escapeSoql(parsed.developerName)}'`;
  return parsed.namespace ? `${base} AND NamespacePrefix = '${escapeSoql(parsed.namespace)}'` : base;
}

/**
 * Resolves a CustomField's record id, handling the Tooling-API gotchas that `TableEnumOrId`
 * is the object NAME for standard objects but the object's record id (`01I…`) for custom objects,
 * and that `DeveloperName` excludes both the trailing `__c` and any namespace prefix.
 */
async function resolveCustomFieldId(ref: MetadataRef, query: ToolingQuery): Promise<string | undefined> {
  const objectApiName = ref.objectApiName ?? '';
  const field = parseApiName(ref.name);

  let tableRef: string;
  if (isCustomEntity(objectApiName)) {
    const object = parseApiName(objectApiName);
    const objectRecords = await query(
      `SELECT Id FROM CustomObject WHERE ${developerNameClause(object)}`,
    );
    const objectId = recordId(objectRecords[0]);
    if (!objectId) {
      return undefined;
    }
    tableRef = objectId;
  } else {
    tableRef = objectApiName;
  }

  const fieldRecords = await query(
    `SELECT Id FROM CustomField WHERE TableEnumOrId = '${escapeSoql(tableRef)}' ` +
      `AND ${developerNameClause(field)}`,
  );
  return recordId(fieldRecords[0]);
}

function recordId(record: SfRecord | undefined): string | undefined {
  const id = record?.Id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Resolves the full open/copy target for a metadata ref. Tooling-API/CLI errors thrown by
 * `query` propagate to the caller; a query that simply returns no rows yields a graceful
 * fallback to the relevant Setup list page (`exact: false`).
 */
export async function resolveTarget(ref: MetadataRef, query: ToolingQuery): Promise<ResolvedTarget> {
  // Flow → open in Flow Builder via the local source file.
  if (ref.type === MetadataType.Flow) {
    const { fallback } = buildRelativePath(ref);
    return { open: { sourceFile: ref.filePath }, copyPath: fallback, exact: false };
  }

  // Custom Object → no id lookup required.
  if (ref.type === MetadataType.CustomObject) {
    const { path, fallback } = buildRelativePath(ref);
    const resolved = path ?? fallback;
    return { open: { path: resolved }, copyPath: resolved, exact: !!path };
  }

  // Everything else needs a record id.
  let id: string | undefined;
  if (ref.type === MetadataType.CustomField) {
    id = await resolveCustomFieldId(ref, query);
  } else {
    const soql = toolingQueryFor(ref);
    if (soql) {
      const records = await query(soql);
      id = recordId(records[0]);
    }
  }

  const { path, fallback } = buildRelativePath(ref, id);
  const resolved = path ?? fallback;
  return { open: { path: resolved }, copyPath: resolved, exact: !!path };
}
