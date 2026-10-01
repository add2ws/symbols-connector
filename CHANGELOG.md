# Changelog

## 0.4.3

Chinese homepage.

- Added `README.zh-cn.md` and a language switcher link at the top of both READMEs.
- The Marketplace does not switch READMEs by locale, so the switcher is a plain relative link; it works in the repository and in VS Code's extension details view.
- The packager now also ships `README.<locale>.md`.

## 0.4.2

Set the real publisher.

- `publisher` changed from the placeholder `local` to `antenna-tec`. The extension ID is now **antenna-tec.symbols-connector**.
- This is a different extension ID from earlier `local.*` builds, so uninstall the old one before installing this (VS Code treats them as two extensions).

## 0.4.1

Added the extension icon.

- `package.json` now points `icon` at `docs/symbols-connector.png` (1254x1254 PNG). It shows in the Extensions view and on the Marketplace listing.
- New test: the icon referenced by the manifest must actually be inside the package — the packager uses an allowlist, so a missing rule would silently ship an icon-less VSIX.

## 0.4.0

English release.

- Every user-facing string is now English: command titles, setting descriptions, the graph panel, the webview UI, the text report and all notifications.
- README and CHANGELOG rewritten in English for the Marketplace listing.

## 0.3.7

Rewrote the homepage for users.

- README trimmed from ~7000 to ~1400 characters: one-line intro, editor screenshot, two core features, command table, common settings, limitations, development commands.
- Added the in-editor connector screenshot `docs/screenshot.png` as the hero image.
- The packager now includes `docs/**/*.png` and `[Content_Types].xml` declares `.png` — without this the homepage image would be missing from the VSIX and break after publishing.
- New test: every image referenced by the README must actually be inside the package.
- `package.json` description shortened to one line.

## 0.3.6

Default connector style is now 1.5px orange dashed.

- `lineWidth` default `1` → `1.5`
- `lineStyle` default `dotted` → `dashed`
- `palette` default `['#7ED321']` → `['#F5A623CC']` (orange at 80% opacity)
- Three tests that only care about geometry and colours now pass `lineWidth: 1` explicitly instead of relying on the default.

## 0.3.5

Default connector style changed to green dotted.

- `palette` default changed from an 8-colour palette to a single green `#7ED321`.
- `lineStyle` default changed from `solid` to `dotted`.
- The assertion that hard-coded the default line style now references `DEFAULT_OPTIONS.lineStyle`.

## 0.3.4

Fixed silent rounding of px settings.

- `lineWidth` and `markBorderRadius` shared a reader that applied `Math.round` to every numeric setting, so `lineWidth: 1.5` silently became 2 — 1.5px is a valid CSS border width.
- Split into `readMeasurement` (px, keeps decimals, still clamped) and `readNumber` (counts and columns, rounded).

## 0.3.3

Rails are now flush with the left edge of the text area.

- The base column used to come from the shallowest indent of the lines a rail crosses, and lanes were staggered **leftwards** — the result was a staircase.
- The base column is now fixed to `minRailColumn` (default 0) and `maxRailLanes` defaults to **1**: every connector shares one vertical line, so the left end is a straight line.
- Staggering remains available: raising `maxRailLanes` fans the extra lanes **rightwards**, bounded by the shallowest indent so they never overlap code.
- Decorations can only target text ranges, so the leftmost a rail can reach is the text area's column 0; the gutter cannot be painted into.

## 0.3.2

Fixed the stray line segment at the end of each connector.

- Stubs are drawn with `border-top` at the **top edge** of their line, while rails covered the closed range `top..bottom` — leaving one extra line-height of vertical hanging below the horizontal.
- Rails now cover `[top, bottom)`.
- Direction-independent: when a target sits above the cursor, the extra segment used to hang off the **cursor's line**.

## 0.3.1

Indexes now follow code order.

- The cursor symbol used to always get index `1` regardless of where it sits in the file. It now queues up with the normal references: definition/declaration is still `0`, the rest count up from `1`, current file first by line, other files after by path and line.
- Removed the `numbering.SUBJECT_LABEL` constant.

## 0.3.0

Index scheme.

- The symbol under the cursor now gets an index too; previously only references were labelled.
- Definition/declaration is fixed at `0`; the cursor symbol is `1`; the rest count up from `2` in display order.
- The editor connectors and the graph share one numbering and colour scheme. Before this the graph picked colours by node index while the editor used the same-file index, so introducing `0` would have made them disagree.
- `mergeAnchors` now detects when the cursor sits on a definition and upgrades the subject's role — otherwise the subject could never be `0`.
- Added `core/numbering.ts`; graph nodes show `#index · line`.
- Removed `GraphLayout.paletteSize`, which became dead once colours followed the index.

## 0.2.0

Configurable line style.

- New settings: `lineWidth` (1-8px), `lineStyle` (solid/dashed/dotted/double), `markBorderRadius` (0-12px).
- Colours come from `palette`, which supports `#RRGGBBAA` / `rgba()` for transparency.
- The painter keeps a style fingerprint and rebuilds decoration types when it changes, so settings apply immediately instead of requiring a window reload.
- The reference highlight box keeps a 1px border and only exposes its corner radius — it is a marker, not a connector.

## 0.1.1

Fixed in-editor connector rendering.

- **Root cause**: the resolver measured indentation in visual columns (tab = 4) but the value was then used as a **character** column for `Range`. In tab-indented files the code starts at character column 3 while the indentation reported 12, so rails landed on column 11 — right on top of the code.
- **Rails no longer fragment into a staircase**: the same character column maps to a different x on lines with different indentation, so a single "vertical" line broke up. The base column now considers every non-blank line the rail crosses.
- **Lane assignment**: lanes degrade to one column apart when space is tight, and share a single column when only one is available.
- Added `src/core/text.ts` to lock down the character-column semantics, plus 10 regression tests.

## 0.1.0

First release.

- In-editor orthogonal connectors: vertical rails (split into per-line single-line decorations) plus horizontal stubs, coloured by index, with a bordered marker and index label on each reference.
- Side webview reference graph: bezier curves, grouped by file, clickable nodes, cross-file.
- Symbol resolution built on the VS Code built-in commands: definition / declaration / references / document highlights, deduplicated, role-prioritised, current file first, with a cap on results.
- Index scheme shared by both views.
- 16 settings: connector width / style / colours / corner radius, rail layout, trigger behaviour and more.
- Zero-dependency build and packaging: ships its own `types/vscode.d.ts`; `build.mjs` falls back to the TypeScript compiler bundled with VS Code; `package.mjs` produces a `.vsix` without `vsce`.
- 120 unit tests (`node:test`), covering `core/` directly and the `vscode` adapters through an injected fake.
