import * as vscode from 'vscode';
import type { ConnectorOptions } from './core/config';
import { DEFAULT_OPTIONS, normalizeOptions } from './core/config';
import { planConnectors } from './core/geometry';
import { isSupportedLanguage } from './core/languages';
import { mergeAnchors } from './core/merge';
import { renderTextReport } from './core/report';
import { isBlankLine, leadingWhitespaceChars } from './core/text';
import type { ConnectorModel } from './core/types';
import type { ConnectorPainter } from './vscode/decorations';
import { createConnectorPainter } from './vscode/decorations';
import type { GraphPanelManager } from './vscode/graphPanel';
import { createGraphPanelManager } from './vscode/graphPanel';
import type { Logger } from './vscode/logger';
import { createLogger } from './vscode/logger';
import type { SymbolResolver } from './vscode/symbolResolver';
import { createSymbolResolver } from './vscode/symbolResolver';

let logger!: Logger;
let resolver!: SymbolResolver;
let painter!: ConnectorPainter;
let panels!: GraphPanelManager;

let options: ConnectorOptions = DEFAULT_OPTIONS;
let enabled = DEFAULT_OPTIONS.enabled;
let timer: ReturnType<typeof setTimeout> | undefined;
/** 递增的请求序号，用于丢弃过期结果。 */
let generation = 0;
/** 上一次解析的缓存键，避免光标在同一符号内移动时重复请求语言服务。 */
let lastKey = '';
let lastModel: ConnectorModel | undefined;

function readOptions(): ConnectorOptions {
	const configuration = vscode.workspace.getConfiguration('symbolsConnector');
	const raw: Record<string, unknown> = {};
	for (const key of Object.keys(DEFAULT_OPTIONS)) {
		raw[key] = configuration.get(key);
	}
	return normalizeOptions(raw);
}

function clearAll(): void {
	lastKey = '';
	lastModel = undefined;
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		painter.clear(editor);
	}
}

function activeEditorKey(): string | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return undefined;
	}
	const position = editor.selection.active;
	return (
		editor.document.uri.toString() +
		'#' +
		position.line +
		':' +
		position.character +
		'@' +
		editor.document.version
	);
}

/** 解析当前符号并刷新编辑器连线（以及可选的关系图）。 */
async function runResolve(force: boolean): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !enabled || !options.enabled) {
		clearAll();
		return;
	}
	// 只在主流编程语言里工作。markdown / 纯文本 / 配置格式的语言服务没有 references，
	// 画出来只剩一个孤零零的起点序号，纯属噪音。
	if (!isSupportedLanguage(editor.document.languageId)) {
		clearAll();
		return;
	}

	const key = activeEditorKey();
	if (key === undefined) {
		clearAll();
		return;
	}
	if (!force && key === lastKey) {
		return;
	}
	lastKey = key;
	const current = ++generation;

	try {
		const raw = await resolver.resolve({
			document: editor.document,
			position: editor.selection.active,
			includeDeclaration: options.includeDeclaration,
			maxRelated: options.maxRelated,
			previewFiles: options.previewFiles
		});

		// 期间又产生了新的请求，丢弃这次结果
		if (current !== generation) {
			return;
		}

		const model = mergeAnchors(raw, options);
		lastModel = model;

		// 导轨会穿过端点之间的每一行，因此基准列必须参考这些行的真实缩进
		const document = editor.document;
		const plan = planConnectors(model.subject, model.sameFile, options, (line) => {
			if (line < 0 || line >= document.lineCount) {
				return undefined;
			}
			const lineText = document.lineAt(line).text;
			return isBlankLine(lineText) ? undefined : leadingWhitespaceChars(lineText);
		});
		if (options.editorLines) {
			painter.paint(editor, model, plan, options);
		} else {
			painter.clear(editor);
		}

		if (options.autoOpenGraph) {
			panels.update(model, options);
		}
	} catch (error) {
		logger.error('Failed to resolve the symbol', error);
	}
}

function schedule(): void {
	if (timer !== undefined) {
		clearTimeout(timer);
	}
	const delay = Math.max(0, options.debounceMs);
	timer = setTimeout(() => {
		timer = undefined;
		void runResolve(false);
	}, delay);
}

async function revealLocation(uriString: string, line: number, char: number): Promise<void> {
	try {
		const uri = vscode.Uri.parse(uriString);
		const document = await vscode.workspace.openTextDocument(uri);
		const editor = await vscode.window.showTextDocument(document, {
			viewColumn: vscode.ViewColumn.One,
			preserveFocus: false
		});
		const position = new vscode.Position(line, char);
		editor.selection = new vscode.Selection(position, position);
		editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
	} catch (error) {
		logger.error('Failed to reveal ' + uriString, error);
	}
}

/** 当前编辑器的语言是否受支持；不支持时给出提示并返回 false。 */
function checkLanguage(): boolean {
	const editor = vscode.window.activeTextEditor;
	if (!editor || isSupportedLanguage(editor.document.languageId)) {
		return true;
	}
	void vscode.window.showInformationMessage(
		'Symbols Connector is not enabled for "' + editor.document.languageId + '" files.'
	);
	return false;
}

async function ensureModel(): Promise<ConnectorModel | undefined> {
	if (!lastModel) {
		await runResolve(true);
	}
	return lastModel;
}

async function showGraph(): Promise<void> {
	if (!checkLanguage()) {
		return;
	}
	const model = await ensureModel();
	if (!model) {
		void vscode.window.showInformationMessage('No symbol found. Put the cursor on an identifier and try again.');
		return;
	}
	panels.show(model, options);
}

async function copyReport(): Promise<void> {
	if (!checkLanguage()) {
		return;
	}
	const model = await ensureModel();
	if (!model) {
		void vscode.window.showInformationMessage('No symbol found. Put the cursor on an identifier and try again.');
		return;
	}
	await vscode.env.clipboard.writeText(renderTextReport(model));
	void vscode.window.showInformationMessage(
		'Copied ' + model.related.length + ' related position' + (model.related.length === 1 ? '' : 's') + '.'
	);
}

async function toggleEnabled(): Promise<void> {
	const next = !enabled;
	enabled = next;
	options = { ...options, enabled: next };
	if (!enabled) {
		clearAll();
	} else {
		await runResolve(true);
	}
	try {
		await vscode.workspace
			.getConfiguration('symbolsConnector')
			.update('enabled', next, vscode.ConfigurationTarget.Global);
	} catch (error) {
		logger.warn('Failed to persist the setting; the toggle applies to this session only: ' + String(error));
	}
	void vscode.window.showInformationMessage('Symbols Connector ' + (enabled ? 'enabled' : 'disabled') + '.');
}

export function activate(context: vscode.ExtensionContext): void {
	logger = createLogger(vscode);
	resolver = createSymbolResolver(vscode, logger);
	painter = createConnectorPainter(vscode);
	panels = createGraphPanelManager(vscode, (uri, line, char) => {
		void revealLocation(uri, line, char);
	});

	options = readOptions();
	enabled = options.enabled;

	const lifecycle: vscode.Disposable = {
		dispose: () => {
			if (timer !== undefined) {
				clearTimeout(timer);
				timer = undefined;
			}
			generation += 1;
			painter.dispose();
			panels.dispose();
			resolver.clear();
			logger.dispose();
		}
	};

	context.subscriptions.push(
		lifecycle,
		// 命令处理函数返回 Promise：executeCommand 的调用方可以等待完成，异常也不会被吞掉
		vscode.commands.registerCommand('symbolsConnector.toggle', () => toggleEnabled()),
		vscode.commands.registerCommand('symbolsConnector.refresh', async () => {
			resolver.clear();
			await runResolve(true);
		}),
		vscode.commands.registerCommand('symbolsConnector.showGraph', () => showGraph()),
		vscode.commands.registerCommand('symbolsConnector.copyReport', () => copyReport()),
		vscode.window.onDidChangeTextEditorSelection((event) => {
			if (!options.autoTrigger || !enabled) {
				return;
			}
			if (event.textEditor !== vscode.window.activeTextEditor) {
				return;
			}
			schedule();
		}),
		vscode.window.onDidChangeActiveTextEditor(() => {
			void runResolve(true);
		}),
		vscode.workspace.onDidChangeTextDocument((event) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || event.document !== editor.document) {
				return;
			}
			schedule();
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (!event.affectsConfiguration('symbolsConnector')) {
				return;
			}
			options = readOptions();
			enabled = options.enabled;
			void runResolve(true);
		})
	);

	void runResolve(true);
	logger.info('Symbols Connector activated.');
}

export function deactivate(): void {
	// 资源都在 context.subscriptions 里释放
}
