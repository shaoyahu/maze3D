# A 域评审 — Architecture / Store / Utils / i18n (post-P2-13, 2026-06-17)

**Slug**: 2026-06-17-A-architecture-post-p2-13
**日期**: 2026-06-17
**评审窗口**: `main` HEAD = `ad94abe feat(p2-13): 编辑器文件夹系统 + 左侧栏重构 + 胜利标签键修复`
**前置评审**: [2026-06-17-A-architecture(P2-11)](./2026-06-17-A-architecture.md)(A 域 6 条 baseline)
**评审方式**: 子代理直接评审(A 域只返回 JSON,本文件由主代理汇总)

---

## §0 范围 & 方法

- **范围**:`src/store/{editorStore,levelStore}.ts` + `src/utils/*` + `src/i18n/resources/{zh,en}.ts` + `src/maze/types.ts` + `src/maze/JsonMazeProvider.ts` + 根配置(package.json / vitest.config.ts)
- **P2-13 改动清单**(本域相关):
  - `src/store/editorStore.ts` (+26) — 4 个 P2-11 setter 修复(已修)
  - `src/store/levelStore.ts` (+254) — 文件夹系统新功能
  - `src/i18n/resources/{zh,en}.ts` (+93/+92) — i18n 增量
  - `src/maze/types.ts` (+6) — folderId 字段 + VictoryType 联合
  - `src/maze/JsonMazeProvider.ts` (+6) — folderId 透传
- **边界检查**:`grep -rE "from ['\"]react|react-dom|zustand|\.\./store" src/engine/ src/entities/ src/maze/generators/ src/game/` → **0 匹配 ✓**
- **store 循环依赖**:`grep -rnE "from ['\"]\.\./store" src/store/` → **0 匹配 ✓**

---

## §1 总览

| 严重度 | 本次 | 上次(P2-11) | 备注 |
|---|---|---|---|
| CRITICAL | 0 | 2(去重) | A-CRITICAL-1/2 全部已修 |
| HIGH | 0 | 1 | A-H-1 spawnSchedule race 继承未修 |
| MEDIUM | 2 | 1 | A-1 i18n dead keys(P2-13 新增)+ A-2 moveFolder messy(新增) |
| LOW | 2 | 1 | A-3 sanitizeFoldersMap.dropped + A-4 rename 失败静默 |
| **总计** | **4** | **5** | 净减 1 |

**P2-13 关键变化**:A-CRITICAL-1(s.draft 4 setter 静默 no-op)和 A-CRITICAL-2(VictoryType 联合缺 'caught-by-enemy')**全部已修**;A-M-1(lastError 清错 8 处重复)通过 `commitLevel` helper 抽掉,稳定无回归。A 域 P2-13 引入 2 条新 MEDIUM(folder 系统的 i18n dead keys + moveFolder messy spread)+ 2 条新 LOW。

---

## §2 上轮 finding 修复状态核验

| ID | 范围 | 修复状态 | 验证 |
|---|---|---|---|
| **F-2026-06-17-A-CRITICAL-1** | `editorStore.ts` 4 个 setter s.draft | ✅ **已修** | `b7707fd` 把 4 个 setter 改用 `set(commitLevel(s, { ...s.level, ... }))` 模式;grep 确认 `s.draft` 仅出现在 line 524 历史注释 |
| **F-2026-06-17-A-CRITICAL-2** | `VictoryType` 联合缺 'caught-by-enemy' | ✅ **已修** | `maze/types.ts:10` union + VICTORY_TYPE_VALUES 同步排序,4 typecheck errors 清 |
| **F-2026-06-17-A-CRITICAL-3** | `tsc -b` 增量模式吞错 | ✅ **已修** | `54bd543` 把 `tsc -b` 改 `--force`,build 命令也加 `--force`;typecheck 当前 0 errors |
| **F-2026-06-17-A-H-1** | `spawnSchedule` round-trip 静默覆盖 | ❌ **未修(继承)** | `utils/gameUrl.ts:104-111, 182-188` 仍未打 `parsedAt` timestamp;用户 UI 操作后 5 秒内复制 URL 仍会反向覆盖 |
| **F-2026-06-17-A-M-1** | editorStore 8 个 action 末尾 `lastError: null, lastErrorKey: null` 重复 | ✅ **已修** | `b7707fd` 抽到 `commitLevel` helper(L359-369),8 处重复消除。P2-13 不加新 `commitLevel` 调用方 |
| **F-2026-06-17-A-M-2** | `migrations.ts` 迁移链 walker "chain incomplete" 信息不准 | ⚠ **未修(继承)** | P2-13 folders 走 `parseStorageKeyVersion` + `applyLevelMigrations` 沿用现有 throw 路径;未引入新坑,文案未修 |
| **F-2026-06-17-A-L-1** | i18n `v == null` 合并语义 | ⚠ **未修(继承)** | P2-13 14 placeholder-bearing keys 全部用 `{name}`/`{count}`/`{value}`/`{id}` 语法,无 null/undefined 传递;P2-13 i18n 层内部一致 |

---

## §3 本轮新 finding

### A-1(MEDIUM)| `src/i18n/resources/{zh,en}.ts:477` | P2-13 引入 dead i18n keys `editor.mylevels.*`(5 zh + 5 en)
- **影响**: P2-13 加了 `editor.mylevels.title/empty/edit/delete/deleteTitle/deleteMessage` 5 zh + 5 en keys,唯一引用 `mylevels` prefix 的文件是 `src/styles/theme.css` 的 `.editor-mylevels__*` 类名(为已废弃的 `EditorMyLevelsDrawer`)。`keysParity.test.ts` 只检查 zh↔en parity + non-empty + dotted-namespace,**不检测 orphan key**。10 个 dead strings 会在 zh/en 编辑时静默腐烂,翻译人员会误以为抽屉还在用。
- **修复**:
  1. 选项 A:删 10 keys + 删 `.editor-mylevels__*` CSS
  2. 选项 B(推荐,系统性修复):扩 `keysParity.test.ts` 加 orphan-key 检查 — `grep -rn "t('[a-z.]*')" src/**/*.tsx` 收集所有 key,断言每个 resource key 都被消费
- **F-tag**: `F-2026-06-17-A-1`

### A-2(MEDIUM)| `src/store/levelStore.ts:569` | `moveFolder` 有 self-admitted 混乱 spread
- **影响**: Lines 569-576 build a `next` map with a spread that contains BOTH `parentId: parentId`(当非 null)和 `parentId: undefined as string | undefined`(当 null)。作者自己的 inline comment `// 上面的展开有点乱,重写更清晰:parentId 字段,根 → undefined。` 承认混乱。Lines 578-581 立即用正确形式 overwrite。
- **修复**:
  ```ts
  const cur = all[folderId];
  const next = { ...all, [folderId]: { ...cur, parentId: parentId === null ? undefined : parentId } };
  ```
  删 569-577 死代码,`as string | undefined` cast 一起消失
- **F-tag**: `F-2026-06-17-A-2`

### A-3(LOW)| `src/store/levelStore.ts:332` | `sanitizeFoldersMap.dropped` 未 surface 到 LoadSummary
- **影响**: Sanitize function shape mirrors `sanitizeBestRecordMap` / `sanitizeCustomLevelsMap`(returns `{ map, dropped }`),但 folders init IIFE 仅用 `.map` 而丢弃 `.dropped` 列表。手改 / 损坏的 `maze3d.folders.v1` 数据会让用户看到 folders 静默消失,无 UI feedback。
- **修复**: 扩 `LoadSummary` 加 `foldersDroppedKeys: string[]` 路由 folders dropped list;或加注释说明 folders 故意不 surface(LOW 风险,folder corruption blast radius 较小)
- **F-tag**: `F-2026-06-17-A-3`

### A-4(LOW)| `src/ui/editor/EditorLeftPanel.tsx:132` | `handleRenameLevel` 走 `useLevelStore.getState().saveCustom` 不订阅 `lastWriteError`
- **影响**: Rename path spreads `{ ...lv, name: ... }` 整盘覆盖,经 `validateMaze` 和 `safeSetItem`,写失败时 `lastWriteError` 字段在 store 上有,但 `EditorLeftPanel` 不订阅 → rename 失败静默。其它写路径(EditorTopBar.handleSave / useAutoSave)显式调 `setStatus({ kind: 'error' })` 或 `onAutoSaveError`。
- **修复**: 订阅 `useLevelStore((s) => s.lastWriteError)` + 弹 confirmation dialog error;或在函数注释里说明 rename 失败故意不 surface
- **F-tag**: `F-2026-06-17-A-4`

---

## §4 验证为假阳性的怀疑

| 怀疑 | 排除理由 |
|---|---|
| P2-13 editorStore 4 个 setter 回归到 `s.draft` | `b7707fd` 修完,grep `s.draft` 仅在 line 524 注释 |
| VictoryType 联合缺 'caught-by-enemy' 回归 | `2296ef2` 修完,types.ts:10 union 完整 |
| 引擎 ⇄ UI 边界破坏 | `grep` 0 匹配 |
| store 循环依赖(levelStore ↔ editorStore) | 0 跨 store import,跨 store 协调走 React 层 `useLevelStore.getState()` |
| A-M-1 lastError 清错代码 8 处重复回归 | `commitLevel` helper 抽掉,P2-13 不加新 commitLevel 调用方 |
| A-M-2 migrations chain empty-message 回归 | P2-13 folders 沿用现有 throw 路径,未引入新坑 |
| A-LOW-1 i18n `v == null` 合并语义回归 | P2-13 14 placeholder keys 全部用标准语法,无 null/undefined |

---

## §5 Files Reviewed

| 文件 | finding 数 |
|---|---|
| `src/store/editorStore.ts` | 0(上轮 CRITICAL 已修) |
| `src/store/levelStore.ts` | 3 (A-1, A-2, A-3) |
| `src/i18n/resources/{zh,en}.ts` | 1 (A-1) |
| `src/ui/editor/EditorLeftPanel.tsx` | 1 (A-4) |
| `src/maze/types.ts` | 0(上轮 CRITICAL 已修) |
| `src/maze/JsonMazeProvider.ts` | 0(上轮 CRITICAL 已修) |
| `src/utils/gameUrl.ts` | 0(A-H-1 继承未修,记入主报告 §8 跨切) |
| `package.json` / `vitest.config.ts` | 0(54bd543 `--force` 修复) |
| **总计** | **4 (0/0/2/2)** |
