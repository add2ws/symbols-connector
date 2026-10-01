'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DECLARATION_LABEL, numberAnchors } = require('../out/core/numbering.js');
const { anchor } = require('./support/anchors.cjs');

test('常量：定义/声明是 0', () => {
	assert.equal(DECLARATION_LABEL, 0);
});

test('按代码上下顺序编号，定义/声明为 0', () => {
	const subject = anchor({ startLine: 20, role: 'reference' });
	const related = [
		anchor({ startLine: 5, role: 'definition' }),
		anchor({ startLine: 10, role: 'reference' }),
		anchor({ uri: 'file:///w/b.ts', shortPath: 'b.ts', startLine: 2, role: 'reference' })
	];
	const numbering = numberAnchors(subject, related);
	// L5 定义=0 → L10 引用=1 → 光标 L20=2 → 其它文件=3
	assert.equal(numbering.subjectLabel, 2);
	assert.deepEqual(numbering.labels, [0, 1, 3]);
});

test('光标在最上面时就是 1', () => {
	const subject = anchor({ startLine: 0, role: 'reference' });
	const related = [anchor({ startLine: 5, role: 'definition' }), anchor({ startLine: 9, role: 'reference' })];
	const numbering = numberAnchors(subject, related);
	assert.equal(numbering.subjectLabel, 1);
	assert.deepEqual(numbering.labels, [0, 2]);
});

test('光标就在定义上时是 0，且不占用递增号', () => {
	const subject = anchor({ startLine: 5, role: 'definition' });
	const numbering = numberAnchors(subject, [anchor({ startLine: 9, role: 'reference' })]);
	assert.equal(numbering.subjectLabel, DECLARATION_LABEL);
	assert.deepEqual(numbering.labels, [1]);
});

test('多个定义/声明共享 0，且不占用递增号', () => {
	const related = [
		anchor({ startLine: 1, role: 'declaration' }),
		anchor({ startLine: 2, role: 'definition' }),
		anchor({ startLine: 3, role: 'reference' })
	];
	const numbering = numberAnchors(anchor({ startLine: 10 }), related);
	assert.deepEqual(numbering.labels, [0, 0, 1]);
	assert.equal(numbering.subjectLabel, 2);
});

test('没有起点时引用仍从 1 开始', () => {
	const numbering = numberAnchors(null, [anchor({ startLine: 1 }), anchor({ startLine: 2 })]);
	assert.equal(numbering.subjectLabel, null);
	assert.deepEqual(numbering.labels, [1, 2]);
});

test('编号与输入一一对应，不重排数组', () => {
	const related = [anchor({ startLine: 9 }), anchor({ startLine: 2 }), anchor({ startLine: 5 })];
	const numbering = numberAnchors(null, related);
	assert.equal(numbering.labels.length, related.length);
	assert.deepEqual(numbering.labels, [1, 2, 3]);
});

test('同一行上的光标符号按列号插到正确位置', () => {
	const subject = anchor({ startLine: 4, startChar: 20, role: 'reference' });
	const related = [anchor({ startLine: 4, startChar: 5, role: 'reference' })];
	const numbering = numberAnchors(subject, related);
	assert.equal(numbering.subjectLabel, 2);
	assert.deepEqual(numbering.labels, [1]);
});
