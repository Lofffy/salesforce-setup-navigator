import * as vscode from 'vscode';
import { detectMetadata } from '../metadata/detector';
import { MetadataType } from '../metadata/types';
import { findTestClasses } from '../apex/testClasses';
import { commaList, formatTestRun } from '../apex/results';
import * as cli from '../salesforce/cli';
import { ensureTargetOrg, getCliPath } from '../org/orgManager';
import { logError } from '../util/log';
import { showApexTestResults } from '../apex/resultsView';
import { cwdFor, resolveTargetUri } from './shared';

interface TestClassPick extends vscode.QuickPickItem {
  className: string;
}

export function registerRunApexTests(): vscode.Disposable {
  return vscode.commands.registerCommand('salesforceSetupNavigator.runApexTests', async (arg?: unknown) => {
    const uri = resolveTargetUri(arg);
    const cliPath = getCliPath();
    const cwd = cwdFor(uri);

    if (!(await cli.isCliAvailable(cliPath, cwd))) {
      vscode.window.showErrorMessage('Salesforce CLI is not available.');
      return;
    }

    const testClasses = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Finding Apex test classes…' },
      () => findTestClasses(),
    );
    if (testClasses.length === 0) {
      vscode.window.showInformationMessage('No Apex test classes found in this workspace.');
      return;
    }

    // Pre-select the class the command was invoked on, if it's one of the test classes.
    const invoked = uri ? detectMetadata(uri.fsPath) : undefined;
    const preselect =
      invoked?.type === MetadataType.ApexClass && testClasses.includes(invoked.name) ? invoked.name : undefined;

    const items: TestClassPick[] = testClasses.map((className) => ({
      label: className,
      className,
      picked: className === preselect,
    }));

    const picks = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title: 'Select Apex Test Classes to Run',
      placeHolder: 'Type to search • Space to toggle • Enter to run',
    });
    if (!picks || picks.length === 0) {
      return;
    }
    const selected = picks.map((p) => p.className);

    // Comma-separated list for deploys (e.g. RunSpecifiedTests) — copy up front so it's ready.
    const list = commaList(selected);
    await vscode.env.clipboard.writeText(list);

    const org = await ensureTargetOrg(cliPath, cwd);
    if (!org) {
      return;
    }

    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Running ${selected.length} Apex test class${selected.length === 1 ? '' : 'es'}…`,
        },
        () => cli.runApexTests(cliPath, org, selected, cwd),
      );

      const { summaryLine, detail } = formatTestRun(result, selected);
      const report =
        `${detail}\n\n` +
        'Selected test classes (comma-separated — copied to clipboard, paste into a deploy):\n' +
        `${list}\n`;
      await showApexTestResults(report);

      const failing = result.summary?.failing ?? 0;
      const notify = failing > 0 ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
      const choice = await notify(`${summaryLine}. Class list copied to clipboard.`, 'Copy List', 'Show Results');
      if (choice === 'Copy List') {
        await vscode.env.clipboard.writeText(list);
      } else if (choice === 'Show Results') {
        await showApexTestResults(report);
      }
    } catch (error) {
      logError('runApexTests', error);
      vscode.window.showErrorMessage('Failed to run Apex tests. See the "Salesforce Setup Navigator" output for details.');
    }
  });
}
