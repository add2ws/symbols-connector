import { numberAnchors } from './numbering';
import type { Anchor, AnchorRole, ConnectorModel } from './types';
import { truncate } from './xml';

export interface GraphLayoutOptions {
	nodeWidth: number;
	nodeHeight: number;
	nodeGap: number;
	groupGap: number;
	groupHeaderHeight: number;
	margin: number;
	columnGap: number;
	previewMaxChars: number;
}

export const DEFAULT_GRAPH_OPTIONS: GraphLayoutOptions = {
	nodeWidth: 340,
	nodeHeight: 48,
	nodeGap: 12,
	groupGap: 18,
	groupHeaderHeight: 26,
	margin: 28,
	columnGap: 190,
	previewMaxChars: 44
};

export type GraphNodeKind = 'subject' | AnchorRole;

export interface GraphNode {
	id: string;
	kind: GraphNodeKind;
	uri: string;
	fileName: string;
	shortPath: string;
	/** 0 起始行号，点击跳转时直接使用。 */
	line: number;
	char: number;
	/** 形如 L42 的行号标签。 */
	lineLabel: string;
	/** 序号：0 是定义/声明，1 是光标符号，2 起是其余引用（与编辑器连线一致）。 */
	label: number;
	preview: string;
	x: number;
	y: number;
	width: number;
	height: number;
	colorIndex: number;
	/** 在 model.related 中的下标；subject 为 -1。 */
	targetIndex: number;
}

export interface GraphGroup {
	uri: string;
	fileName: string;
	shortPath: string;
	y: number;
	height: number;
	count: number;
	/** 是否是光标符号所在文件。 */
	isCurrent: boolean;
}

export interface GraphEdge {
	from: string;
	to: string;
	colorIndex: number;
	path: string;
}

export interface GraphLayout {
	width: number;
	height: number;
	nodes: GraphNode[];
	groups: GraphGroup[];
	edges: GraphEdge[];
}

/** 生成一条从左侧节点右边缘到右侧节点左边缘的三次贝塞尔曲线。 */
function edgePath(from: GraphNode, to: GraphNode): string {
	const x1 = from.x + from.width;
	const y1 = from.y + from.height / 2;
	const x2 = to.x;
	const y2 = to.y + to.height / 2;
	const dx = Math.max(32, Math.round((x2 - x1) * 0.45));
	return 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2;
}

function makeNode(
	id: string,
	anchor: Anchor,
	kind: GraphNodeKind,
	label: number,
	x: number,
	y: number,
	targetIndex: number,
	options: GraphLayoutOptions
): GraphNode {
	return {
		id,
		kind,
		uri: anchor.uri,
		fileName: anchor.fileName,
		shortPath: anchor.shortPath,
		line: anchor.startLine,
		char: anchor.startChar,
		lineLabel: 'L' + (anchor.startLine + 1),
		label,
		preview: truncate(anchor.preview.trim(), options.previewMaxChars),
		x,
		y,
		width: options.nodeWidth,
		height: options.nodeHeight,
		colorIndex: label,
		targetIndex
	};
}

/**
 * 把模型排布成关系图：左侧一列是光标符号，右侧按文件分组罗列全部相关位置，
 * 每条关系画一条贝塞尔曲线。
 *
 * 节点的序号与颜色都来自 numberAnchors，和编辑器内的连线共用同一套编号。
 */
export function layoutGraph(model: ConnectorModel, overrides?: Partial<GraphLayoutOptions>): GraphLayout {
	const options: GraphLayoutOptions = { ...DEFAULT_GRAPH_OPTIONS, ...(overrides || {}) };
	const numbering = numberAnchors(model.subject, model.related);
	const leftX = options.margin;
	const rightX = options.margin + options.nodeWidth + options.columnGap;

	const nodes: GraphNode[] = [];
	const groups: GraphGroup[] = [];
	const edges: GraphEdge[] = [];

	let subjectNode: GraphNode | null = null;
	if (model.subject) {
		subjectNode = makeNode(
			'subject',
			model.subject,
			'subject',
			numbering.subjectLabel === null ? 0 : numbering.subjectLabel,
			leftX,
			options.margin,
			-1,
			options
		);
		nodes.push(subjectNode);
	}

	let cursorY = options.margin;
	for (let index = 0; index < model.related.length; index += 1) {
		const anchor = model.related[index];
		const previous = index > 0 ? model.related[index - 1] : undefined;
		if (!previous || previous.uri !== anchor.uri) {
			if (groups.length > 0) {
				cursorY += options.groupGap;
			}
			groups.push({
				uri: anchor.uri,
				fileName: anchor.fileName,
				shortPath: anchor.shortPath,
				y: cursorY,
				height: options.groupHeaderHeight,
				count: 0,
				isCurrent: model.subject !== null && anchor.uri === model.subject.uri
			});
			cursorY += options.groupHeaderHeight;
		}

		const node = makeNode('r' + index, anchor, anchor.role, numbering.labels[index], rightX, cursorY, index, options);
		nodes.push(node);

		const group = groups[groups.length - 1];
		group.count += 1;
		group.height = node.y + node.height - group.y;

		cursorY += options.nodeHeight + options.nodeGap;
	}

	if (subjectNode) {
		for (const node of nodes) {
			if (node.kind === 'subject') {
				continue;
			}
			edges.push({
				from: subjectNode.id,
				to: node.id,
				colorIndex: node.colorIndex,
				path: edgePath(subjectNode, node)
			});
		}
	}

	let contentBottom = options.margin + options.nodeHeight;
	for (const node of nodes) {
		contentBottom = Math.max(contentBottom, node.y + node.height);
	}

	const hasRelated = model.related.length > 0;
	return {
		width: (hasRelated ? rightX + options.nodeWidth : leftX + options.nodeWidth) + options.margin,
		height: contentBottom + options.margin,
		nodes,
		groups,
		edges
	};
}
