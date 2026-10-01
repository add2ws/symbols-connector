'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_GRAPH_OPTIONS, layoutGraph } = require('../out/core/graphLayout.js');
const { anchor, model } = require('./support/anchors.cjs');

function buildModel() {
	const subject = anchor({
		uri: 'file:///w/a.ts', fileName: 'a.ts', shortPath: 'a.ts',
		startLine: 4, startChar: 6, endChar: 9, role: 'definition', preview: 'const value = 1;'
	});
	const related = [
		anchor({ uri: 'file:///w/a.ts', fileName: 'a.ts', shortPath: 'a.ts', startLine: 12, startChar: 2, endChar: 5, preview: 'value + 1' }),
		anchor({ uri: 'file:///w/b.ts', fileName: 'b.ts', shortPath: 'src/b.ts', startLine: 3, startChar: 8, endChar: 11, preview: 'value' }),
		anchor({ uri: 'file:///w/b.ts', fileName: 'b.ts', shortPath: 'src/b.ts', startLine: 30, startChar: 1, endChar: 4, preview: 'value' })
	];
	return model({ subject, related });
}

test('左侧一个起点节点，右侧按文件分组', () => {
	const layout = layoutGraph(buildModel());
	const subjectNodes = layout.nodes.filter((node) => node.kind === 'subject');
	assert.equal(subjectNodes.length, 1);
	assert.equal(subjectNodes[0].targetIndex, -1);
	assert.deepEqual(
		layout.groups.map((group) => [group.shortPath, group.count]),
		[['a.ts', 1], ['src/b.ts', 2]]
	);
	assert.equal(layout.groups[0].isCurrent, true);
	assert.equal(layout.groups[1].isCurrent, false);
});

test('每个相关位置一条贝塞尔边，颜色跟随序号', () => {
	const layout = layoutGraph(buildModel());
	assert.equal(layout.edges.length, 3);
	assert.ok(layout.edges.every((edge) => edge.path.startsWith('M ') && edge.path.includes(' C ')));
	// subject 本身是定义 → 0；三个引用依次 1、2、3
	assert.deepEqual(layout.edges.map((edge) => edge.colorIndex), [1, 2, 3]);
});

test('节点带序号：0 定义/声明，1 光标符号，2 起引用', () => {
	const layout = layoutGraph(buildModel());
	const subject = layout.nodes.find((node) => node.kind === 'subject');
	assert.equal(subject.label, 0);
	assert.deepEqual(layout.nodes.filter((node) => node.kind !== 'subject').map((node) => node.label), [1, 2, 3]);
});

test('光标符号按它在文件里的位置拿号，不是固定 1', () => {
	const subject = anchor({ uri: 'file:///w/a.ts', shortPath: 'a.ts', startLine: 20, role: 'reference' });
	const related = [
		anchor({ uri: 'file:///w/a.ts', shortPath: 'a.ts', startLine: 5, role: 'definition' }),
		anchor({ uri: 'file:///w/a.ts', shortPath: 'a.ts', startLine: 10, role: 'reference' }),
		anchor({ uri: 'file:///w/b.ts', shortPath: 'b.ts', startLine: 2, role: 'reference' })
	];
	const layout = layoutGraph(model({ subject, related }));
	const subjectNode = layout.nodes.find((node) => node.kind === 'subject');
	// L5 定义=0 → L10=1 → 光标 L20=2 → 其它文件=3
	assert.equal(subjectNode.label, 2);
	assert.deepEqual(layout.nodes.filter((node) => node.kind !== 'subject').map((node) => node.label), [0, 1, 3]);
});

test('右侧节点排在同一个 x 上，且纵向不重叠', () => {
	const layout = layoutGraph(buildModel());
	const right = layout.nodes.filter((node) => node.kind !== 'subject');
	assert.equal(new Set(right.map((node) => node.x)).size, 1);
	assert.equal(
		right[0].x,
		DEFAULT_GRAPH_OPTIONS.margin + DEFAULT_GRAPH_OPTIONS.nodeWidth + DEFAULT_GRAPH_OPTIONS.columnGap
	);
	for (let index = 1; index < right.length; index += 1) {
		assert.ok(right[index].y >= right[index - 1].y + right[index - 1].height);
	}
});

test('行预览被截断，行号标签从 1 开始', () => {
	const longPreview = anchor({ startLine: 0, preview: 'x'.repeat(200) });
	const layout = layoutGraph(model({ subject: anchor({}), related: [longPreview] }), { previewMaxChars: 10 });
	const node = layout.nodes.find((item) => item.kind !== 'subject');
	assert.equal(node.preview.length, 10);
	assert.equal(node.lineLabel, 'L1');
	assert.equal(node.uri, longPreview.uri);
});

test('没有相关位置时只画起点节点', () => {
	const layout = layoutGraph(model({ subject: anchor({}), related: [] }));
	assert.equal(layout.groups.length, 0);
	assert.equal(layout.edges.length, 0);
	assert.equal(layout.nodes.length, 1);
	assert.ok(layout.width > 0 && layout.height > 0);
});

test('没有起点时仍然排出引用节点', () => {
	const layout = layoutGraph(model({ subject: null, related: [anchor({ startLine: 1 }), anchor({ startLine: 2 })] }));
	assert.equal(layout.nodes.length, 2);
	assert.equal(layout.edges.length, 0);
	assert.ok(layout.height > 0);
});

test('颜色下标就是序号，不再按配色数量取模', () => {
	const layout = layoutGraph(buildModel());
	assert.deepEqual(layout.nodes.filter((node) => node.kind !== 'subject').map((node) => node.colorIndex), [1, 2, 3]);
});
