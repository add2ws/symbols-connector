'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isBlankLine, leadingWhitespaceChars } = require('../out/core/text.js');

test('Tab 记为 1 个字符（回归：曾按 4 个视觉列计，导致导轨压到代码上）', () => {
	assert.equal(leadingWhitespaceChars('\t\t\tapi'), 3);
	assert.equal(leadingWhitespaceChars('    api'), 4);
	assert.equal(leadingWhitespaceChars(' \t api'), 3);
});

test('没有缩进或空串返回 0', () => {
	assert.equal(leadingWhitespaceChars('api'), 0);
	assert.equal(leadingWhitespaceChars(''), 0);
	assert.equal(leadingWhitespaceChars('}'), 0);
});

test('整行都是空白时返回整行长度', () => {
	assert.equal(leadingWhitespaceChars('   '), 3);
	assert.equal(leadingWhitespaceChars('\t\t'), 2);
});

test('isBlankLine 只认全空白行', () => {
	assert.equal(isBlankLine(''), true);
	assert.equal(isBlankLine('   \t '), true);
	assert.equal(isBlankLine(' }'), false);
	assert.equal(isBlankLine('}'), false);
});
