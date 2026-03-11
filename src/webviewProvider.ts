/**
 * Manages the webview panel lifecycle.
 * Bundles the webview JS inline (no external bundler needed).
 * Handles message passing between extension and webview.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class AgentArcadePanel {
  public static currentPanel: AgentArcadePanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private messageHandler: ((msg: { type: string; payload: unknown }) => void) | null = null;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtmlContent();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message) => {
        if (this.messageHandler) {
          this.messageHandler(message);
        }
      },
      null,
      this.disposables
    );
  }

  static createOrShow(extensionUri: vscode.Uri): AgentArcadePanel {
    const column = vscode.ViewColumn.Beside;

    if (AgentArcadePanel.currentPanel) {
      AgentArcadePanel.currentPanel.panel.reveal(column);
      return AgentArcadePanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'agentArcade',
      'Agent Arcade',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    AgentArcadePanel.currentPanel = new AgentArcadePanel(panel, extensionUri);
    return AgentArcadePanel.currentPanel;
  }

  onMessage(handler: (msg: { type: string; payload: unknown }) => void): void {
    this.messageHandler = handler;
  }

  postMessage(msg: { type: string; payload: unknown }): void {
    this.panel.webview.postMessage(msg);
  }

  private getHtmlContent(): string {
    // Try pre-bundled HTML first (from npm run compile), fall back to source
    const bundledPath = path.join(this.extensionUri.fsPath, 'out', 'webview', 'index.html');
    const sourcePath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'index.html');

    let html: string;
    if (fs.existsSync(bundledPath)) {
      html = fs.readFileSync(bundledPath, 'utf-8');
    } else {
      // Fallback: read source and inline scripts with crude TS stripping
      html = fs.readFileSync(sourcePath, 'utf-8');
      const webviewDir = path.join(this.extensionUri.fsPath, 'src', 'webview');
      const files = ['sprites.ts', 'office.ts', 'pathfinding.ts', 'agents.ts', 'renderer.ts'];
      const scripts: string[] = [];
      for (const file of files) {
        const filePath = path.join(webviewDir, file);
        if (fs.existsSync(filePath)) {
          let content = fs.readFileSync(filePath, 'utf-8');
          content = this.stripTypeScript(content, file);
          scripts.push(`// === ${file} ===\n${content}`);
        }
      }
      const bundledScript = `<script>\n(function() {\n'use strict';\nconst modules = {};\nfunction require(name) { return modules[name] || {}; }\n${scripts.join('\n\n')}\n})();\n</script>`;
      html = html.replace('<!-- SCRIPTS_PLACEHOLDER -->', bundledScript);
    }

    // Set CSP for webview
    html = html.replace(
      '<head>',
      `<head>
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">`
    );

    return html;
  }

  /**
   * Crude TypeScript stripping for inline bundling.
   * Removes: import/export statements, type annotations, interfaces.
   * For a real extension, use esbuild or webpack.
   */
  private stripTypeScript(content: string, filename: string): string {
    const lines = content.split('\n');
    const output: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip import lines
      if (trimmed.startsWith('import ')) continue;

      // Convert export function/const to plain declarations
      let processed = line;
      if (trimmed.startsWith('export function ')) {
        processed = line.replace('export function ', 'function ');
      } else if (trimmed.startsWith('export const ')) {
        processed = line.replace('export const ', 'const ');
      } else if (trimmed.startsWith('export type ') || trimmed.startsWith('export interface ')) {
        continue; // Skip type exports
      } else if (trimmed.startsWith('export ')) {
        processed = line.replace('export ', '');
      }

      // Skip pure type declarations
      if (trimmed.startsWith('type ') && trimmed.includes('=') && !trimmed.includes('=>')) {
        if (!trimmed.startsWith('type:')) continue;
      }
      if (trimmed.startsWith('interface ')) continue;

      // Strip type annotations (basic)
      processed = processed
        .replace(/:\s*(string|number|boolean|void|null|unknown|never)\b/g, '')
        .replace(/:\s*(string|number|boolean)\[\]/g, '')
        .replace(/:\s*Record<[^>]+>/g, '')
        .replace(/:\s*Map<[^>]+>/g, '')
        .replace(/:\s*Set<[^>]+>/g, '')
        .replace(/:\s*Array<[^>]+>/g, '')
        .replace(/:\s*ReadonlyArray<[^>]+>/g, '')
        .replace(/:\s*readonly\s+/g, ': ')
        .replace(/<[A-Z]\w*(\s*,\s*[A-Z]\w*)*>/g, '') // Generic type params
        .replace(/\bas\s+\w+(\[\])?\b/g, '') // Type assertions
        .replace(/!\./g, '.') // Non-null assertions
        .replace(/!;/g, ';');

      // Strip readonly from properties
      processed = processed.replace(/\breadonly\s+/g, '');

      // Remove declare statements
      if (trimmed.startsWith('declare ')) continue;

      output.push(processed);
    }

    // Register exports as module
    const moduleName = './' + filename.replace('.ts', '');
    const exportedFunctions = content.match(/export function (\w+)/g) || [];
    const exportedConsts = content.match(/export const (\w+)/g) || [];

    const exports: string[] = [];
    for (const fn of exportedFunctions) {
      const name = fn.replace('export function ', '');
      exports.push(`${name}: ${name}`);
    }
    for (const c of exportedConsts) {
      const name = c.replace('export const ', '');
      exports.push(`${name}: ${name}`);
    }

    if (exports.length > 0) {
      output.push(`modules['${moduleName}'] = { ${exports.join(', ')} };`);
    }

    return output.join('\n');
  }

  dispose(): void {
    AgentArcadePanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
