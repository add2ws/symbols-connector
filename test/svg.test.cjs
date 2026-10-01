'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderGraphSvg } = require('../out/core/svg.js');
const { layoutGraph } = require('../out/core/graphLayout.js');
const { escapeXml, truncate } = require('../out/core/xml.js');
const { anchor, model } = require('./support/anchors.cjs');

const PALETTE = ['#111111', '#222222'];

function buildLayout() {
	const subject = anchor({
		uri: 'file:///w/a.ts', fileName: 'a<b>&"c".ts', shortPath: 'a<b>.ts',
		startLine: 0, startChar: 0, endChar: 6, role: 'definition', preview: 'export function foo() {'
	});
	const related = [
		anchor({ uri: 'file:///w/b.ts', fileName: 'b.ts', shortPath: 'src/b.ts', startLine: 7, startChar: 4, endChar: 7, preview: 'foo(x)' })
	];
	return layoutGraph(model({ subject, related }));
}

test('输出是完整的 svg 根元素', () => {
	const svg = renderGraphSvg(buildLayout(), { palette: PALETTE, showPreview: true });
	assert.ok(svg.startsWith('<svg '));
	assert.ok(svg.endsWith('</svg>'));
	assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
});

test('文件名与路径中的特殊字符被转义', () => {
	const svg = renderGraphSvg(buildLayout(), { palette: PALETTE, showPreview: true });
	assert.ok(!svg.includes('<b>'));
	assert.ok(svg.includes('a&lt;b&gt;'));
	assert.ok(svg.includes('data-uri="file:///w/b.ts"'));
});

test('每个节点都带跳转所需的数据属性', () => {
	const svg = renderGraphSvg(buildLayout(), { palette: PALETTE, showPreview: true });
	assert.equal((svg.match(/class="node node-/g) || []).length, 2);
	assert.ok(svg.includes('data-line="7"'));
	assert.ok(svg.includes('data-char="4"'));
	assert.ok(svg.includes('tabindex="0"'));
});

test('边的数量与配色和布局一致', () => {
	const layout = buildLayout();
	const svg = renderGraphSvg(layout, { palette: PALETTE, showPreview: true });
	assert.equal((svg.match(/class="edge"/g) || []).length, layout.edges.length);
	// subject 是 definition → 序号 0（PALETTE[0]）；边连的是引用 → 序号 1（PALETTE[1]）
	assert.ok(svg.includes('stroke: ' + PALETTE[1]));
});

test('打开预览时渲染源码行，关闭时不渲染', () => {
	const withPreview = renderGraphSvg(buildLayout(), { palette: PALETTE, showPreview: true });
	assert.ok(withPreview.includes('node-preview'));
	assert.ok(withPreview.includes('export function foo() {'));
	const withoutPreview = renderGraphSvg(buildLayout(), { palette: PALETTE, showPreview: false });
	assert.ok(!withoutPreview.includes('node-preview'));
});

test('文件分组标题带出现次数', () => {
	const svg = renderGraphSvg(buildLayout(), { palette: PALETTE, showPreview: true });
	assert.ok(svg.includes('src/b.ts'));
	assert.ok(svg.includes('1 ref'));
});

test('escapeXml 覆盖全部五个字符', () => {
	assert.equal(escapeXml('<&>"' + "'"), '&lt;&amp;&gt;&quot;&apos;');
});

test('truncate 按字符数截断并补省略号', () => {
	assert.equal(truncate('abcdef', 4), 'abc…');
	assert.equal(truncate('abc', 4), 'abc');
	assert.equal(truncate('abc', 0), '');
});

test('SVG 标签成对闭合，文本里没有裸 & 或 <', () => {
	const svg = renderGraphSvg(buildLayout(), { palette: PALETTE, showPreview: true });
	const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
	const stack = [];
	const stray = [];
	let index = 0;
	let match;
	while ((match = tagPattern.exec(svg)) !== null) {
		const between = svg.slice(index, match.index);
		if (between.includes('<') || /&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(between)) {
			stray.push(between.slice(0, 40));
		}
		index = tagPattern.lastIndex;
		if (match[1] === '/') {
			assert.equal(stack.pop(), match[2], '闭合标签与开始标签不匹配');
		} else if (match[4] !== '/') {
			stack.push(match[2]);
		}
	}
	assert.deepEqual(stack, [], '存在未闭合的标签');
	assert.deepEqual(stray, [], '文本节点里出现未转义字符');
});

test('节点上显示 #序号 与行号', () => {
	const svg = renderGraphSvg(buildLayout(), { palette: PALETTE, showPreview: true });
	assert.ok(svg.includes('#0 · L1'), 'subject 是定义，应为 #0');
	assert.ok(svg.includes('#1 · L8'), '引用在 0 起始第 7 行，应为 #1 · L8');
});
