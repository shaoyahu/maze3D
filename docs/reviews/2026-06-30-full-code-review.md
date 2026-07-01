# Project Review — Full Code Review (2026-06-30)

**Slug**: 2026-06-30-full-code-review
**日期**: 2026-06-30
**评审窗口**: `main` HEAD = `dfdb5a3 feat(editor): 碰撞校验 + lastError modal + zoom 范围扩展 + pan-hint 布局`
**前置评审**: [`2026-06-17-p2-13-full-code-review.md`](./2026-06-17-p2-13-full-code-review.md)
**关联文档**: [`findings/2026-06-30-A-architecture.md`](./findings/2026-06-30-A-architecture.md) · [`findings/2026-06-30-B-correctness.md`](./findings/2026-06-30-B-correctness.md) · [`findings/2026-06-30-C-security.md`](./findings/2026-06-30-C-security.md) · [`findings/2026-06-30-D-performance.md`](./findings/2026-06-30-D-performance.md) · [`findings/2026-06-30-E-accessibility.md`](./findings/2026-06-30-E-accessibility.md) · [`findings/2026-06-30-F-i18n.md`](./findings/2026-06-30-F-i18n.md) · [`findings/2026-06-30-G-testing.md`](./findings/2026-06-30-G-testing.md) · [`findings/2026-06-30-H-style.md`](./findings/2026-06-30-H-style.md)
**评审方式**: 8 维度并行子代理 (architecture / correctness / security / performance / accessibility / i18n / testing / style) + 对抗性验证 (CRITICAL/HIGH)

## §0 元数据 & 方法

- **评审范围**: 全量项目 (`src/`, `tests/`, `public/`, `docs/`, 配置文件)
- **文件数**: 43 个文件有发现，覆盖 src/ 60+ 文件、tests/ 30+ 文件
- **子代理拆分**: 8 个并行 review agent → 对抗性验证 agent (CRITICAL 5 条 + HIGH 10 条)
- **验证结果**: 5 CRITICAL → 2 确认 (1 降级 HIGH, 1 降级 MEDIUM), 3 误报; 10 HIGH → 6 确认, 4 误报

## §1 总览

| 严重度 | 数量 | 说明 |
|---|---|---|
| **CRITICAL** | 0 | 原始 5 条经对抗性验证全部降级或否定 |
| **HIGH** | 25 | 含 1 条确认的 setTimeout race condition |
| **MEDIUM** | 70 | CSS token 一致性、a11y 缺陷、测试覆盖缺口 |
| **LOW** | 75 | 风格、注释、微小性能 |
| **误报** | 5 | 对抗性验证否定 |

**一句话结论**: 项目无 CRITICAL 级问题。最需关注的是 EditorTutorialManual 关闭动画的 setTimeout race (H-18)、sanitizeSettings 全量丢弃策略 (H-3/M-11)、以及全项目 modal 组件缺少 focus trap/focus restoration 的系统性 a11y 缺陷 (H-5~H-12, M-40)。CSS 层面新代码（editor-manual）与既有 token/transition 约定有多处不一致。

## §2 HIGH 级 Finding

### H-1. index.html:1 — 缺少 Content Security Policy

**文件**: `index.html:1`
**影响**: 无 CSP 保护，XSS 攻击面扩大（虽然代码无 innerHTML/eval）
**修复**: 添加 CSP meta tag: `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' fonts.googleapis.com; font-src fonts.gstatic.com; img-src 'self' data:;">`

### H-2. src/store/gameStore.ts:117 — Parchment 状态双重记账

**文件**: `src/store/gameStore.ts:117` + `src/engine/Game.ts:201`
**影响**: engine 和 store 各持一份 ParchmentState，同步依赖 GameBridge 回调，存在不一致风险
**修复**: 让 store 成为唯一真源，engine 通过 accessor 读取

### H-3. src/store/settingsStore.ts:43 — sanitizeSettings 全量丢弃策略

**文件**: `src/store/settingsStore.ts:43-44`
**影响**: `pointerSensitivity` 或 `fov` 单字段损坏导致整个 settings 被丢弃（包括 `tutorialManualAutoOpen` 偏好），回退到 DEFAULTS
**修复**: 对 `pointerSensitivity`/`fov`/`darkMode` 也采用与 `enemyAggression`/`language`/`tutorialManualAutoOpen` 相同的逐字段宽松回退模式

### H-4. src/styles/theme.css:2038 — editor-manual transition 缺少 ease-out

**文件**: `src/styles/theme.css:2038`
**影响**: `.editor-manual__close` 的 `transition: color 120ms, background 120ms;` 缺少 `ease-out`，与项目约定不一致
**修复**: 改为 `transition: color 120ms ease-out, background 120ms ease-out;`

### H-5. src/ui/components/Dialog.tsx:125 — Dialog 无 focus restoration

**文件**: `src/ui/components/Dialog.tsx:125`
**影响**: 所有 confirm dialog 关闭后焦点丢失，键盘用户无法继续操作
**修复**: open 时保存 `document.activeElement`，关闭时恢复

### H-6. src/ui/components/Dialog.tsx:143 — Dialog focus trap 不完整

**文件**: `src/ui/components/Dialog.tsx:143`
**影响**: Tab 只在 action buttons 间循环，若 dialog 有其他可聚焦元素则焦点可逃逸
**修复**: 扩展 Tab 处理覆盖 dialog 内所有可聚焦元素

### H-7~H-9. src/ui/components/ParchmentMap.tsx — 无 focus trap / 无 autoFocus / 无 focus restoration

**文件**: `src/ui/components/ParchmentMap.tsx:37,42,430`
**影响**: 羊皮纸地图 modal 的 a11y 完整性缺失
**修复**: 添加 focus trap + autoFocus + focus restoration

### H-10. src/ui/components/ParchmentMap.tsx:491 — InertWrapper 使用非类型 DOM 属性

**文件**: `src/ui/components/ParchmentMap.tsx:491`
**影响**: `(el as unknown as { inert: boolean }).inert = true` 绕过 React 18 类型系统
**修复**: 使用 React 18 支持的 `inert={true}` 属性

### H-11. src/ui/editor/EditorHelpDrawer.tsx:38 — HelpDrawer 无 focus restoration

**文件**: `src/ui/editor/EditorHelpDrawer.tsx:38`
**影响**: 关闭后焦点丢失
**修复**: 保存/恢复 activeElement

### H-12. src/ui/editor/EditorHelpDrawer.tsx:66 — HelpDrawer 无 focus trap

**文件**: `src/ui/editor/EditorHelpDrawer.tsx:66`
**影响**: Tab 可逃逸到背景编辑器
**修复**: 添加 focus trap

### H-13. src/ui/editor/EditorPage.tsx:12 — 教程手册状态 prop drilling

**文件**: `src/ui/editor/EditorPage.tsx:12`
**影响**: `manualOpen` 通过 props 层层传递，与 editorStore 模式不一致
**修复**: 将 `manualOpen` 提升到 editorStore 或独立小 store

### H-14. src/ui/editor/EditorPage.tsx:118 — draftPromptedRef 严格模式行为

**文件**: `src/ui/editor/EditorPage.tsx:118`
**影响**: React 18 strict mode 双重挂载时 ref 不重置，但经验证此行为实际正确（防止重复弹窗）
**状态**: ⚠️ 对抗性验证标记为误报，保留为 LOW

### H-15. src/ui/editor/EditorPage.tsx:133 — lastErrorKey 回退无警告

**文件**: `src/ui/editor/EditorPage.tsx:133`
**影响**: i18n key 缺失时 `t()` 返回 key 字符串，toast 显示原始 key 而非可读文本
**修复**: 添加 fallback 文本或 warn

### H-16. src/ui/editor/EditorPropertiesPanel.tsx:231 — useDebouncedCommit 卸载丢失待提交值

**文件**: `src/ui/editor/EditorPropertiesPanel.tsx:231`
**影响**: 组件卸载时 pending debounce 值被丢弃
**修复**: 在 cleanup 中 flush pending commit

### H-17. src/ui/editor/EditorTutorialManual.tsx:54 — 教程手册无 focus restoration

**文件**: `src/ui/editor/EditorTutorialManual.tsx:54`
**影响**: 关闭后焦点丢失
**修复**: 保存/恢复 activeElement

### H-18. src/ui/editor/EditorTutorialManual.tsx:96 — ⭐ 关闭动画 setTimeout race condition

**文件**: `src/ui/editor/EditorTutorialManual.tsx:92-101`
**影响**: `handleClose` 设置 400ms setTimeout + animationend 监听。若用户在 400ms 内重新打开手册，旧 timeout 仍会触发 `onClose()`，关闭新打开的手册。**已对抗性验证确认为真实 bug。**
**修复**: 使用 generation counter ref — 每次 handleClose 递增计数器，callback 检查计数器是否匹配再执行 onClose

### H-19. src/ui/editor/EditorTutorialManual.tsx:144 — 教程手册无 focus trap

**文件**: `src/ui/editor/EditorTutorialManual.tsx:144`
**影响**: Tab/Shift-Tab 可逃逸到背景编辑器
**修复**: 添加 focus trap useEffect

### H-20. src/ui/editor/EditorTutorialManual.tsx:157 — checkbox aria-label 覆盖 label 文本

**文件**: `src/ui/editor/EditorTutorialManual.tsx:157-163`
**影响**: `<label>` 包裹 `<input>` 时 label 文本已是 accessible name，额外 `aria-label` 覆盖了它，违反 WCAG 1.3.1
**修复**: 移除 `aria-label`，让 wrapping label 提供可访问名称

### H-21. src/ui/editor/EditorViewport.tsx:337 — 每次渲染重建 transform 字符串

**文件**: `src/ui/editor/EditorViewport.tsx:337`
**影响**: 视口每次 camera 变化都重建 template literal，触发不必要的 reconciliation
**修复**: 用 `useMemo` 缓存 transform 字符串

### H-22~H-23. tests/component/EditorTutorialManual.test.tsx — 测试断言薄弱

**文件**: `tests/component/EditorTutorialManual.test.tsx:71,77`
**影响**: TOC 测试只检查首尾项；章节切换测试只检查 CSS class 不检查内容变化
**修复**: 扩展断言覆盖

### H-24. tests/component/EditorTutorialManual.test.tsx:143 — 关闭动画未测试 timeout fallback

**文件**: `tests/component/EditorTutorialManual.test.tsx:143`
**影响**: 只测了 animationend 路径，未测 400ms timeout fallback
**修复**: 添加不触发 animationend + advance timer 的测试

### H-25. tests/component/editor/EditorPage.test.tsx:1 — 缺少 auto-open 逻辑测试

**文件**: `tests/component/editor/EditorPage.test.tsx`
**影响**: EditorPage 的 auto-open tutorial manual 逻辑无测试覆盖
**修复**: 添加测试：tutorialManualAutoOpen=true + 无 draft → 手册自动打开

## §3 MEDIUM 级 Finding (精选)

> 完整 70 条见分项 findings 文件。以下列出最需关注的。

| # | 文件:行 | 标题 | 修复概要 |
|---|---|---|---|
| M-3 | `src/maze/importExport.ts:36` | exportLevel 不限制 name 长度 | 添加 max-length 校验 |
| M-5 | `src/maze/importExport.ts:45` | parseImport 不拒绝 `__proto__` key | 递归剥离危险 key |
| M-6 | `src/store/editorStore.ts:422` | levelHash 每次按键都 JSON.stringify | 轻量 hash 或增量 dirty |
| M-7 | `src/store/editorStore.ts:635` | setHideMinimap(false) 设 undefined 非 'top-right' | 修正 fallback |
| M-11 | `src/store/settingsStore.ts:43` | sanitizeSettings 全量丢弃 (同 H-3) | 逐字段宽松回退 |
| M-13 | `src/styles/theme.css:211` | 多个 CSS 动画缺少 prefers-reduced-motion | 添加全局 reduced-motion 块 |
| M-15 | `src/styles/theme.css:1969` | Modal z-index 未 token 化 | 添加 CSS 变量 |
| M-16 | `src/styles/theme.css:1980` | editor-manual 使用已废弃 var(--panel) | 改为 var(--bg-elevated) |
| M-18 | `src/styles/theme.css:2029` | editor-manual 交互元素缺 focus-visible | 添加 :focus-visible 规则 |
| M-20 | `src/styles/theme.css:2038` | transition 缺 ease-out (同 H-4) | 补充 ease-out |
| M-22 | `src/styles/theme.css:2188` | prefers-reduced-motion 未抑制打开动画 | 添加规则 |
| M-30 | `src/ui/editor/EditorPage.tsx:88` | autoOpenAttemptedRef 永久禁用再自动打开 | 改为基于 manualOpen 状态守卫 |
| M-37 | `src/ui/editor/EditorTutorialManual.tsx:92` | onClose 可能被 animationend + timeout 双触发 | 添加 closed flag |
| M-38 | `src/ui/editor/EditorTutorialManual.tsx:96` | animationend 监听器在卸载时泄漏 | 移入 useEffect + cleanup |
| M-40 | `src/ui/editor/EditorTutorialManual.tsx:144` | 无 focus trap (同 H-19) | 添加 focus trap |
| M-42 | `src/ui/editor/EditorTutorialManual.tsx:163` | aria-label 覆盖 label (同 H-20) | 移除 aria-label |
| M-44 | `src/ui/editor/EditorViewport.tsx:102` | ESC handler 在 panel input 中也触发 | 扩展 skip 选择器 |
| M-45 | `src/ui/editor/EditorViewport.tsx:149` | isCellSelected 每次渲染新建闭包 | useCallback 或提取 |
| M-47 | `src/ui/editor/EditorViewport.tsx:237` | pan handler 使用 stale camera | 添加 cameraRef |
| M-51 | `src/ui/editor/EditorViewport.tsx:403` | 2500+ grid cell 每次渲染新建 inline style | CSS class + React.memo |
| M-54 | `src/utils/gameUrl.ts:120` | parseGameSearchParams 不限制 id 长度 | 添加 256 字符上限 |

## §4 LOW 级 Finding (精选)

> 完整 75 条见分项 findings 文件。

| # | 文件:行 | 标题 |
|---|---|---|
| L-2 | `src/engine/Game.ts:32` | 模块级 scratch 对象重入不安全 |
| L-4 | `src/engine/InputManager.ts:138` | KeyP fallthrough 可能触发 useItemListener |
| L-8 | `src/i18n/resources/en.ts:133` | 语言自标签不一致 (中文选项显示 '中文' 非 'Chinese') |
| L-9 | `src/i18n/resources/zh.ts:211` | 箭头/图标 Unicode 硬编码在翻译字符串中 |
| L-14 | `src/maze/importExport.ts:139` | sanitizeFilename 的 \w 允许 Unicode |
| L-15 | `src/store/editorStore.ts:422` | JSON.stringify 无 key 顺序保证 |
| L-22 | `src/styles/theme.css:131` | 暗色模式 --fg-dim 对比度不足 |

## §5 验证为假阳性的子代理报告

| 原始 # | 原始严重度 | 文件 | 标题 | 否定理由 |
|---|---|---|---|---|
| C-2 | CRITICAL | `Dialog.tsx:135` | Dialog focus trap 只循环 action buttons | Dialog 实际只渲染 title + message + buttons，无其他可聚焦元素；代码注释明确标注为 deliberate scope |
| C-4 | CRITICAL | `EditorPropertiesPanel.tsx:629` | 绕过 isPickupType guard | 代码 line 627 显式调用 `if (!isPickupType(tp)) return;`，guard 存在且有效 |
| C-5 | CRITICAL | `editorStore.ts:1285` | History snapshot 绕过 isX guard | 所有 mutation 经过 store action 验证后才进入 snapshot；undo/redo 恢复的是已验证状态 |
| H-14 | HIGH | `EditorPage.tsx:118` | draftPromptedRef 严格模式问题 | ref 跨 strict-mode 周期持久化是正确行为，防止重复弹窗 |
| H-22 | HIGH | `EditorTutorialManual.test.tsx:71` | TOC 测试 "断言为空" | `getByTestId` 在元素不存在时 throw，断言非空；只是弱（只检查 2/6 项），非空 |

## §6 验证结果

```
npm run typecheck  → (待当前 P2-17 增强改动完成后验证)
npm test           → (同上)
npm run build      → (同上)
```

> 注：当前工作树有未提交的 P2-17 增强改动（settingsStore + i18n + CSS + EditorTutorialManual + EditorPage），typecheck/test/build 将在改动完成后执行。

## §7 跨切关注

### 7.1 Modal a11y 系统性缺陷

**涉及**: Dialog.tsx, EditorHelpDrawer.tsx, EditorTutorialManual.tsx, ParchmentMap.tsx

所有 4 个 modal/drawer 组件均缺少 focus trap 和 focus restoration。这是项目级系统性问题，非单组件 bug。建议：

1. 提取共享 `useFocusTrap` + `useFocusRestore` hooks
2. 在所有 modal 组件中统一应用
3. 添加 `@media (prefers-reduced-motion: reduce)` 全局规则

### 7.2 CSS token 一致性

**涉及**: theme.css (editor-manual 新增块)

新代码多处偏离既有约定：
- 使用已废弃 `var(--panel)` 而非 `var(--bg-elevated)`
- transition 缺少 `ease-out`
- `border-radius` 使用硬编码像素而非 token
- `box-shadow` 硬编码而非 `var(--shadow-2)`
- z-index 硬编码而非 token
- 缺少 `:focus-visible` 规则

### 7.3 sanitizeSettings 验证策略不对称

**涉及**: settingsStore.ts

`pointerSensitivity`/`fov`/`darkMode` 使用严格 early-return（单字段损坏丢弃全部），而 `enemyAggression`/`language`/`tutorialManualAutoOpen` 使用逐字段宽松回退。应统一为宽松模式。

### 7.4 EditorViewport 性能

**涉及**: EditorViewport.tsx

- 2500+ grid cell 每次渲染新建 inline style 对象
- isCellSelected 每次渲染新建闭包
- pan handler 使用 stale camera 闭包
- transform 字符串每次渲染重建

建议：React.memo + CSS class + cameraRef + useMemo(transform)

### 7.5 测试覆盖缺口

**涉及**: EditorPage.test.tsx, EditorTutorialManual.test.tsx, settingsStore.test.ts

- EditorPage auto-open 逻辑无测试
- 关闭动画 timeout fallback 路径无测试
- settingsStore language test beforeEach 未重置 tutorialManualAutoOpen
- sanitizeSettings 缺少 null/missing 混合场景测试

## §8 优先级行动建议

| 优先级 | 工作量 | Finding | 行动 |
|---|---|---|---|
| **P0** | S | H-18 | 修复 setTimeout race — generation counter ref |
| **P0** | S | H-20 / M-42 | 移除 checkbox aria-label |
| **P1** | M | H-3 / M-11 | sanitizeSettings 统一为逐字段宽松回退 |
| **P1** | S | M-16 | var(--panel) → var(--bg-elevated) |
| **P1** | S | H-4 / M-20 | transition 补 ease-out |
| **P1** | S | M-30 | autoOpenAttemptedRef 改为 manualOpen 守卫 |
| **P1** | S | M-37 | onClose 双触发防护 (closed flag) |
| **P1** | S | M-38 | animationend 监听器移入 useEffect |
| **P2** | L | §7.1 | 提取 useFocusTrap + useFocusRestore hooks，统一应用到 4 个 modal |
| **P2** | M | §7.4 | EditorViewport 性能优化 (React.memo + CSS class + cameraRef) |
| **P2** | M | §7.5 | 补充测试覆盖 (auto-open / timeout fallback / sanitizeSettings 混合场景) |
| **P3** | S | M-13 | CSS 动画全局 prefers-reduced-motion |
| **P3** | S | M-15 | z-index token 化 |
| **P3** | S | M-18 | editor-manual focus-visible 规则 |
| **P3** | M | H-1 | 添加 CSP meta tag |

## §9 Files Reviewed

| 模块 | 文件数 | Finding 数 |
|---|---|---|
| `src/ui/editor/` | 6 | 66 |
| `src/styles/` | 1 | 20 |
| `src/ui/components/` | 4 | 13 |
| `src/store/` | 4 | 13 |
| `src/maze/` | 2 | 6 |
| `tests/` | 8 | 21 |
| `src/i18n/` | 3 | 5 |
| `src/utils/` | 1 | 1 |
| `src/engine/` | 2 | 2 |
| `index.html` | 1 | 3 |
| 其他 | 11 | 20 |
| **合计** | **43** | **170** |
