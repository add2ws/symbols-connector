import type * as vscode from 'vscode';
import type { ConnectorOptions } from '../core/config';
import { buildGraphHtml } from '../core/graphHtml';
import { layoutGraph } from '../core/graphLayout';
import { renderGraphSvg } from '../core/svg';
import type { ConnectorModel } from '../core/types';

export type RevealHandler = (uri: string, line: number, char: number) => void;

export interface GraphPanelManager {
	show(model: ConnectorModel, options: ConnectorOptions, column?: vscode.ViewColumn): void;
	/** 面板已打开时刷新内容；未打开时什么都不做。 */
	update(model: ConnectorModel, options: ConnectorOptions): void;
	isOpen(): boolean;
	close(): void;
	dispose(): void;
}

const VIEW_TYPE = 'symbolsConnector.graph';

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let text = '';
	for (let index = 0; index < 32; index += 1) {
		text += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
	}
	return text;
}

/** 管理“符号引用关系图”Webview 面板：单例、内容全内联、点击回传跳转。 */
export function createGraphPanelManager(api: typeof vscode, onReveal: RevealHandler): GraphPanelManager {
	let panel: vscode.WebviewPanel | undefined;
	const disposables: vscode.Disposable[] = [];

	function render(model: ConnectorModel, options: ConnectorOptions): void {
		if (!panel) {
			return;
		}
		const layout = layoutGraph(model);
		const svg = renderGraphSvg(layout, { palette: options.palette, showPreview: true });

		const instance = panel;
		const subject = model.subject;
		const title = subject ? 'Reference Graph · ' + subject.fileName : 'Reference Graph';
		const parts: string[] = [];
		if (subject) {
			parts.push('L' + (subject.startLine + 1));
			parts.push(model.related.length + ' related');
			parts.push(model.sameFile.length + ' in this file · ' + model.otherFiles.length + ' in other files');
			if (model.truncated) {
				parts.push('truncated');
			}
		} else {
			parts.push('No symbol under the cursor');
		}

		instance.title = title;
		instance.webview.html = buildGraphHtml({
			svg,
			title,
			subtitle: parts.join(' · '),
			paletteSize: Math.max(1, Math.min(options.palette.length, model.related.length || 1)),
			palette: options.palette,
			nonce: createNonce(),
			cspSource: instance.webview.cspSource
		});
	}

	function ensurePanel(column?: vscode.ViewColumn): vscode.WebviewPanel {
		if (panel) {
			return panel;
		}
		const created = api.window.createWebviewPanel(
			VIEW_TYPE,
			'Reference Graph',
			column === undefined ? api.ViewColumn.Beside : column,
			{ enableScripts: true, retainContextWhenHidden: true }
		);
		created.webview.onDidReceiveMessage(
			(message: unknown) => {
				if (typeof message !== 'object' || message === null) {
					return;
				}
				const record = message as { type?: unknown; uri?: unknown; line?: unknown; char?: unknown };
				if (record.type !== 'reveal' || typeof record.uri !== 'string') {
					return;
				}
				const line = typeof record.line === 'number' && Number.isFinite(record.line) ? Math.max(0, Math.floor(record.line)) : 0;
				const char = typeof record.char === 'number' && Number.isFinite(record.char) ? Math.max(0, Math.floor(record.char)) : 0;
				onReveal(record.uri, line, char);
			},
			null,
			disposables
		);
		created.onDidDispose(
			() => {
				panel = undefined;
			},
			null,
			disposables
		);
		panel = created;
		return created;
	}

	return {
		show: (model, options, column) => {
			const target = ensurePanel(column);
			render(model, options);
			target.reveal(target.viewColumn, false);
		},
		update: (model, options) => {
			if (panel) {
				render(model, options);
			}
		},
		isOpen: () => panel !== undefined,
		close: () => {
			if (panel) {
				panel.dispose();
				panel = undefined;
			}
		},
		dispose: () => {
			panel = undefined;
			for (const disposable of disposables) {
				disposable.dispose();
			}
			disposables.length = 0;
		}
	};
}
