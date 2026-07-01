import * as vscode from 'vscode';
import { isApexTestClass } from './detect';

/**
 * Scans the workspace for Apex test classes (`*.cls` files annotated `@isTest`) and returns
 * their class names, de-duplicated and sorted. Reads from local source — the source of truth
 * for a Salesforce DX project.
 */
export async function findTestClasses(): Promise<string[]> {
  const files = await vscode.workspace.findFiles('**/*.cls', '**/node_modules/**');
  const names = new Set<string>();
  await Promise.all(
    files.map(async (uri) => {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        if (isApexTestClass(text)) {
          const base = uri.path.split('/').pop() ?? '';
          if (base.endsWith('.cls')) {
            names.add(base.slice(0, -'.cls'.length));
          }
        }
      } catch {
        // Skip files that can't be read.
      }
    }),
  );
  return [...names].sort((a, b) => a.localeCompare(b));
}
