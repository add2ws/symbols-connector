/**
 * 补充声明 VS Code 的内置命令。
 *
 * VS Code 1.138 自带的 `types/vscode.d.ts` 只声明了 4 个 commands 函数
 * （registerCommand / registerTextEditorCommand / executeCommand / getCommands），
 * 但官方文档 "Built-in Commands" 里仍然存在 vscode.executeXxxProvider 一族。
 * 本项目需要调用它们，因此在这里做模块增强。
 *
 * 参考：https://code.visualstudio.com/api/references/commands
 */

import type {
	DefinitionLink,
	DocumentHighlight,
	Location,
	Position,
	ReferenceContext,
	SymbolInformation,
	DocumentSymbol,
	Uri,
} from 'vscode';

declare module 'vscode' {
	export namespace commands {
		/** 取光标处的定义（可能跨文件，也可能返回 DefinitionLink）。 */
		export function executeDefinitionProvider(uri: Uri, position: Position): Thenable<Array<Location | DefinitionLink>>;

		/** 取光标处的声明，例如 C 头文件里的原型。 */
		export function executeDeclarationProvider(uri: Uri, position: Position): Thenable<Array<Location | DefinitionLink>>;

		/** 取光标处符号的全部引用。 */
		export function executeReferenceProvider(uri: Uri, position: Position, context?: ReferenceContext): Thenable<Location[]>;

		/** 取当前文档内的符号高亮（同文件出现位置，语言服务可选的快速结果）。 */
		export function executeDocumentHighlights(uri: Uri, position: Position): Thenable<DocumentHighlight[]>;

		/** 取当前文档的符号树。 */
		export function executeDocumentSymbolProvider(uri: Uri): Thenable<Array<SymbolInformation | DocumentSymbol>>;
	}
}
