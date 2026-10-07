import type { Anchor } from './types';

/** 标签挂载位置：0 起始的行列，渲染时用零宽区间。 */
export interface LabelPosition {
	line: number;
	char: number;
}

/**
 * 计算序号标签挂在哪。
 *
 * 装饰器的 before/after 内容只能**行内**插进某一行，插进去就会把该行该列之后的字符推右，
 * 这正是序号"挤占代码"的原因；API 里没有任何把内容浮到行上方的选项。
 * 所以这里绕开挤占，只挑"插入点之后没有字符"的位置：
 *
 * 1. 优先挂到**上一行的同一列**：上一行在该列之后没有内容（空行，或比该列更短的行）时，
 *    插入不推动任何代码，视觉上正好浮在 symbol 上方；
 * 2. 否则退到**本行行尾**：行尾之后本来就没有字符，同样一个字都不推。
 *
 * @param anchor 目标锚点
 * @param lineText 锚点所在行的文本；读不到时为 undefined
 * @param previousLineText 上一行文本；没有上一行时（含第一行）为 undefined
 */
export function labelPosition(anchor: Anchor, lineText: string | undefined, previousLineText: string | undefined): LabelPosition {
	const above = anchor.startLine - 1;
	if (above >= 0 && previousLineText !== undefined && previousLineText.length <= anchor.startChar) {
		return { line: above, char: anchor.startChar };
	}
	if (lineText !== undefined) {
		return { line: anchor.startLine, char: lineText.length };
	}
	// 连行文本都读不到时只能贴着标识符放，没有更好的选择
	return { line: anchor.endLine, char: anchor.endChar };
}
