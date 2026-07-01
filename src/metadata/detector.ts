import { MetadataRef, MetadataType } from './types';

/**
 * Detects the Salesforce metadata type and identifying names from a file path,
 * using standard Salesforce DX source-format conventions.
 *
 * This module is intentionally free of any `vscode` dependency so it can be unit tested
 * and reused outside the extension host. Path separators are normalised so it works on
 * both POSIX and Windows-style paths.
 */
export function detectMetadata(filePath: string): MetadataRef | undefined {
  const segments = segmentsOf(filePath);
  const base = segments[segments.length - 1] ?? '';
  if (!base) {
    return undefined;
  }

  // Apex Class — classes/{Name}.cls (+ optional .cls-meta.xml sidecar)
  if (base.endsWith('.cls')) {
    return { type: MetadataType.ApexClass, name: stripEnd(base, '.cls'), filePath };
  }
  if (base.endsWith('.cls-meta.xml')) {
    return { type: MetadataType.ApexClass, name: stripEnd(base, '.cls-meta.xml'), filePath };
  }

  // Apex Trigger — triggers/{Name}.trigger (+ optional .trigger-meta.xml sidecar)
  if (base.endsWith('.trigger')) {
    return { type: MetadataType.ApexTrigger, name: stripEnd(base, '.trigger'), filePath };
  }
  if (base.endsWith('.trigger-meta.xml')) {
    return { type: MetadataType.ApexTrigger, name: stripEnd(base, '.trigger-meta.xml'), filePath };
  }

  // Visualforce Page — pages/{Name}.page (+ optional .page-meta.xml sidecar)
  if (base.endsWith('.page')) {
    return { type: MetadataType.VisualforcePage, name: stripEnd(base, '.page'), filePath };
  }
  if (base.endsWith('.page-meta.xml')) {
    return { type: MetadataType.VisualforcePage, name: stripEnd(base, '.page-meta.xml'), filePath };
  }

  // Flow — flows/{Name}.flow-meta.xml
  if (base.endsWith('.flow-meta.xml')) {
    return { type: MetadataType.Flow, name: stripEnd(base, '.flow-meta.xml'), filePath };
  }

  // Custom Object — objects/{Object}/{Object}.object-meta.xml
  if (base.endsWith('.object-meta.xml')) {
    const name = stripEnd(base, '.object-meta.xml');
    return { type: MetadataType.CustomObject, name, objectApiName: name, filePath };
  }

  // Custom Field — objects/{Object}/fields/{Field}.field-meta.xml
  if (base.endsWith('.field-meta.xml')) {
    const objectApiName = objectFromContainer(segments, 'fields');
    if (!objectApiName) {
      return undefined;
    }
    return {
      type: MetadataType.CustomField,
      name: stripEnd(base, '.field-meta.xml'),
      objectApiName,
      filePath,
    };
  }

  // Validation Rule — objects/{Object}/validationRules/{Rule}.validationRule-meta.xml
  if (base.endsWith('.validationRule-meta.xml')) {
    const objectApiName = objectFromContainer(segments, 'validationRules');
    if (!objectApiName) {
      return undefined;
    }
    return {
      type: MetadataType.ValidationRule,
      name: stripEnd(base, '.validationRule-meta.xml'),
      objectApiName,
      filePath,
    };
  }

  return undefined;
}

/**
 * Recognises files that are clearly Salesforce metadata but are not in the MVP scope,
 * so the UI can show "not supported yet" instead of "could not detect".
 */
const UNSUPPORTED_SUFFIXES = [
  '.layout-meta.xml',
  '.flexipage-meta.xml',
  '.permissionset-meta.xml',
  '.permissionsetgroup-meta.xml',
  '.profile-meta.xml',
  '.labels-meta.xml',
  '.resource-meta.xml',
  '.md-meta.xml',
  '.email-meta.xml',
  '.report-meta.xml',
  '.dashboard-meta.xml',
  '.approvalProcess-meta.xml',
  '.quickAction-meta.xml',
  '.tab-meta.xml',
  '.app-meta.xml',
  '.recordType-meta.xml',
  '.listView-meta.xml',
  '.webLink-meta.xml',
  '.fieldSet-meta.xml',
  '.compactLayout-meta.xml',
  '.namedCredential-meta.xml',
  '.remoteSiteSetting-meta.xml',
  '.queue-meta.xml',
  '.group-meta.xml',
];

export function looksLikeUnsupportedMetadata(filePath: string): boolean {
  const base = segmentsOf(filePath).pop() ?? '';
  return UNSUPPORTED_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

function segmentsOf(filePath: string): string[] {
  return filePath.split(/[\\/]/).filter((segment) => segment.length > 0);
}

function stripEnd(value: string, suffix: string): string {
  return value.slice(0, value.length - suffix.length);
}

/**
 * For an object-scoped path like `objects/{Object}/{container}/{file}`, returns `{Object}`,
 * i.e. the folder segment immediately before the named container folder.
 */
function objectFromContainer(segments: string[], container: string): string | undefined {
  const idx = segments.lastIndexOf(container);
  if (idx >= 1) {
    return segments[idx - 1];
  }
  return undefined;
}
