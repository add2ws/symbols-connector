'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeVscode } = require('./support/fakeVscode.cjs');
const { createLogger } = require('../out/vscode/logger.js');
const { createSymbolResolver } = require('../out/vscode/symbolResolver.js');

function setup() {
	const api = createFakeVscode();
	const logger = createLogger(api);
	const document = api.createTextDocument(api.Uri.parse('file:///w/src/a.ts'), [
		'export function foo(a) {',
		'  return a + 1;',
		'}',
		'',
		'const x = foo(2);'
	]);
	const otherDocument = api.createTextDocument(api.Uri.parse('file:///w/src/b.ts'), ['import { foo } from "./a";', 'foo(1);']);
	api.workspace.textDocuments.push(document, otherDocument);
	return { api, logger, document, otherDocument };
}

test('调用内置命令并区分定义、声明与引用', async () => {
	const { api, logger, document, otherDocument } = setup();
	api.state.commandHandlers.set('vscode.executeDefinitionProvider', () => [
		{ uri: document.uri, range: new api.Range(0, 16, 0, 19) }
	]);
	api.state.commandHandlers.set('vscode.executeDeclarationProvider', () => [
		{ uri: otherDocument.uri, range: new api.Range(0, 9, 0, 12) }
	]);
	api.state.commandHandlers.set('vscode.executeReferenceProvider', () => [
		{ uri: document.uri, range: new api.Range(4, 10, 4, 13) },
		{ uri: otherDocument.uri, range: new api.Range(1, 0, 1, 3) }
	]);
	api.state.commandHandlers.set('vscode.executeDocumentHighlights', () => [
		{ range: new api.Range(0, 16, 0, 19) }
	]);

	const resolver = createSymbolResolver(api, logger);
	const result = await resolver.resolve({
		document,
		position: new api.Position(0, 17),
		includeDeclaration: true,
		maxRelated: 20,
		previewFiles: 5
	});

	assert.deepEqual(
		api.state.commandCalls.map((call) => call.command),
		[
			'vscode.executeDefinitionProvider',
			'vscode.executeDeclarationProvider',
			'vscode.executeReferenceProvider',
			'vscode.executeDocumentHighlights'
		]
	);
	assert.equal(result.subject.startLine, 0);
	assert.equal(result.subject.startChar, 16);
	assert.deepEqual(result.definitions.map((item) => item.role), ['definition']);
	assert.deepEqual(result.declarations.map((item) => item.role), ['declaration']);
	assert.deepEqual(result.references.map((item) => item.role), ['reference', 'reference']);
	assert.equal(result.definitions[0].preview, 'export function foo(a) {');
	assert.equal(result.definitions[0].indent, 0);
	assert.equal(result.references[0].fileName, 'a.ts');
	assert.equal(result.references[1].shortPath, 'src/b.ts');
	assert.equal(result.references[1].preview, 'foo(1);');
});

test('includeDeclaration=false 时不再请求声明', async () => {
	const { api, logger, document } = setup();
	const resolver = createSymbolResolver(api, logger);
	await resolver.resolve({ document, position: new api.Position(0, 17), includeDeclaration: false, maxRelated: 20, previewFiles: 0 });
	assert.ok(!api.state.commandCalls.some((call) => call.command === 'vscode.executeDeclarationProvider'));
});

test('没有文档高亮时退化为光标处的词范围', async () => {
	const { api, logger, document } = setup();
	document.getWordRangeAtPosition = () => new api.Range(2, 4, 2, 7);
	api.state.commandHandlers.set('vscode.executeDocumentHighlights', () => []);
	const resolver = createSymbolResolver(api, logger);
	const result = await resolver.resolve({ document, position: new api.Position(2, 5), includeDeclaration: true, maxRelated: 20, previewFiles: 0 });
	assert.equal(result.subject.startLine, 2);
	assert.equal(result.subject.startChar, 4);
});

test('光标不在标识符上时退回第一处定义作为起点', async () => {
	const { api, logger, document } = setup();
	const resolver = createSymbolResolver(api, logger);
	api.state.commandHandlers.set('vscode.executeDefinitionProvider', () => [
		{ uri: document.uri, range: new api.Range(0, 16, 0, 19) }
	]);
	const result = await resolver.resolve({ document, position: new api.Position(3, 0), includeDeclaration: true, maxRelated: 20, previewFiles: 0 });
	assert.equal(result.subject.startLine, 0);
	assert.equal(result.subject.startChar, 16);
});

test('DefinitionLink 使用 targetSelectionRange', async () => {
	const { api, logger, document } = setup();
	api.state.commandHandlers.set('vscode.executeDefinitionProvider', () => [
		{ targetUri: document.uri, targetRange: new api.Range(1, 0, 2, 1), targetSelectionRange: new api.Range(1, 9, 1, 12) }
	]);
	const resolver = createSymbolResolver(api, logger);
	const result = await resolver.resolve({ document, position: new api.Position(0, 17), includeDeclaration: true, maxRelated: 20, previewFiles: 0 });
	assert.equal(result.definitions[0].startLine, 1);
	assert.equal(result.definitions[0].startChar, 9);
	assert.equal(result.definitions[0].endChar, 12);
});

test('语言服务报错时降级为空结果并写日志', async () => {
	const { api, logger, document } = setup();
	api.state.commandHandlers.set('vscode.executeDefinitionProvider', () => {
		throw new Error('boom');
	});
	const resolver = createSymbolResolver(api, logger);
	const result = await resolver.resolve({ document, position: new api.Position(3, 0), includeDeclaration: true, maxRelated: 20, previewFiles: 0 });
	assert.equal(result.subject, null);
	assert.deepEqual(result.definitions, []);
	assert.ok(api.state.outputLines.some((line) => line.includes('warn') && line.includes('boom')));
});

test('引用数量按上限预留余量', async () => {
	const { api, logger, document } = setup();
	const references = [];
	for (let line = 0; line < 200; line += 1) {
		references.push({ uri: document.uri, range: new api.Range(line, 0, line, 3) });
	}
	api.state.commandHandlers.set('vscode.executeReferenceProvider', () => references);
	const resolver = createSymbolResolver(api, logger);
	const result = await resolver.resolve({ document, position: new api.Position(3, 0), includeDeclaration: true, maxRelated: 5, previewFiles: 0 });
	assert.equal(result.references.length, 13);
});

test('超出预览预算的文件不读取内容，也不会抛异常', async () => {
	const { api, logger, document, otherDocument } = setup();
	api.workspace.textDocuments.length = 0;
	api.workspace.textDocuments.push(document);
	api.state.commandHandlers.set('vscode.executeReferenceProvider', () => [
		{ uri: otherDocument.uri, range: new api.Range(1, 0, 1, 3) }
	]);
	const resolver = createSymbolResolver(api, logger);
	const result = await resolver.resolve({ document, position: new api.Position(0, 17), includeDeclaration: true, maxRelated: 20, previewFiles: 0 });
	assert.equal(result.references.length, 1);
	assert.equal(result.references[0].preview, '');
	assert.equal(result.references[0].shortPath, 'src/b.ts');
});

test('Tab 缩进按字符计（回归：曾按 4 列计，导致导轨压到代码上）', async () => {
	const { api, logger } = setup();
	const document = api.createTextDocument(api.Uri.parse('file:///w/src/tab.ts'), ['\t\t\tapi.window.createTextEditorDecorationType({']);
	api.workspace.textDocuments.push(document);
	api.state.commandHandlers.set('vscode.executeDefinitionProvider', () => [
		{ uri: document.uri, range: new api.Range(0, 14, 0, 42) }
	]);
	const resolver = createSymbolResolver(api, logger);
	const result = await resolver.resolve({
		document,
		position: new api.Position(0, 15),
		includeDeclaration: true,
		maxRelated: 20,
		previewFiles: 0
	});
	assert.equal(result.definitions[0].indent, 3);
	assert.equal(result.definitions[0].startChar, 14);
});
