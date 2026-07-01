import * as vscode from 'vscode';
import * as cli from '../salesforce/cli';

export const CONFIG_SECTION = 'salesforceSetupNavigator';

export function getCliPath(): string {
  const configured = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('salesforceCliPath');
  return configured && configured.trim() ? configured.trim() : 'sf';
}

export function getTargetOrgSetting(): string {
  return (vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('targetOrg') ?? '').trim();
}

/**
 * Resolves the org to target: the extension setting first, then the CLI's configured
 * default `target-org`. Returns undefined when neither is available.
 */
export async function resolveTargetOrg(cliPath: string, cwd: string): Promise<string | undefined> {
  const setting = getTargetOrgSetting();
  if (setting) {
    return setting;
  }
  try {
    const configured = await cli.getConfigTargetOrg(cliPath, cwd);
    if (configured) {
      return configured;
    }
  } catch {
    // No configured default (or config unreadable) — treated as "no org".
  }
  return undefined;
}

/**
 * Resolves the target org, and if none is set, offers an interactive picker.
 * Returns the chosen org username/alias, or undefined if the user dismisses the prompt.
 */
export async function ensureTargetOrg(cliPath: string, cwd: string): Promise<string | undefined> {
  const existing = await resolveTargetOrg(cliPath, cwd);
  if (existing) {
    return existing;
  }
  const choice = await vscode.window.showErrorMessage('No Salesforce org is selected.', 'Select Org');
  if (choice === 'Select Org') {
    return promptSelectOrg(cliPath, cwd);
  }
  return undefined;
}

/**
 * Presents a QuickPick of authenticated orgs and persists the selection to the
 * `salesforceSetupNavigator.targetOrg` setting. Returns the chosen org, or undefined.
 */
export async function promptSelectOrg(cliPath: string, cwd: string): Promise<string | undefined> {
  const orgs = await cli.listOrgs(cliPath, cwd);
  if (orgs.length === 0) {
    vscode.window.showErrorMessage(
      'No authenticated Salesforce orgs found. Run "sf org login web" to authenticate first.',
    );
    return undefined;
  }

  const items = orgs.map((org) => {
    const value = org.alias || org.username;
    const detailParts = [org.alias ? org.username : undefined, org.connectedStatus].filter(
      (part): part is string => !!part,
    );
    return {
      label: value,
      description: org.instanceUrl,
      detail: detailParts.join('  •  ') || undefined,
      value,
    };
  });

  const pick = await vscode.window.showQuickPick(items, {
    title: 'Select Salesforce Org',
    placeHolder: 'Choose the org used to open Setup pages',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!pick) {
    return undefined;
  }

  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update('targetOrg', pick.value, configurationTarget());
  vscode.window.showInformationMessage(`Salesforce Setup Navigator: target org set to "${pick.label}".`);
  return pick.value;
}

function configurationTarget(): vscode.ConfigurationTarget {
  return vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}
