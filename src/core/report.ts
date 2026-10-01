import type { AnchorRole, ConnectorModel } from './types';

const ROLE_LABEL: Record<AnchorRole, string> = {
	definition: 'Definition',
	declaration: 'Declaration',
	reference: 'Reference'
};

/** 生成纯文本引用清单，供“复制引用清单”命令写入剪贴板。 */
export function renderTextReport(model: ConnectorModel): string {
	const lines: string[] = [];
	if (model.subject) {
		lines.push('Symbol: ' + model.subject.shortPath + ':' + (model.subject.startLine + 1) + ':' + (model.subject.startChar + 1));
	} else {
		lines.push('Symbol: (could not identify the symbol under the cursor)');
	}
	lines.push(
		model.related.length + ' related position' + (model.related.length === 1 ? '' : 's') +
		(model.truncated ? ' (truncated)' : '') +
		': ' + model.sameFile.length + ' in this file, ' + model.otherFiles.length + ' in other files.'
	);
	lines.push('');
	model.related.forEach((anchor, index) => {
		const label = ROLE_LABEL[anchor.role];
		const preview = anchor.preview.trim();
		lines.push(
			String(index + 1).padStart(3, ' ') +
			'. [' + label + '] ' +
			anchor.shortPath + ':' + (anchor.startLine + 1) + ':' + (anchor.startChar + 1) +
			(preview.length > 0 ? '  ' + preview : '')
		);
	});
	return lines.join('\n');
}
