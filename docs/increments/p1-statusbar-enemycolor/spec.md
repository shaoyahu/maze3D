# P1-6/7 EditorStatusBar chip 扩展 + per-instance color damage flash — Spec

**Slug**: `p1-statusbar-enemycolor`
**状态**: draft → in-review → approved → done
**日期**: 2026-08-14
**对应路线图项**: P1 #6 + P1 #7 (P0 follow-up 候选池)
**依赖**: P5-2 editor multi-layer (P1-6) + P1-4 enemy humanoid (P1-7) + P2-18 transition (P1-6)
**复杂度**: Small (P1-6) + Medium (P1-7) — 2 task 合并 spec, 2 commit ship 1 PR

> 2 commit ship 节奏, 跟 P5-2 (b113218 + 867aa89) 一致.
> 候选池里 P1 #6 (S 2-3h) 和 P1 #7 (M 4-6h) 一起做, 减少 PR 数量.

## 1. 概述

P1-6 + P1-7 一起 ship:
- **P1-6 (S)**: EditorStatusBar 加 transition count chip + 多层关卡 per-layer entity 摘要 chip. 现有 chip (dirty/layer/warnings/walls/pickups/enemies) 没显示 P2-18 lock 的 transition 字段, 也没显示 P5-2 lock 的 multi-layer per-layer breakdown. 多层关卡 editor 现在只能 hover 每个 level tab 看 tooltip — 加 status bar 摘要让 designer 立刻看到整体 health.
- **P1-7 (M)**: P1-4 ship 时所有 enemy 共享 body/head/arms material (wall/pickup 共享 pattern). P1-7 改 body + arms material 为 per-enemy 实例, 让 chase state → enemy body 闪红 0.3s linear ramp. 跟 P1-4 Phase 2 FOV cone 红 + Phase 4 heartbeat 同步, 但 P1-7 是 body visual 不是 fovCone (player 在 fp3d 视角下低头看 enemy 看 body 颜色变化, 不只是 FOV cone).

## 2. 目标 / 非目标

### 目标
- P1-6.1: 加 `status-transitions` chip 显示 P2-18 transition count (always visible, 0 也显示)
- P1-6.2: 多层关卡加 per-layer entity 摘要 chip (Level X: pickups N · enemies M · transitions K)
- P1-7.1: enemy body + arms 改 per-enemy material 实例 (clone, not shared)
- P1-7.2: Game.update 每帧 sync chase state → body.material.color + emissive (patrol 0x553333 → chase 0xff0000, 0.3s linear ramp)
- P1-7.3: emit 0.5s linear ramp back to base on patrol/dwell (chase 退出渐隐)
- 2 task 都不破坏既有契约

### 非目标
- 不改 transition 创建 / 编辑 (P2-18 锁)
- 不改 enemy AI state machine (P3-1 锁)
- 不改 fovCone 行为 (P1-4 Phase 2 锁)
- 不改 minimap enemy 渲染 (P3-1 锁)
- 不加新 settings
- 不加新 pickup / trap / door 类型
- 不改 audio (P1-4 Phase 4 锁)
- 不改 head material (保持 shared, 颜色跟 state 无关)
- 不改 spec/plan.md 锁的决策
- 不改 walls2d mutex (P5-2 锁)

## 3. 用户故事

- 作为关卡设计者, 我希望在 status bar 看到 transition count (multi-layer 关卡关键指标, 现有 wall/pickup/enemy count 没显示)
- 作为关卡设计者, 我希望多层关卡在 status bar 看到 per-layer entity 摘要 (L0: 3e · L1: 1e, 一眼看全)
- 作为玩家, 我希望在 fp3d 视角下 enemy 进入 chase 状态时 body 颜色闪红 (跟 fovCone 红色 + heartbeat 同步, 视觉强化)
- 作为玩家, 我希望 chase 退出时 body 颜色渐回 base color (不要 punch out)

## 4. 功能需求

### FR-1: EditorStatusBar transition count chip (P1-6.1)
- F1.1: `status-transitions` chip 显示 `level.transitions.length`
- F1.2: 0 也显示 "0 transitions" (让 designer 立刻知道 "no transitions" 跟 "有 1 个 transition" 视觉一致)
- F1.3: 不在 LevelTabs tooltip 重复显示 (那里已经有了)
- F1.4: icon: `↕` (垂直转换, 跟 P2-18 transition 锁的概念一致)
- F1.5: 多层时 chip 加 `--accent` modifier 强调 (transitions 是多层关卡 feature)
- F1.6: i18n 2 key: `editor.status.transitions` / `editor.status.transitionsAria`

### FR-2: EditorStatusBar per-layer breakdown chip (P1-6.2)
- F2.1: `status-layer-breakdown` chip, multi-layer 关卡才显示 (`levelCount > 1`)
- F2.2: 单层时 hidden (避免冗余 — 现有 wall/pickup/enemy chip 已经覆盖单层)
- F2.3: 文本: `L0: 3·1·0·0  L1: 0·2·0·0` (格式: `Lx: enemy·pickup·trap·door·transition`, 紧凑)
- F2.4: tooltip 显示完整 breakdown: `Layer 0: 3 enemies, 1 pickup, 0 traps, 0 doors, 0 transitions / Layer 1: 0 enemies, 2 pickups, 0 traps, 0 doors, 0 transitions` (跟 LevelTabs tooltip 类似)
- F2.5: i18n 2 key: `editor.status.layerBreakdown` / `editor.status.layerBreakdownTooltip`
- F2.6: 复用 `LevelTabs.countEntitiesOnLevel` 逻辑 (单 source of truth)

### FR-3: enemy per-enemy material instance (P1-7.1)
- F3.1: `bodyMat` / `armMat` 在 buildScene 的 enemy loop 改 per-enemy 实例 (`bodyMat.clone()` per enemy)
- F3.2: `headMat` 保持 shared (颜色 0x886666 跟 state 无关, 不需要 per-instance)
- F3.3: shared geometry 保持不变 (bodyGeom / headGeom / armGeom 仍 shared, P1-4 锁的 4 geometry 优化不变)
- F3.4: disposeScene 自动 walk scene graph 释放 per-enemy material (无新 dispose code)
- F3.5: 50 enemy 仍 4 geometry + 1 shared headMat + 100 (50 body + 50 arm) materials — 比 P1-4 多 50 material, GPU 内存可控

### FR-4: per-instance color chase flash (P1-7.2 / 7.3)
- F4.1: Game.update 每帧 sync enemy.state → body.material.color + emissive
- F4.2: patrol/dwell: body color 0x553333 (base, P1-4 锁), emissive 0x000000
- F4.3: chase: body color 0xff0000 (red), emissive 0x331111 (subtle glow)
- F4.4: 0.3s linear ramp (chase 进入) + 0.5s linear ramp (chase 退出回 base)
- F4.5: arm material 跟 body 同步 (都是 enemy "body silhouette" part)
- F4.6: 跨层 enemy (Phase 3 锁的 group.visible=false) 不参与 ramp (没必要)
- F4.7: 实现: 不引 new tween 库, Game.update 维护 enemy colorRamp state (类似 activeTransition), 简单 lerp

## 5. 数据 / 类型变更

### 新增 Enemy 字段 (P1-7.4 ramp state)
- `enemy.colorRamp: { startMs: number, endMs: number, fromColor: Color, toColor: Color } | null`
- 跟 activeTransition 一样, in-flight 时 lerp, 完成时 clear

### 不变的字段
- `MazeData.walls2d` (P3-1 锁)
- `MazeData.transitions` (P2-18 锁)
- `MazeData.enemies` shape (P2-4a 锁)
- `EnemySpawn` 所有字段
- `Enemy` 状态机
- `levelCount: 1..6` (P3-1 锁)
- `walls xor walls2d` mutex (P5-2 锁)

## 6. 引擎 / 架构影响

### 受影响文件
| 文件 | 改动类型 | 说明 |
|---|---|---|
| `src/ui/editor/EditorStatusBar.tsx` | UPDATE | 加 transition chip + per-layer breakdown chip |
| `src/i18n/resources/en.ts` | UPDATE | 4 个新 key |
| `src/i18n/resources/zh.ts` | UPDATE | 4 个新 key |
| `src/engine/Scene.ts` | UPDATE | enemy body + arms 改 per-enemy material clone |
| `src/engine/Game.ts` | UPDATE | 加 enemy.colorRamp 字段 + 每帧 sync |
| `src/entities/Enemy.ts` | UPDATE | 加 colorRamp 字段 + helper |
| `tests/component/editor/EditorStatusBar.test.tsx` | UPDATE | 加 transition + breakdown chip test |
| `tests/unit/engine/enemyRendering.test.ts` | UPDATE | 加 per-enemy material test |
| `tests/unit/engine/Game.enemyColor.test.ts` | NEW | colorRamp 行为 test |

### 边界检查
- 引擎层继续不 `import` react / zustand
- per-enemy material 仍是 Standard, disposeScene walk scene graph 释放
- 跨层 enemy colorRamp 不参与 (group.visible=false 已隐藏, 玩家看不到)
- audit grep 没动 (P0 #3 锁)

## 7. UI / UX 变更

### EditorStatusBar 新增
- 现有: `[✓ saved] [▤ Layer 1/3] [⚠ 0 warnings] [▦ 5 walls] [✦ 0 pickups] [◉ 0 enemies]`
- P1-6 后: `[✓ saved] [▤ Layer 1/3] [↕ 2 transitions] [⚠ 0 warnings] [▦ 5 walls] [✦ 0 pickups] [◉ 0 enemies]`
- P1-6 多层后: `[✓ saved] [▤ Layer 1/3] [↕ 2 transitions] [L0: 3·1·0  L1: 0·2·0] [⚠ 0 warnings] [▦ 5 walls] [✦ 0 pickups] [◉ 0 enemies]`

### 玩家视觉 (P1-7)
- patrol enemy: body 0x553333 暗红 (P1-4 锁的 base)
- chase enemy: body 0xff0000 红 + emissive 0x331111 微 glow
- 进入 chase: 0.3s linear ramp (0x553333 → 0xff0000)
- 退出 chase: 0.5s linear ramp (0xff0000 → 0x553333)

## 8. 错误处理

### 兜底行为
- transition count 跟 `level.transitions?.length ?? 0` 兼容 (P2-18 锁之前关卡无 transitions 字段, lenient default 0)
- per-enemy material clone 失败 → enemy 仍逻辑运行, body 不变色 (silent fallback)
- colorRamp 完成时自动 clear (no leak)

## 9. 测试策略

### 单元测试
- `tests/component/editor/EditorStatusBar.test.tsx` +2 case:
  - transition chip 渲染 count
  - multi-layer 时 breakdown chip 渲染 + 单层时不渲染
- `tests/unit/engine/enemyRendering.test.ts` +1 case: per-enemy bodyMat 是不同时钟的 material instance (not shared)
- `tests/unit/engine/Game.enemyColor.test.ts` (NEW) +3 case:
  - patrol → body color 0x553333
  - chase → body color 0xff0000 + emissive
  - chase → patrol → 0.5s ramp back

### 性能
- 50 enemy × 100 material (50 body + 50 arm) → 比 P1-4 多 50 material, GPU 内存可控 (~10KB)
- 50 enemy × colorRamp 字段 → 50 个 ramp state, 每帧 check + lerp, 简单 CPU work
- 跨层 enemy 跳过 (Phase 3 锁的 group.visible 已 early-exit)

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| per-enemy material 内存涨 | 低 | 50 enemy × 2 materials = 100 materials, ~10KB, commodity hardware 1k draw call budget 仍 OK |
| colorRamp 计算错误导致 enemy 永久红色 | 中 | 完成时 clear null + 每帧 check (跟 activeTransition 模式一致) |
| EditorStatusBar 加 chip 影响布局 | 低 | 现有 chip 间距 OK, 2 个新 chip 横向排列, mobile 端 wrap 自然 |
| 跟 P1-4 Phase 2 FOV cone 红混淆 | 低 | FOV cone 是 decal pattern (player 远看), body 是 PBR (player 近看), 视觉清晰区分 |
| transition count 跟 P2-18 JSON validator 数字不一致 | 低 | 用 `level.transitions.length` (runtime shape), validator 用 same shape (P2-18 锁) |

## 11. 完成清单 (dod)

### 11.1 功能验收
- [ ] FR-1 transition count chip
- [ ] FR-2 per-layer breakdown chip
- [ ] FR-3 per-enemy material instance
- [ ] FR-4 per-instance color chase flash

### 11.2 引擎 / 架构边界
- [ ] 引擎层继续不 `import` react / zustand
- [ ] 公开 API 不破坏 (EditorStatusBar / Enemy 不改 signature)
- [ ] mutex 保持 (walls xor walls2d)

### 11.3 测试
- [ ] 单元测试覆盖率 ≥80%
- [ ] +6 新 test (2 EditorStatusBar + 1 enemyRendering + 3 Game.enemyColor)
- [ ] `npm run typecheck` 与 `npm run build` 通过
- [ ] pre-commit audit 没报 (P0 #3 锁)

### 11.4 文档
- [ ] `docs/increments/p1-statusbar-enemycolor/spec.md` 已写
- [ ] `docs/increments/p1-statusbar-enemycolor/plan.md` 已写

### 11.5 持久化与兼容
- [ ] 不破坏 localStorage schema
- [ ] 不新增 settings
- [ ] P2-18 之前关卡 (无 transitions 字段) 仍兼容

### 11.6 安全与健壮性
- [ ] typecheck 0 error
- [ ] 0 console.log 残留
- [ ] colorRamp 状态机 null 终止

## 12. 参考

- P5-2 锁: walls xor walls2d mutex + per-layer breakdown (LevelTabs tooltip)
- P2-18 锁: transitions 字段 + count
- P1-4 锁: enemy 共享 material 模式 (本次破例改 per-enemy)
- P1-4 Phase 2 锁: FOV cone 颜色 (跟 body 颜色协同)
- P1-4 Phase 3 锁: 跨层 enemy 隐藏 (colorRamp 跳过)
- P3-1 锁: levelCount 1..6 + 跨层 collision
- P2-4a 锁: Enemy 状态机 (patrol/dwell/chase)
- P0 #3 锁: pre-commit grep audit
- activeTransition 模式 (P3-1) 复用做 colorRamp 状态机
