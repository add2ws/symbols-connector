import type * as vscode from 'vscode';
import { leadingWhitespaceChars } from '../core/text';
import type { Anchor, AnchorRole, RawResolution } from '../core/types';
import type { Logger } from './logger';

export interface ResolveRequest {
	document: vscode.TextDocument;
	position: vscode.Position;
	includeDeclaration: boolean;
	maxRelated: number;
	/** 最多为多少个文件读取行预览，避免一次性打开太多文档。 */
	previewFiles: number;
}

export interface SymbolResolver {
	resolve(request: ResolveRequest): Promise<RawResolution>;
	/** 丢弃文档缓存（例如引用结果可能已过期时）。 */
	clear(): void;
}

interface SimpleLocation {
	uri: vscode.Uri;
	range: vscode.Range;
}

interface PreviewBudget {
	remaining: number;
}

function toLocation(value: unknown): SimpleLocation | null {
	if (typeof value !== 'object' || value === null) {
		return null;
	}
	const record = value as {
		targetUri?: vscode.Uri;
		targetRange?: vscode.Range;
		targetSelectionRange?: vscode.Range;
		uri?: vscode.Uri;
		range?: vscode.Range;
	};
	// DefinitionLink：优先用标识符本身的区间
	if (record.targetUri && (record.targetSelectionRange || record.targetRange)) {
		return { uri: record.targetUri, range: record.targetSelectionRange || (record.targetRange as vscode.Range) };
	}
	if (record.uri && record.range) {
		return { uri: record.uri, range: record.range };
	}
	return null;
}

function rangeLength(range: vscode.Range): number {
	return (range.end.line - range.start.line) * 100000 + (range.end.character - range.start.character);
}

/**
 * 基于 VS Code 内置语言服务命令实现“取光标符号的定义/声明/引用”。
 * 这些命令在官方文档 Built-in Commands 中列出，但未写进 vscode.d.ts，类型声明见 types/。
 */
export function createSymbolResolver(api: typeof vscode, logger: Logger): SymbolResolver {
	const documentCache = new Map<string, vscode.TextDocument | null>();

	async function runCommand(command: string, args: unknown[]): Promise<unknown[]> {
		try {
			const result = await api.commands.executeCommand<unknown[] | undefined>(command, ...args);
			return Array.isArray(result) ? result : [];
		} catch (error) {
			logger.warn('Built-in command ' + command + ' failed: ' + String(error));
			return [];
		}
	}

	async function getDocument(uri: vscode.Uri, budget: PreviewBudget): Promise<vscode.TextDocument | null> {
		const key = uri.toString();
		const cached = documentCache.get(key);
		if (cached !== undefined) {
			return cached;
		}
		const opened = api.workspace.textDocuments.find((document) => document.uri.toString() === key);
		if (opened) {
			documentCache.set(key, opened);
			return opened;
		}
		if (budget.remaining <= 0) {
			// 不写缓存：下次预算恢复后仍有机会读到
			return null;
		}
		budget.remaining -= 1;
		try {
			const document = await api.workspace.openTextDocument(uri);
			documentCache.set(key, document);
			return document;
		} catch {
			documentCache.set(key, null);
			return null;
		}
	}

	function baseName(uri: vscode.Uri): string {
		const path = uri.path;
		const slash = path.lastIndexOf('/');
		return slash >= 0 ? path.slice(slash + 1) : path;
	}

	function shortPathOf(uri: vscode.Uri): string {
		try {
			const relative = api.workspace.asRelativePath(uri, false);
			return relative.length > 0 ? relative : baseName(uri);
		} catch {
			return baseName(uri);
		}
	}

	async function buildAnchor(
		location: SimpleLocation,
		role: AnchorRole,
		activeDocument: vscode.TextDocument,
		budget: PreviewBudget
	): Promise<Anchor> {
		const uriString = location.uri.toString();
		const document =
			uriString === activeDocument.uri.toString() ? activeDocument : await getDocument(location.uri, budget);

		let preview = '';
		let indent = 0;
		const line = location.range.start.line;
		if (document && line >= 0 && line < document.lineCount) {
			const text = document.lineAt(line).text;
			preview = text;
			// 字符列，不是视觉宽度
			indent = leadingWhitespaceChars(text);
		}

		return {
			uri: uriString,
			fileName: baseName(location.uri),
			shortPath: shortPathOf(location.uri),
			startLine: location.range.start.line,
			startChar: location.range.start.character,
			endLine: location.range.end.line,
			endChar: location.range.end.character,
			role,
			preview,
			indent
		};
	}

	function dedupe(locations: SimpleLocation[]): SimpleLocation[] {
		const seen = new Set<string>();
		const unique: SimpleLocation[] = [];
		for (const location of locations) {
			const key = location.uri.toString() + '#' + location.range.start.line + ':' + location.range.start.character;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			unique.push(location);
		}
		return unique;
	}

	async function resolve(request: ResolveRequest): Promise<RawResolution> {
		const { document, position } = request;
		const uri = document.uri;
		const budget: PreviewBudget = { remaining: Math.max(0, Math.floor(request.previewFiles)) };
		const limit = Math.max(1, Math.floor(request.maxRelated));

		const [definitionValues, declarationValues, referenceValues, highlightValues] = await Promise.all([
			runCommand('vscode.executeDefinitionProvider', [uri, position]),
			request.includeDeclaration
				? runCommand('vscode.executeDeclarationProvider', [uri, position])
				: Promise.resolve([] as unknown[]),
			runCommand('vscode.executeReferenceProvider', [uri, position]),
			runCommand('vscode.executeDocumentHighlights', [uri, position])
		]);

		// 光标符号自身：优先用文档高亮里最短的一段（通常就是标识符本身），退化为词范围
		let subjectRange: vscode.Range | null = null;
		for (const value of highlightValues as vscode.DocumentHighlight[]) {
			if (!value || !value.range || !value.range.contains(position)) {
				continue;
			}
			if (!subjectRange || rangeLength(value.range) < rangeLength(subjectRange)) {
				subjectRange = value.range;
			}
		}
		if (!subjectRange) {
			subjectRange = document.getWordRangeAtPosition(position) || null;
		}

		const definitions = dedupe(definitionValues.map(toLocation).filter((item): item is SimpleLocation => item !== null));
		const declarations = dedupe(declarationValues.map(toLocation).filter((item): item is SimpleLocation => item !== null));
		const references = dedupe(referenceValues.map(toLocation).filter((item): item is SimpleLocation => item !== null));
		const boundedReferences = references.length > limit + 8 ? references.slice(0, limit + 8) : references;

		const [definitionAnchors, declarationAnchors, referenceAnchors] = await Promise.all([
			Promise.all(definitions.map((location) => buildAnchor(location, 'definition', document, budget))),
			Promise.all(declarations.map((location) => buildAnchor(location, 'declaration', document, budget))),
			Promise.all(boundedReferences.map((location) => buildAnchor(location, 'reference', document, budget)))
		]);

		let subject: Anchor | null = null;
		if (subjectRange) {
			subject = await buildAnchor({ uri, range: subjectRange }, 'reference', document, budget);
		} else if (definitionAnchors.length > 0) {
			// 光标不在标识符上时，退而把第一处定义当作连线起点
			subject = definitionAnchors[0];
		}

		return {
			subject,
			definitions: definitionAnchors,
			declarations: declarationAnchors,
			references: referenceAnchors
		};
	}

	return {
		resolve,
		clear: () => documentCache.clear()
	};
}
