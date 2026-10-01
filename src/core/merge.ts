import type { Anchor, ConnectorModel, RawResolution } from './types';
import { ROLE_RANK, isDeclarationLike } from './types';

export interface MergeOptions {
	/** 是否把「声明」也作为相关位置（定义总是参与）。 */
	includeDeclaration: boolean;
	/** 相关位置的数量上限。 */
	maxRelated: number;
}

/** 去重键：同一文件同一列起点视为同一个位置。 */
export function anchorKey(anchor: Anchor): string {
	return anchor.uri + '#' + anchor.startLine + ':' + anchor.startChar;
}

function span(anchor: Anchor): number {
	return (anchor.endLine - anchor.startLine) * 100000 + (anchor.endChar - anchor.startChar);
}

/**
 * 把语言服务的原始结果整理成模型：
 * 1. 按起点去重，同一位置保留更权威的角色（定义 > 声明 > 引用）；
 * 2. 剔除光标符号自身；
 * 3. 当前文件优先，其余按文件路径、行号排序；
 * 4. 按 maxRelated 截断。
 */
export function mergeAnchors(raw: RawResolution, options: MergeOptions): ConnectorModel {
	let subject = raw.subject;
	const subjectKey = subject ? anchorKey(subject) : undefined;
	const limit = Math.max(1, Math.floor(options.maxRelated));

	const byKey = new Map<string, Anchor>();
	const consider = (anchor: Anchor): void => {
		const key = anchorKey(anchor);
		if (key === subjectKey) {
			// 光标就停在定义/声明上：把角色补到 subject，
			// 否则 subject 永远是"引用"，编号时拿不到 0
			if (subject && isDeclarationLike(anchor.role) && !isDeclarationLike(subject.role)) {
				subject = { ...subject, role: anchor.role };
			}
			return;
		}
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, anchor);
			return;
		}
		const existingRank = ROLE_RANK[existing.role];
		const incomingRank = ROLE_RANK[anchor.role];
		if (incomingRank < existingRank || (incomingRank === existingRank && span(anchor) > span(existing))) {
			byKey.set(key, anchor);
		}
	};

	for (const anchor of raw.definitions) {
		consider({ ...anchor, role: 'definition' });
	}
	if (options.includeDeclaration) {
		for (const anchor of raw.declarations) {
			consider({ ...anchor, role: 'declaration' });
		}
	}
	for (const anchor of raw.references) {
		consider({ ...anchor, role: 'reference' });
	}

	const currentUri = subject ? subject.uri : undefined;
	const sameFileRank = (anchor: Anchor): number => (currentUri !== undefined && anchor.uri === currentUri ? 0 : 1);

	const sorted = Array.from(byKey.values()).sort((left, right) => {
		const rankDiff = sameFileRank(left) - sameFileRank(right);
		if (rankDiff !== 0) {
			return rankDiff;
		}
		if (left.shortPath !== right.shortPath) {
			return left.shortPath < right.shortPath ? -1 : 1;
		}
		if (left.startLine !== right.startLine) {
			return left.startLine - right.startLine;
		}
		return left.startChar - right.startChar;
	});

	const truncated = sorted.length > limit;
	const related = truncated ? sorted.slice(0, limit) : sorted;

	return {
		subject,
		related,
		sameFile: related.filter((anchor) => sameFileRank(anchor) === 0),
		otherFiles: related.filter((anchor) => sameFileRank(anchor) === 1),
		truncated
	};
}
