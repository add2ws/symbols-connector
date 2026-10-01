'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeVscode } = require('./support/fakeVscode.cjs');
const { normalizeOptions } = require('../out/core/config.js');
const { createGraphPanelManager } = require('../out/vscode/graphPanel.js');
const { anchor, model } = require('./support/anchors.cjs');

function setup() {
	const api = createFakeVscode();
	const reveals = [];
	const manager = createGraphPanelManager(api, (uri, line, char) => reveals.push([uri, line, char]));
	const subject = anchor({ uri: 'file:///w/src/a.ts', fileName: 'a.ts', shortPath: 'src/a.ts', startLine: 11, startChar: 4, endChar: 7, role: 'definition', preview: 'const value = 1;' });
	const related = [
		anchor({ uri: 'file:///w/src/a.ts', fileName: 'a.ts', shortPath: 'src/a.ts', startLine: 20, startChar: 2, endChar: 5, preview: 'value + 1' }),
		anchor({ uri: 'file:///w/src/b.ts', fileName: 'b.ts', shortPath: 'src/b.ts', startLine: 3, startChar: 0, endChar: 3, preview: 'value' })
	];
	return { api, manager, model: model({ subject, related }), options: normalizeOptions({}), reveals };
}

test('show 创建面板并注入关系图 HTML', () => {
	const { api, manager, model: graphModel, options } = setup();
	manager.show(graphModel, options);
	assert.equal(api.state.webviewPanels.length, 1);
	const panel = api.state.webviewPanels[0];
	assert.equal(panel.options.enableScripts, true);
	assert.equal(panel.viewType, 'symbolsConnector.graph');
	assert.ok(panel.webview.html.includes('<svg'));
	assert.ok(panel.webview.html.includes('script-src'));
	assert.ok(panel.title.includes('a.ts'));
	assert.equal(panel.revealed, 1);
});

test('再次 show 复用同一个面板', () => {
	const { api, manager, model: graphModel, options } = setup();
	manager.show(graphModel, options);
	manager.show(graphModel, options);
	assert.equal(api.state.webviewPanels.length, 1);
	assert.equal(api.state.webviewPanels[0].revealed, 2);
});

test('未打开面板时 update 不做任何事', () => {
	const { api, manager, model: graphModel, options } = setup();
	manager.update(graphModel, options);
	assert.equal(api.state.webviewPanels.length, 0);
	assert.equal(manager.isOpen(), false);
});

test('面板已打开时 update 会刷新内容', () => {
	const { api, manager, model: graphModel, options } = setup();
	manager.show(graphModel, options);
	const before = api.state.webviewPanels[0].webview.html;
	manager.update(model({ subject: null, related: [] }), options);
	assert.notEqual(api.state.webviewPanels[0].webview.html, before);
	assert.ok(api.state.webviewPanels[0].webview.html.includes('No symbol under the cursor'));
});

test('收到 reveal 消息时回调跳转参数', () => {
	const { api, manager, model: graphModel, options, reveals } = setup();
	manager.show(graphModel, options);
	api.state.webviewPanels[0].webview.emit({ type: 'reveal', uri: 'file:///w/src/b.ts', line: 7, char: 4 });
	assert.deepEqual(reveals, [['file:///w/src/b.ts', 7, 4]]);
});

test('非法消息被忽略', () => {
	const { api, manager, model: graphModel, options, reveals } = setup();
	manager.show(graphModel, options);
	const webview = api.state.webviewPanels[0].webview;
	webview.emit(undefined);
	webview.emit('nope');
	webview.emit({});
	webview.emit({ type: 'other', uri: 'x' });
	webview.emit({ type: 'reveal' });
	assert.deepEqual(reveals, []);
});

test('面板关闭后 isOpen 为 false，再 show 会重建', () => {
	const { api, manager, model: graphModel, options } = setup();
	manager.show(graphModel, options);
	api.state.webviewPanels[0].dispose();
	assert.equal(manager.isOpen(), false);
	manager.show(graphModel, options);
	assert.equal(api.state.webviewPanels.length, 2);
});

test('dispose 之后面板被关闭', () => {
	const { api, manager, model: graphModel, options } = setup();
	manager.show(graphModel, options);
	manager.dispose();
	assert.equal(manager.isOpen(), false);
	assert.equal(api.state.webviewPanels[0].disposed, false);
});
