#!/usr/bin/env node
/**
 * 打包 .vsix。
 *
 * 为什么不用 vsce：本机沙箱不允许创建子进程，vsce/tsc 都跑不起来。
 * 好在 .vsix 就是一个普通 ZIP，这里用 Node 自带的 zlib 直接写。
 *
 * VS Code 1.140 的 VSIX 安装路径只读取压缩包里的 extension/package.json
 * （见 out/vs/code/electron-utility/sharedProcess/sharedProcessMain.js 中的校验函数），
 * 但为了兼容旧版本与其它工具，仍然按标准 VSIX 结构写入
 * extension.vsixmanifest 与 [Content_Types].xml。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- ZIP 写入

const CRC_TABLE = (() => {
	const table = new Int32Array(256);
	for (let index = 0; index < 256; index += 1) {
		let value = index;
		for (let bit = 0; bit < 8; bit += 1) {
			value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[index] = value;
	}
	return table;
})();

export function crc32(buffer) {
	let crc = -1;
	for (let index = 0; index < buffer.length; index += 1) {
		crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[index]) & 0xff];
	}
	return (crc ^ -1) >>> 0;
}

function dosDateTime(date) {
	const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
	const day = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
	return { time, day };
}

/** 把 [{ name, data }] 打包成 ZIP（deflate，UTF-8 文件名）。 */
export function createZip(entries, now = new Date()) {
	const { time, day } = dosDateTime(now);
	const localChunks = [];
	const centralChunks = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBuffer = Buffer.from(entry.name, 'utf8');
		const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
		const deflated = deflateRawSync(raw, { level: 9 });
		const stored = deflated.length >= raw.length;
		const payload = stored ? raw : deflated;
		const method = stored ? 0 : 8;
		const crc = crc32(raw);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6);
		local.writeUInt16LE(method, 8);
		local.writeUInt16LE(time, 10);
		local.writeUInt16LE(day, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(payload.length, 18);
		local.writeUInt32LE(raw.length, 22);
		local.writeUInt16LE(nameBuffer.length, 26);
		local.writeUInt16LE(0, 28);
		localChunks.push(local, nameBuffer, payload);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(method, 10);
		central.writeUInt16LE(time, 12);
		central.writeUInt16LE(day, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(payload.length, 20);
		central.writeUInt32LE(raw.length, 24);
		central.writeUInt16LE(nameBuffer.length, 28);
		central.writeUInt16LE(0, 30);
		central.writeUInt16LE(0, 32);
		central.writeUInt16LE(0, 34);
		central.writeUInt16LE(0, 36);
		central.writeUInt32LE(0, 38);
		central.writeUInt32LE(offset, 42);
		centralChunks.push(central, nameBuffer);

		offset += local.length + nameBuffer.length + payload.length;
	}

	const centralBuffer = Buffer.concat(centralChunks);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralBuffer.length, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20);

	return Buffer.concat([...localChunks, centralBuffer, end]);
}

// ---------------------------------------------------------------- ZIP 读取（自检用）

/** 解析 ZIP 并校验每个条目的 CRC，返回 [{ name, data }]。 */
export function readZip(buffer) {
	let eocd = -1;
	for (let index = buffer.length - 22; index >= 0 && index > buffer.length - 66000; index -= 1) {
		if (buffer.readUInt32LE(index) === 0x06054b50) {
			eocd = index;
			break;
		}
	}
	if (eocd < 0) {
		throw new Error('找不到 ZIP 的中央目录结尾记录');
	}
	const count = buffer.readUInt16LE(eocd + 10);
	let pointer = buffer.readUInt32LE(eocd + 16);
	const entries = [];
	for (let index = 0; index < count; index += 1) {
		if (buffer.readUInt32LE(pointer) !== 0x02014b50) {
			throw new Error('中央目录记录签名错误');
		}
		const method = buffer.readUInt16LE(pointer + 10);
		const expectedCrc = buffer.readUInt32LE(pointer + 16);
		const compressedSize = buffer.readUInt32LE(pointer + 20);
		const uncompressedSize = buffer.readUInt32LE(pointer + 24);
		const nameLength = buffer.readUInt16LE(pointer + 28);
		const extraLength = buffer.readUInt16LE(pointer + 30);
		const commentLength = buffer.readUInt16LE(pointer + 32);
		const localOffset = buffer.readUInt32LE(pointer + 42);
		const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength);

		if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
			throw new Error('本地文件头签名错误：' + name);
		}
		const localNameLength = buffer.readUInt16LE(localOffset + 26);
		const localExtraLength = buffer.readUInt16LE(localOffset + 28);
		const dataStart = localOffset + 30 + localNameLength + localExtraLength;
		const payload = buffer.subarray(dataStart, dataStart + compressedSize);

		let data;
		if (method === 0) {
			data = Buffer.from(payload);
		} else if (method === 8) {
			data = inflateRawSync(payload);
		} else {
			throw new Error('不支持的压缩方法 ' + method + '：' + name);
		}
		if (data.length !== uncompressedSize) {
			throw new Error('解压后长度不符：' + name);
		}
		if (crc32(data) !== expectedCrc) {
			throw new Error('CRC 校验失败：' + name);
		}
		entries.push({ name, data });
		pointer += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}

// ---------------------------------------------------------------- vsix 组装

function escapeXml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function walkRelative(dir, prefix = '') {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const rel = prefix ? prefix + '/' + entry.name : entry.name;
		if (entry.isDirectory()) {
			out.push(...walkRelative(path.join(dir, entry.name), rel));
		} else {
			out.push(rel);
		}
	}
	return out;
}

/** 收集要放进 extension/ 的文件，规则与 .vscodeignore 保持一致。 */
function collectExtensionFiles(root) {
	const files = [];
	const direct = ['package.json', 'README.md', 'CHANGELOG.md'];
	// README.zh-cn.md 这类本地化版本
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		if (entry.isFile() && /^README\..+\.md$/.test(entry.name)) {
			direct.push(entry.name);
		}
	}
	for (const name of direct) {
		const full = path.join(root, name);
		if (existsSync(full)) {
			files.push({ name, data: readFileSync(full) });
		}
	}
	const groups = [
		{ dir: path.join(root, 'out'), keep: (rel) => rel.endsWith('.js') },
		{ dir: path.join(root, 'image'), keep: (rel) => rel.endsWith('.svg') || rel.endsWith('.png') }
	];
	for (const group of groups) {
		if (!existsSync(group.dir)) continue;
		for (const rel of walkRelative(group.dir)) {
			if (!group.keep(rel)) continue;
			const top = path.basename(group.dir);
			files.push({ name: top + '/' + rel, data: readFileSync(path.join(group.dir, rel)) });
		}
	}
	return files.sort((left, right) => (left.name < right.name ? -1 : 1));
}

function buildManifest(manifest) {
	const lines = [];
	lines.push('<?xml version="1.0" encoding="utf-8"?>');
	lines.push('<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">');
	lines.push('  <Metadata>');
	lines.push('    <Identity Language="en-US" Id="' + escapeXml(manifest.name) + '" Version="' + escapeXml(manifest.version) + '" Publisher="' + escapeXml(manifest.publisher) + '" />');
	lines.push('    <DisplayName>' + escapeXml(manifest.displayName || manifest.name) + '</DisplayName>');
	lines.push('    <Description xml:space="preserve">' + escapeXml(manifest.description || '') + '</Description>');
	lines.push('    <Tags>' + (manifest.keywords || []).join(',') + '</Tags>');
	lines.push('    <Categories>' + (manifest.categories || []).join(',') + '</Categories>');
	lines.push('    <GalleryFlags>Public</GalleryFlags>');
	lines.push('    <Properties>');
	lines.push('      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="' + escapeXml(manifest.engines.vscode) + '" />');
	lines.push('      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />');
	lines.push('      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />');
	lines.push('      <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value="" />');
	lines.push('    </Properties>');
	lines.push('  </Metadata>');
	lines.push('  <Installation>');
	lines.push('    <InstallationTarget Id="Microsoft.VisualStudio.Code" />');
	lines.push('  </Installation>');
	lines.push('  <Dependencies />');
	lines.push('  <Assets>');
	lines.push('    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />');
	lines.push('    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />');
	lines.push('    <Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/CHANGELOG.md" Addressable="true" />');
	lines.push('  </Assets>');
	lines.push('</PackageManifest>');
	return lines.join('\n') + '\n';
}

const CONTENT_TYPES = [
	'<?xml version="1.0" encoding="utf-8"?>',
	'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
	'  <Default Extension=".vsixmanifest" ContentType="text/xml" />',
	'  <Default Extension=".json" ContentType="application/json" />',
	'  <Default Extension=".js" ContentType="application/javascript" />',
	'  <Default Extension=".md" ContentType="text/markdown" />',
	'  <Default Extension=".svg" ContentType="image/svg+xml" />',
	'  <Default Extension=".png" ContentType="image/png" />',
	'  <Default Extension=".xml" ContentType="text/xml" />',
	'</Types>',
	''
].join('\n');

/** 生成 .vsix 的字节内容（纯函数，不写磁盘，便于测试）。 */
export function buildVsixBuffer(root = projectRoot) {
	const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
	const entries = [
		{ name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES, 'utf8') },
		{ name: 'extension.vsixmanifest', data: Buffer.from(buildManifest(manifest), 'utf8') }
	];
	for (const file of collectExtensionFiles(root)) {
		entries.push({ name: 'extension/' + file.name, data: file.data });
	}
	return { buffer: createZip(entries), manifest, fileCount: entries.length };
}

/** 打包并写出到磁盘，随后重新读回来做一次自检。 */
export async function packageVsix({ skipBuild = false } = {}) {
	if (!skipBuild) {
		const result = await build();
		if (result.errors > 0) {
			throw new Error('编译有 ' + result.errors + ' 个错误，已中止打包。');
		}
	}
	const { buffer, manifest } = buildVsixBuffer();
	const target = path.join(projectRoot, manifest.name + '-' + manifest.version + '.vsix');
	writeFileSync(target, buffer);

	const entries = readZip(buffer);
	const names = entries.map((entry) => entry.name);
	const inner = JSON.parse(entries.find((entry) => entry.name === 'extension/package.json').data.toString('utf8'));
	const mainEntry = entries.find((entry) => entry.name === 'extension/' + String(inner.main).replace(/^\.\//, ''));
	if (!mainEntry) {
		throw new Error('自检失败：package.json 里的 main 指向的文件不在包内。');
	}
	if (names.some((name) => name.endsWith('.ts') || name.endsWith('.map'))) {
		throw new Error('自检失败：包里混入了源码或 sourcemap。');
	}
	if (!names.includes('extension/README.md') || !names.includes('extension/CHANGELOG.md')) {
		throw new Error('自检失败：缺少 README 或 CHANGELOG。');
	}

	return {
		target,
		bytes: buffer.length,
		entries: names.length,
		id: inner.publisher + '.' + inner.name,
		version: inner.version,
		engine: inner.engines.vscode
	};
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
	const result = await packageVsix();
	console.log('已生成 ' + path.relative(projectRoot, result.target));
	console.log('  扩展 ID：' + result.id + ' v' + result.version + '（要求 VS Code ' + result.engine + '）');
	console.log('  大小：' + (result.bytes / 1024).toFixed(1) + ' KB，压缩包内 ' + result.entries + ' 个条目，CRC 全部通过');
}
