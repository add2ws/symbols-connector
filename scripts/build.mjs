#!/usr/bin/env node
/**
 * 构建脚本：类型检查 + 编译到 out/。
 *
 * 优先使用项目自带的 typescript；如果还没有 pnpm install，
 * 就回退到本机 VS Code 自带的编译器，做到「零依赖也能构建」。
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 递归收集 outDir 下的 .js 产物，用于统计编译结果。 */
function collectEmitted(dir, acc = []) {
	let entries = [];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return acc;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collectEmitted(full, acc);
		} else if (entry.name.endsWith('.js')) {
			acc.push(path.relative(projectRoot, full));
		}
	}
	return acc;
}

function vscodeInstallRoots() {
	const roots = [];
	if (process.env.VSCODE_APP_ROOT) {
		roots.push(process.env.VSCODE_APP_ROOT);
	}
	const home = homedir();
	const bases = [
		process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code') : null,
		'C:\\Program Files\\Microsoft VS Code',
		'C:\\Program Files (x86)\\Microsoft VS Code',
		'/Applications/Visual Studio Code.app/Contents/Resources/app',
		path.join(home, '.vscode-server')
	].filter(Boolean);
	for (const base of bases) {
		roots.push(base);
		roots.push(path.join(base, 'resources', 'app'));
		// VS Code 更新时会生成 <hash>/resources/app 这样的目录
		try {
			for (const entry of readdirSync(base, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					roots.push(path.join(base, entry.name));
					roots.push(path.join(base, entry.name, 'resources', 'app'));
				}
			}
		} catch {
			// 目录不存在，忽略
		}
	}
	return roots;
}

function resolveTypeScript() {
	const candidates = [];
	if (process.env.TYPESCRIPT_PATH) {
		candidates.push(process.env.TYPESCRIPT_PATH);
	}
	try {
		candidates.push(require.resolve('typescript'));
	} catch {
		// 还没安装依赖
	}
	for (const root of vscodeInstallRoots()) {
		candidates.push(path.join(root, 'extensions', 'node_modules', 'typescript', 'lib', 'typescript.js'));
		candidates.push(path.join(root, 'node_modules', 'typescript', 'lib', 'typescript.js'));
	}
	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

/** 执行一次构建，返回 { errors, warnings, emittedFiles }。 */
export async function build() {
	const tsPath = resolveTypeScript();
	if (!tsPath) {
		throw new Error('找不到 typescript：请先 pnpm install，或设置 TYPESCRIPT_PATH 环境变量。');
	}
	const ts = require(tsPath);
	const configPath = path.join(projectRoot, 'tsconfig.json');
	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
	if (configFile.error) {
		throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
	}
	const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot);
	const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
	const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => {
		// 忽略来自自带类型文件的提示，只关心我们自己的代码
		return !diagnostic.file || !diagnostic.file.fileName.includes('types' + path.sep + 'vscode.d.ts');
	});

	const host = {
		getCanonicalFileName: (fileName) => fileName,
		getCurrentDirectory: () => projectRoot,
		getNewLine: () => '\n'
	};
	const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
	const warnings = diagnostics.filter((diagnostic) => diagnostic.category !== ts.DiagnosticCategory.Error);
	if (diagnostics.length > 0) {
		process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, host) + '\n');
	}

	let emittedFiles = [];
	if (errors.length === 0) {
		program.emit();
		emittedFiles = collectEmitted(parsed.options.outDir || path.join(projectRoot, 'out'));
	}

	return {
		typescript: tsPath,
		version: ts.version,
		errors: errors.length,
		warnings: warnings.length,
		emittedFiles: emittedFiles.length,
		files: emittedFiles,
		diagnostics
	};
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
	const result = await build();
	console.log('TypeScript ' + result.version + '：编译 ' + result.emittedFiles + ' 个文件，' + result.errors + ' 个错误，' + result.warnings + ' 个警告。');
	process.exit(result.errors === 0 ? 0 : 1);
}
