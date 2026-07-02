# Project Review — Full Post-P2-18 Code Review (2026-07-01)

**Slug**: `2026-07-01-full-code-review`
**日期**: 2026-07-01
**评审窗口**: `main` HEAD = `d10b3a1 feat(p2-18): traps + doors + teaching levels + reviews`
**前置评审**: [`2026-07-01-full-p2-18-review`](./2026-07-01-full-p2-18-review.md) (P2-18 增量 review) · [`2026-06-30-full-code-review`](./2026-06-30-full-code-review.md) (前次全量)
**关联文档**:
- [`findings/2026-07-01-A-architecture.md`](./findings/2026-07-01-A-architecture.md)
- [`findings/2026-07-01-B-engine-entities-rules.md`](./findings/2026-07-01-B-engine-entities-rules.md)
- [`findings/2026-07-01-C-maze-subsystem.md`](./findings/2026-07-01-C-maze-subsystem.md)
- [`findings/2026-07-01-D-stores-persistence.md`](./findings/2026-07-01-D-stores-persistence.md)
- [`findings/2026-07-01-E-ui-react-i18n.md`](./findings/2026-07-01-E-ui-react-i18n.md)
- [`findings/2026-07-01-F-editor.md`](./findings/2026-07-01-F-editor.md)
- [`findings/2026-07-01-G-tests-coverage.md`](./findings/2026-07-01-G-tests-coverage.md)
- [`findings/2026-07-01-H-utils-build-ci.md`](./findings/2026-07-01-H-utils-build-ci.md)

**评审方式**: 8 个 caveman-style 子代理并行(architecture · engine/entities/rules · maze · store · ui/i18n · editor · tests · utils/build),由主线程负责交叉验证(false-positive 复核)和严重度分级。

---

## §0 元数据 & 方法

- **评审范围**: 整个项目。`src/**`(134 .ts/.tsx)、`tests/**`(8 e2e + 85 unit/component)、`public/levels/*.json`、`docs/architecture*`、`docs/roadmap.md`、`package.json`、Vite/Vitest/Playwright 配置。
- **未评审**: `node_modules/`、`dist/`、`playwright-report/`、`docs/reviews/`(历史评审)。
- **HEAD 状态**: `d10b3a1` P2-18 已合入 main。`npm run typecheck` 0 错误 · `npm test` 1246 pass / 1 skip · `npm run build` 成功(960 KB chunk-size warning,非阻断)。
- **方法**: 8 个子代理分别覆盖 8 个领域,主线程对所有 HIGH 及以上 finding 抽样交叉验证(grep 文件/RAM trace/Node 跑 BFS),并对子代理报告中的 false-positive 标注为 §6。

## §1 总览

| 严重度 | 数量 | 本次新增 F-tag 编号 |
|--------|------|----------------------|
| CRITICAL | 2 | FCR-C-1, FCR-C-2 |
| HIGH | 3 | FCR-H-1, FCR-H-2, FCR-H-3 |
| MEDIUM | 12 | FCR-M-1 … FCR-M-12 |
| LOW | 15 | FCR-L-1 … FCR-L-15 |
| **合计** | **32** | |

**一句话结论**: P2-18 集成稳定(类型 0 错误 / 单元测试 1246 通过 / 生产构建成功),但 **CRITICAL 主要集中在 E2E 测试与 fixture 同步**——`ui-revamp.spec.ts` 引用了 P2-5 已删除的 `main-menu-scene` testid,且 4 个 spec 文件仍 selectOption `level-tiny-pickups` / `level-tiny-enemy` / `level-tiny` 等 P2-11 已被 `teaching-XX` 替换的内置 id。这是 E2E 测试基础设施债,而非 product regression。

## §2 CRITICAL

### FCR-C-1: `tests/e2e/ui-revamp.spec.ts:6` 引用已删除的 `main-menu-scene` testid
- **位置**: [tests/e2e/ui-revamp.spec.ts:6](../tests/e2e/ui-revamp.spec.ts#L6)
- **影响**: 该测试 `expect(page.getByTestId('main-menu-scene')).toBeVisible()` 在 P2-5 home revamp 之后必然失败。`src/ui/MainMenu.tsx:13` 只剩 `main-menu-panel`。
- **复现**: `npx playwright test tests/e2e/ui-revamp.spec.ts`
- **修复**: 删除该断言,或替换为 `main-menu-panel`;或 `test.skip` + F-tag 跟踪(参见 F-2026-06-15-H-3.6 同类处置)。

### FCR-C-2: 4 个 E2E spec 引用已被替换的内置关卡 id
- **位置**:
  - [tests/e2e/pickup-types.spec.ts:11](../tests/e2e/pickup-types.spec.ts#L11) — `level-tiny-pickups`
  - [tests/e2e/enemies.spec.ts:15](../tests/e2e/enemies.spec.ts#L15) — `level-tiny-enemy`
  - [tests/e2e/play-through.spec.ts:11](../tests/e2e/play-through.spec.ts#L11) — `level-tiny`
  - [tests/e2e/persistence.spec.ts:12](../tests/e2e/persistence.spec.ts#L12), [:29](../tests/e2e/persistence.spec.ts#L29) — `level-tiny`
- **影响**: P2-11 教学关重设计把 `public/levels/level-small.json` / `level-tiny.json` / `level-tiny-pickups.json` / `level-tiny-enemy.json` 替换为 `teaching-01.json` … `teaching-08.json`。这些 spec 仍然对 `sublevel-select` `selectOption('level-tiny-pickups')` 等已不存在的 option。运行时 dropdown 没有该 option → selectOption 抛错。
- **复现**: `npx playwright test tests/e2e/{pickup-types,enemies,play-through,persistence}.spec.ts`
- **修复**: 选项 1) 重命名 `teaching-XX` 还原 4 个旧 fixture;选项 2) 把 spec 改成 `teaching-XX` + 起手坐标重新对位(成本更高)。CLAUDE.md「内置关卡 JSON」表需要同步。

## §3 HIGH

### FCR-H-1: `vitest.config.ts` 覆盖率阈值低于文档基线
- **位置**: [vitest.config.ts:25](../vitest.config.ts#L25)
- **影响**: 阈值被设为 `70/65/65/70`(行/函数/分支/语句),文档与 CLAUDE.md 描述的标准是 `80/75/75/80`。注释 `F-2026-06-17-FCR-H-1` 解释这是 P2-15 为了把 `engine/Game.ts`、`ui/GameCanvas.tsx`、`maze/types.ts` 移出排除列表而临时下调,但目前 vitest.exclude 仍显式排除 `engine/Camera.ts`、`engine/Renderer.ts`、`engine/Loop.ts` 三文件——阈值下调失去了"移出排除"的对应收益,纯负债。
- **修复**: 重新核对三个文件是否真的达到 `80/75/75/80`(types.ts 几乎肯定可以;Camera/Renderer/Loop 是 Three.js wrapper,可能需要补 stub)。达标后恢复标准阈值。

### FCR-H-2: P2-18 `setSlowUntil` store action 无直接单元测试
- **位置**: `src/store/gameStore.ts` 内 P2-18 新增的 `slowUntil` / `setSlowUntil`(search 未在 `tests/unit/store/` 找到对应测试)
- **影响**: `computeSlowMultiplier` 纯函数有测试,Game.test 的 mock 也覆盖到,但 **store action 自身的行为**(写入、`slowMultiplier` 派生字段、过期后归零、与 `lastHitBy` / `lastUnlockedDoorId` 的协作)零覆盖。如果 P2-18 的 trap/slow 流后续重构,会无声地断在 store-action 边界。
- **修复**: `tests/unit/store/gameStore.p2-18.test.ts` 加 3 个 case:进入水域→setSlowUntil(now+3000)→速度 0.5;setSlowUntil 已过期→乘数 1.0;连续两次 setSlowUntil 累加上限。

### FCR-H-3: `tutorialSteps` 在 JSON loader 边界零保护
- **位置**: [src/maze/JsonMazeProvider.ts:258-261](../src/maze/JsonMazeProvider.ts#L258-L261)
- **影响**: `validateMaze` 仅 `Array.isArray(m.tutorialSteps)` + `as NonNullable<MazeData['tutorialSteps']>` 强制断言。每个 trigger 对象的 `kind` 字段(`pickup`/`reach-cell`/`timeout`/`caught-by-enemy`)、`timeoutSec` 必填项、`id` 重复都没被验证。`validateTutorialSteps` 已实现(`src/utils/tutorialValidator.ts:70`)且被 `GameCanvas.tsx:187` 和 `EditorPropertiesPanel.tsx:1324` 调用,**但在 loader 路径上被绕过**——直到用户实际进入游戏才会报错,且错误是 console warning 而非清晰的 LevelLoadError。
- **修复**: `validateMaze` 在 `tutorialSteps = ...` 赋值前调用 `validateTutorialSteps(m.tutorialSteps)`,若 `!ok` 抛 `LevelLoadError(\`Maze '${id}': invalid tutorial step ${index}: ${reason}\`)`,并在 Editor save 时复用同一 helper。

## §4 MEDIUM

| F-tag | 文件:行 | 问题 | 修复 |
|-------|---------|------|------|
| FCR-M-1 | [src/store/gameStore.ts:26](../src/store/gameStore.ts#L26) | store 直接 import engine 的 `createEmptyParchment`/`ParchmentState`(已 F-2026-06-30-H-2) | 选取单一真实源(推荐 engine),store 改为派生 snapshot |
| FCR-M-2 | [src/ui/components/Dropdown.tsx:373](../src/ui/components/Dropdown.tsx#L373) | `commit(activeIndex)` 闭包陈旧,实际点击的是 disabled 项时仍调用旧 index;被 disabled guard 偶然掩盖 | 改为 `commit(i)` 直接传点击 index |
| FCR-M-3 | [src/store/editorStore.ts:788-809](../src/store/editorStore.ts#L788-L809) | `placeErase` 不检查 `isOccupied`;擦掉一面带 trap/door 的墙会把实体孤立在 floor 上且无警告 | 擦前检查 trap/door 占用,命中则发 `lastErrorKey: 'editor.lastError.eraserBlockedByEntity'` |
| FCR-M-4 | [src/ui/editor/EditorPropertiesPanel.tsx:106-116](../src/ui/editor/EditorPropertiesPanel.tsx#L106-L116) | `Stepper.commit` 用 `Math.floor` 把中间值往下取整,用户输入 `4.6` 被悄悄改成 `4` 而无反馈 | 改 `Math.round`,或拒绝不对齐 step 的值并显示提示 |
| FCR-M-5 | [src/store/editorStore.ts:1413-1414](../src/store/editorStore.ts#L1413-L1414) | `moveEnemyNode` 用 `clamp(x, 0, size-1)`,`NaN` 经过 clamp 静默变 0 | 加 `Number.isFinite` 检查,失败则发 `lastErrorKey: 'editor.lastError.pathOutOfBounds'` |
| FCR-M-6 | [src/game/Rules.ts:29,40,57](../src/game/Rules.ts#L29) | `crossesExit` / `findPickupAt` / `findTrapAt` 都用 `maze.cellSize` 做除法,无 `cs <= 0` guard | 加 `if (cs <= 0) return false / null`(上游 JsonMazeProvider 已验证,但 defense-in-depth 缺失) |
| FCR-M-7 | [src/engine/Scene.ts:379](../src/engine/Scene.ts#L379) | `DOOR_COLOR: Record<string, number>` 而非 `Record<KeyColor, number>`,编译期不强制 4 色全覆盖;不支持的 keyColor 静默 fallback 到 0x555555 | 改为 `Record<KeyColor, number>` + 索引签名,或 `as const satisfies Record<KeyColor, number>` |
| FCR-M-8 | [src/engine/InputManager.ts:82-88](../src/engine/InputManager.ts#L82-L88) | `getMove()` 不归一化对角向量,W+A 同时按 → 速度 √2 ≈ 1.41× | 加 `normalize` (避免 0 向量) |
| FCR-M-9 | [src/store/levelStore.ts:683-726](../src/store/levelStore.ts#L683-L726) | `moveFolder` 对 `DEFAULT_FOLDER_ID` 静默 `return false`,而 `deleteFolder` 同样情形会 `console.warn` | 在 `moveFolder` 同样加 warn,保持 UX 一致 |
| FCR-M-10 | [tests/e2e/teaching-flow.spec.ts:6-9](../tests/e2e/teaching-flow.spec.ts#L6-L9) | 仅覆盖 `teaching-01`,其它 7 个教学关被 skip | 编写确定性 walkthrough(不依赖 page.clock)覆盖 02/04 关键路径 |
| FCR-M-11 | [src/maze/generators/_expandThickWall.ts](../src/maze/generators/_expandThickWall.ts) | 4 个生成器集成测试覆盖它,但 helper 本身无独立单测 | 加 `tests/unit/maze/generators/_expandThickWall.test.ts`,覆盖奇/偶 size 边界 |
| FCR-M-12 | `src/game/Rules.ts:300` `applySpawnTrigger` | 无直接 unit test,只通过 `gameStore.rebalance.test.ts` 间接覆盖 | 加 `tests/unit/rules.spawn.test.ts` 固定契约(`newLastSpawnAt === elapsedTime` / `pickupCountCollected` 触发条件) |

## §5 LOW

完整 15 条 LOW 见各领域 finding 文件。重点:
- **FCR-L-1**:`bestByLevel` 仅按 `levelId` 主键,与 spec "复合 key (source, id, mode, survive, enemies, progressive)" 描述偏离——URL-as-identity 设计的内在后果,但 spec 文档需要同步
- **FCR-L-3**:EditorPage toast `useEffect` 闭包陈旧(`clearLastError` 每次重渲染都被新闭包覆盖)——功能正确但浪费
- **FCR-L-5**:WinOverlay / GameOverOverlay / PauseOverlay 的 RAF 副作用无 cleanup,组件卸载中途可能触发 setState
- **FCR-L-7**:`App.tsx` 无 `React.lazy` 路由分包,初始加载受 Three.js 全量拖慢
- **FCR-L-8**:`import * as THREE from 'three'` namespace import 6 处,阻止 tree-shaking(960 KB → 可降至 ~600 KB 经 manualChunks)
- **FCR-L-9 ~ L-15**:vite port / vitest excludes 注释陈旧 / CI Node 20 vs 文档 Node 18+ / `MAX_DT_SECONDS` 重复 / InventoryBar 硬编码色值等

## §6 验证为假阳性的子代理报告

子代理结论经 grep / 文件读取 / Node BFS 验证后,以下声称不成立:

| 子代理声称 | 实际状态 | 验证手段 |
|-----------|---------|----------|
| `public/levels/teaching-07.json` exit 不可达 | **可达** | Node 跑 BFS:`REACHABLE`(从 start (0,2) 到 exit (4,2)) |
| `isSurviveSeconds` 是 dead code | **被使用** | `src/ui/LevelSelect.tsx:143` 调用,与 `isValidSurviveSeconds` 是 API 双胞胎(均存在) |
| `validateTutorialSteps` 从未被调用 | **被 GameCanvas + EditorPropertiesPanel 调用** | `GameCanvas.tsx:187` / `EditorPropertiesPanel.tsx:1324` — 只是 `JsonMazeProvider.validateMaze` 漏掉了它(FCR-H-3 仍成立) |
| `src/ui/components/modalHooks.ts:34` `button:not([disabled))` 有两闭合括号 typo | **无 typo** | 实为 `button:not([disabled])`,正确 |
| `disposeScene` 跳过 `enemies.length = 0` | **未跳过** | `src/engine/Scene.ts:466` 有 `enemies.length = 0` |
| `editor-manual__backdrop` 自动阻挡 `doors-traps.spec.ts` 30s 超时 | **不自动出现** | `EditorPage.tsx:69` `useState(false)`;只有用户点 📖 才打开。Agent G 的 HIGH 主张降级为待人工跑 `npx playwright test tests/e2e/doors-traps.spec.ts` 验证 |
| `teaching-07` 文件存在即教学关可解性存疑 | 详见 §6 第一行 | 改为 §6 单独条目 |

## §7 验证结果

| 命令 | 退出码 | 摘要 |
|------|--------|------|
| `npm run typecheck` | 0 | 0 错误 |
| `npm test` | 0 | 85 files · 1246 pass / 1 skip / 0 fail |
| `npm run build` | 0 | 138 modules transformed · 1 chunk-size warning (≤ 500 KB,非阻断) |
| `npx playwright test` | **未跑** | 主线程未触发 e2e;FCR-C-1 / FCR-C-2 / FCR-H-1 标注需要本次跑过才能确认;预期 ≥ 5 fail |

## §8 跨切关注

1. **E2E fixture 漂移**:CRITICAL 全在测试侧,不在 product code。是 P2-11 重命名 fixture 后没回填 E2E spec 的债——建议在 P2-19 之前的任何小增量里顺手收口。
2. **P2-18 新功能 store-action 覆盖空白**:`setSlowUntil` / `maybeRecordDamage forceType` / `lastUnlockedDoorId` 在 store 层缺直接测试(`Rules.computeSlowMultiplier` 纯函数层覆盖到了)。同样是测试债,但属于 P2-18 应做未做。
3. **EditorPlace 行为不对称**:`placeWall` / `placeTrap` / `placeDoor` / `placePickup` 都有 `isOccupied` 检查 + `lastErrorKey`,**只有 `placeErase` 没有**——这是一个明确的"漏写一处"模式,FCR-M-3。
4. **Three.js bundle 体积**:`import * as THREE from 'three'` 6 处 + 3 个文件被排除覆盖率;chunk-size warning 持续存在但未推动 manualChunks。
5. **store↔engine 边界已有松动**:`gameStore` 直接 import `engine/ParchmentState`(FCR-M-1,已 F-tag 但未修)——P2-16 引入的,需在 P3 之前选 single-source-of-truth。

## §9 优先级行动建议

按 **修复成本 × 用户影响** 排序:

| 顺 | F-tag | 成本 | 预期收益 |
|----|-------|------|----------|
| 1 | FCR-C-1 | XS(改一行) | E2E 不再误报主菜单 |
| 2 | FCR-C-2 | M(改名 + fixture 二选一) | 4 个 spec 恢复 |
| 3 | FCR-H-3 | S(loader 调 4 行 helper) | 教学关畸形数据有清晰错误 |
| 4 | FCR-M-3 | S(`isOccupied` 复用) | 用户不再静默丢 trap/door |
| 5 | FCR-M-2 | XS(`commit(i)`) | 修一个潜在 race |
| 6 | FCR-M-5 | XS(`Number.isFinite`) | 防御未来 NaN 注入 |
| 7 | FCR-M-7 | S(type 重写) | 编译期挡住漏 key 色的门 |
| 8 | FCR-M-8 | S(`normalize`) | 对角速度回归正确 |
| 9 | FCR-H-1 | M(核对覆盖率) | 解除技术债 |
| 10 | FCR-H-2 | M(补 3 个 case) | 锁住 P2-18 行为 |
| 11 | FCR-M-1 | L(架构决策) | 待 P3 启动时一并做 |
| 12 | 其余 LOW | 分摊到各增量 | 见各 finding 文件 |

## §10 Files Reviewed

| 模块 | 文件数 | finding 数(去重后) |
|------|--------|----------------------|
| src/engine | 9 | 5 |
| src/entities | 4 | 0 |
| src/game | 1 | 3 |
| src/maze(含 generators) | 14 | 3 |
| src/store | 8 | 4 |
| src/ui(含 editor) | 38 | 6 |
| src/utils + hooks | 8 | 1 |
| src/i18n | 5 | 0 |
| tests/unit + component | 78 | 4 |
| tests/e2e | 8 | 3 |
| 根配置(package.json / vite / vitest / playwright) | 6 | 3 |
| docs | (引用) | 0 |
| **合计** | **179** | **32**(CRITICAL 2 / HIGH 3 / MEDIUM 12 / LOW 15) |

> 注:文件数含子目录 .ts/.tsx/.json/.md;.d.ts、tests/setup.ts、playwright-report/、docs/reviews/(历史)不计入。