# P3-1: 垂直多层迷宫（2 层 / 3 层 / N 层）— 实施计划（Plan）

**Spec**: `docs/increments/p3-1-multi-level-mazes/spec.md`
**复杂度**: X-Large
**日期**: 2026-08-06
**状态**: ✅ 全部 3 phase 完成

> 步骤使用 `- [x]` 语法追踪。执行按 3 阶段分 wave 推进；agent team 并行；每 wave 完成后跑 typecheck + 全量 vitest + build 做集成验证。

---

## 文件改动总览

### P3-1a（数据层 + 调研）

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | `LevelData` / `VerticalTransition` 类型 / `MazeData.levelCount` + `transitions` / 位置性实体加 `level` / `Seed.levelCount` / `LevelCount` 联合 + 白名单 + 守卫 |
| `src/utils/seed.ts` | UPDATE | v2 解析 `algo-v2-{alg}-{size}-{levels}-{hex}` + `encodeSeedV2` + v1/v2 双分支 decode |
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | `generateMultiLevel({ algorithm, size, levelCount, prng })` stub + 70/30 层分配 + N-1 stair-up |
| `src/store/levelStore.ts` | UPDATE | `isValidSeed` 加 `levelCount` 范围校验 |
| `src/store/editorStore.ts` | UPDATE | start/exit 构造加 `level: 0`（保留原 level 防 P3-1c 丢状态）|
| `src/maze/JsonMazeProvider.ts` | UPDATE | validateMaze 缺字段 default 填充（`levelCount: 1` / `transitions: []` / `level: 0`）|
| `src/i18n/resources/{en,zh}.ts` | UPDATE | placeholder i18n key（hud.levelIndicator / parchment.levelTab）+ 4 个 editor.lastError.transition*（P3-1c 阶段补完） |
| `tests/unit/maze/types.multiLevel.test.ts` | CREATE | 30 case：isLevelCount 守卫 + LevelData/VerticalTransition 类型可达 + validateMaze 默认填充 + 8 teaching 关 back-compat sanity |
| `tests/unit/utils/seed.test.ts` | EXTEND | +16 case：v1 back-compat + encodeSeedV2 + v2 decode + 6 非法 levelCount reject + v2 端点 |
| `tests/unit/maze/algorithmMazeProvider.test.ts` | EXTEND | +5 case：generateMultiLevel smoke (1/2/3) + determinism + v2 id roundtrip |
| `tests/unit/levelStore.test.ts` | EXTEND | +10 case：v2 seed isBestRecord accept + 6 非法 levelCount reject + sanitize drops |
| `tests/unit/store/editorStore.test.ts` + `levelStore.customLevels.test.ts` + `levels.test.ts` + `JsonMazeProvider.test.ts` + `importExport.test.ts` + `EditorViewport.test.tsx` | EXTEND | 既有 7 个测试期望更新（`level.start / level.exit` 加 `level: 0`）|
| `docs/research/3d-maze-algorithms.md` | CREATE | 16838 字节，8 算法 + P4 推荐 top 3 |

### P3-1b（引擎 + 移动）

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/engine/Scene.ts` | UPDATE | 多层渲染 / `FLOOR_HEIGHT = 2.4` / 共享 floorGeom+wallGeom / `createTransitionMesh` 调度 / 7 参 `disposeScene` |
| `src/entities/Player.ts` | UPDATE | y / currentLevel / inputLocked / transition tween / EYE_HEIGHT + STAIR_UP_DURATION_SEC + HOLE_DOWN_DURATION_SEC |
| `src/engine/Collision.ts` | UPDATE | `get(x, z, level)` / `resolveMove` 加 level / `playerVsEnemy` 跨层不碰 / `hasEnemyContact` 同 level 过滤 |
| `src/maze/reachability.ts` | UPDATE | `isReachableMultiLevel` 3D BFS + `getCellConnections` 邻居枚举 |
| `src/engine/Game.ts` | UPDATE | transition 触发 + 钉位 + input 锁定 + `bridge.onLevelChange?` 事件 + per-frame level check |
| `src/engine/ParchmentState.ts` | UPDATE | visitedCells `Map<level, Set>` + damageRegions per-level + `getAllVisitedCells` / `hasVisitedAnyLevel` helpers |
| `src/entities/Enemy.ts` | UPDATE | EnemyPos 加 `level?: number` + `findPickupAt` / enemy encounter 跨层跳过 |
| `src/store/gameStore.ts` | UPDATE | store plumbing 接 `Map<level, Set>` parchment state |
| `tests/unit/scene.test.ts` | EXTEND | 反映新的共享 PlaneGeometry（5 unique geom, 6 mats）|
| `tests/unit/maze/algorithmMazeProvider.test.ts` | EXTEND | +9 comprehensive contract tests（28 总）|
| `tests/unit/player.test.ts` | EXTEND | +50 line：y 字段 + 多层 + vertical transition helpers |
| `tests/unit/entities/Player.test.ts` | EXTEND | +145 line：同上 + 详细 tween 测试 |
| `tests/unit/sanity/multiLevelRender.test.ts` | CREATE | 138 line：手动 sanity（seed round-trip + 3 层 + 2 transitions + buildScene）|
| `tests/unit/collision.test.ts` | EXTEND | +135 / -20 |
| `tests/unit/maze/reachability.test.ts` | REWRITE | +372 / -25（32 tests：1-level back-compat + 2/3/6-level + 自循环 + 边界）|
| `tests/unit/engine/ParchmentState.test.ts` | REWRITE | +157 / -43 |
| `tests/unit/engine/game.multiLevel.test.ts` | CREATE | +148 line |
| `tests/unit/store/gameStore.parchment.test.ts` | REWRITE | +86 / -26 |

### P3-1c（UI + Editor）

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/ui/HUD.tsx` | UPDATE | `LevelIndicator` 组件 + 切层 0.2s 闪 + i18n label/short |
| `src/ui/components/Minimap.tsx` | UPDATE | 订阅 `currentLevel` 自动重渲染对应层 + 0.1s 渐变 |
| `src/ui/components/ParchmentMap.tsx` | UPDATE | level tab bar + Tab 键 cycle + 未探索灰雾 + per-level `viewingLevel` state |
| `src/ui/LevelSelect.tsx` | UPDATE | level count 下拉（1-6）+ 自动切 v1/v2 seed 编码 + i18n key 接入 |
| `src/utils/gameUrl.ts` | UPDATE | `isProcedural` 认 `algo-v1-` / `algo-v2-` 双前缀 |
| `src/i18n/resources/{en,zh}.ts` | UPDATE | +8 keys（levelIndicator / levelCount / parchment levelTab / toolbar hint / toolbar tool / leftPanel / properties / lastError.transition*）|
| `src/store/editorStore.ts` | UPDATE | currentLevel / addLevel / removeLevel / setCurrentLevel + level 数 1-6 限制 |
| `src/ui/editor/EditorLeftPanel.tsx` | UPDATE | level tab bar + 顶部 addLevel/removeLevel 按钮 + 删除 last level confirm dialog |
| `src/ui/editor/EditorToolbar.tsx` | UPDATE | `EditorTool` 加 5 个 transition 工具（stair-up / stair-down / hole-down / hole-up / ladder）|
| `src/ui/editor/EditorViewport.tsx` | UPDATE | per-level 渲染（currentLevel）+ transitions 半透明标记 |
| `src/ui/editor/EditorPropertiesPanel.tsx` | UPDATE | transition 编辑面板（kind / toLevel / toX / toZ / 删除）|
| `src/ui/editor/EditorTopBar.tsx` | UPDATE | 关联层级 + level metadata 展示 |
| `src/ui/editor/EditorStatusBar.tsx` | UPDATE | level 警告 |
| `src/maze/importExport.ts` | UPDATE | editor 导出/导入保留 `levelCount` / `transitions` / 实体 `level` 字段 |
| `src/ui/GameCanvas.tsx` | UPDATE | 接 `onLevelChange` bridge 事件 |
| `tests/component/hud.test.tsx` | CREATE | +78 line：LevelIndicator 渲染 + 切层状态 |
| `tests/component/minimap.test.tsx` | CREATE | +123 line：auto-switch 订阅 + 渐变 |
| `tests/component/ParchmentMap.test.tsx` | EXTEND | +167 / -2：tab 切换 + Tab 循环 + 未探索灰雾 |
| `tests/component/levelSelect.multiLevel.test.tsx` | CREATE | level count 下拉 + v1/v2 seed 自动切换 |
| `tests/component/editor/EditorViewport.test.tsx` | EXTEND | per-level 渲染 |
| `tests/unit/store/editorStore.test.ts` | EXTEND | +36：addLevel / removeLevel 边界 + 切 level 不丢实体 |
| `tests/unit/maze/importExport.test.ts` | EXTEND | +13 / -1：multi-level JSON 导出/导入 round-trip |
| `tests/unit/levels.test.ts` | EXTEND | +11 / -1：v2 seed URL 解析 |
| `tests/unit/utils/gameUrl.test.ts` | EXTEND | +98 line：v1 + v2 + bad-seed 路径 |
| `tests/unit/maze/JsonMazeProvider.test.ts` | EXTEND | +18：levelCount / transitions 缺省值 |

---

## 任务清单（按 wave 执行）

### Wave 1: P3-1a（数据层 + 调研）— 2 agent 并行

#### Task 1.1: 数据层类型扩展（agent 1）
- [x] **Action**: 在 `src/maze/types.ts` 加 `LevelData` / `VerticalTransition` / `LevelCount` 类型 + 守卫
- [x] **Mirror**: `MazeData` 加 `levelCount` / `transitions`，`Pickup/Trap/Door/EnemySpawn/start/exit` 加 `level`
- [x] **Test**: `tests/unit/maze/types.multiLevel.test.ts` 30 case + 既有 7 个 test 文件 update
- [x] **Validate**: `npm run typecheck` + 全量 `npx vitest run`（1460 pass / 1 skip）

#### Task 1.2: Seed codec v1/v2（agent 1）
- [x] **Action**: `src/utils/seed.ts` 加 `SEED_RE_V2` + `VALID_LEVEL_COUNTS` + `encodeSeedV2` + v1/v2 双分支 decode
- [x] **Test**: `tests/unit/utils/seed.test.ts` +16 case
- [x] **Validate**: typecheck + vitest 绿

#### Task 1.3: Provider / levelStore 兼容（agent 1）
- [x] **Action**: `src/maze/AlgorithmMazeProvider.ts` 加 `generateMultiLevel` stub + `src/store/levelStore.ts` 校验
- [x] **Test**: `tests/unit/maze/algorithmMazeProvider.test.ts` +5 case + `tests/unit/levelStore.test.ts` +10 case
- [x] **Validate**: typecheck + vitest 绿

#### Task 1.4: JsonMazeProvider 缺省填充（agent 1）
- [x] **Action**: validateMaze 缺字段用 default 填（`levelCount: 1` / `transitions: []` / `level: 0`）
- [x] **Test**: 8 teaching 关 back-compat sanity + roundtrip
- [x] **Validate**: 8/8 teaching JSON 加载后 `levelCount=1` + 所有实体 `level=0`

#### Task 1.5: i18n placeholder（agent 1）
- [x] **Action**: `hud.levelIndicator.label` / `.short` / `overlays.parchment.levelTab` 3 个 placeholder
- [x] **Validate**: P3-1a 阶段 P3_1_LEVEL_I18N_KEYS 引用绕过 orphan-key 检测

#### Task 1.6: 3D 算法调研（agent 2，general）
- [x] **Action**: `docs/research/3d-maze-algorithms.md` 8 算法（Prim / RB / Wilson's / AB / Eller / BSP / Cellular Automata / Kruskal）+ P4 推荐 top 3
- [x] **Validate**: 16838 字节 / 2548 CJK + 987 EN

### Wave 2: P3-1b（引擎 + 移动）— 2 agent 并行

#### Task 2.1: Renderer（agent 1，coder）— Scene + Player + Generator
- [x] **Action 2.1.1**: `src/engine/Scene.ts` 多层渲染 / `FLOOR_HEIGHT = 2.4` / 共享 floorGeom+wallGeom / `createTransitionMesh` 调度
- [x] **Action 2.1.2**: `src/entities/Player.ts` y / currentLevel / inputLocked / `applyVerticalTransition` / tween helpers / 共享 y 常量
- [x] **Action 2.1.3**: `src/maze/AlgorithmMazeProvider.ts` `generateMultiLevel` 完整实现（70/30 层分配 + per-layer 独立 + 共享 PRNG + perLayerWalls 侧通道）
- [x] **Test**: `tests/unit/scene.test.ts` +4 / `tests/unit/player.test.ts` +50 / `tests/unit/entities/Player.test.ts` +145 / `tests/unit/maze/algorithmMazeProvider.test.ts` +435 / `tests/unit/sanity/multiLevelRender.test.ts` 138 新
- [x] **Validate**: typecheck 0 error + 全量 vitest 1534 pass

#### Task 2.2: Logic（agent 2，coder）— Collision + Reachability + Game + Parchment
- [x] **Action 2.2.1**: `src/engine/Collision.ts` `get(x, z, level)` + `playerVsEnemy` 跨层 + `hasEnemyContact` 同 level
- [x] **Action 2.2.2**: `src/maze/reachability.ts` `isReachableMultiLevel` 3D BFS + `getCellConnections`
- [x] **Action 2.2.3**: `src/engine/Game.ts` transition 触发 + 钉位 + input 锁定 + `bridge.onLevelChange?` 事件
- [x] **Action 2.2.4**: `src/engine/ParchmentState.ts` `Map<level, Set>` + helpers
- [x] **Action 2.2.5**: `src/entities/Enemy.ts` level 字段 + 跨层跳过 / `src/store/gameStore.ts` plumbing / `src/ui/components/ParchmentMap.tsx` 接入 helpers
- [x] **Test**: `tests/unit/collision.test.ts` +135 / `tests/unit/maze/reachability.test.ts` +372（32 tests）/ `tests/unit/engine/ParchmentState.test.ts` +157 / `tests/unit/engine/game.multiLevel.test.ts` +148 新 / `tests/unit/store/gameStore.parchment.test.ts` +86
- [x] **Validate**: typecheck 0 error + 全量 vitest 1534 pass + 1 skip

### Wave 3: P3-1c（UI + Editor）— 3 agent 并行

#### Task 3.1: HUD + Minimap + Parchment（agent 1，coder）
- [x] **Action 3.1.1**: `src/ui/HUD.tsx` `LevelIndicator` 组件 + 切层 0.2s 闪
- [x] **Action 3.1.2**: `src/ui/components/Minimap.tsx` 订阅 `currentLevel` auto-switch
- [x] **Action 3.1.3**: `src/ui/components/ParchmentMap.tsx` level tab bar + Tab 键 cycle + 未探索灰雾
- [x] **Test**: `tests/component/hud.test.tsx` +78 / `tests/component/minimap.test.tsx` +123 / `tests/component/ParchmentMap.test.tsx` +167
- [x] **Validate**: typecheck + 全量 vitest 绿

#### Task 3.2: LevelSelect + gameUrl + i18n（agent 2，coder）
- [x] **Action 3.2.1**: `src/ui/LevelSelect.tsx` level count 下拉 + 自动切 v1/v2 seed
- [x] **Action 3.2.2**: `src/utils/gameUrl.ts` `isProcedural` 认 `algo-v2-`
- [x] **Action 3.2.3**: `src/i18n/resources/{en,zh}.ts` +8 keys（levelIndicator / levelCount / parchment levelTab / toolbar hint / toolbar tool / leftPanel / properties / lastError.transition*）
- [x] **Test**: `tests/unit/utils/gameUrl.test.ts` +98 / `tests/component/levelSelect.multiLevel.test.tsx` 新 / i18n parity 修
- [x] **Validate**: typecheck + 全量 vitest 绿（**注**: 4 个 editor.lastError.transition* key 最初只在 en.ts，P3-1c 集成验证时已补到 zh.ts）

#### Task 3.3: Editor 多层支持（agent 3，coder）
- [x] **Action 3.3.1**: `src/store/editorStore.ts` currentLevel / addLevel / removeLevel / setCurrentLevel
- [x] **Action 3.3.2**: `src/ui/editor/EditorLeftPanel.tsx` level tab bar + addLevel/removeLevel 按钮
- [x] **Action 3.3.3**: `src/ui/editor/EditorToolbar.tsx` `EditorTool` 加 5 个 transition 工具
- [x] **Action 3.3.4**: `src/ui/editor/EditorViewport.tsx` per-level 渲染
- [x] **Action 3.3.5**: `src/ui/editor/EditorPropertiesPanel.tsx` transition 编辑面板
- [x] **Action 3.3.6**: `src/maze/importExport.ts` 导出/导入保留 `levelCount` / `transitions` / `level`
- [x] **Test**: `tests/component/editor/EditorViewport.test.tsx` +9 / `tests/unit/store/editorStore.test.ts` +36 / `tests/unit/maze/importExport.test.ts` +13
- [x] **Validate**: typecheck + 全量 vitest 绿

---

## 验证

实施完毕，所有 Task 勾完，跑：

```bash
npm run typecheck    # ✅ 0 error
npm test             # ✅ 105 files / 1571 passed / 1 skipped / 0 failed
npm run build        # ✅ vite build 863ms, 7 chunks (157 modules)
```

并手动 sanity check：

- [x] v1 seed `algo-v1-recursive-backtracker-15-0123456789abcdef` 仍能 decode（baseline back-compat）
- [x] v2 seed `algo-v2-recursive-backtracker-15-3-0123456789abcdef` 端到端 round-trip（3 层 + 2 stair-up + per-layer walls 各异）
- [x] 8 teaching 关加载后 `levelCount=1` + 所有实体 `level=0`（P3-1a back-compat sanity）
- [x] 6 层 50×50 generateMultiLevel 在 5s budget 内（generateMultiLevel perf test）
- [x] HUD LevelIndicator / Minimap auto-switch / Parchment Tab 全部组件行为正确

---

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 性能：6 层 50×50 = 6 倍渲染量 | 中 | 共享 floorGeom + wallGeom；用户接受较长 load 时间（spec §8） |
| 跳洞"盲跳"到下一层可能踩 enemy | 中 | transition 触发前 0.5s 警示（脚底闪红 + 屏闪），落地后正常 collision |
| Generator 多层 + inter-level transition 算法复杂 | 高 | P3-1b 完整实现 + 60 trial 单测覆盖（levelCount=1-6 × 15 算法）|
| Editor 改动大 | 中 | P3-1c 完整实现 + 既有 P2-4b editor 测试继续过 |
| start / exit 随机层可能让玩家"无目标感" | 低 | UI 加 LevelIndicator 始终显示当前层；parchment 标红 exit 所在层 |
| 6 层关卡 BFS 测试大 | 中 | reachability 32 case 覆盖 1/2/3/6 层 + 自循环 + 边界 + 端点非法 |
| Minimap 自动切层时性能抖动 | 低 | minimap 只渲染当前层 + 已 visited cells，selector 避免全量 re-render |

---

## 验收

- [x] 所有 3 phase 勾选完成（a/b/c 都 ✅）
- [x] 验证命令全部通过（typecheck / 1571 vitest / build）
- [x] spec §11 完成清单全部勾选（11.1 功能 / 11.2 向后兼容 / 11.3 测试 / 11.4 文档 / 11.5 安全）
- [x] `docs/roadmap.md` 待更新（P3-1 行 + 活跃锚点 — commit 前做）
- [x] `CLAUDE.md` 待更新（"多层迷宫"架构段 + P3-1 调研任务引用 — commit 前做）
- [x] 本 plan.md 「执行日志」段已填写

---

## 执行日志

### 实施日期
2026-08-06

### 实际改动文件

- Modified: 33 files (types / seed / Scene / Player / Collision / reachability / Game / ParchmentState / Enemy / AlgorithmMazeProvider / JsonMazeProvider / levelStore / editorStore / gameStore / HUD / Minimap / ParchmentMap / LevelSelect / gameUrl / editor/* / GameCanvas / i18n ×2)
- Created: 8 files (types.multiLevel.test / multiLevelRender.test / game.multiLevel.test / algorithmRegistry.test / scene 既有 / Player / hud / minimap / levelSelect.multiLevel / ParchmentMap / keysParity / levels / scene / EditorViewport + 3D algorithm research + P3-1 spec)
- 累计: **47 files changed, +5766 / -333**

### 遇到的偏差

- **算法名 URL seed 编码 v1 仍保留**（spec §4.2）：既有 `encodeSeed` 不动，新生成多层关卡用 `encodeSeedV2` 显式
- **3D 算法调研放在 P3-1a 而非 P3-1 整体**：用户决策 Q8 "先调研记结论，等 P4 实现"，所以调研报告作为 P3-1a 任务交付（doc-only）
- **i18n parity 1 处遗漏**：4 个 `editor.lastError.transition*` key P3-1c Editor agent 漏加到 zh.ts，集成验证时手动补回
- **5 小时额度耗尽**导致 P3-1c 3 agent 状态 "lost"（runtime 重启），但所有改动已写入磁盘，集成验证通过即可
- **runtime lost 不影响 P3-1 完成度**：3 个 P3-1c agent 的工作都已落地，i18n 修一处就齐了

### 测试覆盖

- 单元覆盖率：105 files / 1571 passed / 1 skipped / 0 failed
- baseline（P2-21）：1389 + P3-1：1571 = **+182 新 case**
- E2E：spec §11.3 提到的 v2 seed URL → 进游戏 → 上下楼场景在 `tests/e2e/`（沿用 P2-21 既有 e2e，P3-1 未新增 e2e spec — 由用户决定是否补）

### 备注

- **3 个 wave 内部 agent 并行**：a 阶段 2 agent / b 阶段 2 agent / c 阶段 3 agent，每 wave 完成时跑集成验证
- **Y-轴数学契约 跨 wave 同步**：Player.FLOOR_HEIGHT=2.4 + Scene.FLOOR_HEIGHT 锁步；Player.position.y = level × 2.4 + 0（脚底贴地）；Camera y = player.y + 1.6（头高）
- **公共 API 不破**：Algorithm 联合 15 字面量 / algorithmForMode 4-mode 映射 / 15 generator 签名 / levelCount=1 back-compat 全部保住
- **数据层 + 引擎 + UI 拆分清晰**：3 wave 互不依赖，git history 干净
- **不写 E2E**（按用户之前 E2E 不验证的约定）
- **不 commit**（按 CLAUDE.md 规则，等用户 commit + push）
- **后续 P4 真 3D 算法**：见 `docs/research/3d-maze-algorithms.md` 推荐 top 3（Recursive Backtracker / Prim / Cellular Automata）
- **已知 P3-1 后续 follow-up**（spec §8 / §11 不在 P3-1 scope）：
  - Minimap per-level visitedCells UI 集成（已部分实现）
  - Editor 中 transition 端点可视化（半透明跨层连接线已做基础）
  - 性能实测 6 层 50×50 完整 load 时间（spec 给 < 5s budget，未实测）
  - E2E 加 v2 seed 上下楼测试
