# P3-3: Warning Flash HUD Overlay (0.5s 屏闪)

**Slug**: p3-3-warning-flash-hud
**状态**: done（WarningFlashOverlay.tsx + gameStore 新 state + GameBridge callback + 8 test 通过;待用户 commit）
**日期**: 2026-08-06
**对应路线图项**: P3-2 遗留 (M-1 spec §12 Q2 屏闪部分)
**依赖**: P3-1 (f30ffed), P3-1d (be7bebc), P3-2 (92c1e57, a11b648)
**复杂度**: S (1h 单 session 闭环)

---

## 1. 概述

P3-2 实现了 hole-down 的 0.5s 3D 脚底环（脚底闪红），但 spec §12 Q2 决策明确要求"transition 入口 0.5s 警示（脚底闪红 + 屏闪）缓冲盲跳" — 屏闪部分没做。

**P3-3 目标**：加 0.5s 全屏红色 vignette overlay，与 P3-2 脚底环同步。让玩家在自由落体前 0.5s 视觉上双重提示：脚底红环 + 屏闪。

效果：
- 玩家踩到 hole-down cell
- P3-2 脚底红环 0.5s + P3-3 全屏红色 vignette 0.5s（同时）
- 输入锁定
- 0.5s 后自动 0.4s 落体（屏闪消失，环消失）
- 落到下一层

## 2. 决策表

| Q | 决策 | 备注 |
|---|---|---|
| Q1 | 屏闪触发哪些 transition? | 仅 `hole-down` (与 P3-2 同步) |
| Q2 | 屏闪持续多久? | 0.5s (与 P3-2 warningFlash 对齐) |
| Q3 | 屏闪视觉怎么呈现? | 全屏红色 vignette 0.3 opacity 起始 → 0 淡出 |
| Q4 | 屏闪期间输入怎么处理? | P3-2 锁 input, 这里 no-op |
| Q5 | 屏闪需要 pointerEvents: none 吗? | 是 — 不能拦截点击 (跟 InvulnerableFlash 一致) |
| Q6 | 屏闪 CSS animation 模式? | 复用 `invulnerable-fade` keyframe (0% opacity 1 → 100% opacity 0, 0.5s linear forwards) |
| Q7 | 屏闪与 3D 环同步? | 是 — 两者由同一个 warningFlash 状态机驱动 |
| Q8 | 屏闪多次触发怎么办? | 跟 InvulnerableFlash 一样, 用 `key={triggerId}` 重新挂载, CSS animation 重启 |

## 3. 状态机

### 3.1 复用 P3-2 warningFlash

P3-2 已实现 `Game.warningFlash` 状态机 (0.5s pre-transition for hole-down)。P3-3 **不引入新 state**, 而是 Game.startWarningFlash + tickWarningFlash 完成时通过 `bridge.onWarningFlashState(active: boolean)` 通知 UI。

```typescript
// P3-2 startWarningFlash
this.warningFlash = { ... };
this.input?.setPaused(true);
this.sceneRefs?.setWarningFlashState(t);
this.bridge.onWarningFlashState?.(true);  // ← P3-3 add

// P3-2 tickWarningFlash 完成
this.warningFlash = null;
this.sceneRefs?.setWarningFlashState(null);
this.startActiveTransition(t);
this.bridge.onWarningFlashState?.(false);  // ← P3-3 add

// P3-2 startLevel reset
this.warningFlash = null;
this.sceneRefs?.setWarningFlashState(null);
this.bridge.onWarningFlashState?.(false);  // ← P3-3 add (保险)
```

### 3.2 gameStore 新 state

```typescript
warningFlashUntil: number;  // wall-clock seconds (Date.now()/1000 + 0.5)
setWarningFlashUntil: (until: number) => void;
```

跟 `invulnerableUntil` 平行 — wall-clock 比较避免 backgrounded tab 的 throttled rAF 冻结 overlay。

### 3.3 WarningFlashOverlay 组件

```typescript
export function WarningFlashOverlay() {
  const warningFlashUntil = useGameStore((s) => s.warningFlashUntil);
  const triggerId = useGameStore((s) => s.warningFlashTriggerId);
  const active = warningFlashUntil > Date.now() / 1000;
  if (!active) return null;
  return (
    <div
      key={triggerId}
      data-testid="warning-flash-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(255, 30, 30, 0.3)',  // 比 InvulnerableFlash 更深红
        pointerEvents: 'none',
        animation: 'invulnerable-fade 0.5s linear forwards',
      }}
    />
  );
}
```

## 4. 视觉

### 4.1 CSS

**复用 `invulnerable-fade` keyframe** (theme.css:199) — 已经定义 0% opacity 1 → 100% opacity 0 0.5s linear forwards 模式。P3-3 用同一 keyframe, **不引入新 CSS**。

如果未来要不同动画模式 (e.g. 0.3 → 0.5 → 0 pulse)，加新 keyframe。当前不需要。

### 4.2 颜色 (rgba)

| Overlay | Color | 备注 |
|---|---|---|
| InvulnerableFlash (P2-4a) | rgba(255, 50, 50, 0.25) | 25% 透明度, 偏淡 |
| WarningFlashOverlay (P3-3) | rgba(255, 30, 30, 0.3) | 30% 透明度, 偏红 (hole-down 是更危险操作) |

## 5. 实施步骤

1. **gameStore.ts**: 加 `warningFlashUntil: number` + `warningFlashTriggerId: number` (用于 key={triggerId} 重启) + `setWarningFlashUntil(until: number): void` + `setWarningFlashTriggerId(id: number): void` + initial value 0
2. **Game.ts**: GameBridge interface 加 `onWarningFlashState?: (active: boolean) => void` 字段
3. **Game.ts**: startWarningFlash / tickWarningFlash 完成 / startLevel reset 三处调 onWarningFlashState
4. **GameCanvas.tsx**: bridge 实现 onWarningFlashState → useGameStore.getState().setWarningFlashUntil(Date.now()/1000 + 0.5) + setWarningFlashTriggerId(prev + 1) (active=true) 或 setWarningFlashUntil(0) (active=false)
5. **WarningFlashOverlay.tsx** (NEW): 复制 InvulnerableFlash 模板, 订阅 warningFlashUntil + warningFlashTriggerId
6. **HUD.tsx**: 加 `<WarningFlashOverlay />`
7. **Tests**:
   - `tests/unit/components/warningFlashOverlay.test.tsx` (NEW): 3 case
     - inactive 时不渲染
     - active 时渲染红色 div
     - 多次触发, key 重新挂载 (动画重启)
   - `tests/unit/store/gameStore.warningFlash.test.ts` (NEW): 2 case
     - setWarningFlashUntil 设值正确
     - initial warningFlashUntil === 0

## 6. 验收 (5 框)

- [ ] **正确性**: hole-down 触发 → 屏闪 0.5s 显示 → 0.5s 后隐藏
- [ ] **非破坏性**: stair-up/-down/hole-up/ladder 不触发屏闪
- [ ] **守门**: startLevel reset 屏闪状态
- [ ] **视觉**: 屏闪 0.3 透明度红色, 0.5s 淡出
- [ ] **测试**: 5+ test case 覆盖

## 7. 冻结契约 (CLAUDE.md 锁定不动)

- FLOOR_HEIGHT = 2.4 (P3-1 锁定)
- EYE_HEIGHT = 1.6 (P3-1 锁定)
- Algorithm 15 + 4-mode mapping (P2-21 锁定)
- WARNING_FLASH_DURATION_SEC = 0.5 (P3-2 锁定)
- 屏闪持续 0.5s 必须与 WARNING_FLASH_DURATION_SEC 对齐 (不允许独立设)

## 8. 遗留 (P3-4+)

- HUD 屏闪与 parchment modal 冲突 (parchment 开时屏闪能否显示?) — 候选
- 屏闪在 victory / game-over 状态禁用 (候选)
- 屏闪触觉反馈 (mobile vibration) — 跨平台候选
