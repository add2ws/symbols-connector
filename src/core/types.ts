/**
 * 核心数据模型。
 *
 * core/ 目录下的模块刻意不 import "vscode"，因此可以在普通 Node 进程里直接运行与单元测试。
 * 与 VS Code 的耦合集中在 vscode/ 目录，vscode 模块通过参数注入。
 */

/** 锚点相对光标符号的角色。 */
export type AnchorRole = 'definition' | 'declaration' | 'reference';

/** 源码中的一个位置区间。行列均为 0 起始，与 vscode.Position 保持一致。 */
export interface Anchor {
	/** 文件 URI 字符串（vscode.Uri.toString()），用于跨文件比较。 */
	uri: string;
	/** 展示用文件名（basename）。 */
	fileName: string;
	/** 展示用的工作区相对路径。 */
	shortPath: string;
	startLine: number;
	startChar: number;
	endLine: number;
	endChar: number;
	role: AnchorRole;
	/** 所在行的预览文本；没有读到内容时为空串。 */
	preview: string;
	/**
	 * 所在行的前导空白**字符**个数（Tab 记 1 个字符）。
	 * 必须用字符数而不是视觉宽度：它会直接当作 Range 的字符列使用。
	 */
	indent: number;
}

/** 语言服务返回的原始结果，尚未去重、排序、限流。 */
export interface RawResolution {
	/** 光标所在符号自身的位置；识别失败时为 null。 */
	subject: Anchor | null;
	definitions: Anchor[];
	declarations: Anchor[];
	references: Anchor[];
}

/** 整理好、可供界面直接使用的模型。 */
export interface ConnectorModel {
	subject: Anchor | null;
	/** 全部相关位置：已去重、排序（当前文件优先，其次按文件与行号）。 */
	related: Anchor[];
	/** subject 所在文件内的相关位置。 */
	sameFile: Anchor[];
	/** 其它文件的相关位置。 */
	otherFiles: Anchor[];
	/** related 是否因为数量上限而被截断。 */
	truncated: boolean;
}

/** 角色优先级：数值越小越权威。定义 > 声明 > 引用。 */
export const ROLE_RANK: Record<AnchorRole, number> = {
	definition: 0,
	declaration: 1,
	reference: 2
};

/** 该角色是否属于“定义/声明”一类。 */
export function isDeclarationLike(role: AnchorRole): boolean {
	return role === 'definition' || role === 'declaration';
}
