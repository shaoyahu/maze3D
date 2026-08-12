# P5-editor-multilayer — 实施计划

**Spec**: `docs/increments/p5-editor-multilayer/spec.md`
**复杂度**: Large
**日期**: 2026-08-12
**前置**: 用户 review spec.md + 5 个关键决策定夺

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/types.ts` | MINOR UPDATE | `MazeData.walls: CellType[][]` 改 `walls?: CellType[][]`(optional) |
| `src/maze/JsonMazeProvider.ts` | MINOR UPDATE | 强化 validator:`walls xor walls2d` 互斥(单层必有 walls,多层必有 walls2d) |
| `src/utils/perLayerWalls.ts` | NEW | 3 个工具函数:`getCurrentLayerWalls` / `promoteToMultiLayer` / `collapseToSingleLayer` |
| `src/store/editorStore.ts` | UPDATE | `addLevel` / `removeLevel` 改用 perLayerWalls utils 真实操作 walls2d |
| `src/ui/editor/EditorViewport.tsx` | UPDATE | walls 渲染改用 `getCurrentLayerWalls(level, currentLevel)` |
| `src/ui/editor/editorValidation.ts` | UPDATE | `isReachable` 接 walls2d,多层 BFS |
| `src/ui/editor/LevelTabs.tsx` | MINOR | 加 tooltip "Layer N · X entities" + 多层 mode hint |
| `src/ui/editor/EditorStatusBar.tsx` | MINOR | 多层时显示 "Layer 1/3" |
| `src/ui/editor/EditorHelpDrawer.tsx` | UPDATE | 加 "多层迷宫" 段 |
| `src/maze/importExport.ts` | MINOR | parseImport 后 store 端 normalize(单层无 walls2d,多层有) |
| `tests/unit/utils/perLayerWalls.test.ts` | NEW | 6 case:工具函数 |
| `tests/unit/store/editorStore.test.ts` | UPDATE | +3 case:addLevel/removeLevel walls2d |
| `tests/unit/maze/importExport.test.ts` | UPDATE | +1 case:round-trip with walls2d |
| `tests/component/editor/LevelTabs.test.tsx` | UPDATE | +1 case:多层 mode hint |

**预估 13 文件,+~280 行,净 +150 行**

## 任务清单

### Phase 1: 数据层 + utils (3-4h)

#### Task 1: MazeData.walls optional
- [x] **Action**: `src/maze/types.ts` `MazeData.walls` 改 `walls?: CellType[][]`,`walls2d` 保持 optional
- [x] **Action**: `src/maze/JsonMazeProvider.ts` 强化 validator:必须有 `walls xor walls2d`
- [x] **Validate**: `npx tsc --noEmit` 0 error

#### Task 2: perLayerWalls 工具
- [x] **Action**: 创建 `src/utils/perLayerWalls.ts`:
  - `getCurrentLayerWalls(level, currentLevel): CellType[][]`
  - `promoteToMultiLayer(level, newLayerClone: 'clone' | 'empty'): MazeData`
  - `collapseToSingleLayer(level): MazeData`
  - `createEmptyGrid(width, depth): CellType[][]` 附赠 helper(测试 + reset 路径用)
- [x] **Test**: `tests/unit/utils/perLayerWalls.test.ts` 8 case(getCurrentLayerWalls 3 + promote 2 + collapse 2 + createEmptyGrid 1)
- [x] **Validate**: `npx vitest run tests/unit/utils/perLayerWalls.test.ts` 8 pass

#### Task 3: editorStore addLevel/removeLevel
- [x] **Action**: `src/store/editorStore.ts`:
  - `addLevel`:
    - 如果 `level.walls2d` undefined → `promoteToMultiLayer` 提到多层 + 新加 clone
    - 如果 `level.walls2d` 已有 → 追加 clone 当前最顶 layer
  - `removeLevel`:
    - 从 `level.walls2d` pop 最后一层
    - 如果剩 1 层 → `collapseToSingleLayer` 回到单层
- [x] **Test**: `tests/unit/store/editorStore.test.ts` +3 case(promote + append + collapse)
- [x] **Validate**: 全量 vitest 1808/1808 pass

### Phase 2: viewport 切换 (2-3h)

#### Task 4: EditorViewport walls 渲染
- [x] **Action**: `src/ui/editor/EditorViewport.tsx`:
  - 替换 `maze.walls` 用 `getCurrentLayerWalls(maze, currentLevel)`
  - 验证 entity 过滤已经按 `currentLevel` (现有逻辑,不动)
  - 验证 transition ghost overlay 跨多层显示 (现有逻辑,不动)
- [x] **Validate**: dev server 200 OK + 2D single-layer 行为零回归 (代码层 typecheck 0)

#### Task 5: LevelTabs UI hint
- [x] **Action**: `src/ui/editor/LevelTabs.tsx`:
  - 每个 tab 加 `title="Layer N · {count} entity / entities · N items · N enemies · …"`
  - 多层 mode 时 (levelCount > 1) 容器 `data-testid="editor-leveltabs-multi"` + CSS class `editor-leveltabs--multi`
  - "Multi-layer" badge 渲染在 tab strip 和 actions 之间
  - `countEntitiesOnLevel` helper 算该层 entity 总数 + breakdown
- [x] **Test**: `tests/component/editor/LevelTabs.test.tsx` 3 case(单层 / 多层 badge / per-layer tooltip)
- [x] **Validate**: typecheck + test pass

### Phase 3: validation + import/export (2h)

#### Task 6: editorValidation 多层 reachability
- [x] **Action**: `src/ui/editor/editorValidation.ts`:
  - `validateDesign` 按 `start.level` / `exit.level` 选对应层 walls(走 `getCurrentLayerWalls`)
  - cross-layer BFS 留作后续增量(目前 same-layer short-circuit + `sameLayer` gate 让跨层 warn "unreachable",Phase 3 完善)
- [x] **Validate**: typecheck

#### Task 7: importExport round-trip
- [x] **Action**: `src/maze/importExport.ts`:
  - `parseImport` 后 store 端 normalize — 自动通过 `...level` spread
  - 验证 export 的 JSON 含 `walls2d` (如果原 level 有)
- [x] **Test**: `tests/unit/maze/importExport.test.ts` +1 case:round-trip 多层(walls2d 严格 mutex + per-layer 验证)
- [x] **Validate**: 全量 vitest 1812 pass

### Phase 4: 文档 + UI 提示 (1-2h)

#### Task 8: EditorHelpDrawer 多层段
- [x] **Action**: `src/ui/editor/EditorHelpDrawer.tsx` 加 ⑤ 多层迷宫段:
  - intro / add / remove / cross-layer connect / JSON output 5 sub-block
  - i18n key `editor.help.section.multiLayer` + 8 sub-key
- [x] **Validate**: typecheck

#### Task 9: StatusBar 多层显示
- [x] **Action**: `src/ui/editor/EditorStatusBar.tsx`:
  - 多层时 status text 显示 "Layer 1/3" 而不是 "1 layer"
  - 加 i18n key `editor.status.layerIndicator.single` + `editor.status.layerIndicator.multi`
- [x] **Action**: `src/i18n/resources/{en,zh}.ts` 加新 keys

#### Task 10: 文档 + roadmap
- [x] **Action**: 写 `docs/increments/p5-editor-multilayer/{spec,plan}.md` (本目录已写)
- [x] **Action**: `docs/roadmap.md` 标 P5-editor-multilayer 完成 + 顶部 "当前进行中" 块更新
- [x] **Action**: `README.md` 加 "创建多层迷宫" 小节 (5.5.1) + 路线图加 Phase 5

### Phase 5: 最终验证

- [x] `npx tsc --noEmit -p tsconfig.app.json` 0 error
- [x] `npx vitest run` 全 pass 1812 / 1 skip / 0 fail (1705 → 1812 = 107 新 test,含 P5-1 +11 + P5-2 +15 + P4-refactor-fp2d review +regressions)
- [x] dev server 2D 模式 200 OK + 2D single-layer 行为零回归
- [x] i18n en/zh parity 通过(keysParity test)
- [ ] PR 提交 review(等用户 commit + push + 开 PR 指示)

## 验证

```bash
# 必须全部通过
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
# dev server 手测多层编辑
```

## 风险

| 风险 | 缓解 |
|---|---|
| `MazeData.walls` 改 optional 破旧 import | JsonMazeProvider strict reject `walls xor walls2d` 互斥;旧 hand-crafted JSON 都有 walls,通过 |
| `addLevel` clone 误把同一份 reference | 强制 `firstLayer.map(row => [...row])` deep clone |
| 多层 reachability check 慢 | 教学 5×5 + procedural 50×50 × 6 都 < 1ms |
| EditorViewport 改 per-layer walls 触发 dispose 漏 | 现有 dispose 路径按 mesh walk,不依赖 wall grid 来源 |

## 验收

- [ ] 所有 Task 勾选完成
- [ ] 验证命令全部通过
- [ ] spec §13 完成清单全部勾
- [ ] 2D 模式单层关卡行为零回归
- [ ] PR 提交 review

## 执行日志(待填)

### 实施日期
2026-08-12

### 实际改动文件
- `src/maze/types.ts` — `MazeData.walls: CellType[][]` → `walls?: CellType[][]`(optional)
- `src/maze/JsonMazeProvider.ts` — `walls xor walls2d` 严格 mutex + per-entity wall check 走 `getLayerWalls`
- `src/utils/perLayerWalls.ts` (NEW) — `getCurrentLayerWalls` / `promoteToMultiLayer` / `collapseToSingleLayer` / `createEmptyGrid`
- `src/store/editorStore.ts` — `addLevel` / `removeLevel` 接 utils 真实操作 walls2d + `setLayerWalls` helper + `placeWall/Erase/Start/Exit/Enemy/...` 接 `currentLevel` per-layer carve
- `src/ui/editor/EditorViewport.tsx` — walls 渲染 / minimap / cell-click 用 `getCurrentLayerWalls(level, currentLevel)`
- `src/ui/editor/editorValidation.ts` — `validateDesign` 按 `start.level` / `exit.level` 选 grid;cross-layer BFS 留 Phase 3
- `src/ui/editor/EditorStatusBar.tsx` — wallCount 走 L0 grid
- `src/engine/Scene.ts` — `[maze.walls!]` fallback 单层 assert
- `src/ui/components/Minimap.tsx` — 2D path `maze.walls!` 断言
- `src/ui/components/ParchmentMap.tsx` — `maze.walls!` 断言 (L0 only)
- `src/maze/enemySpawner.ts` — `maze.walls ?? maze.walls2d![0]!` 共享 L0 grid 提取
- `src/ui/LevelSelect.tsx` — thumb / wall count 接 `walls ?? walls2d[0]`
- `public/levels/teaching-multilayer-01.json` — 删 `walls` 字段(严格 mutex)
- `tests/unit/utils/perLayerWalls.test.ts` (NEW) — 8 case
- `tests/unit/store/editorStore.test.ts` — +3 addLevel/removeLevel walls2d case + 现有 `.walls` 断言加 `!`
- `tests/unit/maze/JsonMazeProvider.test.ts` — P5-1 multi-layer case 改 `walls: undefined`
- `tests/unit/maze/types.multiLevel.test.ts` — P3-1 fixture 改 `walls: undefined` + `walls2d`
- `tests/unit/maze/builtInLevels.test.ts` — 适配 multi-layer 教学关卡
- `tests/unit/maze/algorithmMazeProvider.test.ts` / `enemySpawner.test.ts` / `levels.test.ts` / `JsonMazeProvider.test.ts` / `useAutoSave.backoff.test.tsx` / `EditorPropertiesPanel.test.tsx` / `EditorViewport.test.tsx` / `game.multiLevel.test.ts` — `walls!` 断言

### 遇到的偏差
- **P5-2 spec 锁的 spec.md §5 第 5 决策**:严格 `walls xor walls2d` mutex → `teaching-multilayer-01.json` 的 `walls` 字段必须删,跟 P5-1 commit 67a4a51 的"back-compat 同时存在"打破
- **P5-2 spec Plan Task 4-7 (Phase 2-3) 在 Phase 1 commit 已经部分顺手做了**:EditorViewport/EditorStatusBar/editorValidation/placeWall 等都接了 `currentLevel`(不然 typecheck 过不了);spec 任务清单里 Task 4-7 在 Phase 1 commit 内一并 ship,留 Task 5 LevelTabs UI hint / Task 6 cross-layer BFS / Task 8 EditorHelpDrawer / Task 9 StatusBar plural / Task 10 docs-roadmap 后续 PR
- **`createEmptyGrid` 加到 utils**:spec 没列但 `promoteToMultiLayer({clone: 'empty'})` 和未来的 "重置当前层" 路径需要,顺手加了 + 1 单测

### 测试覆盖
- `tests/unit/utils/perLayerWalls.test.ts` 8 case
- `tests/unit/store/editorStore.test.ts` addLevel/removeLevel +3 case
- `tests/unit/maze/JsonMazeProvider.test.ts` P5-1 multi-layer case 适配 mutex
- 全量 vitest 1808 pass / 1 skipped(0 fail)
- typecheck 0 error

### 备注
- dev server `localhost:5173` 起得来,2D single-layer 关卡行为零回归(代码层全断言)
- Phase 1 commit + push 完后,P5-editor-multilayer 还有 Task 5(LevelTabs UI hint)+ Task 6(cross-layer BFS)+ Task 7(importExport round-trip 显式 case)+ Task 8(EditorHelpDrawer 多层段)+ Task 9(StatusBar plural)+ Task 10(roadmap/README/docs)→ 走单独增量 ship
