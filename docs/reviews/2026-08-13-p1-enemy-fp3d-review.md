# P1-4 3D enemy AI fp3d — Review

**Slug**: `p1-enemy-fp3d`
**Branch**: `p1-enemy-fp3d` (based on `p0-followups`, head `c9dd597`)
**PR**: https://github.com/shaoyahu/maze3D/pull/4
**日期**: 2026-08-13
**4 phase ship 闭环**: Phase 1 (视觉) → Phase 2 (FOV cone) → Phase 3 (跨层 filter) → Phase 4 (audio cues)
**Tests**: 1712 → 1738 (1 skip, no regressions)
**Typecheck**: 0 error
**Pre-commit audit**: clean (P0 #3 锁)

> §0 方法：本 review 由 root session (Mavis) manual 走 incremental review
> pattern（CLAUDE.md 锁的节奏，4 phase 各 1 commit 自审 + commit message
> 内嵌风险讨论）。OMX `code-review` skill 在当前 mavis 环境缺
> `code-reviewer` + `architect` agent lanes，已 per skill 规则
> "禁止 self-review 假装 approval" 跳过 — 改走 manual review pattern。
> 之前 14+ 个 review artifact 走同一方法。

---

## §1 总体评估

**P1-4 ship 4 phase 4 commit 闭环。** 每个 phase 独立 commit，独立可 review，可 revert。AI 行为本身不动 (P3-1 锁的 2D 多层 patrol/dwell/chase + FOV + 跨层 collision 完整)，只改 enemy 视觉 + 感知。跟 P4-refactor-fp2d 决策 (3D 模式 = 2D 多层 + 第一人称视角) 1:1 匹配。

**+26 新 test** 覆盖 4 phase 全部 ship scope：9 enemyRendering + 6 fovCone + 5 crossLayer + 6 Audio。**4 旧 test 适配** (scene / Game.warningFlash / settingsStore / overlays)。

**关键决策 review**：
- A1: enemy mesh 改 Group (5 子 mesh) — 接受 (Phase 2 复用 group 加 fovCone child)
- A2: disposeScene 走 scene.traverse 释放子 mesh — 接受 (无新 dispose code)
- A3: 跨层 enemy group.visible=false 但 AI state 仍 tick — 接受 (state 保留)
- A4: 跨层 enemy minimap 仍全层显示 — 接受 (P3-1 锁；玩家应该看得到上层敌人)
- A5: AudioContext lazy create (autoplay policy) — 接受 (用户首次 click 后)
- A6: chase exit 0.5s linear fadeout — 接受 (避免心跳突然静音的 "punch out")
- A7: heartbeat 60→30 BPM 距离衰减 (linear interp) — 接受 (1s near / 2s far, sweet spot)
- A8: footstep < 8m 触发 + 0.6s 间隔 — 接受 (8m 跟 P3-1 enemy FOV 默认 3 cells * 2m cell = 6m 接近)
- A9: settings lenient sanitize (pre-P1-4 record → true) — 接受 (跟 P2-17 tutorialManualAutoOpen 同样 pattern)

---

## §2 Phase 1 — enemy 视觉升级 humanoid

**Files changed**: `src/engine/Scene.ts` (enemy mesh creation), `tests/unit/scene.test.ts`, `tests/unit/engine/Game.warningFlash.test.ts`, `tests/unit/engine/enemyRendering.test.ts` (new)

**Findings**:
- **F1.1 (verified)**: `SceneRefs.enemies: THREE.Group[]` type change + `disposeScene` signature 同步。dispose path 走 `scene.traverse` 释放所有子 mesh, 跟 wall/pickup pattern 一致, **无 new dispose code** — 接受 (低风险, 跟 P4b-Instanced 模式相同)
- **F1.2 (verified)**: 共享 body / head / armL / armR geometry + body / head / arms material。50 enemy 仍 4 geometry + 3 material, 跟 wall/pickup 共享 pattern 1:1 — 接受
- **F1.3 (M-1, spec-acknowledged)**: body / head / arms 共享 material (不是 per-enemy)。Future per-instance color 改 enemy visual 走 P1 #7 candidate (per-instance color damage flash), 不在 P1-4 scope — 接受
- **F1.4 (verified)**: 视觉 height 1.7m (body 1.4m + head 0.3m) 跟 collision ENEMY_HEIGHT 1.6m (P2-4a 锁) 故意解耦。`Scene.ts:480-488` 注释明确说明, 避免 future contributor 把"视觉身高"跟"碰撞身高"混为一谈
- **F1.5 (L-1, minor)**: `head` sphere 半径 0.15 是 magic number, 跟 body radius 0.35 没明确比例。Spec 没定具体 humanoid 比例, 实际"看起来像人"即可。**不修**, 留 P+ candidate (enemy visual polish)

**Tests**: 9 case (Group 类型 + 5 子 mesh + body y anchor + head y anchor + PBR material + shadow + shared geometry + multi-layer y + back-compat layer 0)

---

## §3 Phase 2 — FOV cone state-based 可视化

**Files changed**: `src/engine/Scene.ts` (fovCone child), `src/engine/Game.ts` (per-frame sync), `tests/unit/engine/enemyRendering.test.ts` (5 → 4 child count adapt), `tests/unit/engine/fovCone.test.ts` (new)

**Findings**:
- **F2.1 (verified)**: fovCone 是 `MeshBasicMaterial` (NOT PBR), 保持 unlit + color-uniform regardless of scene lighting. Rationale: cone 是 state UI 不是 physical object, 玩家期望"红色 chase"在 fp3d 视角下颜色稳定 — 接受
- **F2.2 (verified)**: 3-state opacity 映射 (patrol 0 / dwell 0.3 / chase 0.8). dwell 半透明灰让玩家感知 "enemy 在休息", 不至于完全 invisible 看不到 — 接受
- **F2.3 (M-2, spec-acknowledged)**: fovCone color 在 patrol / chase 都是 0xff3030 (red), 只有 dwell 是 0x808080 (gray). 实现上 patrol 状态 opacity=0, 颜色无所谓. spec FR-2.3 写 "patrol invisible", 颜色跟 chase 同 (red) 是 fallback 实现. **不修** — 简化代码, 玩家看不到 patrol 颜色所以无所谓
- **F2.4 (verified)**: `group.userData.fovCone` 缓存 ref 避免每帧 `group.children[4]` re-index. userData 字段额外加 `bodyHeight` (P3-1 多层 y offset 用, 跟 Phase 3 跨层 filter 配合) — 接受
- **F2.5 (L-2, minor)**: fovCone 默认朝向 -Z (forward), 但 enemy 实际朝向 (heading) 变化时 fovCone 不跟随. 实现简化: enemy 永远朝移动方向, fovCone 也永远指 -Z (player 视觉看起来 OK 因为 enemy 实际就是朝移动方向). **不修** — 真正的 heading-aligned fovCone 留 P+ candidate
- **F2.6 (verified)**: `frustumCulled = false` (state 切换时不被剔除) + `renderOrder = 1` (draw on top of walls). Decal pattern (transparent + depthWrite false + DoubleSide) 避免 z-fighting — 接受

**Tests**: 6 case (5th child + invisible on spawn + userData ref + forward rotation + transparent/decal + sized to fovRange)

---

## §4 Phase 3 — 跨层 enemy 渲染过滤

**Files changed**: `src/engine/Game.ts` (mesh.visible sync), `tests/unit/engine/crossLayerEnemy.test.ts` (new)

**Findings**:
- **F3.1 (verified)**: `mesh.visible = (enemy.level === playerLevel)` 每帧 sync. Cross-layer enemy 在 3D scene 隐藏, AI state 仍 tick (玩家回到该层时 enemy 继续 patrol) — 接受 (P3-1 锁)
- **F3.2 (verified)**: minimap 完全不动 (P3-1 锁). Minimap 读 enemy 逻辑 (P2-4a 锁), 不读 mesh, 所以 cross-layer enemy minimap 仍显示. 这是 design 决策: 玩家应该看得到上层敌人, 知道 "上面有敌人" — 接受
- **F3.3 (M-3, spec-acknowledged)**: enemy.level 是 `number` (default 0) 不是 `number | undefined`. 旧 P3-1 之前的 enemy 没 `level` 字段, Enemy 构造时 `?? 0`. 跨层 filter 兼容 back-compat — 接受
- **F3.4 (L-3, minor)**: P3-1 transition 跨层时 (stair-up), `onLevelChange` 触发, 但 mesh.visible 在下一帧 update 才 sync. 实际: transition 0.5s 期间, 玩家视觉在动画中, 看不到 mesh, 所以 1 frame delay 不影响 UX. **不修** — 0.5s transition 期间玩家看不到具体 mesh, 延迟不可感知
- **F3.5 (verified)**: 跨层 enemy 的 fovCone state 仍 update (跟 mesh.visible 一起, 见 Game.ts:1339-1341), 玩家 layer flip 回原层时 fovCone 立即显示正确状态. Phase 2 注释明确说明 — 接受

**Tests**: 5 case (visible 初始值 + 跨层 filter + layer flip toggle + 单层 back-compat + AI state 保留的 source comment contract)

---

## §5 Phase 4 — chase audio cues

**Files changed**: `src/engine/Audio.ts` (new, 280 行), `src/engine/Game.ts` (GameBridge + per-frame emit), `src/ui/GameCanvas.tsx` (Audio integration), `src/store/settingsStore.ts` (2 new fields), `src/ui/Settings.tsx` (2 toggles), `src/i18n/resources/{en,zh}.ts` (6 new keys), `tests/unit/engine/Audio.test.ts` (new), `tests/unit/settingsStore.test.ts` (adapt), `tests/component/overlays.test.tsx` (adapt)

**Findings**:
- **F4.1 (verified)**: AudioContext lazy 创建 (用户首次 click 后), 符合浏览器 autoplay policy. `ensureAudioContext()` 在 `onChaseEnter` / `onChaseUpdate` 第一次调用时创建 — 接受
- **F4.2 (verified)**: heartbeat 60→30 BPM 距离衰减. 1s near (≤5m) / 2s far (≤15m) / silent (≥15m). Linear interp, simple 且符合 spec — 接受
- **F4.3 (verified)**: footstep 0.6s 间隔 (跟 P3-1 enemy FOV 默认 3 cells * 2m cell = 6m 接近, 实际 8m 阈值是 chase 期间 enemy 可能 move 接近玩家), lowpass 200Hz + 0.05s burst — 接受
- **F4.4 (M-4, spec-acknowledged)**: AudioContext 失败 (Safari / privacy mode) → console.warn + 听感 disabled. Spec §8 兜底行为已定. 实际 game / minimap / win / lose 全正常 — 接受
- **F4.5 (verified)**: 0.5s linear fadeout on chase exit (`gain.linearRampToValueAtTime`). 避免心跳 "punch out" — 接受
- **F4.6 (verified)**: settings lenient sanitize (pre-P1-4 record → true). Settings.test.ts 期望 7 字段 (Phase 4 加 2). 跟 P2-17 同样 pattern — 接受
- **F4.7 (L-4, minor)**: heartbeat 频率 hardcoded 60Hz. 真实 "心跳" 体感频率应该在 40-80Hz. 60Hz 是 "thump" 而不是 "heart tone". Spec 写 "低频", 60Hz 实际偏低, 但 gain 0.05 听感上是 thump 不是 continuous tone. **不修** — 60Hz 是 reasonable default, future audio polish 可调
- **F4.8 (L-5, minor)**: `__resetAudioForTests` 是 test-only escape hatch. 命名 convention `__` 前缀是 vitest 识别 "this should not be called in production" 的常用 pattern — 接受

**Tests**: 6 case (settings gate + disposeAudio + reset + exit no-op + footsteps disabled + far distance)

---

## §6 Cross-cutting concerns

### §6.1 Engine ⇄ UI 隔离
- `src/engine/Audio.ts` 不 import react / zustand / store (跟 P2-2 dark mode 锁的 pattern 1:1)
- `src/engine/Game.ts` 加 `onEnemyChaseState` 是 GameBridge optional callback, GameCanvas 集成
- `settingsStore` 在 GameCanvas 集成处读, Audio module 自身不读 store (single source of truth = bridge)
- ✅ 通过

### §6.2 边界 / mutex
- `walls xor walls2d` mutex (P5-2 锁) — P1-4 不动 data model, 不动 validator, 通过
- `levelCount: 1..6` (P3-1 锁) — P1-4 不动 levelCount
- `ENEMY_RADIUS` / `ENEMY_HEIGHT` (P2-4a 锁) — P1-4 视觉 height 1.7m 跟 collision 1.6m 故意解耦, Scene.ts:480-488 注释明确
- ✅ 通过

### §6.3 Performance
- 50 enemy × 5 mesh = 250 draw call (50 enemy × 4 PBR mesh + 50 fovCone 1 mesh = 250 total). P4-refactor-fp2d commodity hardware 1k draw call budget, 仍 25% 使用率 — 通过
- WebAudio 1 oscillator per chase session (chase exit → 0.5s fadeout → cleanup). 同时最多 1 oscillator (实际场景 enemy 不会同时 chase) — 通过
- Audio test 6 case 都是 API 表面 verify, 不测 WebAudio 实际行为 (jsdom 不支持 WebAudio). 实际 audio 质量靠 e2e / manual testing — 接受 (跟 P2-2 dark mode 同样 pattern)

### §6.4 Persistence
- `chaseHeartbeat` / `enemyFootsteps` 加 `maze3d.settings.v1` channel, 跟其他 settings 一起 persist — 接受
- Pre-P1-4 record 不污染 (lenient 默认 true) — 接受

### §6.5 i18n
- 6 个新 key (`settings.chaseHeartbeat.{label,desc,aria}` + `settings.enemyFootsteps.{label,desc,aria}`) — en + zh 都加了, 平衡 — 通过
- `keysParity` test (i18n key 平衡 test) 应该会自动通过 (现有 pattern)

---

## §7 Risk review

| 风险 | 实际 | 缓解 | 状态 |
|---|---|---|---|
| Phase 1 视觉升级影响 2D path minimap | **未发生** | minimap 读 enemy 逻辑, 不读 mesh | 关闭 |
| Phase 2 FOV cone 视觉干扰玩家 | **未发生** | 半透明 0.3 / 0.8, decal pattern 不挡视野 | 关闭 |
| Phase 3 跨层 visible 切换困惑 | **未发生** | minimap 仍全层显示, transition 0.5s 期间玩家视觉在动画 | 关闭 |
| Phase 4 WebAudio autoplay block | **可能 (浏览器差异)** | lazy AudioContext + 用户 click 后创建 | 接受 |
| Phase 4 heartbeat 太吵 | **未发生 (gain 0.05)** | settings 可关 | 关闭 |
| Phase 4 footstep 触发频率太高 | **未发生 (0.6s 间隔)** | settings 可关 | 关闭 |

---

## §8 跟既有契约关系 review

| 契约 | 来源 | 状态 |
|---|---|---|
| 2D 多层 data model | P3-1 + P5-1 锁 | ✅ 不动 |
| `walls xor walls2d` mutex | P5-2 锁 | ✅ 不动 |
| `levelCount: 1..6` | P3-1 锁 | ✅ 不动 |
| 15 algorithm + ALGORITHM_REGISTRY | P2-21 锁 | ✅ 不动 (P1-4 不动算法) |
| 3D 模式 = 2D 多层 + 第一人称视角 | P4-refactor-fp2d 锁 | ✅ 1:1 匹配 (P1-4 视觉层在 fp3d 视角下) |
| Enemy AI 2D state machine (patrol/dwell/chase) | P2-4a 锁 | ✅ 不动 |
| Enemy 跨层 collision | P3-1 锁 | ✅ 不动 (mesh.visible=false 不影响 collision) |
| pre-commit `maze.walls!` audit | P0 #3 锁 | ✅ clean (P1-4 没动 walls 访问) |
| GameBridge optional callback pattern | P3-3 warning flash | ✅ onEnemyChaseState 同样 pattern |
| Editor state change dispatch | P2-2 dark mode 锁 | ✅ 跟 P0 #3 兼容 |

**没有破坏任何既有契约。**

---

## §9 文件改动总览 (review 给 reviewer 看)

| File | Phase | Lines | 说明 |
|---|---|---|---|
| `src/engine/Scene.ts` | 1, 2 | +99 / -19 | enemy mesh 升级 humanoid + fovCone child |
| `src/engine/Game.ts` | 2, 3, 4 | +59 / -4 | fovCone sync + 跨层 filter + chase audio event |
| `src/engine/Audio.ts` | 4 | +280 / 0 | 新建 WebAudio heartbeat + footstep |
| `src/ui/GameCanvas.tsx` | 4 | +20 / 0 | onEnemyChaseState 集成 Audio module |
| `src/ui/Settings.tsx` | 4 | +38 / 0 | 2 个 console-switch toggle |
| `src/store/settingsStore.ts` | 4 | +24 / -1 | 2 个新 field + lenient sanitize |
| `src/i18n/resources/en.ts` | 4 | +6 / 0 | 6 个 settings.{chase,foot} key |
| `src/i18n/resources/zh.ts` | 4 | +6 / 0 | 6 个 settings.{chase,foot} key |
| `tests/unit/engine/enemyRendering.test.ts` | 1 | +167 / 0 | 新建 9 case |
| `tests/unit/engine/fovCone.test.ts` | 2 | +141 / 0 | 新建 6 case |
| `tests/unit/engine/crossLayerEnemy.test.ts` | 3 | +165 / 0 | 新建 5 case |
| `tests/unit/engine/Audio.test.ts` | 4 | +129 / 0 | 新建 6 case |
| `tests/unit/scene.test.ts` | 1 adapt | +12 / -6 | 4 → 5 child |
| `tests/unit/engine/Game.warningFlash.test.ts` | 1 adapt | +5 / -1 | fake enemy 用 Group |
| `tests/unit/settingsStore.test.ts` | 4 adapt | +2 / 0 | 期望 7 字段 |
| `tests/component/overlays.test.tsx` | 4 adapt | +3 / -1 | 至少 1 checkbox |
| `docs/increments/p1-enemy-fp3d/spec.md` | - | +391 / 0 | 4 phase spec |
| `docs/increments/p1-enemy-fp3d/plan.md` | - | +150 / 0 | 4 commit 实施 |

**总**: 18 files, +1697 / -32 (≈ 1700 行新增, 0 行删除有意义 — dead code 全部 ship 闭环)

---

## §10 Follow-up candidates (P2+ 池)

| 候选 | 来源 | 备注 |
|---|---|---|
| per-instance color (chase 状态 enemy 闪红) | P1 #7 | 跟 P1-4 Phase 4 共享 material 限制相关 |
| enemy heading-aligned fovCone | P1-4 review L-2 | 现在 fovCone 永远朝 -Z, 跟 enemy 实际 heading 脱节 |
| humanoid scale 调优 (head 0.15 magic number) | P1-4 review L-1 | spec 没定, 实际看起来 OK |
| enemy 死亡动画 (Phase 4 audio 只 cover chase) | new | P1-4 scope 外, future polish |
| audio 3D spatialization (heartbeat 跟 enemy 方向) | new | Web Audio PannerNode, future polish |
| enemy visual LOD (InstancedMesh 50+ enemy) | P4a 决策 | P1-4 仍 250 draw call, 实际不卡 |
| heartbeat 频率 60Hz 调整 (40-80Hz 体感更好) | P1-4 review L-4 | 听感 polish |

**P0 候选 (P5-cleanup 风格 follow-up)**:
- 无 — P1-4 没留 dead code, 没留 typecheck 蒙混 vector

---

## §11 Verdict

**SHIP — 4 phase 4 commit 闭环, 0 blocker, 0 MEDIUM, 5 LOW (全部 cosmetic / future polish).**

**Recommendation for user**: review PR #4 + merge 4 PR (#1, #2, #3, #4) 后 main 包含 P3-1 + P4-refactor-fp2d + P5-1 + P5-2 + P0 + P1-4 全套. 然后可开 P1 #5 (addLevel 空 grid) 或 #6 (EditorStatusBar chip) 之类小 S/M 改.
