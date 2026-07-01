import * as vscode from 'vscode';
import * as cli from '../salesforce/cli';
import { resolveTarget } from '../salesforce/urlBuilder';
import { logError } from '../util/log';
import { CommandContext, prepareFileCommand, toolingQueryFor } from './shared';

export function registerOpenInSetup(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'salesforceSetupNavigator.openInSetup',
    async (arg?: unknown) => {
      const ctx = await prepareFileCommand(arg);
      if (!ctx) {
        return;
      }
      await openInSetup(ctx);
    },
  );
}

async function openInSetup(ctx: CommandContext): Promise<void> {
  const { cliPath, org, cwd, ref } = ctx;
  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Opening ${ref.type} in Salesforce…` },
      async () => {
        const target = await resolveTarget(ref, toolingQueryFor(ctx));
        const open = target.open;
        if ('sourceFile' in open) {
          await cli.openSourceFile(cliPath, org, open.sourceFile, cwd);
          return { viaSourceFile: true, exact: target.exact };
        }
        await cli.openPath(cliPath, org, open.path, cwd);
        return { viaSourceFile: false, exact: target.exact };
      },
    );

    // Only a genuine id-lookup fallback (a list page opened by path) warrants the notice.
    // A source-file open (e.g. a Flow in Flow Builder) is the intended success path.
    if (!result.viaSourceFile && !result.exact) {
      vscode.window.showInformationMessage(
        'Could not find this metadata in the selected org. Opened the related Setup list instead.',
      );
    }
  } catch (error) {
    logError('openInSetup', error);
    vscode.window.showErrorMessage('Failed to open Salesforce Setup.');
  }
}
