'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { anchorKey, mergeAnchors } = require('../out/core/merge.js');
const { anchor } = require('./support/anchors.cjs');

const OPTIONS = { includeDeclaration: true, maxRelated: 10 };
const empty = { subject: null, definitions: [], declarations: [], references: [] };

test('同一位置的定义与引用会被合并，并保留定义角色', () => {
	const definition = anchor({ startLine: 3, startChar: 6, endChar: 9, role: 'definition' });
	const reference = anchor({ startLine: 3, startChar: 6, endChar: 11, role: 'reference' });
	const result = mergeAnchors({ ...empty, definitions: [definition], references: [reference] }, OPTIONS);
	assert.equal(result.related.length, 1);
	assert.equal(result.related[0].role, 'definition');
});

test('光标符号自身不算相关位置', () => {
	const subject = anchor({ startLine: 1, startChar: 4, endChar: 7 });
	const other = anchor({ startLine: 8, startChar: 0, endChar: 3 });
	const result = mergeAnchors({ ...empty, subject, definitions: [subject], references: [subject, other] }, OPTIONS);
	assert.equal(result.related.length, 1);
	assert.equal(result.related[0].startLine, 8);
});

test('当前文件优先，其余按路径与行号排序', () => {
	const subject = anchor({ uri: 'file:///w/a.ts', shortPath: 'a.ts' });
	const references = [
		anchor({ uri: 'file:///w/z.ts', shortPath: 'z.ts', startLine: 2 }),
		anchor({ uri: 'file:///w/b.ts', shortPath: 'b.ts', startLine: 9 }),
		anchor({ uri: 'file:///w/a.ts', shortPath: 'a.ts', startLine: 30 }),
		anchor({ uri: 'file:///w/a.ts', shortPath: 'a.ts', startLine: 12 }),
		anchor({ uri: 'file:///w/b.ts', shortPath: 'b.ts', startLine: 1 })
	];
	const result = mergeAnchors({ ...empty, subject, references }, OPTIONS);
	assert.deepEqual(
		result.related.map((item) => item.shortPath + ':' + item.startLine),
		['a.ts:12', 'a.ts:30', 'b.ts:1', 'b.ts:9', 'z.ts:2']
	);
	assert.equal(result.sameFile.length, 2);
	assert.equal(result.otherFiles.length, 3);
});

test('includeDeclaration=false 时忽略声明但保留定义', () => {
	const definitions = [anchor({ startLine: 1, role: 'definition' })];
	const declarations = [anchor({ startLine: 2, role: 'declaration' })];
	const references = [anchor({ startLine: 3, role: 'reference' })];
	const raw = { ...empty, definitions, declarations, references };
	assert.deepEqual(
		mergeAnchors(raw, { includeDeclaration: false, maxRelated: 10 }).related.map((item) => item.role),
		['definition', 'reference']
	);
	assert.deepEqual(
		mergeAnchors(raw, { includeDeclaration: true, maxRelated: 10 }).related.map((item) => item.role),
		['definition', 'declaration', 'reference']
	);
});

test('超过上限时截断并打上标记', () => {
	const references = [0, 1, 2, 3].map((line) => anchor({ startLine: line }));
	const result = mergeAnchors({ ...empty, references }, { includeDeclaration: true, maxRelated: 2 });
	assert.equal(result.related.length, 2);
	assert.equal(result.truncated, true);
});

test('没有达到上限时不标记截断', () => {
	const result = mergeAnchors({ ...empty, references: [anchor({ startLine: 1 })] }, OPTIONS);
	assert.equal(result.truncated, false);
});

test('anchorKey 由文件与起始位置组成', () => {
	assert.equal(anchorKey(anchor({ uri: 'file:///w/a.ts', startLine: 4, startChar: 2 })), 'file:///w/a.ts#4:2');
});

test('光标停在定义上时，subject 的角色会被升级为定义', () => {
	const subject = anchor({ startLine: 3, startChar: 6, endChar: 9, role: 'reference' });
	const definition = anchor({ startLine: 3, startChar: 6, endChar: 9, role: 'definition' });
	const result = mergeAnchors({ ...empty, subject, definitions: [definition], references: [subject] }, OPTIONS);
	assert.equal(result.subject.role, 'definition');
	assert.equal(result.related.length, 0);
});

test('光标停在普通引用上时，subject 角色保持引用', () => {
	const subject = anchor({ startLine: 3, startChar: 6, endChar: 9 });
	const result = mergeAnchors(
		{ ...empty, subject, definitions: [anchor({ startLine: 1, role: 'definition' })], references: [subject] },
		OPTIONS
	);
	assert.equal(result.subject.role, 'reference');
	assert.equal(result.related.length, 1);
	assert.equal(result.related[0].role, 'definition');
});
