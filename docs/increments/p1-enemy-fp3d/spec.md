# P1-4 3D enemy AI fp3d — Spec

**Slug**: `p1-enemy-fp3d`
**状态**: draft → in-review → approved → done
**日期**: 2026-08-13
**对应路线图项**: P1 #4 (P0 follow-up 候选池 4 task 中 1)
**依赖**: P4-refactor-fp2d (3D 模式 = 2D 多层 + 第一人称视角), P3-1 (enemy AI 2D 多层), P0 commit 1 (P5-cleanup 删 3D dead code)
**复杂度**: Large (8-12h, 4 phase)

> 4 phase ship 节奏: 每个 phase 独立 commit + 1 PR review. 跟 P5-2 (2 commit) + P0 (3 commit) 一致.
> Phase 1 视觉升级是地基, Phase 2-4 建立在它之上. 任何 phase 出问题可以 rewind 单独 phase.

## 1. 概述

P0 follow-up 候选池 P1 #4: 当前 enemy 在 fp3d 视角下视觉退化 (单一 dark-red capsule, 无 FOV 提示, 无 chase state 视觉强化, 无 cross-layer 渲染过滤). 这次让 enemy 在 fp3d 视角下"看起来像敌人" — humanoid 视觉 + FOV 锥可见 + chase state 发光 + 跨层 enemy 不可见 (但 minimap 还显示) + chase 听感 (低频心跳).

**AI 行为本身不动** (P3-1 锁的 2D 多层 patrol/dwell/chase + FOV + 跨层 collision 已经完整, 8 commit 历史 P2-4a ship). 这次只改 enemy **视觉 + 感知**, 跟 P4-refactor-fp2d 决策 (3D 模式 = 2D 多层数据 + 第一人称视角) 1:1 匹配.

## 2. 目标 / 非目标

### 目标
- Phase 1 (2-3h): enemy 视觉升级 (capsule body + sphere head + PBR-ish shading + castShadow/receiveShadow)
- Phase 2 (2-3h): FOV 锥可见 (chase state 红色 cone, patrol 状态 invisible, dwell 状态暗淡)
- Phase 3 (2-3h): 跨层 enemy 隐藏 (玩家所在层 visible, 其他层 invisible; minimap 不受影响)
- Phase 4 (2-3h): chase 状态听感 (低频心跳 WebAudio + 距离衰减脚步声; patrol 状态静音)

### 非目标
- 不重写 enemy AI 状态机 (P3-1 锁的 2D state machine 完整)
- 不改 enemy 数量上限 / spawn 算法
- 不改 minimap enemy 显示 (跨层可见)
- 不新增 enemy 种类 (只改现有 Enemy 渲染)
- 不改 multiplayer 同步 (single-player)
- 不加新 pickup / trap / door
- 不碰第一人人称相机控制 (P2-3 锁的 PointerLockControls + Y-clamp)

## 3. 用户故事

- 作为玩家, 我希望在 fp3d 视角下能"看到"敌人朝我看过来 (FOV cone 发光), 这样我知道该躲避而不是依赖 minimap
- 作为玩家, 我希望在 enemy 进入 chase state 时有清晰视觉 (outline / glow) + 听感 (心跳) 提示, 这样紧张感更强
- 作为玩家, 我希望在多层关卡中, enemy 只在当前层显示, 这样 minimap 不会因为上层 enemy 干扰我的判断
- 作为 designer, 我希望 enemy 视觉升级不破坏 2D path 行为 (P2-4a ship 锁), 现有 2D mode minimap 视角不变

## 4. 功能需求

### FR-1: enemy 视觉升级 (Phase 1)
- F1.1: enemy mesh 从单 capsule 改成 capsule body + sphere head + 双 capsule arms (5 mesh 合并 group, 单 enemy 共 5 子 mesh)
- F1.2: 颜色: body 0x553333 (暗红保留, "zombie 感"), head 0x886666 (浅红), arms 同 body
- F1.3: material 升级: `MeshStandardMaterial` (roughness 0.7, metalness 0.1) 替代 `MeshLambertMaterial` — 受 scene 主光 / 暗模式影响更明显
- F1.4: castShadow + receiveShadow 都 true — 玩家能看到 enemy 投在地面的影子 (fp3d 视角核心沉浸感)
- F1.5: enemy height 1.7m (head 0.3m diameter + body 1.4m), body capsule (0.35 radius)
- F1.6: SceneRefs.enemies 改成 `THREE.Group[]` (每个 enemy 一个 group), 保持 backward-compat 数组迭代
- F1.7: disposeScene 释放 group 内的所有子 mesh geometry + material (refactor 后增加 hygiene)
- F1.8: 性能: 50 enemy × 5 mesh = 250 draw call. P4-refactor-fp2d 决策 commodity hardware 1k draw call budget, 仍 OK. Phase 4 留 InstancedMesh 优化候选

### FR-2: FOV cone 可视化 (Phase 2)
- F2.1: enemy `state === 'chase'` 时, 在 enemy 头部渲染一个 红色 FOV cone (跟 Minimap FOV cone 同色 + 大小同 60°)
- F2.2: enemy `state === 'dwell'` 时, FOV cone 半透明灰 (玩家能看到 enemy 在休息)
- F2.3: enemy `state === 'patrol'` 时, FOV cone 完全 invisible (玩家看不到 enemy "看哪里" 除非进入 chase)
- F2.4: Game tick 每帧 sync enemy state → mesh visible / opacity
- F2.5: FOV cone 是新增 mesh, 在 group 内 (跟 body 一起 dispose)
- F2.6: enemy 死亡/不在场 → FOV cone 跟着 group visible=false

### FR-3: 跨层 enemy 渲染 (Phase 3)
- F3.1: 玩家所在层 (playerLevel) = `maze.start.level ?? 0`, 渲染时只有 enemy.level === playerLevel 的 enemy group visible=true
- F3.2: 玩家通过 transition (stair-up / hole-down / ladder) 跨层时, Game 触发 onLevelChange → 重新 sync enemy visibility
- F3.3: minimap 完全不动 (P3-1 锁 minimap 跨层全显示, 这是 design 决策 — 玩家应该看得到上层 enemy 知道 "上面有敌人")
- F3.4: enemy state 跨层保留 (玩家从 L0 → L1, 上次 L0 enemy patrol 仍在跑, 玩家回到 L0 它还在原位)
- F3.5: cross-layer enemy 视觉上不是 "消失" 而是 "传送到楼板" — 实际就是 group.visible=false, 玩家看不到但 mesh 还在 scene graph (无 GC)

### FR-4: chase 听感 (Phase 4)
- F4.1: 玩家进入 enemy FOV (canSeePlayer=true) → 1.5s 内触发 chase state → 启动 low-freq heartbeat (60 BPM WebAudio oscillator, gain 0.05)
- F4.2: heartbeat 间隔: enemy 距离 < 5m → 60 BPM, 5-10m → 45 BPM, 10-15m → 30 BPM, > 15m → 静音
- F4.3: enemy enterPatrol (玩家脱离 FOV 0.5s) → heartbeat 渐隐 (0.5s linear fade out)
- F4.4: enemy 距离玩家 < 8m 时, 每 0.6s 播放 footstep (lowpass white noise burst, 0.05s duration)
- F4.5: 听感默认 settings 关闭 (新增 `audioSettings.chaseHeartbeat` / `audioSettings.enemyFootsteps` boolean settings, 跟 P2-2 dark mode 一样 settingsStore 管理)
- F4.6: WebAudio 必须在用户首次交互 (click) 后才创建 AudioContext (autoplay policy)

## 5. 数据 / 类型变更

### 新增 EnemyGroup 类型
- `SceneRefs.enemies: THREE.Group[]` (从 `THREE.Mesh[]` 升级)
- Group 内子 mesh: `body` (capsule) / `head` (sphere) / `armL` (capsule) / `armR` (capsule) / `fovCone` (cone, Phase 2)

### 新增 settings
- `settingsStore.audio.chaseHeartbeat: boolean` (default true)
- `settingsStore.audio.enemyFootsteps: boolean` (default true)
- 持久化: 跟 dark mode / progressive spawn 一样 localStorage `maze3d:settings`

### 不变的字段
- `MazeData.enemies: EnemySpawn[]` (P3-1 锁)
- `EnemySpawn` 所有字段 (id/x/z/path/level/dwellTime/fovRange/fovAngleDeg/...)
- `Enemy` 类的 state machine (patrol/dwell/chase)
- `levelCount` 范围 1..6
- `isReachableMultiLevel` 跨层 BFS (P0 #2 锁)

## 6. 引擎 / 架构影响

### 受影响文件
| 文件 | 改动类型 | 说明 |
|---|---|---|
| `src/engine/Scene.ts` | UPDATE | enemy mesh 升级 (Phase 1) + FOV cone (Phase 2) + 跨层 visible (Phase 3) |
| `src/engine/Game.ts` | UPDATE | 每帧 sync enemy state → mesh (Phase 2) + onLevelChange 触发 enemy visibility resync (Phase 3) |
| `src/engine/Audio.ts` | NEW | WebAudio heartbeat + footsteps 播放 (Phase 4) |
| `src/store/settingsStore.ts` | UPDATE | 加 audio.chaseHeartbeat / audio.enemyFootsteps (Phase 4) |
| `src/ui/Settings.tsx` | UPDATE | 加 2 个 audio toggle (Phase 4) |
| `src/i18n/resources/{en,zh}.ts` | UPDATE | 加 2 个 audio settings label (Phase 4) |

### 边界检查
- 引擎层 (`src/engine/**`) 继续不 `import` react / zustand
- `Audio.ts` 跟 Three.js 无关, 跟 Enemy state 同步走 Game.bridge.onEnemyStateChange callback (跟 P3-3 warning flash state 一样 pattern)
- 现有 2D path 不变 (P2-4a 锁)

## 7. UI / UX 变更

### 屏幕 / 组件改动
- Game 视角 (fp3d): enemy 现在是 humanoid (Phase 1), 头部 FOV cone 在 chase 状态可见 (Phase 2), 跨层 enemy 隐藏 (Phase 3)
- Minimap: 不动 (enemy 仍全层可见, 跨层透明度不变)
- Settings 页面: 加 2 个 audio toggle (Phase 4)

### 交互流程
1. 玩家进入 enemy FOV (canSeePlayer) → 1.5s 后 enemy enterChase → 视觉: FOV cone 红色 (Phase 2) + 听感: 心跳 (Phase 4)
2. 玩家脱离 enemy FOV → 0.5s 后 enemy enterPatrol → 视觉: FOV cone 隐藏 + 听感: 心跳渐隐
3. 玩家 P3-1 transition 跨层 (stair-up) → onLevelChange → 上层 enemy 出现 / 下层 enemy 消失 (Phase 3)
4. 玩家在 Settings 关掉 audio.chaseHeartbeat → 心跳立即静音, FOV cone 视觉不变 (Phase 4)

## 8. 错误处理

### 新增错误码
- `AudioError.kind`: WebAudio 初始化失败 (e.g. browser 不支持) → 静默 fallback, 听感 disabled, UI 仍正常

### 兜底行为
- WebAudio 创建失败 → console.warn + audio.chaseHeartbeat 强制 false
- 用户拒绝 audio context (autoplay block) → 听感 disabled 但其他功能正常
- enemy mesh 创建失败 (极少见) → enemy 仍逻辑运行, minimap 仍显示, 只是 fp3d 视角看不到

## 9. 测试策略

### 单元测试
- `tests/unit/engine/enemyRendering.test.ts` NEW: enemy mesh 5 子 mesh 存在 + group.visible 正确 (Phase 1)
- `tests/unit/engine/fovCone.test.ts` NEW: state → FOV cone opacity / visible 映射 (Phase 2)
- `tests/unit/engine/crossLayerEnemy.test.ts` NEW: playerLevel 切换 → group.visible 切换 (Phase 3)
- `tests/unit/engine/Audio.test.ts` NEW: heartbeat 间隔公式 + footstep 触发 (Phase 4)

### 组件测试 (RTL)
- `tests/component/Settings.audio.test.tsx` NEW: 2 个 audio toggle 工作 (Phase 4)
- 现有 minimap test 不动 (跨层 minimap 不变)

### E2E 测试 (Playwright)
- 现有 哨兵回廊 E2E (P2-11 ship) 不动, 验证 enemy chase 在 fp3d 视角下视觉 + 行为正常

### 性能测试
- 50 enemy × 5 mesh = 250 draw call. P4-refactor-fp2d 1k draw call budget OK
- 100 enemy → 500 draw call, 仍 < budget
- Phase 4 心跳 WebAudio 1 oscillator per chase enemy, 同时最多 5 enemy → 5 oscillator (P2-4a 锁 single-chase 模式, 实际上 enemy 不会同时 chase, 所以 1 oscillator 实际)

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| Phase 1 视觉升级影响 2D path (top-down minimap) | 中 | minimap 仍读 enemy 逻辑 (P2-4a 锁), 不读 mesh — 解耦 |
| Phase 2 FOV cone 视觉干扰玩家 (fp3d 视角视野) | 中 | cone 是半透明 + 仅 enemy 头部周边, 不挡主视野; 红色提示紧迫性 |
| Phase 3 跨层 enemy visible 切换导致玩家"敌人在哪"困惑 | 中 | minimap 仍全层显示, 玩家始终知道"上层有 enemy"; 跨层只是 fp3d 视觉过滤 |
| Phase 4 WebAudio autoplay block 失败 | 高 | 用户首次 click 后创建 AudioContext, 失败 fallback 静音 + settings 关闭 |
| Phase 4 heartbeat 太吵 | 中 | gain 0.05 + 距离衰减, settings 可关 |
| Phase 4 footstep 触发频率太高 | 低 | 0.6s 间隔 + 仅 enemy < 8m |

## 11. 完成清单 (dod)

### 11.1 功能验收
- [ ] FR-1 enemy 视觉升级
- [ ] FR-2 FOV cone 可视化
- [ ] FR-3 跨层 enemy 渲染
- [ ] FR-4 chase 听感

### 11.2 引擎 / 架构边界
- [ ] 引擎层继续不 `import` react / zustand
- [ ] Audio.ts 走 GameBridge callback pattern (跟 P3-3 warning flash 一致)
- [ ] 新增 Three.js 资源在 `dispose()` 路径中被释放

### 11.3 测试
- [ ] 单元测试覆盖率 ≥80%
- [ ] 4 个新 test file 覆盖 4 个 phase
- [ ] `npm run typecheck` 与 `npm run build` 通过
- [ ] pre-commit audit grep 不报 (P0 #3 锁)

### 11.4 文档
- [ ] `docs/increments/p1-enemy-fp3d/spec.md` 已写
- [ ] `docs/increments/p1-enemy-fp3d/plan.md` 已写
- [ ] 4 phase 每个 phase review artifact

### 11.5 持久化与兼容
- [ ] audio settings 加 settingsStore, 跟 dark mode 一样
- [ ] 不破坏 localStorage schema (新字段, 旧用户用 default true)
- [ ] 现有 2D 视角 enemy minimap 不变

### 11.6 安全与健壮性
- [ ] WebAudio 创建失败 fallback
- [ ] 用户拒绝 audio context fallback
- [ ] no console.log 残留
- [ ] no hardcoded audio URL

## 12. 参考

- P4-refactor-fp2d 决策: 3D 模式 = `view=fp3d` + 2D 多层 + 第一人称视角
- P3-1 锁: enemy AI 2D 多层 + patrol/dwell/chase + FOV + 跨层 collision
- P2-4a 锁: enemy 状态机 + minimap FOV cone + enemy wall-aware movement
- P3-3 锁: warning flash state machine 模式 (GameBridge callback pattern)
- P0 #3 锁: pre-commit grep audit (P1 不能违反)
- PR #1 (P4-refactor-fp2d) + PR #2 (P5-2) + PR #3 (P0) 待 review + merge
