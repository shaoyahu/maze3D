# P1-4 3D enemy AI fp3d — Plan

**Spec**: `docs/increments/p1-enemy-fp3d/spec.md`
**复杂度**: Large (8-12h, 4 phase)
**日期**: 2026-08-13

> 4 phase ship 节奏: 每 phase 1 commit + 1 review. Phase 1 视觉是地基, Phase 2-4 叠加.
> 1 PR 4 commit 模式.

## 文件改动总览

| 文件 | 操作 | Phase | 原因 |
|---|---|---|---|
| `docs/increments/p1-enemy-fp3d/spec.md` | CREATE | - | spec |
| `docs/increments/p1-enemy-fp3d/plan.md` | CREATE | - | plan |
| `src/engine/Scene.ts` | UPDATE | 1, 2, 3 | enemy mesh 升级 + FOV cone + 跨层 visible |
| `src/engine/Game.ts` | UPDATE | 2, 3 | 每帧 sync enemy state + onLevelChange resync |
| `src/engine/Audio.ts` | CREATE | 4 | WebAudio heartbeat + footsteps |
| `src/store/settingsStore.ts` | UPDATE | 4 | 加 audio.chaseHeartbeat / enemyFootsteps |
| `src/ui/Settings.tsx` | UPDATE | 4 | 加 2 个 audio toggle |
| `src/i18n/resources/en.ts` | UPDATE | 4 | 加 2 个 audio label |
| `src/i18n/resources/zh.ts` | UPDATE | 4 | 加 2 个 audio label |
| `tests/unit/engine/enemyRendering.test.ts` | CREATE | 1 | 5 子 mesh 验证 |
| `tests/unit/engine/fovCone.test.ts` | CREATE | 2 | state → opacity 映射 |
| `tests/unit/engine/crossLayerEnemy.test.ts` | CREATE | 3 | playerLevel 切换 → visible 切换 |
| `tests/unit/engine/Audio.test.ts` | CREATE | 4 | heartbeat 间隔 + footstep 触发 |
| `tests/component/Settings.audio.test.tsx` | CREATE | 4 | audio toggle 组件测试 |

## 任务清单

### Commit 1: Phase 1 - enemy 视觉升级 (2-3h)

- [ ] **Action 1.1**: `src/engine/Scene.ts` enemy mesh 改 5 子 mesh group (body capsule + head sphere + armL/R capsule)
- [ ] **Action 1.2**: MeshStandardMaterial 替代 MeshLambertMaterial (roughness 0.7, metalness 0.1)
- [ ] **Action 1.3**: castShadow + receiveShadow 都 true
- [ ] **Action 1.4**: `SceneRefs.enemies` 改 `THREE.Group[]`
- [ ] **Action 1.5**: disposeScene 释放 group 内所有子 mesh
- [ ] **Test**: `tests/unit/engine/enemyRendering.test.ts` (5 子 mesh + material + shadow flag)
- [ ] **Validate**: `npx tsc --noEmit && npx vitest run`
- [ ] **Commit 1**: `feat(p1-enemy-fp3d): Phase 1 — enemy 视觉升级 humanoid + PBR + shadow`

### Commit 2: Phase 2 - FOV cone 可视化 (2-3h)

- [ ] **Action 2.1**: enemy group 加 fovCone child (cone geometry, state-based material)
- [ ] **Action 2.2**: `Game.update` 每帧 sync enemy.state → fovCone.material.opacity + visible
- [ ] **Action 2.3**: patrol invisible, dwell 0.3, chase 0.8 (3 个 opacity 档)
- [ ] **Action 2.4**: FOV cone color: chase 红色 (0xff3030), dwell 灰色 (0x808080)
- [ ] **Test**: `tests/unit/engine/fovCone.test.ts` (state → opacity + visible 映射)
- [ ] **Validate**: `npx tsc --noEmit && npx vitest run`
- [ ] **Commit 2**: `feat(p1-enemy-fp3d): Phase 2 — FOV cone state-based 可视化`

### Commit 3: Phase 3 - 跨层 enemy 渲染 (2-3h)

- [ ] **Action 3.1**: `Game.update` 每帧检查 playerLevel, enemy.group.visible = (enemy.level === playerLevel)
- [ ] **Action 3.2**: onLevelChange 触发 resync (transition 完成时强制 sync 一次)
- [ ] **Action 3.3**: SceneRefs 加 helper `setEnemyLayerVisibility(playerLevel: number)`
- [ ] **Action 3.4**: minimap 完全不动 (P3-1 锁)
- [ ] **Test**: `tests/unit/engine/crossLayerEnemy.test.ts` (playerLevel 切换 → group.visible 切换)
- [ ] **Validate**: `npx tsc --noEmit && npx vitest run`
- [ ] **Commit 3**: `feat(p1-enemy-fp3d): Phase 3 — 跨层 enemy 渲染过滤 (同层 visible, 跨层 invisible)`

### Commit 4: Phase 4 - chase 听感 (2-3h)

- [ ] **Action 4.1**: `src/engine/Audio.ts` 新建 WebAudio heartbeat + footsteps 播放
- [ ] **Action 4.2**: AudioContext lazy 创建 (用户首次 click 后)
- [ ] **Action 4.3**: `Game.bridge.onEnemyStateChange` callback (跟 P3-3 warning flash 同 pattern)
- [ ] **Action 4.4**: `settingsStore` 加 `audio.chaseHeartbeat` / `audio.enemyFootsteps` (default true)
- [ ] **Action 4.5**: `Settings.tsx` 加 2 个 audio toggle
- [ ] **Action 4.6**: `i18n/resources/{en,zh}.ts` 加 2 个 audio label
- [ ] **Test**: `tests/unit/engine/Audio.test.ts` (heartbeat 间隔 + footstep 触发)
- [ ] **Test**: `tests/component/Settings.audio.test.tsx` (audio toggle 组件)
- [ ] **Validate**: `npx tsc --noEmit && npx vitest run`
- [ ] **Commit 4**: `feat(p1-enemy-fp3d): Phase 4 — chase 听感 (heartbeat + footstep + settings toggle)`

## 验证

```bash
# 必须全部通过才能 ship
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
npm run build
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| Phase 1 视觉升级影响 2D path | 中 | minimap 读 enemy 逻辑, 不读 mesh |
| Phase 2 FOV cone 视觉干扰玩家 | 中 | 半透明 + 仅 enemy 头部 |
| Phase 3 跨层 visible 切换困惑 | 中 | minimap 仍全层显示 |
| Phase 4 WebAudio autoplay block | 高 | 用户 click 后创建 AudioContext |
| Phase 4 heartbeat 太吵 | 中 | gain 0.05 + 距离衰减 + settings 关 |

## 验收

- [ ] 所有 Task 勾选完成
- [ ] 验证命令全部通过
- [ ] spec §11 完成清单全部勾选
- [ ] 4 phase 每个 phase 1 commit, 总 1 PR 4 commit

---

## 执行日志（实施时填写）

### 实施日期
2026-08-13

### 实际改动文件
（实施后填）

### 遇到的偏差
（实施后填）

### 测试覆盖
- 单元覆盖率：（实施后跑 coverage 填）

### 备注
（实施后填）
