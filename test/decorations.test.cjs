'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeVscode } = require('./support/fakeVscode.cjs');
const { normalizeOptions } = require('../out/core/config.js');
const { planConnectors } = require('../out/core/geometry.js');
const { createConnectorPainter } = require('../out/vscode/decorations.js');
const { anchor } = require('./support/anchors.cjs');

function setup(config) {
	const api = createFakeVscode();
	const document = api.createTextDocument(api.Uri.parse('file:///w/src/a.ts'), ['a', 'b', 'c', 'd', 'e', 'f']);
	const editor = api.createEditor(document);
	const painter = createConnectorPainter(api);
	const options = normalizeOptions(Object.assign({ palette: ['#111111'] }, config || {}));
	return { api, editor, painter, options };
}

function sampleModel(options) {
	const subject = anchor({ startLine: 1, startChar: 4, endChar: 7, indent: 4 });
	const targets = [anchor({ startLine: 4, startChar: 4, endChar: 7, indent: 4, role: 'definition' })];
	const model = { subject, related: targets, sameFile: targets, otherFiles: [], truncated: false };
	return { model, plan: planConnectors(subject, targets, options) };
}

test('竖向导轨按行拆开并落在同一列上', () => {
	// 显式钉住 1px：本用例只关心几何，不该随默认粗细变化而失败
	const { api, editor, painter, options } = setup({ lineWidth: 1 });
	const { model, plan } = sampleModel(options);
	painter.paint(editor, model, plan, options);

	const railType = api.state.decorationTypes.find((type) => type.options.borderWidth === '0 0 0 1px');
	assert.ok(railType, '应创建导轨装饰类型');
	const applied = editor.decorations.find((item) => item.type === railType);
	// 导轨覆盖 [1, 4)，不含下端第 4 行
	assert.equal(applied.ranges.length, 3);
	assert.deepEqual(applied.ranges.map((range) => range.start.line), [1, 2, 3]);
	assert.ok(applied.ranges.every((range) => range.start.character === 0 && range.end.character === 0));
});

test('横向短线连到标识符起点', () => {
	const { api, editor, painter, options } = setup({ lineWidth: 1 });
	const { model, plan } = sampleModel(options);
	painter.paint(editor, model, plan, options);
	const stubType = api.state.decorationTypes.find((type) => type.options.borderWidth === '1px 0 0 0');
	const applied = editor.decorations.find((item) => item.type === stubType);
	assert.deepEqual(applied.ranges.map((range) => range.start.line), [1, 4]);
	assert.ok(applied.ranges.every((range) => range.start.character === 0 && range.end.character === 4));
});

test('引用位置带彩色边框与序号标签', () => {
	const { api, editor, painter, options } = setup();
	const { model, plan } = sampleModel(options);
	painter.paint(editor, model, plan, options);
	const mark = api.state.decorationTypes.find((type) => type.options.borderWidth === '1px' && type.options.borderRadius === '3px');
	assert.ok(mark);
	assert.equal(mark.options.borderColor, '#111111');
	const label = api.state.decorationTypes.find((type) => type.options.after);
	assert.ok(label);
	assert.equal(label.options.after.contentText, '0', '定义处应为 0');
});

test('showIndexLabels=false 时不生成标签', () => {
	const { api, editor, painter, options } = setup({ showIndexLabels: false });
	const { model, plan } = sampleModel(options);
	painter.paint(editor, model, plan, options);
	assert.ok(!api.state.decorationTypes.some((type) => type.options.after));
});

test('起点用主题色高亮', () => {
	const { api, editor, painter, options } = setup();
	const { model, plan } = sampleModel(options);
	painter.paint(editor, model, plan, options);
	const subjectType = api.state.decorationTypes.find((type) => type.options.backgroundColor);
	assert.ok(subjectType);
	assert.equal(subjectType.options.backgroundColor.id, 'editor.findMatchHighlightBackground');
	assert.equal(subjectType.options.borderColor.id, 'editor.findMatchBorder');
});

test('没有起点时不画任何装饰', () => {
	const { api, editor, painter, options } = setup();
	const model = { subject: null, related: [], sameFile: [], otherFiles: [], truncated: false };
	painter.paint(editor, model, planConnectors(null, [], options), options);
	assert.equal(editor.decorations.length, 0);
	assert.equal(api.state.decorationTypes.length, 0);
});

test('clear 清空所有已创建的装饰类型', () => {
	const { editor, painter, options } = setup();
	const { model, plan } = sampleModel(options);
	painter.paint(editor, model, plan, options);
	editor.decorations.length = 0;
	painter.clear(editor);
	assert.ok(editor.decorations.length > 0);
	assert.ok(editor.decorations.every((item) => item.ranges.length === 0));
});

test('多个引用使用不同颜色，颜色按配色循环', () => {
	const { api, editor, painter, options } = setup({ palette: ['#111111', '#222222'], lineWidth: 1 });
	const subject = anchor({ startLine: 0, startChar: 4, endChar: 7, indent: 4 });
	const targets = [1, 2, 3].map((line) => anchor({ startLine: line, startChar: 4, endChar: 7, indent: 4 }));
	const model = { subject, related: targets, sameFile: targets, otherFiles: [], truncated: false };
	painter.paint(editor, model, planConnectors(subject, targets, options), options);
	const colors = api.state.decorationTypes
		.filter((type) => type.options.borderWidth === '1px 0 0 0')
		.map((type) => type.options.borderColor);
	assert.deepEqual(colors, ['#111111', '#222222']);
	assert.ok(editor.decorations.some((item) => item.ranges.length > 0));
});

test('dispose 释放全部装饰类型', () => {
	const { editor, painter, options } = setup();
	const { model, plan } = sampleModel(options);
	painter.paint(editor, model, plan, options);
	painter.dispose();
	editor.decorations.length = 0;
	painter.clear(editor);
	assert.equal(editor.decorations.length, 0);
});

test('连线粗细与线型来自配置', () => {
	const { api, editor, painter, options } = setup({ lineWidth: 3, lineStyle: 'dashed' });
	const { model, plan } = sampleModel(options);
	painter.paint(editor, model, plan, options);

	const rail = api.state.decorationTypes.find((type) => type.options.borderWidth === '0 0 0 3px');
	assert.ok(rail, '应创建 3px 导轨');
	assert.equal(rail.options.borderStyle, 'dashed');

	const stub = api.state.decorationTypes.find((type) => type.options.borderWidth === '3px 0 0 0');
	assert.ok(stub, '应创建 3px 短接线');
	assert.equal(stub.options.borderStyle, 'dashed');
});

test('样式改动无需重建 painter 即生效（样式指纹）', () => {
	const { api, editor, painter, options } = setup({ lineWidth: 1, lineStyle: 'solid' });
	const first = sampleModel(options);
	painter.paint(editor, first.model, first.plan, options);
	assert.ok(api.state.decorationTypes.some((type) => type.options.borderWidth === '0 0 0 1px'));

	const bolder = normalizeOptions({ palette: ['#111111'], lineWidth: 4, lineStyle: 'dotted' });
	const second = sampleModel(bolder);
	painter.paint(editor, second.model, second.plan, bolder);

	const rail = api.state.decorationTypes.find((type) => type.options.borderWidth === '0 0 0 4px');
	assert.ok(rail, '样式指纹变化后应重建出 4px 导轨');
	assert.equal(rail.options.borderStyle, 'dotted');
});

test('引用高亮框圆角可配，描边固定 1px', () => {
	const { api, editor, painter, options } = setup({ markBorderRadius: 0, lineWidth: 4 });
	const { model, plan } = sampleModel(options);
	painter.paint(editor, model, plan, options);

	const mark = api.state.decorationTypes.find(
		(type) => type.options.borderColor === '#111111' && type.options.borderWidth === '1px'
	);
	assert.ok(mark, '应创建引用高亮框');
	assert.equal(mark.options.borderRadius, '0px');
	assert.equal(mark.options.borderStyle, 'solid');
});

test('光标所在符号也有序号，定义/声明为 0', () => {
	const { api, editor, painter, options } = setup();
	const { model, plan } = sampleModel(options);
	painter.paint(editor, model, plan, options);

	const texts = api.state.decorationTypes
		.filter((type) => type.options.after)
		.map((type) => type.options.after.contentText)
		.sort();
	// 目标(定义) = 0，光标符号(引用) = 1
	assert.deepEqual(texts, ['0', '1']);
});

test('showIndexLabels=false 时连光标符号也不加序号', () => {
	const { api, editor, painter, options } = setup({ showIndexLabels: false });
	const { model, plan } = sampleModel(options);
	painter.paint(editor, model, plan, options);
	assert.equal(api.state.decorationTypes.filter((type) => type.options.after).length, 0);
});

test('小数粗细原样写进边框，不会被取整', () => {
	const { api, editor, painter, options } = setup({ lineWidth: 1.5 });
	const { model, plan } = sampleModel(options);
	painter.paint(editor, model, plan, options);

	assert.ok(
		api.state.decorationTypes.some((type) => type.options.borderWidth === '0 0 0 1.5px'),
		'导轨应为 0 0 0 1.5px'
	);
	assert.ok(
		api.state.decorationTypes.some((type) => type.options.borderWidth === '1.5px 0 0 0'),
		'短接线应为 1.5px 0 0 0'
	);
});
