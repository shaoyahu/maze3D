# P2-15 — review-fixes-batch-2 — 设计文档(Spec)

**Slug**: p2-15-review-fixes-batch-2
**状态**: draft → in-review → approved → done
**日期**: 2026-06-17
**对应路线图项**: P2-15
**依赖**: P2-13(已 done, `ad94abe`)+ P2-14(已 done, `e135e32`)
**复杂度**: Medium

## 1. 概述

承接 P2-14(12/33 finding 修复),本增量收口 2026-06-17 全项目代码评审剩余 **24 条** LOW/MEDIUM finding(9 主报告 M + 12 主报告 L + 3 D 域新增),目标是把 P2-13 review 清单清零至 0(除 5 条继承到 P3 候选)。所有改动遵循"小范围 + 不重构 + 加回归 pin"原则,每个 finding 是一组最小 diff。

## 2. 目标 / 非目标

### 目标
- 关闭主报告剩余 21 条(9 M + 12 L)+ D 域新增 3 条 = **24 条 finding**
- 每个 finding 至少 1 个 `F-tag` 注释(`F-2026-06-17-X-N`)+ 单测或 component test 覆盖
- typecheck 0 errors / `npm test` 全过(>=993 pass,目标无回归)/ 引擎 ⇄ UI 隔离边界 0 匹配

### 非目标
- D 域继承 5 条(D-H-1/2/3 + D-L-1/2/5)→ **推迟到 P3 候选**(schemaVersion 迁移 / 出口位置策略 / SCHEMA_VERSION 双源 / 注释清理 / layering inversion — 都需独立设计,不在本增量范围)
- A 域继承 3 条(A-H-1 spawnSchedule / A-M-2 migrations chain / A-L-1 i18n v==null)→ **推迟到 P3 候选**(均非 ship-blocker)
- e2e skip 8 处根因修复(`page.clock + rAF` + `carveLShape`)→ 仍是 known test debt,需要独立增量(P3+ 范围)
- Dropdown 组件 a11y 完整测试套件 → L-7/L-8/L-12 单条修复是本增量范围;**整套 Dropdown 焦点 + 键盘 + portal 测试**(主报告 §8 跨切 #6 提到的 1 hr 工作)推迟到 P3
- theme.css bundle size 优化(4416 行)→ P3 评估范围

## 3. 用户故事

- 作为玩家,我希望在编辑器中快速切换文件夹折叠状态时不要重渲染整树,以便 100+ 关卡时仍流畅 (M-7)
- 作为开发者,我希望在 i18n 文件中加 dead key 时立刻被 CI 抓到,以便不让死字符串腐烂 (M-1)
- 作为玩家,我希望在编辑器中输入关卡名快速失败时收到错误提示,以便知道为什么没保存 (L-2)
- 作为开发者,我希望 Dropdown 在 Tab 关闭后焦点回到 trigger,以便键盘用户的焦点位置可预测 (L-7)
- 作为开发者,我希望编辑器 e2e 的 carveLShape helper 不抹除 exit cell,以便 save/export 测试可以从 fixme 转为 skip-free (M-11)

## 4. 功能需求(24 FR)

### MEDIUM(9 项,主报告 §4)

- **FR-1 (M-1)**:扩 `tests/unit/i18n/keysParity.test.ts` 加 orphan-key 自动检测 — 收集 `src/**/*.tsx` 中所有 `t('xxx.yyy')` 调用,断言每个 `zh.ts` / `en.ts` resource key 都被消费;若 `editor.mylevels.*` 仍是 dead,CI 报失败;**选择方案 B**(系统检测而非删 10 keys),保留选项 A 作为兜底(若 orphan 检测实现复杂,降级为删 keys + 删 CSS)
- **FR-2 (M-4)**:`tests/unit/maze/enemySpawner.test.ts` 加 retry 路径单测 — 第二次调 `injectEnemySpawns` 返回的 `gen-*` ids 与第一次不同时,调用方 dedup by id prefix 后总数正确(不超过程序化关卡敌人数)
- **FR-3 (M-5)**:`src/ui/editor/EditorPropertiesPanel.tsx:220-225` 改 `useDebouncedCommit` 为 ref pattern(`valueRef` + `commitRef` + effect deps 只含 `[delay]`),7 个调用方无需改(签名不变)
- **FR-4 (M-6)**:`src/ui/editor/EditorPropertiesPanel.tsx:385-606` 给 `PickupForm` / `EnemyForm` / `WallForm` 加 `React.memo`,props 改 primitive projection(只传 `pickupId` / 当前 selection)
- **FR-5 (M-7)**:`src/ui/editor/EditorLeftPanel.tsx:70-72` collapsed 状态从 `useState<Record>` 移到 `src/store/levelStore.ts`(`collapsedFolderIds: Record<string, boolean>`)+ 持久化(`maze3d.folders.v1` 共享 storage key,`parseStorageKeyVersion` 兼容老数据)+ EditorLeftPanel selector 改为 `useLevelStore((s) => s.collapsedFolderIds)`
- **FR-6 (M-8)**:`src/ui/editor/EditorPropertiesPanel.tsx:807-860` TutorialAdvancedSteps 的 `stepList` 用 `useMemo([raw, status])` 包裹,避免每次 render `JSON.parse`
- **FR-7 (M-9)**:抽 `tests/_helpers/makeMaze.ts` + `tests/_helpers/editorMocks.ts` 提供 `makeMaze(overrides?)` / `resetEditor(overrides?)` / `mockEditorStore(overrides?)`,4 份内联重复替换(EditorLeftPanel / EditorStatusBar / levelStore.folders / a11y.test.tsx)— EditorLeftDrawer 已删
- **FR-8 (M-10)**:`tests/component/editor/EditorLeftPanel.test.tsx` 加 3 case:右菜单 rename(走 `window.prompt`)→ 调 `saveCustom` / 右菜单 move-to-folder → 调 `moveLevel` / 右菜单 move-folder-to-parent → 调 `moveFolder`
- **FR-9 (M-11)**:`tests/e2e/editor.spec.ts:16-26` 重写 `carveLShape` helper,跳过 `(4, 3)` exit cell(改为 `for (z = 1; z < 3; z += 1)`);**作为本次的副产物** `editor.spec.ts:48` 和 `:120` 两个 `test.fixme` 可以尝试升级为 `test.skip('flaky', ...)` 或保持 fixme,主报告 `M-3` 标记 root-cause 修了即可

### MEDIUM 额外(D 域新增,1 项)+ LOW 额外(D 域新增,2 项)

- **FR-10 (D-M-1)**:`src/maze/AlgorithmMazeProvider.ts` 在 4 个 generator 出口前加 spatial 守卫:出口 cell 1 radius 内不放 pickup,起点 2 radius 内不放;最小 spec = "pickup 不在 [exit-1, exit+1] 矩形范围内"
- **FR-11 (D-L-3)**:`src/maze/types.ts` 加 `isEnemyAggression(v: unknown): v is EnemyAggression` 守卫 + `JsonMazeProvider.ts:265-268` 把 `as` 强转换 `isEnemyAggression` + 不通过走 sanitize
- **FR-12 (D-L-4)**:`tests/unit/maze/importExport.test.ts` 加 `it.each` P2-11 字段 roundtrip 断言(i18n / tutorialSteps / hideMinimap / rules.enemyAggression / rules.requireAllPickups),对称 `tests/unit/maze/levels.test.ts:108-139`

### LOW(12 项,主报告 §5)

- **FR-13 (L-1)**:`src/store/levelStore.ts` `sanitizeFoldersMap` 走 `LoadSummary` 路由 — `LoadSummary` 加 `foldersDroppedKeys: string[]`,`levelStore` 在 folders init IIFE 末尾 dispatch `loadSummary` 更新;UI 层在 Settings toast 或 StatusBar 显示
- **FR-14 (L-2)**:`src/ui/editor/EditorLeftPanel.tsx:127-133` `handleRenameLevel` 订阅 `useLevelStore((s) => s.lastWriteError)`,失败时弹 useConfirm error dialog(走 `useConfirm` 现有 hook)
- **FR-15 (L-4)**:`src/ui/GameOverOverlay.tsx:16` + `src/ui/HUD.tsx` 胜利标签键统一为 `Record<VictoryType, string>`,与 WinOverlay 模式对齐(GameOverOverlay 三元 → Record map)
- **FR-16 (L-5)**:`tests/unit/maze/levels.test.ts` 加 `expect(data.pickups.every(p => Number.isInteger(p.x) && Number.isInteger(p.z) && Number.isFinite(p.value) && p.value > 0)).toBe(true)` 钉 pickup 契约
- **FR-17 (L-6)**:`tests/unit/entities/Enemy.test.ts` 加 `it('chaseSpeed equals playerSpeed * chaseMultiplier')`;若发现 `chaseMultiplier` 字段未被实际使用,**两个选项**:(A) 加测试 + 把字段标记 deprecated 注释;(B) 删字段 + 修测试 — **选择 A**(保守,不破坏 enemy SpawnSchedule 序列化)
- **FR-18 (L-7)**:`src/ui/components/Dropdown.tsx:200-202` Tab 关闭 + `e.preventDefault()` + `triggerRef.current?.focus()`,与 Esc 路径一致
- **FR-19 (L-8)**:`src/ui/components/Dropdown.tsx` 鼠标 click 与键盘 Enter 统一 — onClick 也 `setActiveIndex(i)` + `commit(activeIndex)`,文档化"activeIndex 是单一真理"
- **FR-20 (L-9)**:`src/store/levelStore.ts` 加 `renameLevel(id: string, name: string)` action,内部只更新一个 entry(避免 `Object.values` 全表重建);`EditorLeftPanel.handleRenameLevel` 改走 `useLevelStore((s) => s.renameLevel)` selector
- **FR-21 (L-10)**:`src/ui/LevelSelect.tsx:243-248, 547, 647` 把 `VICTORY_LABEL_KEYS[lv.data.rules.victory] ?? ''` 改 `?? 'levels.victory.reachExit'` 兜底到合法 key
- **FR-22 (L-11)**:`src/ui/components/Dialog.tsx:54, 61, 92` 把 `var(--panel)` 替换为 `var(--bg-elevated)`;`src/styles/theme.css` 注释 `--panel` 标 deprecated,加 lint-style 注释"don't use --panel outside legacy surfaces";**不删 `--panel`**(legacy 兼容保留,只是新代码不走)
- **FR-23 (L-12)**:`src/styles/theme.css` `.dropdown__option--active` 加 `outline: 2px solid var(--accent); outline-offset: -2px;`(dark mode 下视觉反差足够)
- **FR-24 (L-13)**:`tests/component/editor/EditorPropertiesPanel.debounce.test.tsx` 新文件,加 `useDebouncedCommit` 3 case:快速打字只 commit 最后一次 / unmount 时不 commit / commit reference 变化时仍用最新 callback(ref 模式修复的回归 pin)

## 5. 数据 / 类型变更

### 新增 / 修改的类型
- `src/maze/types.ts`:加 `isEnemyAggression(v: unknown): v is EnemyAggression` 守卫函数(FR-11)
- `src/store/levelStore.ts`:
  - 加 `collapsedFolderIds: Record<string, boolean>` 字段(FR-5)
  - 加 `renameLevel(id: string, name: string)` action(FR-20)
  - 加 `foldersDroppedKeys: string[]` 到 `LoadSummary`(FR-13)

### 新增 / 修改的 Store 字段
- `levelStore.collapsedFolderIds`: 默认 `{}`,持久化到 `maze3d.folders.v1`(与 folders 同 storage key,parseStorageKeyVersion 兼容 v1 数据加 `collapsedFolderIds: {}` 默认值)
- `levelStore.renameLevel`: signature `(id: string, name: string) => boolean`(成功 true,失败 false)
- `LoadSummary.foldersDroppedKeys`: 数组,UI 层订阅显示在 StatusBar 或 Settings toast

## 6. 引擎 / 架构影响

### 受影响文件
| 文件 | 改动类型 | 说明 |
|---|---|---|
| `tests/unit/i18n/keysParity.test.ts` | UPDATE | FR-1 orphan-key 检测 |
| `tests/unit/maze/enemySpawner.test.ts` | UPDATE | FR-2 retry 路径 |
| `src/ui/editor/EditorPropertiesPanel.tsx` | UPDATE | FR-3 useDebouncedCommit ref + FR-4 form memo + FR-6 JSON.parse memo + FR-24 debounce test |
| `src/ui/editor/EditorLeftPanel.tsx` | UPDATE | FR-5 collapsed 移到 store + FR-14 rename 失败 surface + FR-20 改走 renameLevel action |
| `src/store/levelStore.ts` | UPDATE | FR-5 collapsedFolderIds + FR-13 foldersDroppedKeys + FR-20 renameLevel action |
| `tests/_helpers/makeMaze.ts` | CREATE | FR-7 抽 helper |
| `tests/_helpers/editorMocks.ts` | CREATE | FR-7 抽 helper |
| `tests/component/editor/EditorLeftPanel.test.tsx` | UPDATE | FR-8 右键菜单 + FR-7 用新 helper |
| `tests/component/editor/EditorStatusBar.test.tsx` | UPDATE | FR-7 用新 helper |
| `tests/unit/levelStore.folders.test.ts` | UPDATE | FR-7 用新 helper |
| `tests/e2e/editor.spec.ts` | UPDATE | FR-11 carveLShape 重写 |
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | FR-10 pickup 位置守卫 |
| `src/maze/types.ts` | UPDATE | FR-11 isEnemyAggression 守卫 |
| `src/maze/JsonMazeProvider.ts` | UPDATE | FR-11 isEnemyAggression 强转 |
| `tests/unit/maze/importExport.test.ts` | UPDATE | FR-12 roundtrip 断言 |
| `src/ui/GameOverOverlay.tsx` | UPDATE | FR-15 Record<VictoryType> 模式 |
| `src/ui/HUD.tsx` | UPDATE | FR-15 同上 |
| `tests/unit/maze/levels.test.ts` | UPDATE | FR-16 pickup.value 契约 |
| `tests/unit/entities/Enemy.test.ts` | UPDATE | FR-17 chaseSpeed 契约 |
| `src/ui/components/Dropdown.tsx` | UPDATE | FR-18 Tab 焦点 + FR-19 activeIndex 统一 |
| `src/ui/LevelSelect.tsx` | UPDATE | FR-21 ?? '' 兜底 |
| `src/ui/components/Dialog.tsx` | UPDATE | FR-22 --panel → --bg-elevated |
| `src/styles/theme.css` | UPDATE | FR-22 --panel 注释 + FR-23 dropdown outline |
| `tests/component/editor/EditorPropertiesPanel.debounce.test.tsx` | CREATE | FR-24 debounce 单测 |

### 边界检查(强制)
- 引擎层(`src/engine/`、`src/maze/generators/`、`src/entities/`、`src/game/`)`grep -rE "from ['\"]react|react-dom|zustand|\.\./store"` 必须 0 匹配
- 新增 `LevelLoadError` / `LoadSummary` 等错误类型走 `src/utils/errors.ts` 体系
- 修改 `Enemy.chaseMultiplier` 字段(FR-17)**不删字段**(保守,标 deprecated)
- `collapsedFolderIds` 持久化用现有 `maze3d.folders.v1` schema,加字段不破坏 schemaVersion

## 7. UI / UX 变更

### 屏幕 / 组件改动
- **EditorLeftPanel**(FR-5, FR-14, FR-20):collapsed 状态持久化到 store;rename 失败弹 error dialog;走 `renameLevel` action
- **Dropdown**(FR-18, FR-19):Tab 关闭后焦点回 trigger;click 与 Enter commit 路径统一
- **EditorPropertiesPanel**(FR-3, FR-4, FR-6):useDebouncedCommit ref pattern + form memo + JSON.parse memo
- **GameOverOverlay / HUD**(FR-15):victory 标签键统一为 Record 模式
- **Settings / StatusBar**(FR-13):foldersDroppedKeys 显示为 toast 或 warning chip
- **LevelSelect**(FR-21):victory ?? '' 兜底改为 'reachExit'

### 交互流程
1. 玩家编辑关卡 → useDebouncedCommit 快速输入时 commit 引用变化不影响 debounce timer 行为(FR-3 ref pattern)
2. 玩家在 EditorLeftPanel hover row → RowMenu 用 React.memo + 细粒度 selector 不触发父组件 re-render(FR-4 间接受益)
3. 玩家在 Dropdown 用键盘 Tab 关闭 → 焦点回 trigger(FR-18)
4. 玩家 rename 关卡 → 失败时弹 useConfirm error dialog(FR-14)
5. 玩家刷新编辑器 → collapsed 状态从 store 恢复(FR-5)

## 8. 错误处理

### 新增错误码
- `levelStore.renameLevel` 返回 `boolean`,UI 层检查 + 弹 dialog
- `LevelLoadError.foldersDroppedKeys: string[]` 走现有 LoadSummary 通道

### 兜底行为
- FR-1 orphan-key 检测 → CI 报错,本地开发 console.warn
- FR-10 pickup 位置守卫 → generator 找不到合法位置时降级到原随机行为 + console.warn(不抛错,避免破坏 progressive 关卡生成)
- FR-20 renameLevel 失败 → 走 useConfirm dialog(不静默)
- FR-21 VICTORY_LABEL_KEYS 兜底 → fallback 到 'reachExit'(不再 console.warn 空 key)

## 9. 测试策略

### 单元测试
- `tests/unit/i18n/keysParity.test.ts` 加 orphan-key 检测(FR-1)
- `tests/unit/maze/enemySpawner.test.ts` 加 retry 单测(FR-2)
- `tests/unit/maze/importExport.test.ts` 加 roundtrip it.each(FR-12)
- `tests/unit/maze/levels.test.ts` 加 pickup.value 契约(FR-16)
- `tests/unit/entities/Enemy.test.ts` 加 chaseSpeed 契约(FR-17)

### 组件测试(RTL)
- `tests/component/editor/EditorLeftPanel.test.tsx` 加右键菜单 3 case(FR-8)
- `tests/component/editor/EditorPropertiesPanel.debounce.test.tsx` 新文件,3 case(FR-24)
- `tests/component/editor/EditorStatusBar.test.tsx` 改用新 helper(FR-7)
- `tests/component/editor/a11y.test.tsx` 改用新 helper(FR-7)

### E2E 测试(Playwright)
- `tests/e2e/editor.spec.ts:48, 120` 两个 fixme → 试运行 `carveLShape` 重写后升级为 `test.skip('flaky', ...)` 或保留 fixme 但 root cause 已修(FR-9 / FR-11)
- 跑 `npx playwright test` 完整套件确认无新增 skip / fail

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| FR-1 orphan-key 检测 regex 误报(dynamic key 名 `t(prefix + 'name')`) | 中 | regex 只匹配字面量 `t('xxx.yyy')`;dynamic 路径在代码注释豁免;首轮跑前手动 `grep -rn "t('editor.mylevels" src/` 确认无消费者 |
| FR-5 collapsedFolderIds 持久化破坏老数据 | 低 | 与 folders 同 storage key,parseStorageKeyVersion 兼容;默认值 `{}` 保证老数据不报错 |
| FR-9 carveLShape 重写影响 editor.spec.ts 其他 case | 低 | helper 仅改 exit 跳过逻辑,其他 8 个 case 用法不变;跑前先跑原 e2e 套件确认 baseline |
| FR-17 Enemy.test.ts chaseSpeed 测试发现 chaseMultiplier 真为死代码 | 中 | 选 A(加测试 + 标 deprecated)保守;不删字段 |
| FR-22 Dialog.tsx 改 `--panel` → `--bg-elevated` 视觉差异 | 低 | 两个 token 当前值相同(`--panel: var(--bg-elevated)`),改动无视觉差异 |
| FR-3 useDebouncedCommit ref pattern 改变 commit 时机 | 低 | ref pattern 等价行为,只是 commit 引用稳定;EditorPropertiesPanel debounce test(FR-24)pin 回归 |
| FR-15 HUD.tsx victory key 模式统一可能破坏现有 testid | 低 | 改 string 表不改 DOM 结构;e2e 套件确认 |

## 11. 完成清单(拷贝自 `_template/dod.md`)

### 11.1 功能验收
- [ ] FR-1 到 FR-24 全部实现
- [ ] 每个 finding 在代码注释中保留 F-tag(`F-2026-06-17-X-N`)
- [ ] 边界情况显式列出并被覆盖

### 11.2 引擎 / 架构边界
- [ ] 引擎层不新增对 `react` / `store/` 的 import(`grep -rE "from ['\"]react|react-dom|zustand|\.\./store" src/engine/ src/entities/ src/maze/generators/ src/game/` 0 匹配)
- [ ] 新增类型 / 错误走 `src/utils/errors.ts` 体系

### 11.3 测试
- [ ] 单元测试覆盖率 ≥80%
- [ ] 新增的 Zustand action / Rule / Collision 分支必须有对应单测
- [ ] 涉及 UI 的改动必须有 RTL 组件测试
- [ ] E2E 套件无新增 skip / fail(可保持原有 8 处)
- [ ] `npm run typecheck` 与 `npm run build` 通过

### 11.4 文档
- [ ] `docs/increments/p2-15-review-fixes-batch-2/spec.md` 已写入(本文)
- [ ] `docs/increments/p2-15-review-fixes-batch-2/plan.md` 所有 checkbox 已勾
- [ ] `docs/roadmap.md` P2-15 行从 `🟡 done` → `✅ done`
- [ ] `docs/roadmap.md` 活跃锚点更新(已完成 → + P2-15)

### 11.5 持久化与兼容
- [ ] `collapsedFolderIds` 持久化兼容老数据(parseStorageKeyVersion 默认值 `{}`)
- [ ] `Enemy.chaseMultiplier` 字段保留(deprecated 注释,不删)
- [ ] `LoadSummary.foldersDroppedKeys` 不破坏现有 schema

### 11.6 安全与健壮性
- [ ] 用户输入校验到位(rename 失败 surface / i18n orphan-key 检测)
- [ ] 错误处理走 LoadSummary / useConfirm 体系
- [ ] 无 console.log / debugger 残留
- [ ] 无硬编码密钥 / 资源 URL

## 12. 参考

- 前置评审主报告:[docs/reviews/2026-06-17-p2-13-full-code-review.md](../../reviews/2026-06-17-p2-13-full-code-review.md)
- 前置评审 baseline:[docs/reviews/2026-06-17-full-code-review.md](../../reviews/2026-06-17-full-code-review.md)
- A 域子报告:[docs/reviews/findings/2026-06-17-A-architecture-post-p2-13.md](../../reviews/findings/2026-06-17-A-architecture-post-p2-13.md)
- B 域子报告:[docs/reviews/findings/2026-06-17-B-engine-post-p2-13.md](../../reviews/findings/2026-06-17-B-engine-post-p2-13.md)
- C 域子报告:[docs/reviews/findings/2026-06-17-C-entities-rules-post-p2-13.md](../../reviews/findings/2026-06-17-C-entities-rules-post-p2-13.md)
- D 域子报告:[docs/reviews/findings/2026-06-17-D-maze-subsystem-post-p2-13.md](../../reviews/findings/2026-06-17-D-maze-subsystem-post-p2-13.md)
- E 域子报告:[docs/reviews/findings/2026-06-17-E-ui-react-p2-13.md](../../reviews/findings/2026-06-17-E-ui-react-p2-13.md)
- F 域子报告:[docs/reviews/findings/2026-06-17-F-tests-v2.md](../../reviews/findings/2026-06-17-F-tests-v2.md)
- P2-14 commit:`e135e32 fix(p2-14): review batch 1 — 12/33 finding 修复`
- P2-13 commit:`ad94abe feat(p2-13): 编辑器文件夹系统 + 左侧栏重构 + 胜利标签键修复`
- Spec 模板:[docs/increments/_template/increment-spec.md](../_template/increment-spec.md)
- Plan 模板:[docs/increments/_template/increment-plan.md](../_template/increment-plan.md)
