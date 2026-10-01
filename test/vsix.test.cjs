'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const packager = import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'package.mjs')).href);

async function unpack() {
	const module = await packager;
	const built = module.buildVsixBuffer();
	// readZip 会对每个条目做 CRC 校验，校验不过会抛异常
	return { built, entries: module.readZip(built.buffer) };
}

test('生成的字节流是合法 ZIP，且每个条目 CRC 校验通过', async () => {
	const { built, entries } = await unpack();
	assert.ok(built.buffer.length > 0);
	assert.equal(entries.length, built.fileCount);
	assert.ok(entries.length >= 15);
});

test('包含 VS Code 安装扩展所需的关键条目', async () => {
	const { entries } = await unpack();
	const names = entries.map((entry) => entry.name);
	for (const required of [
		'extension/package.json',
		'extension.vsixmanifest',
		'[Content_Types].xml',
		'extension/out/extension.js',
		'extension/README.md',
		'extension/CHANGELOG.md'
	]) {
		assert.ok(names.includes(required), '缺少 ' + required);
	}
	assert.ok(names.every((name) => name.startsWith('extension/') || name === '[Content_Types].xml' || name === 'extension.vsixmanifest'));
});

test('包内没有源码或 sourcemap', async () => {
	const { entries } = await unpack();
	const leaked = entries.map((entry) => entry.name).filter((name) => name.endsWith('.ts') || name.endsWith('.map'));
	assert.deepEqual(leaked, []);
});

test('包内的 package.json 能通过 VS Code 的安装校验', async () => {
	const { entries } = await unpack();
	const manifest = JSON.parse(entries.find((entry) => entry.name === 'extension/package.json').data.toString('utf8'));
	const names = entries.map((entry) => entry.name);

	// 对应 VS Code 安装前的字段校验
	assert.equal(typeof manifest.name, 'string');
	assert.equal(typeof manifest.version, 'string');
	assert.equal(typeof manifest.publisher, 'string');
	assert.equal(typeof manifest.engines, 'object');
	assert.equal(typeof manifest.engines.vscode, 'string');
	assert.ok(Array.isArray(manifest.activationEvents));
	assert.ok(manifest.activationEvents.every((event) => typeof event === 'string'));
	assert.equal(typeof manifest.main, 'string');
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);

	// activationEvents 存在时，VS Code 要求 main 或 browser 指向真实入口
	const entryFile = 'extension/' + manifest.main.replace(/^\.\//, '');
	assert.ok(names.includes(entryFile), 'main 指向的 ' + entryFile + ' 不在包内');
});

test('vsixmanifest 是 XML 且指向 extension/package.json', async () => {
	const { entries } = await unpack();
	const xml = entries.find((entry) => entry.name === 'extension.vsixmanifest').data.toString('utf8');
	assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
	assert.ok(xml.includes('<PackageManifest Version="2.0.0"'));
	assert.ok(xml.includes('Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json"'));
	assert.ok(xml.includes('Publisher="' + JSON.parse(entries.find((e) => e.name === 'extension/package.json').data.toString('utf8')).publisher + '"'));
	const opens = (xml.match(/<(?!\/)[A-Za-z]/g) || []).length;
	assert.ok(opens > 0);
	assert.ok(xml.trimEnd().endsWith('</PackageManifest>'));
});

test('[Content_Types].xml 覆盖包内出现的扩展名', async () => {
	const { entries } = await unpack();
	const contentTypes = entries.find((entry) => entry.name === '[Content_Types].xml').data.toString('utf8');
	const extensions = new Set(entries.map((entry) => path.extname(entry.name)).filter(Boolean));
	for (const extension of extensions) {
		assert.ok(contentTypes.includes('Extension="' + extension + '"'), '缺少 ' + extension + ' 的内容类型声明');
	}
});

test('README 里引用的相对路径图片都在包里', async () => {
	const { entries } = await unpack();
	const names = entries.map((entry) => entry.name);
	// 所有语言的 README 都要查
	const readmes = entries.filter((entry) => /^extension\/README(\..+)?\.md$/.test(entry.name));
	assert.ok(readmes.length > 0, '包里应有 README');

	for (const readme of readmes) {
		const text = readme.data.toString('utf8');
		for (const match of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
			const ref = match[1];
			// 绝对地址（https://…、data:…）由外部托管，不归包管；只校验相对路径确实进了包
			if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) continue;
			assert.ok(names.includes('extension/' + ref), readme.name + ' 引用的 ' + ref + ' 不在包里');
		}
	}
});

test('清单里的 icon 也在包里', async () => {
	const { entries } = await unpack();
	const names = entries.map((entry) => entry.name);
	const manifest = JSON.parse(entries.find((entry) => entry.name === 'extension/package.json').data.toString('utf8'));
	assert.equal(typeof manifest.icon, 'string', 'package.json 应声明 icon');
	assert.ok(names.includes('extension/' + manifest.icon), '清单声明的 icon ' + manifest.icon + ' 不在包里');
});
