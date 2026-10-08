'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

let cached = null;
/** 跑官方 vsce ls，拿到真正会进 VSIX 的文件清单（不真的打包，快）。 */
function includedFiles() {
	if (cached === null) {
		const vsce = path.join(root, 'node_modules', '@vscode', 'vsce', 'vsce');
		const out = execFileSync(process.execPath, [vsce, 'ls'], { cwd: root, encoding: 'utf8' });
		cached = out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	}
	return cached;
}

test('包含 VS Code 安装扩展所需的关键条目', () => {
	const files = includedFiles();
	for (const required of ['package.json', 'README.md', 'CHANGELOG.md', 'out/extension.js']) {
		assert.ok(files.includes(required), '缺少 ' + required);
	}
});

test('包内没有源码、sourcemap、依赖锁文件与本地工具状态', () => {
	const files = includedFiles();
	const leaked = files.filter((file) =>
		file.endsWith('.ts') ||
		file.endsWith('.map') ||
		file.startsWith('node_modules/') ||
		file.startsWith('.codemap') ||
		file.endsWith('.vsix') ||
		/pnpm-lock\.yaml$|pnpm-workspace\.yaml$|package-lock\.json$/.test(file)
	);
	assert.deepEqual(leaked, [], '这些不该进包: ' + leaked.join(', '));
});

test('清单字段能通过 VS Code 的安装校验，main 指向的文件在包内', () => {
	assert.equal(typeof manifest.name, 'string');
	assert.equal(typeof manifest.publisher, 'string');
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(typeof manifest.engines.vscode, 'string');
	assert.ok(Array.isArray(manifest.activationEvents));
	assert.ok(manifest.activationEvents.every((event) => typeof event === 'string'));
	assert.equal(typeof manifest.main, 'string');
	assert.ok(includedFiles().includes(manifest.main.replace(/^\.\//, '')), 'main 指向的文件不在包内');
});

test('清单声明的 icon 会被打进包', () => {
	assert.equal(typeof manifest.icon, 'string', 'package.json 应声明 icon');
	assert.ok(includedFiles().includes(manifest.icon), 'icon ' + manifest.icon + ' 不在包内');
});

test('README 里引用的相对路径图片会被打进包', () => {
	const files = includedFiles();
	const readmes = fs.readdirSync(root).filter((name) => /^README(\..+)?\.md$/.test(name));
	assert.ok(readmes.length > 0, '项目根应有 README');
	for (const name of readmes) {
		const text = fs.readFileSync(path.join(root, name), 'utf8');
		for (const match of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
			const ref = match[1];
			// 绝对地址由外部托管（现在的 README 就是用 GitHub 绝对地址）；
			// 只有相对路径才需要我们自己打进包里，所以只校验这一种。
			if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) continue;
			assert.ok(files.includes(ref), name + ' 引用的 ' + ref + ' 不会进包');
		}
	}
});

test('清单里的 onLanguage 列表与代码常量一致', () => {
	const fromManifest = (manifest.activationEvents || [])
		.filter((event) => event.startsWith('onLanguage:'))
		.map((event) => event.slice('onLanguage:'.length))
		.sort();
	const { SUPPORTED_LANGUAGES } = require('../out/core/languages.js');
	assert.deepEqual(fromManifest, SUPPORTED_LANGUAGES.slice().sort(), '两处的语言清单必须一致，否则白名单会悄悄失效');
	assert.ok(fromManifest.length > 20, '主流编程语言应该有几十项');
});

test('markdown / 纯文本不在语言清单里', () => {
	const { SUPPORTED_LANGUAGES } = require('../out/core/languages.js');
	for (const id of ['markdown', 'plaintext', 'json', 'yaml', 'xml', 'html', 'css', 'log']) {
		assert.ok(!SUPPORTED_LANGUAGES.includes(id), id + ' 不应参与连线');
	}
});
