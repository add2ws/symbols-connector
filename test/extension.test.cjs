'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { createFakeVscode } = require('./support/fakeVscode.cjs');

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 把 require('vscode') 劫持成替身，然后加载真实的扩展入口。 */
function loadExtension(api) {
	const originalLoad = Module._load;
	Module._load = function (request, parent, isMain) {
		if (request === 'vscode') {
			return api;
		}
		return originalLoad.call(this, request, parent, isMain);
	};
	try {
		delete require.cache[require.resolve('../out/extension.js')];
		return require('../out/extension.js');
	} finally {
		Module._load = originalLoad;
	}
}

function setup() {
	const api = createFakeVscode();
	const document = api.createTextDocument(
		api.Uri.parse('file:///w/src/a.ts'),
		['export function foo(a) {', '  return a + 1;', '}', '', 'const x = foo(2);'],
		1
	);
	api.workspace.textDocuments.push(document);
	const editor = api.createEditor(document);
	editor.selection = new api.Selection(new api.Position(0, 17), new api.Position(0, 17));
	api.window.activeTextEditor = editor;

	api.state.commandHandlers.set('vscode.executeDefinitionProvider', () => [
		{ uri: document.uri, range: new api.Range(0, 16, 0, 19) }
	]);
	api.state.commandHandlers.set('vscode.executeDeclarationProvider', () => []);
	api.state.commandHandlers.set('vscode.executeReferenceProvider', () => [
		{ uri: document.uri, range: new api.Range(4, 10, 4, 13) }
	]);
	api.state.commandHandlers.set('vscode.executeDocumentHighlights', () => [
		{ range: new api.Range(0, 16, 0, 19) }
	]);

	const context = { subscriptions: [], extensionPath: '/ext' };
	return { api, document, editor, context, extension: loadExtension(api) };
}

test('activate 注册全部命令与事件', async () => {
	const { api, context, extension } = setup();
	extension.activate(context);
	assert.deepEqual(
		Array.from(api.state.registeredCommands.keys()).sort(),
		['symbolsConnector.copyReport', 'symbolsConnector.refresh', 'symbolsConnector.showGraph', 'symbolsConnector.toggle']
	);
	assert.equal(api.events.selection.count(), 1);
	assert.equal(api.events.activeEditor.count(), 1);
	assert.equal(api.events.textDocument.count(), 1);
	assert.equal(api.events.configurationChanged.count(), 1);
	assert.ok(context.subscriptions.length >= 5);
});

test('activate 后自动解析并在编辑器里画线', async () => {
	const { api, editor, context, extension } = setup();
	extension.activate(context);
	await tick(80);
	const commands = api.state.commandCalls.map((call) => call.command);
	assert.ok(commands.includes('vscode.executeDefinitionProvider'));
	assert.ok(commands.includes('vscode.executeReferenceProvider'));
	const painted = editor.decorations.filter((item) => item.ranges.length > 0);
	assert.ok(painted.length > 0, '应至少应用一类装饰');
});

test('光标移动经防抖后重新解析', async () => {
	const { api, editor, context, extension } = setup();
	extension.activate(context);
	await tick(80);
	const before = api.state.commandCalls.length;
	editor.selection = new api.Selection(new api.Position(4, 11), new api.Position(4, 11));
	api.events.selection.fire({ textEditor: editor, selections: [editor.selection] });
	assert.equal(api.state.commandCalls.length, before, '防抖期间不应立即请求');
	await tick(420);
	assert.ok(api.state.commandCalls.length > before, '防抖结束后应重新请求');
});

test('关闭 autoTrigger 后光标移动不再触发解析', async () => {
	const { api, editor, context, extension } = setup();
	api.state.configuration['symbolsConnector.autoTrigger'] = false;
	extension.activate(context);
	await tick(80);
	const before = api.state.commandCalls.length;
	api.events.selection.fire({ textEditor: editor, selections: [editor.selection] });
	await tick(420);
	assert.equal(api.state.commandCalls.length, before);
});

test('toggle 命令写回配置并停用连线', async () => {
	const { api, editor, context, extension } = setup();
	extension.activate(context);
	await tick(80);
	await api.state.registeredCommands.get('symbolsConnector.toggle')();
	assert.equal(api.state.configuration['symbolsConnector.enabled'], false);
	assert.ok(api.state.messages.some((message) => message.includes('disabled')));
	editor.decorations.length = 0;
	await api.state.registeredCommands.get('symbolsConnector.toggle')();
	assert.equal(api.state.configuration['symbolsConnector.enabled'], true);
});

test('showGraph 命令打开关系图面板', async () => {
	const { api, context, extension } = setup();
	extension.activate(context);
	await tick(80);
	await api.state.registeredCommands.get('symbolsConnector.showGraph')();
	assert.equal(api.state.webviewPanels.length, 1);
	assert.ok(api.state.webviewPanels[0].webview.html.includes('<svg'));
	assert.ok(api.state.webviewPanels[0].webview.html.includes('src/a.ts'));
});

test('copyReport 命令把清单写入剪贴板', async () => {
	const { api, context, extension } = setup();
	extension.activate(context);
	await tick(80);
	await api.state.registeredCommands.get('symbolsConnector.copyReport')();
	assert.ok(api.state.clipboard.includes('src/a.ts'));
	assert.ok(api.state.clipboard.includes('1 related position'));
});

test('refresh 命令清缓存并重新解析', async () => {
	const { api, context, extension } = setup();
	extension.activate(context);
	await tick(80);
	const before = api.state.commandCalls.length;
	await api.state.registeredCommands.get('symbolsConnector.refresh')();
	await tick(20);
	assert.ok(api.state.commandCalls.length > before);
});

test('释放 subscriptions 后事件监听被清空', async () => {
	const { api, context, extension } = setup();
	extension.activate(context);
	await tick(80);
	for (const disposable of context.subscriptions) {
		disposable.dispose();
	}
	assert.equal(api.events.selection.count(), 0);
	assert.equal(api.events.activeEditor.count(), 0);
	assert.equal(api.events.configurationChanged.count(), 0);
	assert.equal(api.state.registeredCommands.size, 0);
});
