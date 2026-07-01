import * as vscode from 'vscode';
import { registerOpenInSetup } from './commands/openInSetup';
import { registerCopySetupUrl } from './commands/copySetupUrl';
import { registerOpenDeveloperConsole } from './commands/openDeveloperConsole';
import { registerSelectOrg } from './commands/selectOrg';
import { registerRunApexTests } from './commands/runTests';
import { registerApexTestResultsView } from './apex/resultsView';
import { disposeOutputChannel, logInfo } from './util/log';

export function activate(context: vscode.ExtensionContext): void {
  logInfo('Salesforce Setup Navigator activated.');
  context.subscriptions.push(
    registerOpenInSetup(),
    registerCopySetupUrl(),
    registerOpenDeveloperConsole(),
    registerSelectOrg(),
    registerRunApexTests(),
    registerApexTestResultsView(),
  );
}

export function deactivate(): void {
  disposeOutputChannel();
}
