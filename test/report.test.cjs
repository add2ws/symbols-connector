'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTextReport } = require('../out/core/report.js');
const { anchor, model } = require('./support/anchors.cjs');

test('报告包含起点、统计与逐条清单', () => {
	const subject = anchor({ shortPath: 'src/a.ts', startLine: 11, startChar: 4, role: 'definition' });
	const related = [
		anchor({ shortPath: 'src/a.ts', startLine: 20, startChar: 2, role: 'reference', preview: '  value + 1' }),
		anchor({ shortPath: 'src/b.ts', startLine: 2, startChar: 0, role: 'definition', preview: 'const value' })
	];
	const text = renderTextReport(model({ subject, related, truncated: true }));
	assert.ok(text.includes('src/a.ts:12:5'));
	assert.ok(text.includes('2 related positions (truncated)'));
	assert.ok(text.includes('[Reference] src/a.ts:21:3'));
	assert.ok(text.includes('[Definition] src/b.ts:3:1'));
});

test('没有起点时不抛异常', () => {
	const text = renderTextReport(model({ subject: null, related: [] }));
	assert.ok(text.includes('could not identify'));
});
