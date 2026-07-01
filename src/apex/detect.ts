/**
 * True if the Apex source is a test class — it carries the `@isTest` annotation (any casing) or
 * the legacy `testMethod` keyword. Pure (no `vscode` dependency) so it is unit-testable.
 */
export function isApexTestClass(source: string): boolean {
  return /@istest\b/i.test(source) || /\btestmethod\b/i.test(source);
}
