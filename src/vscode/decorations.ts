import type * as vscode from 'vscode';
import type { ConnectorOptions } from '../core/config';
import { colorFor } from '../core/config';
import type { ConnectorPlan } from '../core/geometry';
import { anchorKey } from '../core/merge';
import { DECLARATION_LABEL, numberAnchors } from '../core/numbering';
import type { Anchor, ConnectorModel } from '../core/types';

/** 单次绘制允许的最大线段数，防止极端文件把编辑器拖垮。 */
const MAX_SEGMENTS = 4000;
/** 最多为多少个引用加序号标签（每个标签需要一个装饰类型）。 */
const MAX_LABELS = 24;

export interface ConnectorPainter {
	paint(editor: vscode.TextEditor, model: ConnectorModel, plan: ConnectorPlan, options: ConnectorOptions): void;
	clear(editor: vscode.TextEditor): void;
	dispose(): void;
}

type RangeMap = Map<vscode.TextEditorDecorationType, vscode.Range[]>;

/**
 * 用装饰器把连线画进编辑器。
 *
 * 说明：编辑器 API 只能画矩形边框，画不了任意矢量线，所以这里用"正交折线"：
 * 每个目标一条竖向导轨（按行拆成若干单行装饰），两端各接一小段横向短线。
 * 竖向导轨用零宽区间的左边框实现，单行光栅化不受跨行边框实现差异影响。
 *
 * 粗细与线型来自配置，并参与"样式指纹"：样式一变就整体重建装饰类型，
 * 否则被缓存的旧类型会让设置改动要重载窗口才生效。
 */
export function createConnectorPainter(api: typeof vscode): ConnectorPainter {
	const types = new Map<string, vscode.TextEditorDecorationType>();
	let styleSignature = '';

	function typeFor(key: string, create: () => vscode.TextEditorDecorationType): vscode.TextEditorDecorationType {
		const existing = types.get(key);
		if (existing) {
			return existing;
		}
		const created = create();
		types.set(key, created);
		return created;
	}

	function disposeTypes(): void {
		for (const type of types.values()) {
			type.dispose();
		}
		types.clear();
	}

	/** 所有影响装饰外观的配置项指纹。 */
	function signatureOf(options: ConnectorOptions): string {
		return options.lineWidth + '|' + options.lineStyle + '|' + options.markBorderRadius;
	}

	/** 竖向导轨：零宽区间 + 只留左边框。 */
	function railType(color: string, options: ConnectorOptions): vscode.TextEditorDecorationType {
		return typeFor('rail|' + color, () =>
			api.window.createTextEditorDecorationType({
				borderWidth: '0 0 0 ' + options.lineWidth + 'px',
				borderStyle: options.lineStyle,
				borderColor: color,
				rangeBehavior: api.DecorationRangeBehavior.ClosedClosed
			})
		);
	}

	/** 横向短接线：区间 + 只留上边框。 */
	function stubType(color: string, options: ConnectorOptions): vscode.TextEditorDecorationType {
		return typeFor('stub|' + color, () =>
			api.window.createTextEditorDecorationType({
				borderWidth: options.lineWidth + 'px 0 0 0',
				borderStyle: options.lineStyle,
				borderColor: color,
				rangeBehavior: api.DecorationRangeBehavior.ClosedClosed
			})
		);
	}

	/** 引用高亮框是"标记"而不是连线：描边固定 1px，只有圆角可配。 */
	function markType(color: string, options: ConnectorOptions): vscode.TextEditorDecorationType {
		return typeFor('mark|' + color, () =>
			api.window.createTextEditorDecorationType({
				borderWidth: '1px',
				borderStyle: 'solid',
				borderColor: color,
				borderRadius: options.markBorderRadius + 'px',
				rangeBehavior: api.DecorationRangeBehavior.ClosedClosed
			})
		);
	}

	function labelType(color: string, text: string): vscode.TextEditorDecorationType {
		return typeFor('label|' + color + '|' + text, () =>
			api.window.createTextEditorDecorationType({
				after: {
					contentText: text,
					color: color,
					margin: '0 0 0 0.4em',
					fontStyle: 'normal',
					fontWeight: 'normal'
				}
			})
		);
	}

	function subjectType(): vscode.TextEditorDecorationType {
		return typeFor('subject', () =>
			api.window.createTextEditorDecorationType({
				backgroundColor: new api.ThemeColor('editor.findMatchHighlightBackground'),
				borderWidth: '1px',
				borderStyle: 'solid',
				borderColor: new api.ThemeColor('editor.findMatchBorder'),
				borderRadius: '3px',
				rangeBehavior: api.DecorationRangeBehavior.ClosedClosed
			})
		);
	}

	function add(map: RangeMap, type: vscode.TextEditorDecorationType, range: vscode.Range): void {
		const list = map.get(type);
		if (list) {
			list.push(range);
		} else {
			map.set(type, [range]);
		}
	}

	function clear(editor: vscode.TextEditor): void {
		for (const type of types.values()) {
			editor.setDecorations(type, []);
		}
	}

	function paint(editor: vscode.TextEditor, model: ConnectorModel, plan: ConnectorPlan, options: ConnectorOptions): void {
		const signature = signatureOf(options);
		if (signature !== styleSignature) {
			// 样式变了：重建全部装饰类型，让新设置立刻生效
			disposeTypes();
			styleSignature = signature;
		}
		clear(editor);

		const subject = model.subject;
		if (!subject) {
			return;
		}

		// 序号：0 = 定义/声明，1 = 光标符号，2 起 = 其余引用；颜色与序号一一对应
		const numbering = numberAnchors(subject, model.related);
		const labelByKey = new Map<string, number>();
		model.related.forEach((anchor, index) => {
			labelByKey.set(anchorKey(anchor), numbering.labels[index]);
		});
		const labelOf = (anchor: Anchor): number => {
			const label = labelByKey.get(anchorKey(anchor));
			return label === undefined ? DECLARATION_LABEL : label;
		};

		const rails: RangeMap = new Map();
		const stubs: RangeMap = new Map();
		const segments = plan.segments.length > MAX_SEGMENTS ? plan.segments.slice(0, MAX_SEGMENTS) : plan.segments;
		for (const segment of segments) {
			const target = model.sameFile[segment.targetIndex];
			const color = colorFor(options.palette, target ? labelOf(target) : segment.targetIndex);
			const range = new api.Range(segment.line, segment.startChar, segment.line, segment.endChar);
			if (segment.role === 'rail') {
				add(rails, railType(color, options), range);
			} else {
				add(stubs, stubType(color, options), range);
			}
		}

		const marks: RangeMap = new Map();
		const labels: RangeMap = new Map();
		model.sameFile.forEach((anchor, index) => {
			const label = labelOf(anchor);
			const color = colorFor(options.palette, label);
			const range = new api.Range(anchor.startLine, anchor.startChar, anchor.endLine, anchor.endChar);
			add(marks, markType(color, options), range);
			if (options.showIndexLabels && index < MAX_LABELS) {
				add(labels, labelType(color, String(label)), range);
			}
		});

		const subjectRange = new api.Range(subject.startLine, subject.startChar, subject.endLine, subject.endChar);
		editor.setDecorations(subjectType(), [subjectRange]);
		// 光标所在符号也要有序号
		if (options.showIndexLabels && numbering.subjectLabel !== null) {
			add(labels, labelType(colorFor(options.palette, numbering.subjectLabel), String(numbering.subjectLabel)), subjectRange);
		}
		for (const [type, ranges] of rails) {
			editor.setDecorations(type, ranges);
		}
		for (const [type, ranges] of stubs) {
			editor.setDecorations(type, ranges);
		}
		for (const [type, ranges] of marks) {
			editor.setDecorations(type, ranges);
		}
		for (const [type, ranges] of labels) {
			editor.setDecorations(type, ranges);
		}
	}

	return {
		paint,
		clear,
		dispose: disposeTypes
	};
}
