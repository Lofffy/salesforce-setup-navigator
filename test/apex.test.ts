import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isApexTestClass } from '../src/apex/detect';
import { commaList, coverageRelevance, formatTestRun, testBaseName } from '../src/apex/results';
import { ApexTestRunResult } from '../src/apex/types';

test('isApexTestClass detects @isTest (any casing) and legacy testMethod', () => {
  assert.equal(isApexTestClass('@isTest\npublic class FooTest {}'), true);
  assert.equal(isApexTestClass('@IsTest private class Bar {}'), true);
  assert.equal(isApexTestClass('public class Baz {\n  static testMethod void t() {}\n}'), true);
  assert.equal(isApexTestClass('public class Service {\n  void run() {}\n}'), false);
});

test('commaList joins class names', () => {
  assert.equal(commaList(['AccountTest', 'CaseTest']), 'AccountTest,CaseTest');
  assert.equal(commaList(['OnlyOne']), 'OnlyOne');
});

test('formatTestRun summarizes results, failures, and coverage', () => {
  const result: ApexTestRunResult = {
    summary: {
      outcome: 'Failed',
      testsRan: 2,
      passing: 1,
      failing: 1,
      testTotalTime: '1.23 s',
      orgWideCoverage: '82%',
      testRunId: '707000000000001',
    },
    tests: [
      { Outcome: 'Pass', MethodName: 'testOk', FullName: 'AccountTest.testOk', ApexClass: { Name: 'AccountTest' } },
      {
        Outcome: 'Fail',
        MethodName: 'testBad',
        FullName: 'AccountTest.testBad',
        Message: 'System.AssertException: expected 1 was 2',
        StackTrace: 'Class.AccountTest.testBad: line 10, column 1',
        ApexClass: { Name: 'AccountTest' },
      },
    ],
    coverage: { coverage: [{ name: 'AccountService', coveredPercent: 75, totalLines: 40, totalCovered: 30 }] },
  };

  const { summaryLine, detail } = formatTestRun(result, ['AccountTest']);
  assert.equal(summaryLine, 'Failed: 1 passed, 1 failed (2 tests)');
  assert.match(detail, /Selected classes : AccountTest/);
  assert.match(detail, /✖ AccountTest\.testBad/);
  assert.match(detail, /expected 1 was 2/);
  assert.match(detail, /75%\s+AccountService \(30\/40 lines\)/);
  assert.match(detail, /Org-wide coverage: 82%/);
});

test('testBaseName strips test prefixes/suffixes', () => {
  assert.equal(testBaseName('AccountSelectorTest'), 'accountselector');
  assert.equal(testBaseName('TestAccountSelector'), 'accountselector');
  assert.equal(testBaseName('Account_Selector_Test'), 'accountselector');
});

test('coverageRelevance ranks class-under-test, then near matches, then unrelated', () => {
  const bases = [testBaseName('AccountSelectorTest')];
  assert.equal(coverageRelevance('AccountSelector', bases), 3); // exact class under test
  assert.equal(coverageRelevance('AccountsSelector', bases), 1); // plural/near variant
  assert.equal(coverageRelevance('ContactTrigger', bases), 0); // unrelated
});

test('formatTestRun lists classes under test before other coverage', () => {
  const result: ApexTestRunResult = {
    summary: { outcome: 'Passed', testsRan: 1, passing: 1, failing: 0 },
    tests: [{ Outcome: 'Pass', FullName: 'AccountSelectorTest.t' }],
    coverage: [
      { name: 'ZContactService', coveredPercent: 95 },
      { name: 'AccountsSelector', coveredPercent: 70 },
      { name: 'AccountSelector', coveredPercent: 88 },
    ],
  };
  const { detail } = formatTestRun(result, ['AccountSelectorTest']);
  const relatedHeader = detail.indexOf('classes under test');
  const otherHeader = detail.indexOf('Other code coverage');
  assert.ok(relatedHeader >= 0 && otherHeader > relatedHeader, 'related section precedes other section');
  assert.ok(detail.indexOf('AccountsSelector') < otherHeader, 'near-match listed under "classes under test"');
  assert.ok(detail.indexOf('ZContactService') > otherHeader, 'unrelated class listed under "other"');
});

test('formatTestRun handles coverage given as a bare array and computes counts from tests', () => {
  const result: ApexTestRunResult = {
    tests: [
      { Outcome: 'Pass', FullName: 'A.t1' },
      { Outcome: 'Pass', FullName: 'A.t2' },
    ],
    coverage: [{ name: 'A', coveredPercent: 100 }],
  };
  const { summaryLine, detail } = formatTestRun(result, ['A']);
  assert.equal(summaryLine, 'Passed: 2 passed, 0 failed (2 tests)');
  assert.match(detail, /100%\s+A/);
});
