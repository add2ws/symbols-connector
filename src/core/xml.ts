/** XML/SVG 文本转义与截断工具。 */

export function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/** 按字符数截断，超出部分用省略号代替。 */
export function truncate(text: string, maxChars: number): string {
	if (maxChars <= 0) {
		return '';
	}
	if (text.length <= maxChars) {
		return text;
	}
	return text.slice(0, Math.max(1, maxChars - 1)) + '…';
}
