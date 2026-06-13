# Project Review — maze3D 全项目代码评审

**Slug**: project-review-2026-06-13
**日期**: 2026-06-13
**前置评审**: [`2026-06-11-code-review.md`](./2026-06-11-code-review.md)（35 条已全部关闭）
**关联文档**: [`findings/A-architecture.md`](./findings/A-architecture.md) · [`B-ui.md`](./findings/B-ui.md) · [`C-tests.md`](./findings/C-tests.md) · [`D-quality.md`](./findings/D-quality.md)

---

## 0. 元数据 & 评审方法

| 项目 | 值 |
|---|---|
| 项目类型 | React 18 + TypeScript + Vite + zustand + Three.js |
| 评审范围 | `src/**` + `public/levels/**` + `tests/**` + 配置文件 |
| 评审方式 | 4 个并行 Sonnet-style 子代理：§A 架构 / §B UI / §C 测试 / §D 安全与质量 |
| 输出拆分 | 每代理独立 finding 文件 → 本文档合并 + 重新优先级排序 |
| 评审窗口 | 截止 `b02fc5d docs: 增量子目录加 p2-N- 前缀…` |

---

## 1. 概览

| 严重度 | 数量 | 与 baseline 对比 |
|---|---|---|
| **CRITICAL** | 0 | ↓ (baseline 2 条已修) |
| **HIGH** | 13 | ↑ (baseline 6 条) |
| **MEDIUM** | 60 | ↑↑ (baseline 8 条) |
| **LOW** | 65 | ↑↑ (baseline 18 条) |
| **总计** | **138** | ↑↑ (baseline 35 条) |

**一句话结论**: maze3D 整体健康，主流程无 CRITICAL；HIGH 集中在 4 个新热点（useAutoSave 边界 / localStorage 数据契约 / e2e stale skip / 类型安全逃生口）；MEDIUM/LOW 大幅增长是因为新增了 P2-6/P2-7 大量 UI 路径 + 严格度提升。

---

## 2. 严重度统计

```
CRITICAL  ▏0
HIGH      ▏▏▏▏▏▏▏▏▏▏▏▏▏ 13
MEDIUM    ▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏ 60
LOW       ▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏ 65
```

---

## 3. CRITICAL（0 条）

无。

---

## 4. HIGH（13 条）

按"用户感知优先级 + ROI"排序。

### 4.1 `src/hooks/useAutoSave.ts:57-69` — Auto-save interval 在编辑器 `dirty=true` 时存活跨 unmount（A-HIGH-1）

`useAutoSave` 注册 `setInterval` 仅在 effect cleanup 清掉。interval closure 懒读 `useEditorStore.getState().dirty`,所以只要任意一个 stale store 状态报告 `dirty=true`,interval 仍会 `saveLevel()`,即使消费组件已 unmount。StrictMode dev 双 mount 放大此 race。

**修复**: 在 interval 内 `if (!mountedRef.current) return;` + 清理时 `mountedRef.current = false`;或 gate 在 `level !== null`。

### 4.2 `src/store/editorStore.ts:1-50` — editorStore ↔ levelStore 通过 `.getState()` 双向耦合（A-HIGH-2）

`editorStore.saveLevel()` 读 `useLevelStore.getState().customLevels` 并调 `upsertCustom`;`levelStore.deleteCustom(id)` 可能改 editor draft。两边互相 reach through 另一个 store,React 订阅模型不通知对方,导致 `LevelSelect.tsx:307-314` 必须手合并订阅。隐藏依赖。

**修复**: 选定 `levelStore` 为 custom-level 唯一 source of truth;`editorStore.saveLevel()` 只返回 `MazeData`,把持久化 side-effect 交给调用方。

### 4.3 `src/store/levelStore.ts:1-200` — localStorage 写不 debounce;单记录损坏整表丢（A-HIGH-3 / D-5 / D-23）

`levelStore.upsertCustom` 每次 mutation 同步 `JSON.stringify` + `localStorage.setItem`。Burst save (autosave tick + 手动 save 同 tick) 产生双写。`loadCustomLevels()` 一次 `JSON.parse` 失败 → 整个 custom-level 集合丢失(无 per-record try/catch,无 schema version check)。`saveDraft` 写 `JSON.stringify({ level: get().level })` 50×50 maze 单写 ≈ 25KB;undo 50 步 × 25KB ≈ 1.25MB 瞬时。

**修复**: (a) per-record try/catch,损坏记录搬到"待修复"；(b) envelope `{ schemaVersion, levels }`; (c) `MAX_DRAFT_BYTES` 1MB 上限 + 表面化 `QuotaExceededError`; (d) editor history `past`/`future` cap 50。

### 4.4 `src/maze/{EditorMazeProvider,JsonMazeProvider}.ts` — MazeProvider 接口名存实亡 + teaching-level glob 每次 list() 重算（A-HIGH-4）

`MazeProvider.load(id: string): Promise<MazeData>` 声明在 `types.ts:46-49`,两个实现都不遵守:`JsonMazeProvider.load(json: string)` 接原始 JSON 字符串,`EditorMazeProvider` 没 `load()` 而是 `new EditorMazeProvider(level)`。`list()` 每次调都 `import.meta.glob('../../teachingLevels/*.json')` + 重新 parse 全部教学关。

**修复**: 要么 drop interface,要么实装 `load(id: string): MazeData` 取 typed identifier;hoist glob + parse 到 module-level constant。

### 4.5 `src/ui/editor/EditorToolbar.tsx:251-264` — `level.name` 无 length / charset cap（D-1）

自由文本输入直绑 `updateName(e.target.value)`,可粘贴 10k CJK 串 / 多行 / sanitize 后变空(filename fallback `'level'` 掩盖问题)。`maze3d.editorDraft.v1` 单键 hold 整个 level,失控膨胀。

**修复**: onChange `value.slice(0, 64)` + collapse newlines + 表面 hint。

### 4.6 `src/ui/editor/EditorPropertiesPanel.tsx:223,107,142` — 未 guard 的 `as` cast 把用户控制 enum 写入 store（D-2 / D-16）

`e.target.value as PickupType` / `as VictoryType` / `as MazeSize` 直接 cast 闭 union,无 runtime guard。未来 DOM regression / 扩展 / 持久化 replay 喂越界值 → store hold invalid `MazeData` → engine 深处抛或静默错误行为。

**修复**: 单点 `isPickupType` / `isVictoryType` / `isMazeSize` / `isLevelSource` type-guard,边界强制走 guard。

### 4.7 `src/ui/LevelSelect.tsx:60-64` — `Math.random()` 备选 seed → 不可重现（D-3）

`crypto.getRandomValues` 缺失时回退到 `Math.floor(Math.random() * 256) × 8`,seed 是用户分享/重输的 reproducibility key。两位 "no-crypto" 用户永远不能复现同 hex 串。

**修复**: 备选走 (timestamp + counter) 折叠 xorshift 生成 16-hex;或在 seed input tooltip 显式注明。

### 4.8 `src/maze/JsonMazeProvider.ts:177` — `as unknown as MazeData` 逃生口 + D-7 重复 `as number`/`as string`（D-6 / D-7）

`return { ...m, pickups: normalizedPickups, enemies } as unknown as MazeData;` 验证函数返回类型还是 `Record<string, unknown>` cast,smuggling `m.customProperty` 等任意键。`requireNumber` / `requireString` 抛但不 narrow,后续 `m.cellSize as number` × 4 / `r.initialTime as number` × 3 / `ee.id as string` × 3 / `nn.x as number` × 4 — runtime check 真实,type check 失效。

**修复**: `requireNumber` 改为 narrow return `number`(抛内,typed 出); `validateMaze` 用 typed object literal 替代 spread,所有 `as number` 消失。

### 4.9 `tests/e2e/editor.spec.ts:139-179` + `:57-65` — 2 个 stale `test.skip` 静默回归风险（C-H1 / C-H3）

`carveLShape` 与新 exit-on-floor guard 冲突的 skip,无 issue link,无 re-enable 计划;`进阶 ▾` fold 在 P2-6 已删,skip 仍残留。两者若不删 / 不改 `test.fixme` + tracking link,半年后回看无人记得 → round-trip 静默 regress。

**修复**: 删两 `test.skip`(新 specs 已覆盖);或 `test.fixme` + 文件顶部 TODO + issue link。

### 4.10 `tests/e2e/editor.spec.ts:80-87` — save-and-exit-then-verify 有 race window（C-H2）

测等 `main-menu-editor` 出现后立即点 开始,没等 `levelStore` re-hydrate 完。若 hydration 改成 deferred effect,flake。若重构成 deferred effect 必然 flake。

**修复**: 点 开始 后 `await expect(page.getByTestId('level-source-select')).toBeVisible()` 强制 hydration 落定。

### 4.11 `tests/e2e/editor.spec.ts:90-131` — delete-confirm e2e seed 没清 `editorDraft`,autosave race（C-L5 升级,本轮标 HIGH）

seed 只设 `maze3d.customLevels.v1`,前 spec autosave (debounce 2s) 落地 `maze3d.editorDraft.v1` 残留 → delete spec 看到错关。

**修复**: seed 步骤显式 `removeItem('maze3d.editorDraft.v1')` 或 seed 后 assert 只存在 customLevels。

### 4.12 `src/maze/JsonMazeProvider.ts:159-177, 218, 221, 231-233` — `requireNumber` 抛但不 narrow → 4+3+3+4 个 `as number`/`as string`（D-7）

见 4.8。

### 4.13 跨表 - level.name / localStorage / 类型安全三角债（D-1 + A-HIGH-3 + D-6/D-7）

editor 关卡名无 cap → 50×50 + 长名 → 单写 25KB+ → 50 步 undo 1.25MB → localStorage 撑爆 → `QuotaExceededError` 静默吞 → 5 步后用户 autosave 看似成功但实则失败。整链路无任何节点报警。

**修复**: 全链路: clamp input → MAX_DRAFT_BYTES → surface `storageFull` 状态 → `EditorStatusBar` 红字。

---

## 5. MEDIUM（60 条）

按 10 个主题分组。详细 file:line 见 4 份子 finding 文件。

### 5.1 持久化与本地存储（10 条）

| 主题 | finding |
|---|---|
| `persist.ts:writeJson` 同步不 debounce | A-M7 |
| `loadFromStorage` 丢记录只 `console.warn`,无 UI | D-10 |
| `saveDraft` quota 错静默吞 | D-18 |
| versioned key 无 migration path | D-21 |
| `JSON.stringify` 体积无界 | D-23 |
| `safeSetItem` 包装器缺失 | D-26 |
| `loadDraft` 后应 re-save 校正 hash | D-29 |
| `onClick` 同步 `localStorage.getItem` | D-31 |
| 持久化 module 分散,难维护 | A-M5 |
| `editorHistory` 50 步 undo 无 cap | (A-HIGH-3 衍生) |

### 5.2 StrictMode 边界与 effect cleanup（5 条）

| 主题 | finding |
|---|---|
| `InputManager` StrictMode 双 mount 监听器泄漏 | A-M8 |
| `MainMenu` scene async catch + re-throw 在 unmount 后 | B-M3 |
| `EditorPage` `setShowDraftPrompt(false)` 在 cancelled 守卫外 | B-M4 |
| `prevDirtyRef` rising-edge StrictMode 双 mount 行为 | B-M16 / B-M25 |
| `Minimap` setInterval cleanup 未保 pending in-flight | D-11 |

### 5.3 React 渲染 / 性能回退（10 条）

| 主题 | finding |
|---|---|
| `Minimap` 10Hz polling 无早出 | A-M6 |
| `customDefs` 每次 render 重建,`useMemo` 失效 | B-M2 |
| HUD 7 子组件无 memo,60Hz 全 re-render | B-M12 |
| `HealthBar` `Array.from` 每次重建 | B-M15 |
| `screen` 双重订阅(Render + subscribe) | B-M20 |
| `EditorPropertiesPanel` 顶层无 memo,5+ debounced 反复 schedule | B-M21 |
| `StaticMaze` memo 在 maze reference 变时失效 | B-M11 |
| `window.__game` dev 残留 | B-M13 |
| `buildLookups` 每 render 重建 Map | B-L30 |
| `validateDesign` O(n²) ≈ 50ms | B-L14 |

### 5.4 useConfirm / Dialog 边界（5 条）

| 主题 | finding |
|---|---|
| `buttonRefs` cleanup deps 仅 `[open]`,actions 变未触发 | B-M1 / B-M19 |
| Tab cycling portal 外 idx===-1 处理 OK | B-M22 |
| render 期写 ref | B-M23 |
| `request()` 同步路径 setCurrent race | B-L22 |
| `drainCurrentRef` effect deps OK | B-L23 |

### 5.5 a11y / UX 细节（4 条）

| 主题 | finding |
|---|---|
| `sublevelId` 切换 source 丢失用户选择 | B-M7 |
| autosave 反复失败无退避,30s 弹一次 | B-M5 |
| Dialog `titleId`/`messageId` 常量 → StrictMode aria-labelledby 重复 | B-L28 |
| dirty marker 无 `aria-live` | B-L34 |

### 5.6 TypeScript 类型安全（6 条）

| 主题 | finding |
|---|---|
| `Scene` 纹理用 `Math.random()` → 不可重现 | D-4 |
| `SEED_RE` `as Algorithm`/`as MazeSize` 不用 named groups | D-8 |
| `window as unknown as { __game }` 逃生口 | D-9 |
| `cells.push(v as CellType)` 信任跳,spread leak 额外字段 | D-15 |
| event target 多处 `as Foo` 无 guard | D-16 |
| `LevelMetadataForm` `[level.id]` ESLint disable 隐藏 stale-state | A-M3 |

### 5.7 测试质量（10 条）

| 主题 | finding |
|---|---|
| playwright 无 HTML reporter,fail triage 难 | C-M1 |
| `waitForTimeout(1600)` magic number | C-M2 |
| `EditorStatusBar` fake timer 无 `useRealTimers` 配对 | C-M3 |
| debounce `<2s` no-write path 无测试 | C-M4 |
| `lastError` 3s 测试用 magic 3050ms 不导出常量 | C-M5 |
| `confirmSpy` never restored (P2-7 后 dead) | C-M6 |
| `console.warn` spy never restored | C-M7 |
| `enemySpawner` exclusion bounds hard-coded 5×5 | C-M8 |
| `setFov` 测构造真实 `THREE.PerspectiveCamera` | C-M9 |
| `placeWall` OOB 无 test (pin 缺失) | C-M10 |

### 5.8 数据契约 / JSON 边界（5 条）

| 主题 | finding |
|---|---|
| `import.meta.glob` `!` non-null assertion | D-19 |
| 公开 `levels/*.json` 无 schema 验证测试 | D-20 |
| `readJsonFile` 无 size 限制(可卡死 tab) | D-25 |
| exported JSON 无 `schemaVersion` | D-27 |
| `sanitizeFilename` 只用于文件名,未净化 name 进 JSON | D-22(LOW) |

### 5.9 错误处理 / 边界（4 条）

| 主题 | finding |
|---|---|
| `LevelLoadError` 插值大字段 → 10MB `<p>` | D-30 |
| `CanvasTexture` 隐式 disposal pairing | D-17(LOW) |
| `isUndoRedoTarget` SVG fallback `return true` 语义反 | B-M9 |
| `clamped as 30 \| 60 \| 90 \| 120` 类型不符运行 | B-M24 |

### 5.10 其他（1 条）

| 主题 | finding |
|---|---|
| `walls: CellType[][]` 嵌套数组,非 flat | A-M1 |
| `useAutoSave` 30s + `EditorPage` 2s draft 职责混淆 | B-M18 |
| `EditorToolbar` `onSaveAndExit?.() ?? onExit?.()` 语义模糊 | B-M14 |
| `subscribe` 内调 DOM API (`exitPointerLock`) | B-M6 |
| `useAutoSave` / `saveLevel` 是否写 localStorage 不明 | B-M18(衍生) |
| `Settings` 4 sliders drag 整体 re-render | B-M17 |
| `Crosshair` / `InventoryBar` / `Timer` 无 memo | B-L5/13/40/27 |
| `Button` `hoverLift` deprecated 残留 | B-L6 |
| `inventory length` 缩短时 `flash.slot` 越界(本项目无路径) | B-L40 |
| `playwright.config.ts` reporter / workers 慢路径 | C-M1 |
| `subscribers 全体 re-render` 单 action selector | B-M17 |
| `onAutoSaveError` 30s tick 反复 fire | B-M5 |
| `Minimap.useTickRef` setInterval 残 race | B-M10 |
| `enemySpawner` `injectEnemySpawns` 总是 append | A-L1 |
| `id.ts` `Math.random` fallback 2^20 后冲突 | A-L2 |
| `seed.ts` encode/decode round-trip 无 test | A-L3 |
| `importExport.ts` Blob URL 永不 revoke | A-L4 |

(注: 部分条目下沉到 §6 LOW)

---

## 6. LOW（65 条）

按 6 个主题分组。

### 6.1 死代码 / 残留 / 已修未清（6 条）

`hoverLift` deprecated (B-L6) · `Button.aria-pressed` 缺失但不强 (B-L25) · `confirmSpy` 测 P2-7 后 dead (C-M6) · `validateSelection` 内 `randomHexSeed()` 每次 render (B-L37) · `LAST_SEED_KEY` 同步读 (D-31) · `MainMenu.sceneLayerStyle` 每次新 object (B-L8) · `viewBox` 字符串拼 (B-L11) · `wallCount` O(n²) (B-L14) · `Array.from({ length: max })` (B-M15) · `InventoryBar` flash 边界 (B-L26) · `EditorPropertiesPanel` let + if/else (B-L26) · `pickup.value` re-sync (B-L17) · `KeyD` held 没 release (C-M2 衍生) · `onNext` optional (B-L19) · `page.once('dialog')` 注释残留 (P2-7 review) · `dirty` rising-edge OK (B-M16) · `prevDirtyRef` StrictMode (B-M25) · `WinOverlay.onNext` optional (B-L19) · `PointerSensitivity` slider drag (B-L7) · `cursor 'grab'/'grabbing'` (B-L32) · `aria-live` on dirty (B-L34) · `color contrast` dark mode (B-L20) · `InventoryBar/Timer/Crosshair` 无 memo (B-L5/13/27) · `Minimap` `viewBox` 重建 (B-L11) · `Timer` 无 memo (B-L13) · `InventoryBar` flash 边界 (B-L40) · `sceneLayerStyle` (B-L8) · `pickup.value` (B-L17) · `useState<Status>` 初始 OK (B-L18) · `settings 单 action` (B-M17) · `MainMenu` StrictMode 双 mount (B-M3) · `EditorStatusBar` validateDesign O(n²) (B-L14) · `PauseOverlay` 嵌套 Settings (B-L16) · `DevTools __game` 跨 tab (B-M13) · `EditorToolbar` import 走 useAutoSave (B-M18) · `crosshair` 无 memo (B-L5) · `Button.tsx` 缺 aria-busy (B-L25) · `Minimap` module-level const OK (B-L10) · `PAGE_STYLE` OK (B-L9) · `input type="file"` aria-label (B-L21) · `deleteCustom` capture (B-L2) · `lastSeed` 同步读 (D-31) · `surviveSecondsError` 强耦合 (B-L29) · `Object.values(customLevels).map().sort()` 每次 render (B-M2 / B-L12) · `try/catch` 空 catch (B-L1) · `role="toolbar"` 无 aria-controls (B-L3) · `import.meta.env.DEV` 检查 OK (B-L15) · `SVG fallback` 反义 (B-L4) · `Dialog portal` OK (B-L38) · `Minimap` setTick 仅在 player pos 存在 (B-L36) · `onNext optional` (B-L19) · `__game` leak (B-M13) · `sublevelId` 切换 (B-L35 = M-7) · `flash.slot` 越界 (B-L40)

### 6.2 a11y 弱（3 条）

dirty marker `aria-live` (B-L34) · color contrast dark mode (B-L20) · Dialog `titleId` 常量 (B-L28)

### 6.3 性能微优化（10+ 条）

`buildLookups` 每 render 重建 Map (B-L30) · `validateDesign` O(n²) (B-L14) · `viewBox` 字符串拼 (B-L11) · `Array.from({ length: max })` (B-M15) · `StaticMaze` memo 失效 (B-M11) · `HealthBar` 重建 (B-M15) · `Timer/Crosshair/InventoryBar` 无 memo (B-L5/13/27) · `Settings` 4 sliders re-render (B-M17) · `editorHistory` `structuredClone` 每步 (A-HIGH-3 衍生) · `useTickRef` 10Hz (A-M6 / D-11) · `Minimap` memo (B-M11) · `screen` 双重订阅 (B-M20) · `page.once('dialog')` 残 (P2-7 review) · `import.meta.glob` 每次 list() 重算 (A-HIGH-4) · `BLOB URL` 永不 revoke (A-L4) · `EditorStatusBar` 50ms (B-L14) · `Minimap` 10Hz polling (A-M6) · `subscribers 全体 re-render` (B-M17)

### 6.4 命名 / 风格 / 微小（15+ 条）

PAGE_STYLE 模块顶层 OK (B-L9) · `crosshair` inline style (B-L5) · `cursor` 'grab'/'grabbing' (B-L32) · `EditorPropertiesPanel` let + if/else (B-L26) · `Minimap` module-level const (B-L10) · `import.meta.env.DEV` OK (B-L15) · `EditorToolbar` useState<Status> OK (B-L18) · `PauseOverlay` 嵌套 Settings (B-L16) · `PointerSensitivity` 覆盖 (B-L7) · `EditorToolbar` import 走 useAutoSave (B-M18) · `InventoryBar` flash 边界 (B-L40) · `WinOverlay.onNext` optional (B-L19) · `GameOverOverlay` color contrast dark mode (B-L20) · `input type="file"` aria-label (B-L21) · `sublevelId` 切换 (B-L35 = M-7) · `try/catch` 空 catch (B-L1) · `role="toolbar"` 无 aria-controls (B-L3) · `surviveSecondsError` (B-L29) · `EditorPropertiesPanel` let + if/else (B-L26) · `Minimap` 10Hz polling OK (B-L36) · `pickup.value` re-sync (B-L17) · `cursor 'grab'` mousedown (B-L32) · `Settings` 4 sliders (B-M17) · `Button.aria-busy` (B-L25) · `EditorPropertiesPanel` let + if/else (B-L26) · `Array.from({ length: max })` (B-M15) · `validateSelection` `randomHexSeed()` (B-L37) · `settingsStore` setter drag (A-M7 / B-L7) · `seed.ts` encode/decode round-trip (A-L3)

### 6.5 测试细节（3 条）

`Enemy.test.ts` 间接 OK · `useAutoSave` 9 tests · `useTickRef` polling test 缺 (A-M6 衍生) · `useAutoSave` StrictMode unmount test 缺 (A-M8 / HIGH-1 衍生) · `useTickRef` StrictMode leak test 缺 (D-11 衍生) · `placeWall` OOB 缺 (C-M10) · `placePickup` OOB 已覆盖 (pin 对比) · `editorStore.undo/redo` 引用 alias 缺测 (A-M5 衍生) · `Math.random` 备选 seed 行为缺测 (D-3 衍生) · `seed.ts` round-trip property-based 缺 (A-L3)

### 6.6 其他（剩 5-6 条）

`editorStore` 200+ 行拆分候选 (D cross-ref §A) · `Pickup` spread leak (D-15 衍生) · `path` spread leak (D-15 衍生) · `levelHash` 不匹配 on-disk (D-29) · `safeSetItem` wrapper (D-26) · `CanvasTexture` disposal pair (D-17)

---

## 7. 跨代理重复 / 主题聚类

| 主题 | §A | §B | §C | §D |
|---|---|---|---|---|
| localStorage 边界 | A-HIGH-3, A-M5, A-M7 | B-M18 | — | D-5, D-10, D-18, D-21, D-23, D-26, D-29, D-31 |
| StrictMode 边界 | A-M8, A-HIGH-1 | B-M3, B-M4, B-M16, B-M25 | — | D-11 |
| Math.random / 可重现性 | A-L2 | — | — | D-3, D-4 |
| 类型断言 `as` | A-M5 | B-M24 | — | D-2, D-6, D-7, D-8, D-9, D-15, D-16 |
| 性能回退(每 render/帧) | A-M1, A-M6 | B-M2, B-M11, B-M12, B-M15, B-M20, B-M21, B-L14, B-L30 | — | — |
| useConfirm / Dialog | — | B-M1, B-M6, B-M19, B-M22, B-M23, B-L22, B-L23, B-L28 | — | — |
| a11y | — | B-M7, B-L20, B-L28, B-L34 | — | — |
| 测试 e2e 可靠性 | — | — | C-H1, C-H2, C-H3, C-L5 | — |
| 数据契约 / JSON | — | — | C-M10, C-M11 | D-19, D-20, D-22, D-25, D-27, D-30 |

**关键洞见**:
- **localStorage 边界** 是 4 代理共识: A-HIGH-3 / D-5 / D-10 / D-18 / D-23 / D-26 / D-29 同指一个根因(写不 debounce + 读不 guard + 错不 surface + version 无 migration + 体积无界 + 安全错无包装 + normalize 后未 re-save)。建议一次增量统一处理。
- **类型安全 `as` cast** 集中度高: D-6 / D-7 / D-8 / D-15 同源(JsonMazeProvider 验证函数窄化失败),一次重构消 5+ 个 finding。
- **StrictMode 边界** 是 P2-7 `useConfirm` 引入的副作用,4 条 finding 共享一个 pattern(render / effect cleanup / async 闭包 顺序),一次 SOP 文档化可批量防。

---

## 8. 与 2026-06-11 baseline 差异

| 维度 | 2026-06-11 | 2026-06-13 | 变化 |
|---|---|---|---|
| CRITICAL | 2 | 0 | ↓ 已修 |
| HIGH | 6 | 13 | ↑ 净增 7 |
| MEDIUM | 8 | 60 | ↑↑ +52(主要源自 P2-6/P2-7 新代码 + 严格度提升) |
| LOW | 18 | 65 | ↑↑ +47 |
| 总计 | 35 | 138 | +103 |

**HIGH 净增 7 条分类**:
- localStorage 边界 3 条(A-HIGH-3 升 HIGH, D-5 新, D-23 新)
- e2e stale skip 3 条(C-H1, C-H3 + C-H2 升 HIGH)
- 类型安全 2 条(D-6, D-7)
- useAutoSave 边界 1 条(A-HIGH-1)
- MazeProvider 接口 1 条(A-HIGH-4)
- 减去原 6 条 HIGH 中 5 条已修(F-H1 race, F-H2 alloc, F-H3 debounce, F-N2 dead import, F-N3 deps, F-N4 dirty check)

**关键差异**:
- 2026-06-11 偏重"跑起来",2026-06-13 偏重"边界"和"长期可维护性"
- 2026-06-11 主线 = 性能 alloc / race;2026-06-13 主线 = 数据契约 / 类型安全 / e2e 可靠性
- 2026-06-11 偶发 bug 较多;2026-06-13 偶发较少,但"未修的小坑"放大 4 倍(LOW 65 vs 18)

---

## 9. 推荐修复优先级

按 ROI 排序。

### P0 — 立即修(用户数据/可立即感知) — 5 条

1. **A-HIGH-1** useAutoSave unmount race → unmount 时 `mountedRef.current = false` + gate `if (!mountedRef.current) return;`
2. **A-HIGH-3 + D-5 + D-23** localStorage 整链路修(per-record try/catch + MAX_DRAFT_BYTES + surface `storageFull` + `safeSetItem` 包装器 + undo 50 步 cap)
3. **C-H1 + C-H3** 删 stale `test.skip`(新 specs 已覆盖);或 `test.fixme` + issue link
4. **C-H2 + C-L5** save-and-exit race + delete-confirm seed 清 `editorDraft` + 强 `level-source-select` 等待
5. **D-1** `level.name` clamp 64 + collapse newlines + hint

### P1 — 1-2 周内修(类型/接口安全,避免连锁) — 5 条

6. **A-HIGH-2** editorStore ↔ levelStore 双向耦合 → 选 levelStore 为 SoT,editorStore.saveLevel 返回 `MazeData`
7. **A-HIGH-4** MazeProvider 接口名存实亡 + teaching-level glob hoist
8. **D-2 / D-6 / D-7 / D-15 / D-16** 类型安全三件套: 统一 `isX` type-guard + `requireNumber` 改 narrow return + `validateMaze` 用 typed object literal 替代 spread
9. **D-3** `Math.random()` 备选 seed → xorshift fold 或 tooltip 注明
10. **D-27** exported JSON 加 `schemaVersion`,`importExport.parseImport` refuse 更高 version

### P2 — 1 月内修(数据契约 / e2e 可靠 / 性能回退) — 15 条

11. **B-M7** `sublevelId` 切换 source 保留各自选择(`useRef<Record<LevelSource, string | null>>`)
12. **B-M5** autosave 反复失败指数退避(30s → 60s → 120s → 300s cap)
13. **B-M4** `setShowDraftPrompt(false)` 进 cancelled 守卫
14. **D-25** `readJsonFile` `MAX_IMPORT_BYTES` 1MB 拒绝
15. **D-20** `tests/levels.test.ts` 跑 `validateMaze` 在 4 个公开 level 上
16. **D-19** `import.meta.glob` `!` 改为 `?? ''` + cross-check path-derived id === m.id
17. **D-21** versioned key migration path(v1 → v2 一次迁移)
18. **D-30** `LevelLoadError` `${v}` 截断 80 chars
19. **A-M8** StrictMode 监听器泄漏 test
20. **A-M6 / D-11** `Minimap` 10Hz polling 加 early-out / pending in-flight guard
21. **A-M7** `persist.ts:writeJson` 250ms debounce + idle callback
22. **D-10** `loadFromStorage` 丢记录时 surface toast
23. **C-M1** playwright 加 `reporter: [['html', {open:'never'}], ['list']]`
24. **C-M2** `waitForTimeout(1600)` → poll `通关` text
25. **C-M4 / C-M5** 拆分 1999ms/1ms 测试 + 导出 `LAST_ERROR_DISPLAY_MS` 常量

### P3 — 1 季度内清理(性能微优化 / a11y / mock 卫生) — 25 条

26. **B-M12** HUD 7 子组件 `memo`
27. **B-M2** `customDefs` `useMemo([customLevels])`
28. **B-L14** `validateDesign` `useMemo([level])`
29. **B-L30** `buildLookups` `useMemo([level])`
30. **B-M11** `StaticMaze` 投影 primitive props
31. **B-M21** LevelMetadataForm/PickupForm/EnemyForm/WallForm `memo`
32. **B-M15** HealthBar `Array.from` `useMemo`
33. **B-L20** color contrast dark mode verify
34. **B-L28** Dialog `titleId` `useId()`
35. **B-L34** dirty marker `aria-live="polite"`
36. **B-M16/B-M25** StrictMode 双 mount rising-edge 注释化
37. **B-M6** `exitPointerLock` 移 `useEffect`
38. **B-M13** `delete window.__game` in cleanup
39. **B-M9** `isUndoRedoTarget` SVG fallback `return false`
40. **B-M24** `surviveSeconds` 类型改 `number`
41. **A-M1** `walls: CellType[][]` 改 `Uint8Array`(规模收益小,可延后)
42. **A-M3** `LevelMetadataForm` discard local edits 入口
43. **A-M5** `editorStore` mutating actions 引用检查 + Immer 候选
44. **B-L37** `randomHexSeed` `useState` only on `levelSource` change
45. **C-M3 / C-M7** fake timer + console.warn spy restore
46. **C-M6** 删 dead `confirmSpy` test
47. **C-M8** `enemySpawner` 边界 derive from fixture
48. **C-M9** `setFov` stub camera
49. **C-M10** `placeWall` OOB test
50. **B-M18** `saveLevel` 是否写 localStorage 文档化(若不写,EditorToolbar `handleSave` 显式)

---

## 10. 验收清单

修完 P0+P1+P2 后,以下命令应全绿:

```bash
# 1. 类型检查
npm run typecheck

# 2. 单元 + 组件测试
npm test

# 3. E2E
npx playwright test

# 4. 全量 grep gate(0 命中)
grep -rn "as unknown as" src/ | wc -l   # 应只剩 META 注释
grep -rn "Math.random" src/ | wc -l      # 应只在 utils/id.ts 备选 + utils/seed.ts (备选分支注释) + 测试 fixture
grep -rn "as any" src/ | wc -l           # 0
grep -rn "as Foo)" src/ | wc -l          # 显著减少(原 20+ → 期望 ≤ 5)

# 5. 构建
npm run build

# 6. 评审文件结构
find docs/reviews -name "*.md" -type f | xargs ls -la

# 7. P0 fix 必做
grep -n "mountedRef.current = false" src/hooks/useAutoSave.ts
grep -n "MAX_DRAFT_BYTES" src/store/editorStore.ts
grep -n "level-source-select" tests/e2e/editor.spec.ts  # C-H2 等待
grep -n ".slice(0, 64)" src/ui/editor/EditorToolbar.tsx  # D-1

# 8. P1 fix 必做
grep -n "isPickupType" src/ui/editor/EditorPropertiesPanel.tsx
grep -n "schemaVersion" public/levels/*.json
grep -n "import.meta.glob" src/maze/JsonMazeProvider.ts  # 移 module 顶层

# 9. P2 fix 必做
grep -n "MAX_IMPORT_BYTES" src/maze/importExport.ts
grep -n "tests/levels.test.ts" tests/
```

---

## 11. 评审覆盖范围

### 文件清单(绝对路径)

**§A 架构**:`src/main.tsx` · `src/App.tsx` · `src/maze/{types,JsonMazeProvider,EditorMazeProvider,AlgorithmMazeProvider,importExport,reachability,enemySpawner}.ts` · `src/maze/generators/*` · `src/store/{gameStore,levelStore,editorStore,editorHistory,settingsStore,persist}.ts` · `src/engine/{Game,Renderer,Camera,Scene,Collision,InputManager,Loop}.ts` · `src/entities/{Player,Enemy,Pickup}.ts` · `src/game/Rules.ts` · `src/hooks/useAutoSave.ts` · `src/utils/{errors,id,seed,time}.ts` · cross-cutting `src/ui/{GameCanvas,LevelSelect,EditorPage,EditorToolbar,EditorPropertiesPanel,EditorStatusBar,EditorViewport,useConfirm,components/Dialog,components/Minimap}.tsx`

**§B UI**:`src/ui/**`(全) + `src/App.tsx`(UI 拼装相关) + `src/hooks/useAutoSave.ts`(P2-7 消费方)

**§C 测试**:`tests/unit/**` · `tests/component/**` · `tests/e2e/**` · `playwright.config.ts` · `vitest.config.ts`

**§D 质量**:`src/**`(安全/类型/性能) + `public/levels/*.json`(数据契约)

### 排除范围(已确认无需复审)

- 已 ✅ 标记的 2026-06-11 baseline 35 条 finding
- `node_modules/` · `dist/` · `.git/`
- 自动生成(Three.js 类型声明、Vite 配置)无业务逻辑处
- P2-7 review 已覆盖的增量(8 task 落定 + 673/673 vitest + 25/25 playwright)

---

## 12. 结论

**maze3D 项目整体健康**: 无 CRITICAL,无 P0 紧急 race-condition,主流程(选关 → 进入 → 通关 → 编辑 → 自定义关)实测稳定。

**P0+P1 (10 条 HIGH) 全部修完前,不要发布**。HIGH 集中在 4 个根因(各代理独立命中):
- **localStorage 整链路**(`A-HIGH-3` + `D-5` + `D-23` + `D-26` + `D-10` + `D-18` + `D-21` + `D-29` + `D-31`)
- **useAutoSave 边界**(`A-HIGH-1`)
- **类型安全逃生口**(`D-2` + `D-6` + `D-7` + `D-8` + `D-15` + `D-16`)
- **e2e stale skip + race**(`C-H1` + `C-H2` + `C-H3` + `C-L5`)

**P2 (15 条 MEDIUM 中高 ROI) 1 月内**: 重点是 P2-6/P2-7 引入的 useConfirm/Dialog/LevelSelect/Editor 边界,用户可感知但非阻塞。

**P3 (25 条 LOW 性能/a11y/卫生) 季度清理**: 性能微优化 + mock 卫生 + a11y 弱项,可分批做。

**特别建议**: 4 个 HIGH 根因(§7 表) 各开一个增量(P0-1: localStorage 边界 / P0-2: useAutoSave race / P0-3: 类型安全三件套 / P0-4: e2e 可靠性),每个增量 ≤ 1 周,可一次 4 并行。

---

**评审日期**: 2026-06-13
**下次评审建议**: P0+P1 修完后(预计 +1 周)做一次回归评审,验证本次 finding 关闭率;之后每 2 月一次常规评审。
