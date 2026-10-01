'use strict';

/**
 * 一个足够用的 vscode 模块替身，用来在没有 VS Code 的环境里跑适配层测试。
 * 只实现被测代码真正用到的 API，行为尽量贴近真实语义。
 */

class Position {
	constructor(line, character) {
		this.line = line;
		this.character = character;
	}
	isBefore(other) {
		return this.line < other.line || (this.line === other.line && this.character < other.character);
	}
	isBeforeOrEqual(other) {
		return this.isBefore(other) || this.isEqual(other);
	}
	isAfter(other) {
		return other.isBefore(this);
	}
	isEqual(other) {
		return this.line === other.line && this.character === other.character;
	}
	compareTo(other) {
		if (this.isBefore(other)) return -1;
		return this.isEqual(other) ? 0 : 1;
	}
	with(line, character) {
		return new Position(line === undefined ? this.line : line, character === undefined ? this.character : character);
	}
	translate(lineDelta, characterDelta) {
		return new Position(this.line + (lineDelta || 0), this.character + (characterDelta || 0));
	}
}

class Range {
	constructor(startOrLine, startOrEnd, endLine, endChar) {
		if (typeof startOrLine === 'number') {
			this.start = new Position(startOrLine, startOrEnd);
			this.end = new Position(endLine, endChar);
		} else {
			this.start = startOrLine;
			this.end = startOrEnd;
		}
	}
	get isEmpty() {
		return this.start.isEqual(this.end);
	}
	get isSingleLine() {
		return this.start.line === this.end.line;
	}
	contains(position) {
		return !position.isBefore(this.start) && !position.isAfter(this.end);
	}
	isEqual(other) {
		return this.start.isEqual(other.start) && this.end.isEqual(other.end);
	}
	toString() {
		return '[' + this.start.line + ':' + this.start.character + ' -> ' + this.end.line + ':' + this.end.character + ']';
	}
}

class Selection extends Range {
	constructor(anchor, active) {
		super(anchor, active);
		this.anchor = anchor;
		this.active = active;
	}
}

class Uri {
	constructor(scheme, path) {
		this.scheme = scheme;
		this.path = path;
	}
	static file(fsPath) {
		return new Uri('file', fsPath);
	}
	static parse(value) {
		if (value instanceof Uri) return value;
		const match = /^([a-zA-Z][a-zA-Z0-9+.\-]*):(.*)$/.exec(String(value));
		if (!match) return new Uri('file', String(value));
		return new Uri(match[1], match[2]);
	}
	toString() {
		return this.scheme + ':' + this.path;
	}
	get fsPath() {
		return this.path;
	}
}

class ThemeColor {
	constructor(id) {
		this.id = id;
	}
}

class Disposable {
	constructor(fn) {
		this._fn = fn;
	}
	dispose() {
		if (this._fn) {
			this._fn();
			this._fn = undefined;
		}
	}
}

/** 极简事件：返回订阅函数，附带 .fire。 */
function createEvent() {
	const listeners = [];
	const subscribe = (listener) => {
		listeners.push(listener);
		return new Disposable(() => {
			const index = listeners.indexOf(listener);
			if (index >= 0) listeners.splice(index, 1);
		});
	};
	subscribe.fire = (value) => {
		for (const listener of listeners.slice()) listener(value);
	};
	subscribe.count = () => listeners.length;
	return subscribe;
}

function createTextDocument(uri, lines, version, languageId) {
	const text = lines.join('\n');
	return {
		uri,
		version: version === undefined ? 1 : version,
		languageId: languageId === undefined ? 'typescript' : languageId,
		lineCount: lines.length,
		getText: () => text,
		lineAt: (line) => ({ lineNumber: line, text: lines[line] === undefined ? '' : lines[line] }),
		getWordRangeAtPosition: () => null
	};
}

function createFakeVscode() {
	const state = {
		commandHandlers: new Map(),
		commandCalls: [],
		registeredCommands: new Map(),
		decorationTypes: [],
		decorationApplications: [],
		webviewPanels: [],
		configuration: {},
		configurationUpdates: [],
		messages: [],
		clipboard: '',
		outputLines: []
	};

	const events = {
		selection: createEvent(),
		activeEditor: createEvent(),
		textDocument: createEvent(),
		configurationChanged: createEvent()
	};

	const workspace = {
		textDocuments: [],
		getConfiguration(section) {
			const prefix = section ? section + '.' : '';
			return {
				get(key, fallback) {
					const full = prefix + key;
					return Object.prototype.hasOwnProperty.call(state.configuration, full)
						? state.configuration[full]
						: fallback;
				},
				has(key) {
					return Object.prototype.hasOwnProperty.call(state.configuration, prefix + key);
				},
				async update(key, value, target) {
					state.configurationUpdates.push({ key: prefix + key, value, target });
					state.configuration[prefix + key] = value;
					events.configurationChanged.fire({
						affectsConfiguration: (needle) => (prefix + key).startsWith(needle)
					});
				}
			};
		},
		async openTextDocument(uri) {
			const found = workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
			if (found) return found;
			throw new Error('cannot open ' + uri.toString());
		},
		asRelativePath(uri) {
			const path = typeof uri === 'string' ? uri : uri.path;
			return path.replace(/^.*\/w\//, '');
		},
		onDidChangeTextDocument: events.textDocument,
		onDidChangeConfiguration: events.configurationChanged
	};

	const window = {
		activeTextEditor: undefined,
		createOutputChannel(name) {
			return {
				name,
				appendLine(line) {
					state.outputLines.push(line);
				},
				dispose() {}
			};
		},
		createTextEditorDecorationType(options) {
			const handle = {
				options,
				key: 'dt' + state.decorationTypes.length,
				dispose() {}
			};
			state.decorationTypes.push(handle);
			return handle;
		},
		createWebviewPanel(viewType, title, column, options) {
			const messageEvent = createEvent();
			const disposeEvent = createEvent();
			const panel = {
				viewType,
				title,
				viewColumn: column,
				options,
				revealed: 0,
				disposed: false,
				webview: {
					html: '',
					cspSource: 'vscode-webview://fake',
					onDidReceiveMessage: messageEvent,
					postMessage: async () => true,
					emit(message) {
						messageEvent.fire(message);
					}
				},
				onDidDispose: disposeEvent,
				reveal() {
					panel.revealed += 1;
				},
				dispose() {
					panel.disposed = true;
					disposeEvent.fire();
				}
			};
			state.webviewPanels.push(panel);
			return panel;
		},
		async showTextDocument(document, options) {
			const editor = createEditor(document);
			editor.shownWith = options;
			window.activeTextEditor = editor;
			events.activeEditor.fire(editor);
			return editor;
		},
		showInformationMessage(message) {
			state.messages.push(message);
			return Promise.resolve(undefined);
		},
		onDidChangeTextEditorSelection: events.selection,
		onDidChangeActiveTextEditor: events.activeEditor
	};

	const commands = {
		async executeCommand(command, ...args) {
			state.commandCalls.push({ command, args });
			const handler = state.commandHandlers.get(command);
			if (!handler) return undefined;
			return handler(...args);
		},
		registerCommand(command, handler) {
			state.registeredCommands.set(command, handler);
			return new Disposable(() => state.registeredCommands.delete(command));
		}
	};

	const env = {
		clipboard: {
			async writeText(value) {
				state.clipboard = value;
			}
		}
	};

	return {
		state,
		events,
		Position,
		Range,
		Selection,
		Uri,
		ThemeColor,
		Disposable,
		DecorationRangeBehavior: { AsOld: 0, Never: 1, ClosedClosed: 2, OpenOpen: 3 },
		ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 },
		TextEditorRevealType: { Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3 },
		ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
		workspace,
		window,
		commands,
		env,
		createTextDocument,
		createEditor
	};
}

function createEditor(document) {
	const editor = {
		document,
		selection: new Selection(new Position(0, 0), new Position(0, 0)),
		selections: [],
		// 由外部通过 editor.decorations 观察
		decorations: [],
		setDecorations(type, ranges) {
			editor.decorations.push({ type, ranges });
		},
		revealRange(range, revealType) {
			editor.revealed = { range, revealType };
		}
	};
	return editor;
}

module.exports = { createFakeVscode, Position, Range, Selection, Uri, ThemeColor, createEvent, createTextDocument, createEditor };
