# P2-15 — review-fixes-batch-2 — 实施计划(Plan)

**Spec**: `docs/increments/p2-15-review-fixes-batch-2/spec.md`
**复杂度**: Medium
**日期**: 2026-06-17
**前置**: P2-14(`e135e32`,已 done)+ P2-13(`ad94abe`,已 done)

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `tests/unit/i18n/keysParity.test.ts` | UPDATE | FR-1 orphan-key 自动检测 |
| `tests/unit/maze/enemySpawner.test.ts` | UPDATE | FR-2 retry 路径单测 |
| `src/ui/editor/EditorPropertiesPanel.tsx` | UPDATE | FR-3 useDebouncedCommit ref + FR-4 form memo + FR-6 JSON.parse memo |
| `src/ui/editor/EditorLeftPanel.tsx` | UPDATE | FR-5 collapsed 移到 store + FR-14 rename 失败 surface + FR-20 走 renameLevel action |
| `src/store/levelStore.ts` | UPDATE | FR-5 collapsedFolderIds + FR-13 foldersDroppedKeys + FR-20 renameLevel action |
| `tests/_helpers/makeMaze.ts` | CREATE | FR-7 抽 helper |
| `tests/_helpers/editorMocks.ts` | CREATE | FR-7 抽 helper |
| `tests/component/editor/EditorLeftPanel.test.tsx` | UPDATE | FR-7 用新 helper + FR-8 右键菜单 3 case |
| `tests/component/editor/EditorStatusBar.test.tsx` | UPDATE | FR-7 用新 helper |
| `tests/unit/levelStore.folders.test.ts` | UPDATE | FR-7 用新 helper |
| `tests/component/editor/a11y.test.tsx` | UPDATE | FR-7 用新 helper(resetEditor) |
| `tests/e2e/editor.spec.ts` | UPDATE | FR-9 carveLShape 重写 |
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | FR-10 pickup 位置守卫 |
| `src/maze/types.ts` | UPDATE | FR-11 isEnemyAggression 守卫 |
| `src/maze/JsonMazeProvider.ts` | UPDATE | FR-11 isEnemyAggression 强转 |
| `tests/unit/maze/importExport.test.ts` | UPDATE | FR-12 roundtrip 断言 |
| `src/ui/GameOverOverlay.tsx` | UPDATE | FR-15 Record<VictoryType> 模式 |
| `src/ui/HUD.tsx` | UPDATE | FR-15 同上 |
| `tests/unit/maze/levels.test.ts` | UPDATE | FR-16 pickup.value 契约 |
| `tests/unit/entities/Enemy.test.ts` | UPDATE | FR-17 chaseSpeed 契约 |
| `src/ui/components/Dropdown.tsx` | UPDATE | FR-18 Tab 焦点 + FR-19 activeIndex 统一 |
| `src/ui/LevelSelect.tsx` | UPDATE | FR-21 VICTORY_LABEL_KEYS 兜底 |
| `src/ui/components/Dialog.tsx` | UPDATE | FR-22 --panel → --bg-elevated |
| `src/styles/theme.css` | UPDATE | FR-22 --panel 注释 + FR-23 dropdown outline |
| `tests/component/editor/EditorPropertiesPanel.debounce.test.tsx` | CREATE | FR-24 debounce 单测 |
| `docs/roadmap.md` | UPDATE | P2-15 行从候选池移到正式表 + 活跃锚点更新 |

## 任务清单

### Task 1: i18n orphan-key 自动检测(FR-1 / M-1)
- [ ] **Action**: 扩 `tests/unit/i18n/keysParity.test.ts` 加 orphan-key 检查 — 用 `glob` 读 `src/**/*.tsx`,regex 匹配 `t('xxx.yyy')` 字面量调用,收集后断言每个 `zh.ts` / `en.ts` resource key 都被消费(无消费 → CI 失败 + 列具体 dead keys)
- [ ] **Mirror**: 现有 `keysParity.test.ts` 已检查 parity / non-empty / dotted-namespace,新增 `describe('orphan-key detection', ...)` 段
- [ ] **Test**: 验证当前 10 个 `editor.mylevels.*` keys 被检测为 orphan,CI fail
- [ ] **Validate**: `npm run test -- keysParity.test.ts` 应失败 → 删 10 dead keys + 删 `.editor-mylevels__*` CSS → 再跑应通过

### Task 2: enemySpawner retry 单测(FR-2 / M-4)
- [ ] **Action**: `tests/unit/maze/enemySpawner.test.ts` 加 2 case — `it('second call returns different gen-* ids that overwrite first batch', ...)` + `it('caller-merge helper dedups by id prefix', ...)`
- [ ] **Mirror**: 现有单测测单次 injectEnemySpawns;扩展到 retry 路径
- [ ] **Test**: 用 gameStore + Game 两侧的 handCraftedEnemies filter(b7707fd 修复)作为基线,验证 retry 后总数正确
- [ ] **Validate**: `npm run test -- enemySpawner.test.ts` 全过

### Task 3: useDebouncedCommit ref pattern(FR-3 / M-5)
- [ ] **Action**: `src/ui/editor/EditorPropertiesPanel.tsx:220-225` 改 `useDebouncedCommit` 实现为 ref pattern:`valueRef` + `commitRef` + effect deps 只含 `[delay]`,commit 用 `commitRef.current(valueRef.current)`
- [ ] **Mirror**: P2-11 评审 E-M-1 推荐模式
- [ ] **Test**: 编译通过 + 7 个调用方无需改(签名不变)
- [ ] **Validate**: `npm run typecheck` + `npm run test -- EditorPropertiesPanel` 全过

### Task 4: form 组件 React.memo(FR-4 / M-6)
- [ ] **Action**: `src/ui/editor/EditorPropertiesPanel.tsx:385-606` 给 `PickupForm` / `EnemyForm` / `WallForm` 包 `React.memo`,props 改 primitive projection(只传 `pickupId` / `enemyId` / 当前 selection)
- [ ] **Mirror**: P2-11 评审 E-M-2 推荐模式
- [ ] **Test**: 编译通过 + 现有 EditorPropertiesPanel 单测全过
- [ ] **Validate**: `npm run typecheck` + `npm run test -- EditorPropertiesPanel`

### Task 5: collapsedFolderIds 持久化(FR-5 / M-7)
- [ ] **Action**:
  1. `src/store/levelStore.ts` 加 `collapsedFolderIds: Record<string, boolean>` 字段
  2. 持久化到 `maze3d.folders.v1`(与 folders 同 storage key,parseStorageKeyVersion 兼容老数据加默认值 `{}`)
  3. `src/ui/editor/EditorLeftPanel.tsx:70-72` 用 `useLevelStore((s) => s.collapsedFolderIds)` 替换 `useState`
- [ ] **Mirror**: P2-13 文件夹持久化模式(`maze3d.folders.v1`)
- [ ] **Test**: `tests/unit/levelStore.folders.test.ts` 加 2 case:collapsed 写入后刷新恢复 / 默认空对象兼容老数据
- [ ] **Validate**: `npm run test -- levelStore.folders.test.ts`

### Task 6: TutorialAdvancedSteps JSON.parse memo(FR-6 / M-8)
- [ ] **Action**: `src/ui/editor/EditorPropertiesPanel.tsx:847-860` 把 IIFE 改 `useMemo([raw, status])` 包裹
- [ ] **Mirror**: P2-11 评审 E-M-4 推荐模式
- [ ] **Test**: 现有 EditorPropertiesPanel 单测全过
- [ ] **Validate**: `npm run typecheck` + `npm run test -- EditorPropertiesPanel`

### Task 7: 抽 tests/_helpers(makeMaze + editorMocks)(FR-7 / M-9)
- [ ] **Action**:
  1. 创建 `tests/_helpers/makeMaze.ts` 提供 `makeMaze(overrides?)` 返回 3x3 / cellSize=2 / reach-exit 标准 maze
  2. 创建 `tests/_helpers/editorMocks.ts` 提供 `resetEditor(overrides?)` + `mockEditorStore(overrides?)`
  3. 替换 4 份内联重复(EditorLeftPanel.test.tsx / EditorStatusBar.test.tsx / levelStore.folders.test.ts / a11y.test.tsx)
- [ ] **Mirror**: P2-11 评审 F-M-1 抽 helper 方案
- [ ] **Test**: 4 份测试编译 + 行为不变
- [ ] **Validate**: `npm run test -- EditorLeftPanel EditorStatusBar a11y levelStore.folders`

### Task 8: EditorLeftPanel 右键菜单 3 case(FR-8 / M-10)
- [ ] **Action**: `tests/component/editor/EditorLeftPanel.test.tsx` 加 3 case:
  - `it('right-click rename prompts for new name and calls saveCustom', ...)` — mock `window.prompt` 返回新名
  - `it('right-click move-to-folder calls moveLevel', ...)` — fireEvent.mouseEnter + click row menu
  - `it('right-click move-folder-to-parent calls moveFolder', ...)`
- [ ] **Mirror**: 现有 delete case 模式
- [ ] **Test**: 触发 `fireEvent.mouseEnter` 或 `fireEvent.click(row-menu-{kind}-{id})`
- [ ] **Validate**: `npm run test -- EditorLeftPanel`

### Task 9: carveLShape helper 重写(FR-9 / M-11)
- [ ] **Action**: `tests/e2e/editor.spec.ts:16-26` 把 `for (z = 1; z < 4; z += 1)` 改 `for (z = 1; z < 3; z += 1)`,跳过 `(4, 3)` exit cell;或先把出口 (4, 3) 设为 floor 再开始 carve
- [ ] **Mirror**: F-2026-06-15-H-3.7 root cause
- [ ] **Test**: `tests/e2e/editor.spec.ts` 两个 fixme(行 48, 120)可以尝试升级为 `test.skip('flaky', ...)` 或保留 fixme 但 root cause 修了
- [ ] **Validate**: `npx playwright test tests/e2e/editor.spec.ts`(需 dev server)

### Task 10: AlgorithmMazeProvider pickup 位置守卫(FR-10 / D-M-1)
- [ ] **Action**: `src/maze/AlgorithmMazeProvider.ts` 在 4 个 generator 输出 pickup 位置前加 spatial 守卫 — 出口 cell 1 radius 内不放,起点 2 radius 内不放;最小 spec = "pickup 不在 [exit-1, exit+1] 矩形范围内"
- [ ] **Mirror**: D 域子报告 D-M-1 提案
- [ ] **Test**: 跑 50 个不同 seed 验证无 pickup 在出口前
- [ ] **Validate**: `npm run test -- AlgorithmMazeProvider`

### Task 11: isEnemyAggression 守卫(FR-11 / D-L-3)
- [ ] **Action**:
  1. `src/maze/types.ts` 加 `isEnemyAggression(v: unknown): v is EnemyAggression`
  2. `src/maze/JsonMazeProvider.ts:265-268` 把 `as` 强转换 `isEnemyAggression` 守卫 + 不通过走 sanitize
- [ ] **Mirror**: 现有 5 个 `is*` 守卫(`isPickupType` / `isVictoryType` / `isMazeSize` / `isLevelSource` / `isSurviveSeconds`)
- [ ] **Test**: `tests/unit/maze/types.test.ts` 加 isEnemyAggression 4 case(合法 / null / undefined / 非法字符串)
- [ ] **Validate**: `npm run test -- types.test.ts`

### Task 12: importExport roundtrip 断言(FR-12 / D-L-4)
- [ ] **Action**: `tests/unit/maze/importExport.test.ts` 加 `it.each` P2-11 5 字段 roundtrip 断言 — `i18n` / `tutorialSteps` / `hideMinimap` / `rules.enemyAggression` / `rules.requireAllPickups`
- [ ] **Mirror**: `tests/unit/maze/levels.test.ts:108-139` 模式
- [ ] **Test**: 5 字段全过
- [ ] **Validate**: `npm run test -- importExport.test.ts`

### Task 13: sanitizeFoldersMap.dropped → LoadSummary(FR-13 / L-1)
- [ ] **Action**:
  1. `src/store/levelStore.ts` `LoadSummary` 类型加 `foldersDroppedKeys: string[]` 字段
  2. folders init IIFE 末尾把 `sanitizeFoldersMap(...).dropped` 路由到 `LoadSummary.foldersDroppedKeys`
  3. UI 层在 EditorStatusBar 或 Settings toast 显示(若有 dropped keys)
- [ ] **Mirror**: P2-13 folders sanitize 函数 shape(`{ map, dropped }`)
- [ ] **Test**: `tests/unit/levelStore.folders.test.ts` 加 case:损坏的 folders 数据触发 droppedKeys 填充
- [ ] **Validate**: `npm run test -- levelStore.folders.test.ts`

### Task 14: handleRenameLevel 失败 surface(FR-14 / L-2)
- [ ] **Action**: `src/ui/editor/EditorLeftPanel.tsx:127-133` `handleRenameLevel`:
  1. 订阅 `useLevelStore((s) => s.lastWriteError)`
  2. 失败时弹 `useConfirm` error dialog(走 `useConfirm` 现有 hook)
- [ ] **Mirror**: 其他写路径(EditorTopBar.handleSave / useAutoSave)显式调 `setStatus({ kind: 'error' })`
- [ ] **Test**: EditorLeftPanel test 加 case:rename 失败时弹 dialog
- [ ] **Validate**: `npm run test -- EditorLeftPanel`

### Task 15: GameOverOverlay + HUD victory key 统一(FR-15 / L-4)
- [ ] **Action**:
  1. `src/ui/GameOverOverlay.tsx:16` 三元 → `Record<VictoryType, string>` map
  2. `src/ui/HUD.tsx` 状态条走相同 Record 模式(若有 victory 相关显示)
  3. i18n resources 加缺失的 keys(若 Record 中引用的 keys 不存在)
- [ ] **Mirror**: P2-13 WinOverlay 已修复的 `Record<VictoryType, string>` 模式
- [ ] **Test**: WinOverlay / GameOverOverlay / HUD 现有单测全过
- [ ] **Validate**: `npm run typecheck` + `npm run test -- WinOverlay GameOverOverlay HUD`

### Task 16: levels.test.ts pickup.value 契约(FR-16 / L-5)
- [ ] **Action**: `tests/unit/maze/levels.test.ts` 加断言 `expect(data.pickups.every(p => Number.isInteger(p.x) && Number.isInteger(p.z) && Number.isFinite(p.value) && p.value > 0)).toBe(true)`
- [ ] **Mirror**: 现有 P2-11 字段断言模式
- [ ] **Test**: 全 17 case 全过
- [ ] **Validate**: `npm run test -- levels.test.ts`

### Task 17: Enemy.test.ts chaseSpeed 契约(FR-17 / L-6)
- [ ] **Action**: `tests/unit/entities/Enemy.test.ts` 加 `it('chaseSpeed equals playerSpeed * chaseMultiplier')`;若 `chaseMultiplier` 字段未被实际使用,加 deprecated 注释(选项 A)
- [ ] **Mirror**: 现有 Enemy.test.ts 7 case
- [ ] **Test**: 7 + 1 case 全过
- [ ] **Validate**: `npm run test -- Enemy.test.ts`

### Task 18: Dropdown Tab 焦点 + activeIndex 统一(FR-18 + FR-19 / L-7 + L-8)
- [ ] **Action**:
  1. `src/ui/components/Dropdown.tsx:200-202` Tab 关闭 + `e.preventDefault()` + `triggerRef.current?.focus()`
  2. onClick 与 Enter 统一:`onClick={() => { setActiveIndex(i); commit(activeIndex); }}`,文档化"activeIndex 是单一真理"
- [ ] **Mirror**: 现有 Esc 关闭路径
- [ ] **Test**: Dropdown 行为兼容(现有 fireEvent.change 路径不变)
- [ ] **Validate**: `npm run test -- Dropdown`(若新增 test) + `npm run typecheck`

### Task 19: renameLevel action(FR-20 / L-9)
- [ ] **Action**:
  1. `src/store/levelStore.ts` 加 `renameLevel(id: string, name: string): boolean` action,内部只更新一个 entry(避免 `Object.values` 全表重建)
  2. `src/ui/editor/EditorLeftPanel.tsx:127-133` `handleRenameLevel` 改走 `useLevelStore((s) => s.renameLevel)` selector,不用 `getState().saveCustom`
- [ ] **Mirror**: P2-13 folders 的 `renameFolder` action 模式
- [ ] **Test**: `tests/unit/levelStore.folders.test.ts` 加 renameLevel 3 case:成功 / 失败(null name) / 不存在的 id
- [ ] **Validate**: `npm run test -- levelStore.folders.test.ts`

### Task 20: LevelSelect victory 兜底(FR-21 / L-10)
- [ ] **Action**: `src/ui/LevelSelect.tsx:243-248, 547, 647` 把 `VICTORY_LABEL_KEYS[lv.data.rules.victory] ?? ''` 改 `?? 'levels.victory.reachExit'`(3 处)
- [ ] **Mirror**: 现有 `VICTORY_LABEL_KEYS` Record 模式
- [ ] **Test**: LevelSelect 现有单测全过
- [ ] **Validate**: `npm run test -- LevelSelect`

### Task 21: theme.css --panel 清理 + dropdown outline(FR-22 + FR-23 / L-11 + L-12)
- [ ] **Action**:
  1. `src/ui/components/Dialog.tsx:54, 61, 92` 把 `var(--panel)` 替换为 `var(--bg-elevated)`
  2. `src/styles/theme.css:90-92, 138` `--panel` 注释加 deprecated + 加 lint-style 注释"don't use --panel outside legacy surfaces"(不删 token)
  3. `src/styles/theme.css` `.dropdown__option--active` 加 `outline: 2px solid var(--accent); outline-offset: -2px;`
- [ ] **Mirror**: 现有 CSS 主题注释模式
- [ ] **Test**: Dialog 组件单测全过 + 视觉无差异
- [ ] **Validate**: `npm run typecheck` + `npm run test -- Dialog` + 手动 dark/light mode 切换

### Task 22: useDebouncedCommit 单测(FR-24 / L-13)
- [ ] **Action**: 新建 `tests/component/editor/EditorPropertiesPanel.debounce.test.tsx` 加 3 case:
  1. 快速打字只 commit 最后一次
  2. unmount 时不 commit
  3. commit reference 变化时仍用最新 callback(FR-3 ref pattern 回归 pin)
- [ ] **Mirror**: 现有 EditorPropertiesPanel.test 模式 + `vi.useFakeTimers`
- [ ] **Test**: 3 case 全过,pin 住 ref pattern 行为
- [ ] **Validate**: `npm run test -- EditorPropertiesPanel.debounce`

### Task 23: 文档同步
- [ ] **Action**:
  1. `docs/roadmap.md` P2-15 行从候选池移到正式表(状态:`🟡 in-progress` → `✅ done`)
  2. 活跃锚点更新(已完成加 P2-15;下一个任务 = P3 候选或等用户指示)
  3. e2e skip 状态表更新(8 → 可能 6,若 Task 9 成功解锁)
- [ ] **Test**: 文档链接正确(relative path 全部用 `./` 相对)
- [ ] **Validate**: `grep -n "p2-15" docs/roadmap.md` 命中;`grep -rn "P2-15" docs/` 链接正确

## 验证

```bash
# 必须全部通过才能标记增量为 done
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

**附加边界检查**:
```bash
grep -rE "from ['\"]react|react-dom|zustand|\.\./store" src/engine/ src/entities/ src/maze/generators/ src/game/
# 期望: 0 匹配
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| Task 1 FR-1 orphan-key 检测 regex 误报(dynamic key 名 `t(prefix + 'name')`) | 中 | regex 只匹配字面量 `t('xxx.yyy')`;dynamic 路径在代码注释豁免;首轮跑前手动 `grep -rn "t('editor.mylevels" src/` 确认无消费者 |
| Task 5 FR-5 collapsedFolderIds 持久化破坏老数据 | 低 | 与 folders 同 storage key,parseStorageKeyVersion 兼容;默认值 `{}` 保证老数据不报错 |
| Task 9 FR-9 carveLShape 重写影响 editor.spec.ts 其他 case | 低 | helper 仅改 exit 跳过逻辑,其他 8 个 case 用法不变;跑前先跑原 e2e 套件确认 baseline |
| Task 17 FR-17 Enemy.test.ts chaseSpeed 测试发现 chaseMultiplier 真为死代码 | 中 | 选 A(加测试 + 标 deprecated)保守;不删字段 |
| Task 21 FR-22 Dialog.tsx 改 `--panel` → `--bg-elevated` 视觉差异 | 低 | 两个 token 当前值相同(`--panel: var(--bg-elevated)`),改动无视觉差异 |
| Task 3 FR-3 useDebouncedCommit ref pattern 改变 commit 时机 | 低 | ref pattern 等价行为,只是 commit 引用稳定;Task 22 debounce test pin 回归 |
| Task 15 FR-15 HUD.tsx victory key 模式统一可能破坏现有 testid | 低 | 改 string 表不改 DOM 结构;e2e 套件确认 |

## 验收

- [ ] 所有 23 个 Task checkbox 已勾
- [ ] 验证命令(typecheck / test / build / e2e)全部通过
- [ ] 边界 grep 0 匹配
- [ ] spec §11 完成清单全部勾选
- [ ] `docs/roadmap.md` P2-15 行从 `🟡 in-progress` 改 `✅ done`
- [ ] `docs/roadmap.md` 活跃锚点更新
- [ ] 至少 1 个 commit,message 格式:`fix(p2-15): review batch 2 — 24 finding 修复`

## 执行日志(实施时填写)

### 实施日期
YYYY-MM-DD

### 实际改动文件
(与上面"文件改动总览"对照,列出真实改动的文件)

### 遇到的偏差
- spec 中计划 ...,实际做了 ...,原因 ...

### 测试覆盖
- 单元覆盖率:...%
- 新增 / 修改测试:...

### 备注
(任何给后续增量有参考价值的发现)

---

**任务依赖关系图**(实施参考):
- Task 1, 2, 11, 12, 16, 17:单元测试,无依赖,可并行
- Task 3, 4, 6:同一文件 (`EditorPropertiesPanel.tsx`) 改动,顺序: 3 → 4 → 6
- Task 5, 13, 19:同一文件 (`levelStore.ts`) 改动,顺序: 5 → 13 → 19
- Task 7:基础设施,先做(其他 task 可能用到)
- Task 8, 14, 20:同一文件 (`EditorLeftPanel.tsx`) 改动,顺序: 7 → 8 → 14 → 20
- Task 18, 21:UI/CSS,可并行
- Task 9:独立 e2e,最后跑
- Task 22:依赖 Task 3(FR-3 ref pattern)
- Task 23:文档同步,最后做
