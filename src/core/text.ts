/**
 * 文本度量的小工具。
 *
 * 这里只有一种"列"的口径：**字符列**，也就是 vscode.Range / Position 真正使用的单位。
 * 早先版本在这里混用了"视觉宽度"（Tab 记 4 列）和"字符列"，导致 Tab 缩进的文件里
 * 导轨被画到代码上，因此单独抽出来并锁死语义。
 */

/** 一行开头连续空白字符的个数。Tab 记 1 个字符，不是 1 个缩进宽度。 */
export function leadingWhitespaceChars(text: string): number {
	let count = 0;
	while (count < text.length) {
		const character = text.charAt(count);
		if (character !== ' ' && character !== '\t') {
			break;
		}
		count += 1;
	}
	return count;
}

/** 该行是否只有空白（空行）。空行上任何列都是空白，定位导轨时应跳过。 */
export function isBlankLine(text: string): boolean {
	return text.trim().length === 0;
}
