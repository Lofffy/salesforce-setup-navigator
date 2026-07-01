import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVELOPER_CONSOLE_PATH,
  devConsoleSupportsType,
  developerConsolePath,
  escapeSoql,
  isValidApiName,
  parseApiName,
  resolveTarget,
} from '../src/salesforce/urlBuilder';
import { MetadataRef, MetadataType } from '../src/metadata/types';
import { SfRecord, ToolingQuery } from '../src/salesforce/types';

/** Builds a mock Tooling query that returns canned ids and records every SOQL it sees. */
function mockQuery(handler: (soql: string) => SfRecord[]): { query: ToolingQuery; seen: string[] } {
  const seen: string[] = [];
  const query: ToolingQuery = async (soql: string) => {
    seen.push(soql);
    return handler(soql);
  };
  return { query, seen };
}

test('escapeSoql escapes quotes and backslashes', () => {
  assert.equal(escapeSoql("O'Brien"), "O\\'Brien");
  assert.equal(escapeSoql('a\\b'), 'a\\\\b');
});

test('isValidApiName accepts api names and rejects junk', () => {
  assert.equal(isValidApiName('Customer_Status__c'), true);
  assert.equal(isValidApiName('ns__Field__c'), true);
  assert.equal(isValidApiName("bad'name"), false);
  assert.equal(isValidApiName(undefined), false);
});

test('Apex Class resolves to an address-wrapped Setup path', async () => {
  const ref: MetadataRef = {
    type: MetadataType.ApexClass,
    name: 'AccountService',
    filePath: 'classes/AccountService.cls',
  };
  const { query } = mockQuery(() => [{ Id: '01p000000000001' }]);
  const target = await resolveTarget(ref, query);
  assert.deepEqual(target.open, {
    path: '/lightning/setup/ApexClasses/page?address=%2F01p000000000001',
  });
  assert.equal(target.exact, true);
});

test('Apex Class falls back to the list page when not found', async () => {
  const ref: MetadataRef = {
    type: MetadataType.ApexClass,
    name: 'Missing',
    filePath: 'classes/Missing.cls',
  };
  const { query } = mockQuery(() => []);
  const target = await resolveTarget(ref, query);
  assert.deepEqual(target.open, { path: '/lightning/setup/ApexClasses/home' });
  assert.equal(target.exact, false);
});

test('Custom Object resolves without any query', async () => {
  const ref: MetadataRef = {
    type: MetadataType.CustomObject,
    name: 'Invoice__c',
    objectApiName: 'Invoice__c',
    filePath: 'objects/Invoice__c/Invoice__c.object-meta.xml',
  };
  const { query, seen } = mockQuery(() => {
    throw new Error('should not query for a custom object');
  });
  const target = await resolveTarget(ref, query);
  assert.deepEqual(target.open, { path: '/lightning/setup/ObjectManager/Invoice__c/Details/view' });
  assert.equal(target.exact, true);
  assert.equal(seen.length, 0);
});

test('Custom Field on a standard object queries TableEnumOrId by name', async () => {
  const ref: MetadataRef = {
    type: MetadataType.CustomField,
    name: 'Customer_Status__c',
    objectApiName: 'Account',
    filePath: 'objects/Account/fields/Customer_Status__c.field-meta.xml',
  };
  const { query, seen } = mockQuery((soql) =>
    soql.includes('FROM CustomField') ? [{ Id: '00N000000000001' }] : [],
  );
  const target = await resolveTarget(ref, query);
  assert.deepEqual(target.open, {
    path: '/lightning/setup/ObjectManager/Account/FieldsAndRelationships/00N000000000001/view',
  });
  assert.equal(target.exact, true);
  // Standard object → single query, no CustomObject lookup.
  assert.equal(seen.length, 1);
  assert.match(seen[0], /TableEnumOrId = 'Account'/);
  assert.match(seen[0], /DeveloperName = 'Customer_Status'/);
});

test('parseApiName splits namespace, developer name, and suffix', () => {
  assert.deepEqual(parseApiName('Customer_Status__c'), { developerName: 'Customer_Status' });
  assert.deepEqual(parseApiName('ns__Region__c'), { namespace: 'ns', developerName: 'Region' });
  assert.deepEqual(parseApiName('Account'), { developerName: 'Account' });
  assert.deepEqual(parseApiName('Invoice__c'), { developerName: 'Invoice' });
});

test('Custom Field on a namespaced object resolves by bare developer name + namespace', async () => {
  const ref: MetadataRef = {
    type: MetadataType.CustomField,
    name: 'ns__Region__c',
    objectApiName: 'ns__Invoice__c',
    filePath: 'objects/ns__Invoice__c/fields/ns__Region__c.field-meta.xml',
  };
  const { query, seen } = mockQuery((soql) => {
    if (soql.includes('FROM CustomObject')) return [{ Id: '01I00000000000A' }];
    if (soql.includes('FROM CustomField')) return [{ Id: '00N00000000000B' }];
    return [];
  });
  const target = await resolveTarget(ref, query);
  assert.deepEqual(target.open, {
    path: '/lightning/setup/ObjectManager/ns__Invoice__c/FieldsAndRelationships/00N00000000000B/view',
  });
  assert.match(seen[0], /FROM CustomObject WHERE DeveloperName = 'Invoice' AND NamespacePrefix = 'ns'/);
  assert.match(seen[1], /DeveloperName = 'Region' AND NamespacePrefix = 'ns'/);
});

test('Custom Field on a custom object resolves the object id first', async () => {
  const ref: MetadataRef = {
    type: MetadataType.CustomField,
    name: 'Total__c',
    objectApiName: 'Invoice__c',
    filePath: 'objects/Invoice__c/fields/Total__c.field-meta.xml',
  };
  const { query, seen } = mockQuery((soql) => {
    if (soql.includes('FROM CustomObject')) return [{ Id: '01I000000000009' }];
    if (soql.includes('FROM CustomField')) return [{ Id: '00N000000000002' }];
    return [];
  });
  const target = await resolveTarget(ref, query);
  assert.deepEqual(target.open, {
    path: '/lightning/setup/ObjectManager/Invoice__c/FieldsAndRelationships/00N000000000002/view',
  });
  assert.equal(seen.length, 2);
  assert.match(seen[0], /FROM CustomObject WHERE DeveloperName = 'Invoice'/);
  assert.match(seen[1], /TableEnumOrId = '01I000000000009'/);
});

test('Validation Rule resolves under Object Manager', async () => {
  const ref: MetadataRef = {
    type: MetadataType.ValidationRule,
    name: 'Require_Email',
    objectApiName: 'Account',
    filePath: 'objects/Account/validationRules/Require_Email.validationRule-meta.xml',
  };
  const { query, seen } = mockQuery(() => [{ Id: '03d000000000001' }]);
  const target = await resolveTarget(ref, query);
  assert.deepEqual(target.open, {
    path: '/lightning/setup/ObjectManager/Account/ValidationRules/03d000000000001/view',
  });
  assert.match(seen[0], /EntityDefinition\.QualifiedApiName = 'Account'/);
  assert.match(seen[0], /ValidationName = 'Require_Email'/);
});

test('developerConsolePath deep-links a specific Apex class (with name hint)', () => {
  const ref: MetadataRef = { type: MetadataType.ApexClass, name: 'AccountService', filePath: 'x.cls' };
  assert.equal(
    developerConsolePath(ref, '01p000000000001'),
    '/_ui/common/apex/debug/ApexCSIPage?action=openFile&extent=ApexClass&Id=01p000000000001&name=AccountService',
  );
});

test('developerConsolePath uses the right extent for triggers and Visualforce', () => {
  const trigger: MetadataRef = { type: MetadataType.ApexTrigger, name: 'AccTrg', filePath: 'x.trigger' };
  const page: MetadataRef = { type: MetadataType.VisualforcePage, name: 'AccPage', filePath: 'x.page' };
  assert.match(developerConsolePath(trigger, '01q1'), /extent=ApexTrigger&Id=01q1&name=AccTrg$/);
  assert.match(developerConsolePath(page, '0661'), /extent=ApexPage&Id=0661&name=AccPage$/);
});

test('developerConsolePath falls back to the plain console without an id or for unsupported types', () => {
  assert.equal(developerConsolePath(), DEVELOPER_CONSOLE_PATH);
  const apex: MetadataRef = { type: MetadataType.ApexClass, name: 'X', filePath: 'x.cls' };
  assert.equal(developerConsolePath(apex, undefined), DEVELOPER_CONSOLE_PATH);
  const flow: MetadataRef = { type: MetadataType.Flow, name: 'F', filePath: 'f.flow-meta.xml' };
  assert.equal(developerConsolePath(flow, '300x'), DEVELOPER_CONSOLE_PATH);
});

test('devConsoleSupportsType covers apex/trigger/Visualforce only', () => {
  assert.equal(devConsoleSupportsType(MetadataType.ApexClass), true);
  assert.equal(devConsoleSupportsType(MetadataType.ApexTrigger), true);
  assert.equal(devConsoleSupportsType(MetadataType.VisualforcePage), true);
  assert.equal(devConsoleSupportsType(MetadataType.Flow), false);
  assert.equal(devConsoleSupportsType(MetadataType.CustomField), false);
});

test('Flow opens via source file, with a Flows list copy path', async () => {
  const ref: MetadataRef = {
    type: MetadataType.Flow,
    name: 'Create_Case',
    filePath: 'flows/Create_Case.flow-meta.xml',
  };
  const { query, seen } = mockQuery(() => []);
  const target = await resolveTarget(ref, query);
  assert.deepEqual(target.open, { sourceFile: 'flows/Create_Case.flow-meta.xml' });
  assert.equal(target.copyPath, '/lightning/setup/Flows/home');
  assert.equal(seen.length, 0);
});
