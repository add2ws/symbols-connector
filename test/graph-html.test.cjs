'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGraphHtml } = require('../out/core/graphHtml.js');

const INPUT = {
	svg: '<svg class="connector-graph"></svg>',
	title: '符号引用关系图 · a<b>.ts',
	subtitle: 'L12 · 相关位置 3 个',
	paletteSize: 3,
	palette: ['#111111', '#222222', '#333333'],
	nonce: 'NONCE123',
	cspSource: 'vscode-webview://abc'
};

test('CSP 与内联脚本使用同一个 nonce', () => {
	const html = buildGraphHtml(INPUT);
	assert.ok(html.includes("script-src 'nonce-NONCE123'"));
	assert.ok(html.includes('<script nonce="NONCE123">'));
	assert.ok(html.includes("default-src 'none'"));
	assert.ok(html.includes('vscode-webview://abc'));
});

test('标题按 HTML 转义，SVG 原样嵌入', () => {
	const html = buildGraphHtml(INPUT);
	assert.ok(html.includes('a&lt;b&gt;.ts'));
	assert.ok(!html.includes('a<b>.ts'));
	assert.ok(html.includes(INPUT.svg));
});

test('图例颜色数量与配色一致', () => {
	const html = buildGraphHtml(INPUT);
	assert.equal((html.match(/class="legend-dot"/g) || []).length, 3);
	assert.ok(html.includes('#333333'));
});

test('点击跳转脚本齐全', () => {
	const html = buildGraphHtml(INPUT);
	assert.ok(html.includes('acquireVsCodeApi'));
	assert.ok(html.includes('"reveal"'));
	assert.ok(html.includes('postMessage'));
});
