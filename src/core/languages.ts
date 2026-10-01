/**
 * 参与符号连线的语言白名单：主流编程语言。
 *
 * 这里刻意只列"有真正符号引用关系"的编程语言。
 * markdown / 纯文本 / json / yaml / 配置格式等不在其中 ——
 * 它们的语言服务没有 references，只剩一个孤零零的起点序号，纯属噪音。
 *
 * 注意：这份清单与 package.json 的 activationEvents（onLanguage:*）必须保持一致，
 * test/vsix.test.cjs 里有用例盯着。
 */
export const SUPPORTED_LANGUAGES: string[] = [
	'javascript',
		'javascriptreact',
		'typescript',
		'typescriptreact',
		'vue',
		'svelte',
		'python',
		'java',
		'c',
		'cpp',
		'csharp',
		'go',
		'rust',
		'kotlin',
		'swift',
		'scala',
		'ruby',
		'php',
		'perl',
		'lua',
		'dart',
		'objective-c',
		'objective-cpp',
		'fsharp',
		'vb',
		'r',
		'julia',
		'groovy',
		'elixir',
		'erlang',
		'haskell',
		'clojure',
		'zig',
		'nim',
		'crystal',
		'shellscript',
		'powershell',
		'sql'
];

/** 该语言是否参与符号连线。 */
export function isSupportedLanguage(languageId: string | undefined): boolean {
	return languageId !== undefined && SUPPORTED_LANGUAGES.indexOf(languageId) >= 0;
}
