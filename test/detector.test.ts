import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMetadata, looksLikeUnsupportedMetadata } from '../src/metadata/detector';
import { MetadataType } from '../src/metadata/types';

const BASE = 'force-app/main/default';

test('detects Apex Class from .cls', () => {
  const ref = detectMetadata(`${BASE}/classes/AccountService.cls`);
  assert.equal(ref?.type, MetadataType.ApexClass);
  assert.equal(ref?.name, 'AccountService');
});

test('detects Apex Class from .cls-meta.xml sidecar', () => {
  const ref = detectMetadata(`${BASE}/classes/AccountService.cls-meta.xml`);
  assert.equal(ref?.type, MetadataType.ApexClass);
  assert.equal(ref?.name, 'AccountService');
});

test('detects Apex Trigger', () => {
  const ref = detectMetadata(`${BASE}/triggers/AccountTrigger.trigger`);
  assert.equal(ref?.type, MetadataType.ApexTrigger);
  assert.equal(ref?.name, 'AccountTrigger');
});

test('detects Visualforce Page', () => {
  const ref = detectMetadata(`${BASE}/pages/AccountSearch.page`);
  assert.equal(ref?.type, MetadataType.VisualforcePage);
  assert.equal(ref?.name, 'AccountSearch');
});

test('detects Flow', () => {
  const ref = detectMetadata(`${BASE}/flows/Create_Case.flow-meta.xml`);
  assert.equal(ref?.type, MetadataType.Flow);
  assert.equal(ref?.name, 'Create_Case');
});

test('detects Custom Object (object api name == folder name)', () => {
  const ref = detectMetadata(`${BASE}/objects/Invoice__c/Invoice__c.object-meta.xml`);
  assert.equal(ref?.type, MetadataType.CustomObject);
  assert.equal(ref?.name, 'Invoice__c');
  assert.equal(ref?.objectApiName, 'Invoice__c');
});

test('detects Custom Field and extracts parent object', () => {
  const ref = detectMetadata(`${BASE}/objects/Account/fields/Customer_Status__c.field-meta.xml`);
  assert.equal(ref?.type, MetadataType.CustomField);
  assert.equal(ref?.name, 'Customer_Status__c');
  assert.equal(ref?.objectApiName, 'Account');
});

test('detects Custom Field on a custom object', () => {
  const ref = detectMetadata(`${BASE}/objects/Invoice__c/fields/Total__c.field-meta.xml`);
  assert.equal(ref?.type, MetadataType.CustomField);
  assert.equal(ref?.name, 'Total__c');
  assert.equal(ref?.objectApiName, 'Invoice__c');
});

test('detects Validation Rule and extracts parent object', () => {
  const ref = detectMetadata(
    `${BASE}/objects/Account/validationRules/Require_Email.validationRule-meta.xml`,
  );
  assert.equal(ref?.type, MetadataType.ValidationRule);
  assert.equal(ref?.name, 'Require_Email');
  assert.equal(ref?.objectApiName, 'Account');
});

test('handles Windows-style separators', () => {
  const ref = detectMetadata('force-app\\main\\default\\classes\\AccountService.cls');
  assert.equal(ref?.type, MetadataType.ApexClass);
  assert.equal(ref?.name, 'AccountService');
});

test('returns undefined for unrelated files', () => {
  assert.equal(detectMetadata(`${BASE}/staticresources/logo.png`), undefined);
  assert.equal(detectMetadata('README.md'), undefined);
});

test('recognises known-but-unsupported metadata', () => {
  assert.equal(looksLikeUnsupportedMetadata(`${BASE}/layouts/Account-Account Layout.layout-meta.xml`), true);
  assert.equal(looksLikeUnsupportedMetadata(`${BASE}/permissionsets/Admin.permissionset-meta.xml`), true);
  assert.equal(looksLikeUnsupportedMetadata(`${BASE}/classes/AccountService.cls`), false);
});
