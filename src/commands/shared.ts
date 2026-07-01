import * as path from 'node:path';
import * as vscode from 'vscode';
import { detectMetadata, looksLikeUnsupportedMetadata } from '../metadata/detector';
import { MetadataRef } from '../metadata/types';
import * as cli from '../salesforce/cli';
import { ToolingQuery } from '../salesforce/types';
import { ensureTargetOrg, getCliPath } from '../org/orgManager';

/** Resolves the file the command should act on: an explicit Uri arg, else the active editor. */
export function resolveTargetUri(arg?: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) {
    return arg;
  }
  return vscode.window.activeTextEditor?.document.uri;
}

/** Picks the working directory for the CLI so it resolves the right SFDX project + auth config. */
export function cwdFor(uri: vscode.Uri | undefined): string {
  if (uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) {
      return folder.uri.fsPath;
    }
  }
  const firstFolder = vscode.workspace.workspaceFolders?.[0];
  if (firstFolder) {
    return firstFolder.uri.fsPath;
  }
  return uri ? path.dirname(uri.fsPath) : process.cwd();
}

export interface CommandContext {
  uri: vscode.Uri;
  ref: MetadataRef;
  cliPath: string;
  org: string;
  cwd: string;
}

/**
 * Shared precondition pipeline for file-scoped commands: resolve file → detect metadata →
 * ensure CLI present → ensure an org. Returns undefined (after showing the relevant friendly
 * message) when any precondition is not met.
 */
export async function prepareFileCommand(arg?: unknown): Promise<CommandContext | undefined> {
  const uri = resolveTargetUri(arg);
  if (!uri) {
    vscode.window.showErrorMessage('No Salesforce metadata file selected.');
    return undefined;
  }

  const ref = detectMetadata(uri.fsPath);
  if (!ref) {
    vscode.window.showErrorMessage(
      looksLikeUnsupportedMetadata(uri.fsPath)
        ? 'This metadata type is not supported yet.'
        : 'Could not detect the metadata type from this file.',
    );
    return undefined;
  }

  const cliPath = getCliPath();
  const cwd = cwdFor(uri);
  if (!(await cli.isCliAvailable(cliPath, cwd))) {
    vscode.window.showErrorMessage('Salesforce CLI is not available.');
    return undefined;
  }

  const org = await ensureTargetOrg(cliPath, cwd);
  if (!org) {
    // ensureTargetOrg already showed "No Salesforce org is selected." (or the user cancelled).
    return undefined;
  }

  return { uri, ref, cliPath, org, cwd };
}

/** Binds a Tooling-API query to a specific CLI path / org / cwd. */
export function toolingQueryFor(ctx: CommandContext): ToolingQuery {
  return (soql: string) => cli.queryTooling(ctx.cliPath, ctx.org, soql, ctx.cwd);
}
