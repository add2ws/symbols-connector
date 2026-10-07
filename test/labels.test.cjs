'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { labelPosition } = require('../out/core/labels.js');
const { anchor } = require('./support/anchors.cjs');

const LINE = '      pg_row.try_get(i)';

test('上一行是空行时，序号浮到 symbol 上方同一列', () => {
	const target = anchor({ startLine: 4, startChar: 6, endChar: 12 });
	assert.deepEqual(labelPosition(target, LINE, ''), { line: 3, char: 6 });
});

test('上一行比该列短也算安全：插入不会推动任何代码', () => {
	const target = anchor({ startLine: 4, startChar: 6, endChar: 12 });
	assert.deepEqual(labelPosition(target, LINE, '  }'), { line: 3, char: 6 });
});

test('上一行在该列之后还有代码时退到本行行尾，绝不推开代码', () => {
	const target = anchor({ startLine: 4, startChar: 6, endChar: 12 });
	assert.deepEqual(labelPosition(target, LINE, '  let result: BigDecimal = if type_name.contains("x") {'), {
		line: 4,
		char: LINE.length
	});
});

test('第一行没有上一行时退到本行行尾', () => {
	const target = anchor({ startLine: 0, startChar: 0, endChar: 5 });
	assert.deepEqual(labelPosition(target, 'const a = 1;', undefined), { line: 0, char: 12 });
});

test('连行文本都读不到时才贴着标识符放', () => {
	const target = anchor({ startLine: 2, startChar: 4, endLine: 2, endChar: 7 });
	assert.deepEqual(labelPosition(target, undefined, '    foo();'), { line: 2, char: 7 });
});
