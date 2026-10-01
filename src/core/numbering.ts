import { isDeclarationLike } from './types';
import type { Anchor } from './types';

/** 定义 / 声明固定使用的序号。 */
export const DECLARATION_LABEL = 0;

export interface Numbering {
	/** 光标符号的序号；没有起点时为 null。 */
	subjectLabel: number | null;
	/** 与 related（以及关系图节点）一一对应的序号。 */
	labels: number[];
}

function comparePosition(left: Anchor, right: Anchor): number {
	if (left.startLine !== right.startLine) {
		return left.startLine - right.startLine;
	}
	return left.startChar - right.startChar;
}

/**
 * 光标符号在 related 顺序里的插入位置。
 * related 保证「同文件的相关位置」排在最前面且按行列升序，所以只需要扫这一段前缀。
 */
function insertIndexFor(subject: Anchor, related: Anchor[]): number {
	let index = 0;
	while (
		index < related.length &&
		related[index].uri === subject.uri &&
		comparePosition(related[index], subject) <= 0
	) {
		index += 1;
	}
	return index;
}

/**
 * 给「光标符号 + 全部相关位置」编号。
 *
 * 规则：
 * - 定义 / 声明 → 0（同文件有多处则共享 0，且不占用递增号）
 * - 其余位置（包含光标所在符号）→ 按**代码的上下顺序**从 1 递增：
 *   当前文件按行列升序，其它文件接在后面按路径与行号。
 *
 * 光标符号不是固定 1，而是按它自己在文件里的位置排队，
 * 这样"号的大小"和眼睛看到的代码顺序一致。
 * 编辑器连线与关系图共用同一套编号，两边颜色才不会串。
 */
export function numberAnchors(subject: Anchor | null, related: Anchor[]): Numbering {
	const labels: number[] = new Array(related.length).fill(DECLARATION_LABEL);
	let subjectLabel: number | null = null;
	let next = 1;
	const insertAt = subject ? insertIndexFor(subject, related) : -1;

	const assign = (anchor: Anchor, store: (label: number) => void): void => {
		if (isDeclarationLike(anchor.role)) {
			store(DECLARATION_LABEL);
			return;
		}
		store(next);
		next += 1;
	};

	for (let index = 0; index <= related.length; index += 1) {
		if (subject && index === insertAt) {
			assign(subject, (label) => {
				subjectLabel = label;
			});
		}
		if (index < related.length) {
			const position = index;
			assign(related[position], (label) => {
				labels[position] = label;
			});
		}
	}

	return { subjectLabel, labels };
}
