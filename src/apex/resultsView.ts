import * as vscode from 'vscode';

const SCHEME = 'salesforce-apex-tests';
// `.log` gives the document a monospaced log language; the basename is the editor tab title.
const RESULTS_URI = vscode.Uri.from({ scheme: SCHEME, path: '/Apex Test Results.log' });

/** Backs a single, reusable, read-only document showing the latest Apex test report. */
class ResultsProvider implements vscode.TextDocumentContentProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;
  private content = '';

  provideTextDocumentContent(): string {
    return this.content;
  }

  setContent(text: string): void {
    this.content = text;
    this.emitter.fire(RESULTS_URI);
  }
}

let provider: ResultsProvider | undefined;

/** Registers the virtual results document provider. Call once during activation. */
export function registerApexTestResultsView(): vscode.Disposable {
  provider = new ResultsProvider();
  return vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider);
}

/**
 * Renders the report into the read-only results document and opens it scrolled to the TOP,
 * so the summary is visible immediately (an Output channel always tails to the bottom).
 */
export async function showApexTestResults(report: string): Promise<void> {
  if (!provider) {
    provider = new ResultsProvider();
  }
  provider.setContent(report);
  const doc = await vscode.workspace.openTextDocument(RESULTS_URI);
  const editor = await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
  editor.revealRange(new vscode.Range(0, 0, 0, 0), vscode.TextEditorRevealType.AtTop);
}
