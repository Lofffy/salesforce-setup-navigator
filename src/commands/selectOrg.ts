import * as vscode from 'vscode';
import * as cli from '../salesforce/cli';
import { getCliPath, promptSelectOrg } from '../org/orgManager';
import { logError } from '../util/log';
import { cwdFor, resolveTargetUri } from './shared';

export function registerSelectOrg(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'salesforceSetupNavigator.selectOrg',
    async (arg?: unknown) => {
      const cliPath = getCliPath();
      const cwd = cwdFor(resolveTargetUri(arg));

      if (!(await cli.isCliAvailable(cliPath, cwd))) {
        vscode.window.showErrorMessage('Salesforce CLI is not available.');
        return;
      }

      try {
        await promptSelectOrg(cliPath, cwd);
      } catch (error) {
        logError('selectOrg', error);
        vscode.window.showErrorMessage('Could not list Salesforce orgs.');
      }
    },
  );
}
