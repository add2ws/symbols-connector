import { colorFor } from './config';
import type { GraphLayout, GraphNode } from './graphLayout';
import { escapeXml } from './xml';

export interface SvgOptions {
	/** 连线配色。 */
	palette: string[];
	/** 是否在节点里显示源码行预览。 */
	showPreview: boolean;
}

export const DEFAULT_SVG_OPTIONS: SvgOptions = {
	palette: ['#4E9CF5'],
	showPreview: true
};

const NODE_PADDING = 16;

function renderNode(node: GraphNode, options: SvgOptions): string {
	const color = colorFor(options.palette, node.colorIndex);
	const parts: string[] = [];
	const title = node.shortPath + ':' + (node.line + 1) + ':' + (node.char + 1);

	parts.push(
		'<g class="node node-' + node.kind + '"' +
		' data-uri="' + escapeXml(node.uri) + '"' +
		' data-line="' + node.line + '"' +
		' data-char="' + node.char + '"' +
		' tabindex="0" role="button"' +
		' style="--node-color: ' + escapeXml(color) + '">'
	);
	parts.push('<title>' + escapeXml(title) + '</title>');
	parts.push(
		'<rect class="node-bg" x="' + node.x + '" y="' + node.y + '"' +
		' width="' + node.width + '" height="' + node.height + '" rx="8" />'
	);
	parts.push(
		'<rect class="node-accent" x="' + (node.x + 2) + '" y="' + (node.y + 2) + '"' +
		' width="4" height="' + (node.height - 4) + '" rx="2" />'
	);
	parts.push(
		'<text class="node-file" x="' + (node.x + NODE_PADDING) + '" y="' + (node.y + 19) + '">' +
		escapeXml(node.fileName) +
		'</text>'
	);
	parts.push(
		'<text class="node-line" x="' + (node.x + node.width - NODE_PADDING) + '" y="' + (node.y + 19) + '"' +
		' text-anchor="end">#' + node.label + ' · ' + escapeXml(node.lineLabel) + '</text>'
	);
	if (options.showPreview && node.preview.length > 0) {
		parts.push(
			'<text class="node-preview" x="' + (node.x + NODE_PADDING) + '" y="' + (node.y + 37) + '">' +
			escapeXml(node.preview) +
			'</text>'
		);
	}
	parts.push('</g>');
	return parts.join('');
}

function renderGroup(group: GraphLayout['groups'][number], layout: GraphLayout): string {
	const x = layout.nodes.length > 0 ? layout.nodes[layout.nodes.length - 1].x : 0;
	const width = layout.nodes.length > 0 ? layout.nodes[layout.nodes.length - 1].width : 0;
	const y = group.y + 16;
	const parts: string[] = [];
	parts.push('<g class="group' + (group.isCurrent ? ' group-current' : '') + '">');
	parts.push(
		'<text class="group-title" x="' + x + '" y="' + y + '">' +
		escapeXml(group.shortPath) +
		'</text>'
	);
	parts.push(
		'<text class="group-count" x="' + (x + width) + '" y="' + y + '" text-anchor="end">' +
		group.count + (group.count === 1 ? ' ref' : ' refs') +
		'</text>'
	);
	parts.push(
		'<line class="group-rule" x1="' + x + '" y1="' + (group.y + 22) + '"' +
		' x2="' + (x + width) + '" y2="' + (group.y + 22) + '" />'
	);
	parts.push('</g>');
	return parts.join('');
}

/** 把布局渲染成内联 SVG。纯函数，便于单元测试。 */
export function renderGraphSvg(layout: GraphLayout, options: SvgOptions): string {
	const parts: string[] = [];
	parts.push(
		'<svg xmlns="http://www.w3.org/2000/svg" class="connector-graph"' +
		' width="' + layout.width + '" height="' + layout.height + '"' +
		' viewBox="0 0 ' + layout.width + ' ' + layout.height + '"' +
		' role="img" aria-label="Symbol reference graph">'
	);

	parts.push('<g class="edges">');
	for (const edge of layout.edges) {
		parts.push(
			'<path class="edge" d="' + edge.path + '"' +
			' style="stroke: ' + escapeXml(colorFor(options.palette, edge.colorIndex)) + '" />'
		);
	}
	parts.push('</g>');

	if (layout.groups.length > 0) {
		parts.push('<g class="groups">');
		for (const group of layout.groups) {
			parts.push(renderGroup(group, layout));
		}
		parts.push('</g>');
	}

	parts.push('<g class="nodes">');
	for (const node of layout.nodes) {
		parts.push(renderNode(node, options));
	}
	parts.push('</g>');

	parts.push('</svg>');
	return parts.join('');
}
