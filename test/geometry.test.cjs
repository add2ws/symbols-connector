'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planConnectors } = require('../out/core/geometry.js');
const { anchor } = require('./support/anchors.cjs');

const OPTIONS = { railSpacing: 2, maxRailLanes: 4, minRailColumn: 0 };

test('没有起点或没有目标时返回空计划', () => {
	assert.deepEqual(planConnectors(null, [anchor({})], OPTIONS).segments, []);
	assert.deepEqual(planConnectors(anchor({}), [], OPTIONS).segments, []);
	assert.equal(planConnectors(null, [], OPTIONS).laneCount, 0);
});

test('跨行目标：导轨按行拆开，两端各接一段横向短线', () => {
	const subject = anchor({ startLine: 2, startChar: 6, endChar: 9, indent: 4 });
	const target = anchor({ startLine: 6, startChar: 6, endChar: 9, indent: 4 });
	const plan = planConnectors(subject, [target], OPTIONS);

	assert.equal(plan.baseColumn, 0);
	assert.deepEqual(plan.targetColumns, [0]);
	assert.equal(plan.laneCount, 1);

	const rails = plan.segments.filter((segment) => segment.role === 'rail');
	// 导轨只覆盖 [top, bottom)，不含下端那一行
	assert.deepEqual(rails.map((segment) => segment.line), [2, 3, 4, 5]);
	assert.ok(rails.every((segment) => segment.startChar === 0 && segment.endChar === 0));

	const stubs = plan.segments.filter((segment) => segment.role === 'stub');
	assert.deepEqual(
		stubs.map((segment) => [segment.line, segment.startChar, segment.endChar]),
		[[2, 0, 6], [6, 0, 6]]
	);
});

test('同一行的目标只画一段横向短线', () => {
	const subject = anchor({ startLine: 4, startChar: 10, endChar: 13, indent: 8 });
	const target = anchor({ startLine: 4, startChar: 20, endChar: 24, indent: 8 });
	const plan = planConnectors(subject, [target], OPTIONS);
	assert.equal(plan.segments.length, 1);
	assert.deepEqual(plan.segments[0], { role: 'stub', targetIndex: 0, lane: 0, line: 4, startChar: 10, endChar: 24 });
});

test('多个目标按道错开，超过道数后循环复用', () => {
	const subject = anchor({ startLine: 0, startChar: 12, endChar: 15, indent: 8 });
	const targets = [4, 8, 12].map((line) => anchor({ startLine: line, startChar: 12, endChar: 15, indent: 8 }));
	const plan = planConnectors(subject, targets, { railSpacing: 2, maxRailLanes: 2, minRailColumn: 0 });
	// 贴左为基准，附加道向右展开：0、2、0
	assert.equal(plan.baseColumn, 0);
	assert.deepEqual(plan.targetColumns, [0, 2, 0]);
	assert.equal(plan.laneCount, 2);
});

test('目标在光标上方时导轨覆盖两者之间的所有行', () => {
	const subject = anchor({ startLine: 9, startChar: 4, endChar: 7, indent: 4 });
	const target = anchor({ startLine: 7, startChar: 4, endChar: 7, indent: 4 });
	const plan = planConnectors(subject, [target], OPTIONS);
	assert.deepEqual(plan.segments.filter((segment) => segment.role === 'rail').map((segment) => segment.line), [7, 8]);
});

test('导轨列号不会越过 minRailColumn，也不会为负', () => {
	const subject = anchor({ startLine: 0, startChar: 2, endChar: 5, indent: 0 });
	const targets = [3, 6, 9].map((line) => anchor({ startLine: line, startChar: 2, endChar: 5, indent: 0 }));
	const plan = planConnectors(subject, targets, { railSpacing: 3, maxRailLanes: 4, minRailColumn: 0 });
	assert.ok(plan.targetColumns.every((column) => column >= 0));
	assert.ok(plan.segments.every((segment) => segment.startChar >= 0 && segment.endChar >= 0));
});

test('每个目标都用自己这一组的颜色下标', () => {
	const subject = anchor({ startLine: 0, startChar: 0, endChar: 1, indent: 2 });
	const targets = [2, 4].map((line) => anchor({ startLine: line, startChar: 0, endChar: 1, indent: 2 }));
	const plan = planConnectors(subject, targets, OPTIONS);
	const targetIndexes = new Set(plan.segments.map((segment) => segment.targetIndex));
	assert.deepEqual(Array.from(targetIndexes).sort(), [0, 1]);
});

test('lineIndent 限制并行导轨向右展开的范围', () => {
	const subject = anchor({ startLine: 5, startChar: 12, endChar: 30, indent: 12 });
	const targets = [6, 7, 8, 9].map((line) => anchor({ startLine: line, startChar: 12, endChar: 30, indent: 12 }));
	// 第 7 行只缩进 2 个字符 → 导轨最多只能到第 1 列，否则会压在这行代码上
	const indents = { 5: 12, 6: 12, 7: 2, 8: 12, 9: 12 };
	const plan = planConnectors(subject, targets, { railSpacing: 1, maxRailLanes: 4, minRailColumn: 0 }, (line) => indents[line]);
	assert.equal(plan.baseColumn, 0);
	assert.deepEqual(plan.targetColumns, [0, 1, 0, 1]);
	assert.ok(plan.segments.every((segment) => segment.startChar <= 1));
});

test('空行（lineIndent 返回 undefined）不参与展开范围计算', () => {
	const subject = anchor({ startLine: 1, startChar: 8, endChar: 20, indent: 6 });
	const targets = [2, 3, 4].map((line) => anchor({ startLine: line, startChar: 8, endChar: 20, indent: 6 }));
	const plan = planConnectors(subject, targets, { railSpacing: 1, maxRailLanes: 4, minRailColumn: 0 }, (line) => (line === 2 ? undefined : 6));
	assert.deepEqual(plan.targetColumns, [0, 1, 2]);
});

test('缩进不够时并行道数被压到可用列数', () => {
	const subject = anchor({ startLine: 0, startChar: 4, endChar: 8, indent: 2 });
	const targets = [2, 4, 6, 8].map((line) => anchor({ startLine: line, startChar: 4, endChar: 8, indent: 2 }));
	// 缩进只有 2 个字符 → 最长只能到第 1 列，间距 3 放不下第二条道
	const plan = planConnectors(subject, targets, { railSpacing: 3, maxRailLanes: 4, minRailColumn: 0 }, () => 2);
	assert.equal(plan.baseColumn, 0);
	assert.equal(plan.laneCount, 1);
	assert.deepEqual(plan.targetColumns, [0, 0, 0, 0]);
});

test('缩进为 0 时全部导轨共用第 0 列', () => {
	const subject = anchor({ startLine: 0, startChar: 0, endChar: 3, indent: 0 });
	const targets = [2, 4].map((line) => anchor({ startLine: line, startChar: 0, endChar: 3, indent: 0 }));
	const plan = planConnectors(subject, targets, OPTIONS, () => 0);
	assert.equal(plan.baseColumn, 0);
	assert.equal(plan.laneCount, 1);
	assert.deepEqual(plan.targetColumns, [0, 0]);
});

test('Tab 缩进：导轨必须落在代码起始列之前（回归）', () => {
	// 三行都是 \t\t\tapi.window.xxx(...)，代码从字符列 3 开始
	const subject = anchor({ startLine: 0, startChar: 14, endChar: 44, indent: 3 });
	const target = anchor({ startLine: 3, startChar: 14, endChar: 44, indent: 3 });
	const plan = planConnectors(subject, [target], OPTIONS, () => 3);
	assert.equal(plan.baseColumn, 0);
	for (const column of plan.targetColumns) {
		assert.ok(column < 3, '导轨列 ' + column + ' 压到了代码上');
	}
});

test('导轨不覆盖靠近下端的那一行（否则会多出一截悬空的竖线）', () => {
	const subject = anchor({ startLine: 10, startChar: 8, endChar: 12, indent: 4 });
	const below = anchor({ startLine: 14, startChar: 8, endChar: 12, indent: 4 });
	const above = anchor({ startLine: 6, startChar: 8, endChar: 12, indent: 4 });

	const downward = planConnectors(subject, [below], OPTIONS);
	assert.deepEqual(
		downward.segments.filter((segment) => segment.role === 'rail').map((segment) => segment.line),
		[10, 11, 12, 13]
	);
	assert.ok(!downward.segments.some((segment) => segment.role === 'rail' && segment.line === 14));

	const upward = planConnectors(subject, [above], OPTIONS);
	assert.deepEqual(
		upward.segments.filter((segment) => segment.role === 'rail').map((segment) => segment.line),
		[6, 7, 8, 9]
	);
	assert.ok(!upward.segments.some((segment) => segment.role === 'rail' && segment.line === 10));
});

test('相邻两行之间只需要一段导轨', () => {
	const subject = anchor({ startLine: 10, startChar: 8, endChar: 12, indent: 4 });
	const target = anchor({ startLine: 11, startChar: 8, endChar: 12, indent: 4 });
	const plan = planConnectors(subject, [target], OPTIONS);
	assert.deepEqual(plan.segments.filter((segment) => segment.role === 'rail').map((segment) => segment.line), [10]);
});

test('默认所有导轨贴齐最左列（不再出现阶梯状的最左端）', () => {
	const subject = anchor({ startLine: 0, startChar: 12, endChar: 15, indent: 8 });
	const targets = [3, 6, 9].map((line) => anchor({ startLine: line, startChar: 12, endChar: 15, indent: 8 }));
	const plan = planConnectors(subject, targets, { railSpacing: 2, maxRailLanes: 1, minRailColumn: 0 });

	assert.equal(plan.baseColumn, 0);
	assert.equal(plan.laneCount, 1);
	assert.deepEqual(plan.targetColumns, [0, 0, 0]);
	assert.ok(
		plan.segments.filter((segment) => segment.role === 'rail').every((segment) => segment.startChar === 0),
		'所有导轨都应在第 0 列'
	);
});

test('缩进很深也不会把导轨整体右缩', () => {
	const subject = anchor({ startLine: 0, startChar: 40, endChar: 44, indent: 36 });
	const target = anchor({ startLine: 5, startChar: 40, endChar: 44, indent: 36 });
	const plan = planConnectors(subject, [target], { railSpacing: 2, maxRailLanes: 1, minRailColumn: 0 });
	assert.equal(plan.baseColumn, 0);
	assert.deepEqual(plan.targetColumns, [0]);
});
