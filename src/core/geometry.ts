import type { Anchor } from './types';

/** 画面几何参数，只取 planConnectors 真正需要的字段。 */
export interface GeometryOptions {
	/** 并行导轨之间的字符列数；只有 maxRailLanes > 1 时才用得上。 */
	railSpacing: number;
	/** 最多几条并行导轨；默认 1，也就是所有连线贴齐最左列。 */
	maxRailLanes: number;
	/** 导轨基准列，默认 0 = 文本区最左边缘。 */
	minRailColumn: number;
}

/**
 * 查询某一行的前导空白字符数。
 * 空行（整行都是空白）应返回 undefined，因为空行上任何列都不会压到代码。
 */
export interface LineIndentSource {
	(line: number): number | undefined;
}

export type SegmentRole = 'rail' | 'stub';

/**
 * 一段连线。为了绕开 VS Code 对跨行装饰边框的实现差异，
 * 这里统一拆成"单行线段"：导轨按行拆开，每行一段。
 * startChar / endChar 一律是**字符列**。
 */
export interface ConnectorSegment {
	role: SegmentRole;
	/** 该段属于 targets 中的第几个元素，用于取颜色。 */
	targetIndex: number;
	/** 导轨道号，0 是最靠近左边缘的一条。 */
	lane: number;
	line: number;
	startChar: number;
	endChar: number;
}

export interface ConnectorPlan {
	/** 第 0 条导轨的字符列号（等于 minRailColumn）。 */
	baseColumn: number;
	/** 实际用到的道数。 */
	laneCount: number;
	/** 每个 target 各自使用的导轨字符列号。 */
	targetColumns: number[];
	segments: ConnectorSegment[];
}

function clampInt(value: number, min: number, fallback: number): number {
	if (!Number.isFinite(value)) {
		return fallback;
	}
	return Math.max(min, Math.floor(value));
}

/**
 * 计算导轨允许到达的最右列。
 *
 * 导轨会**穿过**起点与目标之间的每一行，所以不能越过这些行里最浅的前导空白，
 * 否则就会压在代码上；不同缩进的行上同一个字符列对应的横坐标也不相同，
 * 一旦越过空白区，一条竖线就会断成阶梯。
 *
 * lineIndent 缺失时退化为只看起点与目标两端的缩进。
 */
function resolveMaxColumn(
	subject: Anchor,
	targets: Anchor[],
	minColumn: number,
	lineIndent?: LineIndentSource
): number {
	let minLeading: number | undefined;
	const consider = (value: number | undefined): void => {
		if (value === undefined || !Number.isFinite(value)) {
			return;
		}
		minLeading = minLeading === undefined ? value : Math.min(minLeading, value);
	};

	if (lineIndent) {
		let top = subject.startLine;
		let bottom = subject.startLine;
		for (const target of targets) {
			top = Math.min(top, target.startLine);
			bottom = Math.max(bottom, target.startLine);
		}
		for (let line = top; line <= bottom; line += 1) {
			consider(lineIndent(line));
		}
	}

	if (minLeading === undefined) {
		consider(subject.indent);
		for (const target of targets) {
			consider(target.indent);
		}
	}

	return Math.max(minColumn, (minLeading as number) - 1);
}

/**
 * 计算"光标符号 → 同文件内的每个相关位置"的正交折线。
 *
 * 默认所有导轨都贴在 minRailColumn（0 = 文本区最左边缘），合成一条竖线，
 * 横向短接线从这条竖线分叉到各个 token —— 最左端是一条直线，不会出现阶梯。
 * 需要"排线"效果时把 maxRailLanes 调大，附加的道会向右展开，
 * 但不能越过缩进进入代码。
 */
export function planConnectors(
	subject: Anchor | null,
	targets: Anchor[],
	options: GeometryOptions,
	lineIndent?: LineIndentSource
): ConnectorPlan {
	if (!subject || targets.length === 0) {
		return { baseColumn: 0, laneCount: 0, targetColumns: [], segments: [] };
	}

	const lanes = clampInt(options.maxRailLanes, 1, 1);
	const spacing = clampInt(options.railSpacing, 1, 2);
	const minColumn = clampInt(options.minRailColumn, 0, 0);

	// 基准列固定在最左：不再按缩进整体右缩，也就不会出现阶梯状的最左端
	const baseColumn = minColumn;
	// 向右能展开到哪一列，由穿过行的最浅缩进决定
	const maxColumn = resolveMaxColumn(subject, targets, minColumn, lineIndent);
	const usable = Math.floor((maxColumn - baseColumn) / spacing) + 1;
	const maxLanes = Math.max(1, Math.min(lanes, usable));
	// laneCount 是"实际用到的道数"：单个目标只需要一条导轨
	const laneCount = Math.min(targets.length, maxLanes);

	const segments: ConnectorSegment[] = [];
	const targetColumns: number[] = [];

	for (let index = 0; index < targets.length; index += 1) {
		const target = targets[index];
		const lane = index % laneCount;
		const column = Math.min(maxColumn, baseColumn + lane * spacing);
		targetColumns.push(column);

		// 同一行：只需要一段横向短线把两者连起来。
		if (target.startLine === subject.startLine) {
			const from = Math.min(subject.startChar, target.startChar);
			const to = Math.max(subject.startChar, target.endChar, target.startChar);
			if (to > from) {
				segments.push({ role: 'stub', targetIndex: index, lane, line: subject.startLine, startChar: from, endChar: to });
			}
			continue;
		}

		// 两端的横向短线都画在所在行的**上边缘**（border-top），
		// 所以导轨只需要覆盖 [top, bottom)：一旦覆盖到 bottom，
		// 下端就会多出整整一行高的竖线，悬在横线下面。
		const top = Math.min(subject.startLine, target.startLine);
		const bottom = Math.max(subject.startLine, target.startLine);
		for (let line = top; line < bottom; line += 1) {
			segments.push({ role: 'rail', targetIndex: index, lane, line, startChar: column, endChar: column });
		}

		const subjectFrom = Math.min(column, subject.startChar);
		const subjectTo = Math.max(column, subject.startChar);
		if (subjectTo > subjectFrom) {
			segments.push({
				role: 'stub',
				targetIndex: index,
				lane,
				line: subject.startLine,
				startChar: subjectFrom,
				endChar: subjectTo
			});
		}

		const targetFrom = Math.min(column, target.startChar);
		const targetTo = Math.max(column, target.startChar);
		if (targetTo > targetFrom) {
			segments.push({
				role: 'stub',
				targetIndex: index,
				lane,
				line: target.startLine,
				startChar: targetFrom,
				endChar: targetTo
			});
		}
	}

	return { baseColumn, laneCount, targetColumns, segments };
}
