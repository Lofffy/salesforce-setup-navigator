import * as vscode from 'vscode';

const CHANNEL_NAME = 'Salesforce Setup Navigator';

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel(CHANNEL_NAME);
  }
  return channel;
}

export function logInfo(message: string): void {
  getOutputChannel().appendLine(`[info] ${message}`);
}

/**
 * Logs technical error detail to the output channel. The user only ever sees a short,
 * friendly message (shown by the command); raw stack traces stay in this log.
 */
export function logError(context: string, error: unknown): void {
  const out = getOutputChannel();
  out.appendLine(`[error] ${context}`);
  if (error instanceof Error) {
    out.appendLine(error.stack ?? `${error.name}: ${error.message}`);
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.length > 0) {
      out.appendLine(detail);
    }
  } else if (error !== undefined) {
    out.appendLine(String(error));
  }
}

export function disposeOutputChannel(): void {
  channel?.dispose();
  channel = undefined;
}
