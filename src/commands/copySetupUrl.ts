import * as vscode from 'vscode';
import * as cli from '../salesforce/cli';
import { resolveTarget } from '../salesforce/urlBuilder';
import { logError } from '../util/log';
import { CommandContext, prepareFileCommand, toolingQueryFor } from './shared';

export function registerCopySetupUrl(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'salesforceSetupNavigator.copySetupUrl',
    async (arg?: unknown) => {
      const ctx = await prepareFileCommand(arg);
      if (!ctx) {
        return;
      }
      await copySetupUrl(ctx);
    },
  );
}

async function copySetupUrl(ctx: CommandContext): Promise<void> {
  const { cliPath, org, cwd, ref } = ctx;
  try {
    const { url, exact } = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Building Setup URL for ${ref.type}…` },
      async () => {
        const target = await resolveTarget(ref, toolingQueryFor(ctx));
        const instanceUrl = await cli.getInstanceUrl(cliPath, org, cwd);
        // A clean, token-free, shareable link (the recipient must be logged into the org).
        return { url: `${instanceUrl}${target.copyPath}`, exact: target.exact };
      },
    );

    await vscode.env.clipboard.writeText(url);
    if (exact) {
      vscode.window.showInformationMessage(`Copied Setup URL to clipboard: ${url}`);
    } else {
      vscode.window.showInformationMessage(
        `Could not find this metadata in the selected org. Copied the related Setup list URL instead: ${url}`,
      );
    }
  } catch (error) {
    logError('copySetupUrl', error);
    vscode.window.showErrorMessage('Could not build the Setup URL for this metadata.');
  }
}
