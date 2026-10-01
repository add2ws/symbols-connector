'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_OPTIONS, DEFAULT_PALETTE, LINE_STYLES, colorFor, normalizeOptions } = require('../out/core/config.js');

test('非法输入整体回退到默认值', () => {
	assert.deepEqual(normalizeOptions(undefined), DEFAULT_OPTIONS);
	assert.deepEqual(normalizeOptions(null), DEFAULT_OPTIONS);
	assert.deepEqual(normalizeOptions('nonsense'), DEFAULT_OPTIONS);
	assert.deepEqual(normalizeOptions([]), DEFAULT_OPTIONS);
});

test('数值被取整并夹到配置声明的区间', () => {
	const options = normalizeOptions({
		debounceMs: -50,
		maxRelated: 100000,
		railSpacing: 2.7,
		maxRailLanes: 0,
		minRailColumn: -3,
		previewFiles: 1e9
	});
	assert.equal(options.debounceMs, 0);
	assert.equal(options.maxRelated, 500);
	assert.equal(options.railSpacing, 3);
	assert.equal(options.maxRailLanes, 1);
	assert.equal(options.minRailColumn, 0);
	assert.equal(options.previewFiles, 100);
});

test('NaN 与 Infinity 回退到默认值', () => {
	const options = normalizeOptions({ debounceMs: Number.NaN, maxRelated: Number.POSITIVE_INFINITY });
	assert.equal(options.debounceMs, DEFAULT_OPTIONS.debounceMs);
	assert.equal(options.maxRelated, DEFAULT_OPTIONS.maxRelated);
});

test('类型不符的布尔项回退到默认值', () => {
	const options = normalizeOptions({ enabled: 'yes', autoOpenGraph: 'yes', editorLines: 1, showIndexLabels: null });
	assert.equal(options.enabled, DEFAULT_OPTIONS.enabled);
	assert.equal(options.autoOpenGraph, DEFAULT_OPTIONS.autoOpenGraph);
	assert.equal(options.editorLines, DEFAULT_OPTIONS.editorLines);
	assert.equal(options.showIndexLabels, DEFAULT_OPTIONS.showIndexLabels);
});

test('配色会去掉空白项与非法项，全空时回退默认', () => {
	assert.deepEqual(normalizeOptions({ palette: [' #fff ', 42, '', null] }).palette, ['#fff']);
	assert.deepEqual(normalizeOptions({ palette: [] }).palette, DEFAULT_PALETTE);
	assert.deepEqual(normalizeOptions({ palette: 'red' }).palette, DEFAULT_PALETTE);
});

test('归一化结果与入参脱钩', () => {
	const raw = { palette: ['#111'] };
	const options = normalizeOptions(raw);
	raw.palette.push('#222');
	assert.deepEqual(options.palette, ['#111']);
});

test('colorFor 支持任意整数下标', () => {
	assert.equal(colorFor(['a', 'b'], 0), 'a');
	assert.equal(colorFor(['a', 'b'], 3), 'b');
	assert.equal(colorFor(['a', 'b'], -1), 'b');
	assert.equal(colorFor([], 5), DEFAULT_PALETTE[0]);
});

test('连线样式：数值夹取与非法线型回退', () => {
	assert.equal(normalizeOptions({ lineWidth: 99 }).lineWidth, 8);
	assert.equal(normalizeOptions({ lineWidth: 0 }).lineWidth, 1);
	assert.equal(normalizeOptions({ lineWidth: 2.4 }).lineWidth, 2.4);
	assert.equal(normalizeOptions({ markBorderRadius: -5 }).markBorderRadius, 0);
	assert.equal(normalizeOptions({ markBorderRadius: 99 }).markBorderRadius, 12);
	assert.equal(normalizeOptions({ lineStyle: 'DASHED' }).lineStyle, 'dashed');
	assert.equal(normalizeOptions({ lineStyle: ' dashed ' }).lineStyle, 'dashed');
	assert.equal(normalizeOptions({ lineStyle: 'wavy' }).lineStyle, DEFAULT_OPTIONS.lineStyle);
	assert.equal(normalizeOptions({ lineStyle: 42 }).lineStyle, DEFAULT_OPTIONS.lineStyle);
});

test('默认样式是 1.5px 橙色虚线，线型枚举稳定', () => {
	assert.equal(DEFAULT_OPTIONS.lineWidth, 1.5);
	assert.equal(DEFAULT_OPTIONS.lineStyle, 'dashed');
	assert.equal(DEFAULT_OPTIONS.markBorderRadius, 3);
	assert.deepEqual(DEFAULT_PALETTE, ['#F5A623CC']);
	assert.deepEqual(LINE_STYLES, ['solid', 'dashed', 'dotted', 'double']);
});

test('px 尺寸保留小数，计数类仍然取整', () => {
	assert.equal(normalizeOptions({ lineWidth: 1.5 }).lineWidth, 1.5);
	assert.equal(normalizeOptions({ lineWidth: 0.4 }).lineWidth, 1); // 仍受最小值约束
	assert.equal(normalizeOptions({ lineWidth: 99 }).lineWidth, 8); // 仍受最大值约束
	assert.equal(normalizeOptions({ markBorderRadius: 2.5 }).markBorderRadius, 2.5);
	assert.equal(normalizeOptions({ markBorderRadius: 99 }).markBorderRadius, 12);

	// 计数 / 列号类不能出现小数
	assert.equal(normalizeOptions({ maxRelated: 2.7 }).maxRelated, 3);
	assert.equal(normalizeOptions({ railSpacing: 2.7 }).railSpacing, 3);
	assert.equal(normalizeOptions({ maxRailLanes: 2.7 }).maxRailLanes, 3);
	assert.equal(normalizeOptions({ minRailColumn: 2.7 }).minRailColumn, 3);
	assert.equal(normalizeOptions({ previewFiles: 2.7 }).previewFiles, 3);
	assert.equal(normalizeOptions({ debounceMs: 2.7 }).debounceMs, 3);
});
