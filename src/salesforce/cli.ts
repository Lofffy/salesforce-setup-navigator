import { execFile } from 'node:child_process';
import { SfRecord } from './types';
import type { ApexTestRunResult } from '../apex/types';

/**
 * Thin, `vscode`-free wrapper around the Salesforce CLI (`sf`).
 *
 * All authenticated work is delegated to the CLI: the extension never reads or stores
 * access tokens. Commands are invoked with `execFile` (argument array, no shell) so file
 * names and SOQL can never be interpreted by a shell.
 */

export interface OrgInfo {
  username: string;
  alias?: string;
  instanceUrl?: string;
  connectedStatus?: string;
  isScratch?: boolean;
  isDefaultUsername?: boolean;
}

/** Error type for CLI failures. `message` is user-safe; `detail` holds technical output for logging. */
export class SfCliError extends Error {
  readonly detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'SfCliError';
    this.detail = detail;
  }
}

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface SfJsonEnvelope<T> {
  status: number;
  result: T;
  message?: string;
  name?: string;
}

const MAX_BUFFER = 16 * 1024 * 1024;

function exec(cliPath: string, args: string[], cwd?: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      cliPath,
      args,
      { cwd, maxBuffer: MAX_BUFFER, windowsHide: true },
      (error, stdout, stderr) => {
        const out = stdout ?? '';
        const err = stderr ?? '';
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new SfCliError('Salesforce CLI is not available.', String(error)));
          return;
        }
        const exitCode =
          error && typeof (error as { code?: unknown }).code === 'number'
            ? ((error as { code: number }).code)
            : error
              ? 1
              : 0;
        resolve({ code: exitCode, stdout: out, stderr: err });
      },
    );
  });
}

/** Runs an `sf … --json` command and returns the parsed `result`, throwing on CLI errors. */
async function execJson<T>(cliPath: string, args: string[], cwd?: string): Promise<T> {
  const { stdout, stderr } = await exec(cliPath, args, cwd);
  const text = (stdout.trim() || stderr.trim()).trim();
  let parsed: SfJsonEnvelope<T> | undefined;
  try {
    parsed = JSON.parse(text) as SfJsonEnvelope<T>;
  } catch {
    parsed = undefined;
  }
  if (!parsed || typeof parsed.status !== 'number') {
    throw new SfCliError('Salesforce CLI returned an unexpected response.', text.slice(0, 4000));
  }
  if (parsed.status !== 0) {
    throw new SfCliError(parsed.message || 'Salesforce CLI command failed.', text.slice(0, 4000));
  }
  return parsed.result;
}

/** Returns true if the CLI executable can be invoked. */
export async function isCliAvailable(cliPath: string, cwd?: string): Promise<boolean> {
  try {
    const result = await exec(cliPath, ['--version'], cwd);
    return result.code === 0;
  } catch {
    return false;
  }
}

/** Reads the configured default `target-org` (local or global), if any. */
export async function getConfigTargetOrg(cliPath: string, cwd?: string): Promise<string | undefined> {
  const result = await execJson<Array<{ name?: string; key?: string; value?: string }>>(
    cliPath,
    ['config', 'get', 'target-org', '--json'],
    cwd,
  );
  const entry = Array.isArray(result)
    ? result.find((r) => r.name === 'target-org' || r.key === 'target-org')
    : undefined;
  const value = entry?.value?.trim();
  return value ? value : undefined;
}

/** Returns the org's instance URL (trailing slash trimmed). */
export async function getInstanceUrl(cliPath: string, org: string, cwd?: string): Promise<string> {
  const result = await execJson<{ instanceUrl?: string }>(
    cliPath,
    ['org', 'display', '--json', '-o', org],
    cwd,
  );
  if (!result.instanceUrl) {
    throw new SfCliError('Could not determine the org instance URL.');
  }
  return result.instanceUrl.replace(/\/+$/, '');
}

/** Lists all authenticated orgs, flattening every org bucket returned by `sf org list`. */
export async function listOrgs(cliPath: string, cwd?: string): Promise<OrgInfo[]> {
  const result = await execJson<Record<string, unknown>>(cliPath, ['org', 'list', '--json'], cwd);
  const orgs: OrgInfo[] = [];
  const seen = new Set<string>();
  for (const bucket of Object.values(result)) {
    if (!Array.isArray(bucket)) {
      continue;
    }
    for (const item of bucket) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const org = item as Record<string, unknown>;
      const username = typeof org.username === 'string' ? org.username : undefined;
      if (!username || seen.has(username)) {
        continue;
      }
      seen.add(username);
      orgs.push({
        username,
        alias: typeof org.alias === 'string' && org.alias ? org.alias : undefined,
        instanceUrl: typeof org.instanceUrl === 'string' ? org.instanceUrl : undefined,
        connectedStatus: typeof org.connectedStatus === 'string' ? org.connectedStatus : undefined,
        isScratch: typeof org.isScratch === 'boolean' ? org.isScratch : undefined,
        isDefaultUsername: org.isDefaultUsername === true,
      });
    }
  }
  return orgs;
}

/** Runs a Tooling-API SOQL query and returns the matched records. */
export async function queryTooling(
  cliPath: string,
  org: string,
  soql: string,
  cwd?: string,
): Promise<SfRecord[]> {
  const result = await execJson<{ records?: SfRecord[] }>(
    cliPath,
    ['data', 'query', '-q', soql, '--use-tooling-api', '--json', '-o', org],
    cwd,
  );
  return Array.isArray(result.records) ? result.records : [];
}

/** Opens a relative navigation path in the org via the CLI (which handles authentication). */
export async function openPath(cliPath: string, org: string, relPath: string, cwd?: string): Promise<void> {
  const { code, stdout, stderr } = await exec(cliPath, ['org', 'open', '-p', relPath, '-o', org], cwd);
  if (code !== 0) {
    throw new SfCliError('Failed to open Salesforce Setup.', (stderr || stdout).slice(0, 4000));
  }
}

/** Opens local metadata (ApexPage / FlexiPage / Flow) in its associated Builder via the CLI. */
export async function openSourceFile(cliPath: string, org: string, file: string, cwd?: string): Promise<void> {
  const { code, stdout, stderr } = await exec(cliPath, ['org', 'open', '-f', file, '-o', org], cwd);
  if (code !== 0) {
    throw new SfCliError('Failed to open Salesforce Setup.', (stderr || stdout).slice(0, 4000));
  }
}

/**
 * Runs `sf apex run test` for the given test classes with code coverage and returns the parsed
 * result. The CLI exits non-zero when tests FAIL but still emits the full result JSON, so the
 * result is parsed regardless of exit code; an error is thrown only when no usable result is
 * present (e.g. an auth failure or a run that didn't finish within the wait window).
 */
export async function runApexTests(
  cliPath: string,
  org: string,
  classNames: string[],
  cwd?: string,
  waitMinutes = 60,
): Promise<ApexTestRunResult> {
  const args = ['apex', 'run', 'test'];
  for (const name of classNames) {
    args.push('--class-names', name);
  }
  args.push('--code-coverage', '--wait', String(waitMinutes), '--json', '--target-org', org);

  const { stdout, stderr } = await exec(cliPath, args, cwd);
  const text = (stdout.trim() || stderr.trim()).trim();
  let parsed: { status?: number; result?: ApexTestRunResult; message?: string } | undefined;
  try {
    parsed = JSON.parse(text) as { status?: number; result?: ApexTestRunResult; message?: string };
  } catch {
    parsed = undefined;
  }
  const result = parsed?.result;
  if (result && (result.summary || result.tests)) {
    return result;
  }
  throw new SfCliError(parsed?.message || 'Failed to run Apex tests.', text.slice(0, 4000));
}
