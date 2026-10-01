'use strict';

/** 构造一个 Anchor，只需给出关心的字段。 */
function anchor(overrides) {
	return Object.assign(
		{
			uri: 'file:///w/a.ts',
			fileName: 'a.ts',
			shortPath: 'a.ts',
			startLine: 0,
			startChar: 0,
			endLine: 0,
			endChar: 3,
			role: 'reference',
			preview: '',
			indent: 0
		},
		overrides || {}
	);
}

/** 构造一个 ConnectorModel，并按 subject 所在文件自动拆分 sameFile / otherFiles。 */
function model(overrides) {
	const given = overrides || {};
	const subject = 'subject' in given ? given.subject : null;
	const related = given.related || [];
	const uri = subject ? subject.uri : undefined;
	const isCurrent = (item) => uri !== undefined && item.uri === uri;
	return {
		subject,
		related,
		sameFile: related.filter(isCurrent),
		otherFiles: related.filter((item) => !isCurrent(item)),
		truncated: Boolean(given.truncated)
	};
}

module.exports = { anchor, model };
