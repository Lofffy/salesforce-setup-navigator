import * as vscode from 'vscode';
import { detectMetadata } from '../metadata/detector';
import * as cli from '../salesforce/cli';
import {
  devConsoleSupportsType,
  developerConsolePath,
  toolingQueryFor as soqlForRef,
} from '../salesforce/urlBuilder';
import { ensureTargetOrg, getCliPath } from '../org/orgManager';
import { logError } from '../util/log';
import { cwdFor, resolveTargetUri } from './shared';

export function registerOpenDeveloperConsole(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'salesforceSetupNavigator.openDeveloperConsole',
    async (arg?: unknown) => {
      const uri = resolveTargetUri(arg);
      const cliPath = getCliPath();
      const cwd = cwdFor(uri);

      if (!(await cli.isCliAvailable(cliPath, cwd))) {
        vscode.window.showErrorMessage('Salesforce CLI is not available.');
        return;
      }
      const org = await ensureTargetOrg(cliPath, cwd);
      if (!org) {
        return;
      }

      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Opening Developer Console…' },
          async () => {
            const path = await resolveDeveloperConsolePath(uri, cliPath, org, cwd);
            await cli.openPath(cliPath, org, path, cwd);
          },
        );
      } catch (error) {
        logError('openDeveloperConsole', error);
        vscode.window.showErrorMessage('Failed to open the Developer Console.');
      }
    },
  );
}

/**
 * Builds a Developer Console URL that opens the selected Apex class/trigger/Visualforce page
 * when one is in context and its id resolves; otherwise opens the console itself.
 */
async function resolveDeveloperConsolePath(
  uri: vscode.Uri | undefined,
  cliPath: string,
  org: string,
  cwd: string,
): Promise<string> {
  if (!uri) {
    return developerConsolePath();
  }
  const ref = detectMetadata(uri.fsPath);
  if (!ref || !devConsoleSupportsType(ref.type)) {
    return developerConsolePath();
  }
  const soql = soqlForRef(ref);
  if (!soql) {
    return developerConsolePath();
  }
  const records = await cli.queryTooling(cliPath, org, soql, cwd);
  const id = typeof records[0]?.Id === 'string' ? records[0].Id : undefined;
  return developerConsolePath(ref, id);
}
