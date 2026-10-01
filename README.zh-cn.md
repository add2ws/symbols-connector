[English](README.md) | [简体中文](README.zh-cn.md)

# Symbols Connector

用连接线直观地展示当前文件中某符号的所有引用和定义


![Symbols Connector](https://raw.githubusercontent.com/add2ws/symbols-connector/refs/heads/main/docs/screenshot.png)

## 功能

- **编辑器内连线** — 光标放到标识符(变量、函数或类)上，同文件里的每个出现位置都会被连起来，并标上序号：`0` 是定义 / 声明，其余按代码上下顺序编号。
- **引用关系图** — 按 `Ctrl+Alt+G` 打开侧边面板，用曲线画出全部引用。支持跨文件，点节点即可跳过去。

## 使用

装好即用 —— 把光标移到任意标识符上，不需要额外操作。

命令面板（`Ctrl+Shift+P`）和编辑器右键菜单里也能找到：

| 命令 | 快捷键 |
| --- | --- |
| 打开引用关系图 | `Ctrl+Alt+G` / `Cmd+Alt+G` |
| 启用 / 停用符号连线 | — |
| 重新解析当前符号 | — |
| 复制引用清单到剪贴板 | — |

## 配置

默认是 1.5px 橙色虚线。想换外观改以下这几项：

```jsonc
{
  "symbolsConnector.lineWidth": 1.5,        // 粗细 1-8px
  "symbolsConnector.lineStyle": "dashed",   // solid / dashed / dotted / double
  "symbolsConnector.palette": ["#F5A623CC"] // 支持 #RRGGBBAA 半透明
}
```

给不同引用上不同颜色，把 `palette` 写成多色数组即可（按序号循环取用）。

常用开关：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `symbolsConnector.autoTrigger` | `true` | 光标移动时自动解析；关掉后只能用命令触发 |
| `symbolsConnector.autoOpenGraph` | `false` | 解析完成后自动打开关系图 |
| `symbolsConnector.maxRelated` | `60` | 单次最多渲染多少个引用 |

其余（导轨对齐、序号标签、跨文件预览等）在设置里搜 `symbolsConnector` 就能看到。
