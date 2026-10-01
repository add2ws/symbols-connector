/**
 * 配置项的读取与校正。
 *
 * VS Code 的配置是用户可任意编辑的 JSON，这里做一次彻底的归一化，
 * 保证后续逻辑拿到的永远是合法值（也便于单元测试）。
 */

/** 扩展的全部可配置项。 */
export interface ConnectorOptions {
	/** 总开关。 */
	enabled: boolean;
	/** 光标移动时是否自动解析。 */
	autoTrigger: boolean;
	/** 光标移动后的防抖毫秒数。 */
	debounceMs: number;
	/** 是否额外请求符号的声明（例如 C/C++ 头文件里的原型）。定义始终参与连线。 */
	includeDeclaration: boolean;
	/** 单次最多渲染多少个相关位置。 */
	maxRelated: number;
	/** 是否在当前编辑器内绘制连接线。 */
	editorLines: boolean;
	/** 连接线的粗细（px，支持小数），作用于竖向导轨与横向短接线。 */
	lineWidth: number;
	/** 连接线的线型，取值见 LINE_STYLES。 */
	lineStyle: string;
	/** 引用高亮框的圆角半径（px）。 */
	markBorderRadius: number;
	/** 并行导轨之间的列间距；只有 maxRailLanes > 1 时才用得上。 */
	railSpacing: number;
	/** 最多几条并行导轨；默认 1，即所有连线贴齐最左列。 */
	maxRailLanes: number;
	/** 导轨基准列，默认 0 = 文本区最左边缘。 */
	minRailColumn: number;
	/** 是否在引用位置旁显示序号标签。 */
	showIndexLabels: boolean;
	/** 解析完成后是否自动打开关系图。 */
	autoOpenGraph: boolean;
	/** 关系图中最多读取多少个文件的行预览。 */
	previewFiles: number;
	/** 连线配色；配多个颜色时按序号循环，用于区分不同引用。 */
	palette: string[];
}

/**
 * 默认连线颜色：一种橙色（带 80% 不透明度）。
 * 想按序号区分不同引用，把 palette 配成多个颜色即可（会按序号循环取用）。
 */
export const DEFAULT_PALETTE: string[] = ['#F5A623CC'];

/** 连线线型可选值，直接对应 CSS 的 border-style。 */
export const LINE_STYLES: string[] = ['solid', 'dashed', 'dotted', 'double'];

export const DEFAULT_OPTIONS: ConnectorOptions = {
	enabled: true,
	autoTrigger: true,
	debounceMs: 220,
	includeDeclaration: true,
	maxRelated: 60,
	editorLines: true,
	lineWidth: 1.5,
	lineStyle: 'dashed',
	markBorderRadius: 3,
	railSpacing: 2,
	maxRailLanes: 1,
	minRailColumn: 0,
	showIndexLabels: true,
	autoOpenGraph: false,
	previewFiles: 12,
	palette: DEFAULT_PALETTE
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBoolean(raw: Record<string, unknown>, key: string, fallback: boolean): boolean {
	const value = raw[key];
	return typeof value === 'boolean' ? value : fallback;
}

/** 计数类配置：夹到区间内并取整。 */
function readNumber(raw: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
	const value = raw[key];
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}
	return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * 尺寸类配置（px）：同样夹到区间内，但**保留小数**。
 * 1.5px 是合法的 CSS 边框宽度，四舍五入会静默丢掉用户显式配的值。
 */
function readMeasurement(raw: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
	const value = raw[key];
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}
	return Math.min(max, Math.max(min, value));
}

function readChoice(raw: Record<string, unknown>, key: string, allowed: string[], fallback: string): string {
	const value = raw[key];
	if (typeof value !== 'string') {
		return fallback;
	}
	const normalized = value.trim().toLowerCase();
	return allowed.indexOf(normalized) >= 0 ? normalized : fallback;
}

function readPalette(raw: Record<string, unknown>): string[] {
	const value = raw['palette'];
	if (!Array.isArray(value)) {
		return DEFAULT_PALETTE.slice();
	}
	const colors = value
		.filter((item): item is string => typeof item === 'string')
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
	return colors.length > 0 ? colors : DEFAULT_PALETTE.slice();
}

/**
 * 把任意输入（通常来自 workspace.getConfiguration）归一化成合法配置。
 * 非法字段一律回退到默认值，数值一律夹到配置声明的区间内。
 */
export function normalizeOptions(raw: unknown): ConnectorOptions {
	const record = isRecord(raw) ? raw : {};
	return {
		enabled: readBoolean(record, 'enabled', DEFAULT_OPTIONS.enabled),
		autoTrigger: readBoolean(record, 'autoTrigger', DEFAULT_OPTIONS.autoTrigger),
		debounceMs: readNumber(record, 'debounceMs', DEFAULT_OPTIONS.debounceMs, 0, 3000),
		includeDeclaration: readBoolean(record, 'includeDeclaration', DEFAULT_OPTIONS.includeDeclaration),
		maxRelated: readNumber(record, 'maxRelated', DEFAULT_OPTIONS.maxRelated, 1, 500),
		editorLines: readBoolean(record, 'editorLines', DEFAULT_OPTIONS.editorLines),
		lineWidth: readMeasurement(record, 'lineWidth', DEFAULT_OPTIONS.lineWidth, 1, 8),
		lineStyle: readChoice(record, 'lineStyle', LINE_STYLES, DEFAULT_OPTIONS.lineStyle),
		markBorderRadius: readMeasurement(record, 'markBorderRadius', DEFAULT_OPTIONS.markBorderRadius, 0, 12),
		railSpacing: readNumber(record, 'railSpacing', DEFAULT_OPTIONS.railSpacing, 1, 8),
		maxRailLanes: readNumber(record, 'maxRailLanes', DEFAULT_OPTIONS.maxRailLanes, 1, 16),
		minRailColumn: readNumber(record, 'minRailColumn', DEFAULT_OPTIONS.minRailColumn, 0, 40),
		showIndexLabels: readBoolean(record, 'showIndexLabels', DEFAULT_OPTIONS.showIndexLabels),
		autoOpenGraph: readBoolean(record, 'autoOpenGraph', DEFAULT_OPTIONS.autoOpenGraph),
		previewFiles: readNumber(record, 'previewFiles', DEFAULT_OPTIONS.previewFiles, 0, 100),
		palette: readPalette(record)
	};
}

/** 按序号取颜色，序号可以为任意整数。 */
export function colorFor(palette: string[], index: number): string {
	if (palette.length === 0) {
		return DEFAULT_PALETTE[0];
	}
	const normalized = ((index % palette.length) + palette.length) % palette.length;
	return palette[normalized];
}
