# P3-2: Hole-down Warning Flash (0.5s pre-transition 警示)

**Slug**: p3-2-hole-down-warning-flash
**状态**: done（Game.ts warningFlash 状态机 + Scene.ts 红色 ring + 6 test 通过;待用户 commit）
**日期**: 2026-08-06
**对应路线图项**: P3-1 遗留 M-1（verifier 抓的 polish MEDIUM, 标 P3-2）
**依赖**: P3-1 (f30ffed, be7bebc)
**复杂度**: S (1-2h 单 session 闭环)

---

## 1. 概述

P3-1 commit (f30ffed) 实现了 hole-down 的 0.4s 自由落体, 但 spec §12 Q2 决策明确要求"transition 入口 0.5s 警示（脚底闪红 + 屏闪）缓冲盲跳"。P3-1a/b/c 阶段只做了渲染, 没做 timing 警示。

**P3-2 目标**: 给 hole-down 加 0.5s pre-transition warning phase, 让玩家在自由落体前 0.5s 看到"我要掉下去了"的视觉提示, 减少盲跳的不适感。

效果:
- 玩家踩到 hole-down 单元格
- 立即 0.5s 红色脚底环 (脚底闪红) + 输入锁定
- 0.5s 后自动 0.4s 自由落体 (现有 activeTransition)
- 0.4s 后落到下一层, 触发 onLevelChange

## 2. 决策表 (锁定)

| Q | 决策 | 备注 |
|---|---|---|
| Q1 | 哪些 transition 触发 warning? | 仅 `hole-down`(最危险, 自由落体); stair-up/-down/hole-up/ladder 不触发 |
| Q2 | Warning 持续多久? | 0.5s (spec §12 Q2 锁定) |
| Q3 | Warning 期间输入怎么处理? | 完全锁定 (inputLock = true), 玩家不能 WASD/跳跃 |
| Q4 | Warning 视觉怎么呈现? | 脚底闪红环 (3D mesh) + 屏闪 (CSS animation overlay, 标 P3-3) |
| Q5 | Warning 期间相机怎么处理? | 保持当前 y 不变 (玩家没动, 不需要 lerp) |
| Q6 | Warning 完成时怎么处理? | 自动调 startActiveTransition 启动 0.4s 落体 |
| Q7 | 玩家在 warning 期间死亡会怎样? | Game.destroyed = true 守护, warning 自然丢弃 (不重置 y) |
| Q8 | 玩家在 warning 期间退出 level 会怎样? | startLevel 重置 engine, warningFlash = null |

## 3. 状态机

### 3.1 新增 state

```typescript
private warningFlash: {
  kind: 'hole-down';     // 锁定 hole-down 唯一
  transition: VerticalTransition;  // 完整 transition 用于完成时启动落体
  durationSec: number;   // 0.5 (WARNING_FLASH_DURATION_SEC)
  elapsed: number;       // 累计 dt
} | null = null;
```

### 3.2 update() 流程变更

```typescript
// 现有 activeTransition short-circuit 之前加 warningFlash
if (this.warningFlash !== null) {
  this.tickWarningFlash(dt);
  this.camera.position.y = this.playerY + EYE_HEIGHT;
  this.renderer.render(this.sceneRefs.scene, this.camera);
  return;
}
if (this.activeTransition !== null) {
  this.tickActiveTransition(dt);
  // ... existing
}
```

### 3.3 触发路径

```typescript
// 现有 startActiveTransition 调用处 (Game.update 内 line 924)
if (t && t.level !== t.toLevel) {
  if (t.kind === 'hole-down') {
    this.startWarningFlash(t);
  } else {
    this.startActiveTransition(t);
  }
}
```

### 3.4 tickWarningFlash 完成时

```typescript
if (this.warningFlash.elapsed >= this.warningFlash.durationSec) {
  const t = this.warningFlash.transition;
  this.warningFlash = null;
  this.startActiveTransition(t);  // 现有 0.4s 落体
}
```

## 4. 视觉

### 4.1 脚底闪红环 (3D mesh, Scene.ts)

P3-1 已经在 hole-down cell 渲染了 dark square (`PlaneGeometry` 黑色)。P3-2 加一个**第二层 mesh**: warning 期间显示红色环 (TorusGeometry), 落体期间不显示。

```typescript
// buildScene 时为每个 hole-down transition 加一个 warning ring
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(cs * 0.4, cs * 0.05, 8, 24),
  new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.9 }),
);
ring.rotation.x = -Math.PI / 2;  // 平躺
ring.position.set(cellCenterX, tcs + 0.03, cellCenterZ);
ring.visible = false;  // 默认隐藏, warning 时显示
scene.add(ring);
```

### 4.2 setWarningFlashState 暴露 (SceneRefs)

```typescript
interface SceneRefs {
  // ... existing
  setWarningFlashState(transition: VerticalTransition | null): void;
}
```

实现: 在 buildScene 内 closure, 遍历 transitions 找到匹配的 ring, 设 visible + animate opacity (pulse)。

### 4.3 屏闪 (HUD overlay, P3-3 候选)

本期不实现。P3-3 时加 CSS animation: 0.5s 红色 vignette (0.3 → 0 → 0), 透明层覆盖全屏。

理由: 3D 脚底环是核心提示 (玩家低头就能看到), HUD 屏闪是 polish 上 polish。spec §12 Q2 说"脚底闪红 + 屏闪", 但两者并联, 不耦合。

## 5. 实施步骤

1. **Game.ts** (核心)
   - 新增 `private warningFlash: {...} | null = null`
   - 新增 `WARNING_FLASH_DURATION_SEC = 0.5` 常量
   - 新增 `private startWarningFlash(t: VerticalTransition): void`
   - 新增 `private tickWarningFlash(dt: number): void`
   - 修改 `update()`: 顶层先 check warningFlash
   - 修改 update 内 line 924 trigger: hole-down 走 warningFlash, 其他走 activeTransition
   - 修改 `startLevel` (line 736): 重置 `warningFlash = null`

2. **Scene.ts** (视觉)
   - buildScene: 为每个 hole-down transition 加一个 warning ring mesh
   - 返回 SceneRefs 加 `setWarningFlashState` closure
   - setWarningFlashState: 找到匹配的 ring, visible + opacity pulse

3. **Tests** (回归守门)
   - `tests/unit/engine/ParchmentState.test.ts` 已有 P3-1 transition 测试结构, 加 warningFlash 子 describe
   - 或者新建 `tests/unit/engine/Game.warningFlash.test.ts`:
     - hole-down 触发 → 0.5s 内 warningFlash 非 null, activeTransition null
     - 0.5s 后 → warningFlash null, activeTransition 非 null (0.4s 落体启动)
     - 0.9s 后 (0.5 + 0.4) → 全部 null, playerLevel 翻转
     - non-hole-down kinds (stair-up) 仍走 activeTransition 直启, 不走 warningFlash
     - startLevel 重置: 中途 startLevel → warningFlash = null

## 6. 验收 (5 框)

- [ ] **正确性**: hole-down 触发完整流程 0.5s 警示 + 0.4s 落体, playerLevel 翻转
- [ ] **非破坏性**: stair-up/-down/hole-up/ladder 仍走 0.5s/0.4s 旧路径
- [ ] **守门**: startLevel 重置, Game.destroyed 守护
- [ ] **视觉**: 脚底红色环 warning 期间显示 + pulse, 落体期间隐藏
- [ ] **测试**: 4+ test case 覆盖核心路径 + 边界

## 7. 冻结契约 (CLAUDE.md 锁定不动)

- FLOOR_HEIGHT = 2.4 (P3-1 锁定, 不动)
- EYE_HEIGHT = 1.6 (P3-1 锁定, 不动)
- Algorithm 15 + 4-mode mapping (P2-21 锁定, 不动)
- algorithmForMode 不动 (P2-3 锁定)
- seed codec v1/v2 (P3-1 锁定)

## 8. 遗留 (P3-3+)

- HUD 屏闪 CSS animation
- stair-down / hole-up / ladder 完整视觉 + transition (P3-1c 标 TODO)
- hole-up warning flash (Q1 决策当前不触发, 后续可加)
