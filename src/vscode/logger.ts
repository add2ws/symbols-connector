import type * as vscode from 'vscode';

/** 输出到 "输出 → Symbols Connector" 面板的简易日志。 */
export interface Logger {
	info(message: string): void;
	warn(message: string): void;
	error(message: string, error?: unknown): void;
	dispose(): void;
}

export function describeError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

export function createLogger(api: typeof vscode): Logger {
	const channel = api.window.createOutputChannel('Symbols Connector');
	const write = (level: string, message: string): void => {
		channel.appendLine('[' + level + '] ' + message);
	};
	return {
		info: (message) => write('info', message),
		warn: (message) => write('warn', message),
		error: (message, error) => write('error', error === undefined ? message : message + ' :: ' + describeError(error)),
		dispose: () => channel.dispose()
	};
}
