import { colorFor } from './config';
import { escapeXml } from './xml';

export interface GraphHtmlInput {
	/** renderGraphSvg 生成的 SVG 片段。 */
	svg: string;
	title: string;
	subtitle: string;
	/** 参与连线的颜色数量，用于图例。 */
	paletteSize: number;
	palette: string[];
	nonce: string;
	cspSource: string;
}

function renderLegend(input: GraphHtmlInput): string {
	const items: string[] = [];
	const count = Math.max(1, Math.min(input.paletteSize, input.palette.length));
	for (let index = 0; index < count; index += 1) {
		items.push(
			'<span class="legend-item">' +
			'<i class="legend-dot" style="background: ' + escapeXml(colorFor(input.palette, index)) + '"></i>' +
			'</span>'
		);
	}
	return '<div class="legend">' + items.join('') + '</div>';
}

const STYLES = [
	':root { color-scheme: light dark; }',
	'html, body { margin: 0; padding: 0; height: 100%; }',
	'body {',
	'  font-family: var(--vscode-font-family);',
	'  font-size: 12px;',
	'  color: var(--vscode-foreground);',
	'  background: var(--vscode-editor-background);',
	'  display: flex;',
	'  flex-direction: column;',
	'  height: 100vh;',
	'  overflow: hidden;',
	'}',
	'.toolbar {',
	'  display: flex;',
	'  align-items: center;',
	'  justify-content: space-between;',
	'  gap: 12px;',
	'  padding: 10px 16px;',
	'  border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));',
	'  flex: 0 0 auto;',
	'}',
	'h1 { font-size: 13px; font-weight: 600; margin: 0; }',
	'.subtitle { margin: 2px 0 0; color: var(--vscode-descriptionForeground); }',
	'.legend { display: flex; gap: 4px; align-items: center; }',
	'.legend-item { display: inline-flex; }',
	'.legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }',
	'.canvas { flex: 1 1 auto; overflow: auto; padding: 4px; }',
	'.hint {',
	'  flex: 0 0 auto;',
	'  padding: 6px 16px;',
	'  color: var(--vscode-descriptionForeground);',
	'  border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));',
	'}',
	'.edge { fill: none; stroke-width: 1.6; opacity: 0.75; }',
	'.node { cursor: pointer; }',
	'.node-bg {',
	'  fill: var(--vscode-editorWidget-background, rgba(128,128,128,0.08));',
	'  stroke: var(--vscode-editorWidget-border, rgba(128,128,128,0.35));',
	'  stroke-width: 1;',
	'}',
	'.node-accent { fill: var(--node-color); }',
	'.node-subject .node-bg { stroke: var(--vscode-focusBorder); stroke-width: 1.6; }',
	'.node-file { fill: var(--vscode-foreground); font-size: 12px; font-weight: 600; }',
	'.node-line { fill: var(--vscode-descriptionForeground); font-size: 11px; }',
	'.node-preview {',
	'  fill: var(--vscode-descriptionForeground);',
	'  font-family: var(--vscode-editor-font-family, monospace);',
	'  font-size: 11px;',
	'}',
	'.node:hover .node-bg, .node:focus .node-bg { stroke: var(--vscode-focusBorder); stroke-width: 1.6; }',
	'.node:focus { outline: none; }',
	'.group-title { fill: var(--vscode-descriptionForeground); font-size: 11px; font-weight: 600; }',
	'.group-count { fill: var(--vscode-descriptionForeground); font-size: 11px; }',
	'.group-current .group-title { fill: var(--vscode-foreground); }',
	'.group-rule { stroke: var(--vscode-panel-border, rgba(128,128,128,0.35)); stroke-width: 1; }'
].join('\n');

const SCRIPT = [
	'(function () {',
	'  var api = acquireVsCodeApi();',
	'  function activate(target) {',
	'    var node = target && target.closest ? target.closest(".node") : null;',
	'    if (!node) { return; }',
	'    var uri = node.getAttribute("data-uri");',
	'    if (!uri) { return; }',
	'    api.postMessage({',
	'      type: "reveal",',
	'      uri: uri,',
	'      line: Number(node.getAttribute("data-line") || 0),',
	'      char: Number(node.getAttribute("data-char") || 0)',
	'    });',
	'  }',
	'  document.addEventListener("click", function (event) { activate(event.target); });',
	'  document.addEventListener("keydown", function (event) {',
	'    if (event.key !== "Enter" && event.key !== " ") { return; }',
	'    var target = event.target;',
	'    if (!target || !target.classList || !target.classList.contains("node")) { return; }',
	'    event.preventDefault();',
	'    activate(target);',
	'  });',
	'}());'
].join('\n');

/** 组装关系图面板的完整 HTML（内联样式与脚本，使用 nonce 满足 CSP）。 */
export function buildGraphHtml(input: GraphHtmlInput): string {
	const lines: string[] = [];
	lines.push('<!DOCTYPE html>');
	lines.push('<html lang="en">');
	lines.push('<head>');
	lines.push('<meta charset="UTF-8" />');
	lines.push(
		'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\' ' +
		escapeXml(input.cspSource) + '; script-src \'nonce-' + escapeXml(input.nonce) + '\';" />'
	);
	lines.push('<meta name="viewport" content="width=device-width, initial-scale=1.0" />');
	lines.push('<title>' + escapeXml(input.title) + '</title>');
	lines.push('<style>');
	lines.push(STYLES);
	lines.push('</style>');
	lines.push('</head>');
	lines.push('<body>');
	lines.push('<header class="toolbar">');
	lines.push('<div class="titles">');
	lines.push('<h1>' + escapeXml(input.title) + '</h1>');
	lines.push('<p class="subtitle">' + escapeXml(input.subtitle) + '</p>');
	lines.push('</div>');
	lines.push(renderLegend(input));
	lines.push('</header>');
	lines.push('<main class="canvas">');
	lines.push(input.svg);
	lines.push('</main>');
	lines.push('<footer class="hint">Click a node to jump to that location. Press Tab to cycle through nodes.</footer>');
	lines.push('<script nonce="' + escapeXml(input.nonce) + '">');
	lines.push(SCRIPT);
	lines.push('</script>');
	lines.push('</body>');
	lines.push('</html>');
	return lines.join('\n');
}
