# P1-6/7 EditorStatusBar chip 扩展 + per-instance color damage flash — Plan

**Spec**: `docs/increments/p1-statusbar-enemycolor/spec.md`
**复杂度**: Small (P1-6) + Medium (P1-7)
**日期**: 2026-08-14

> 2 commit ship 节奏 (跟 P5-2 b113218 + 867aa89 风格一致).

## 文件改动总览

| 文件 | 操作 | 任务 | 原因 |
|---|---|---|---|
| `docs/increments/p1-statusbar-enemycolor/spec.md` | CREATE | - | spec (2 task) |
| `docs/increments/p1-statusbar-enemycolor/plan.md` | CREATE | - | plan |
| `src/ui/editor/EditorStatusBar.tsx` | UPDATE | P1-6 | +2 chip (transition + per-layer breakdown) |
| `src/i18n/resources/en.ts` | UPDATE | P1-6 | +4 key |
| `src/i18n/resources/zh.ts` | UPDATE | P1-6 | +4 key |
| `src/engine/Scene.ts` | UPDATE | P1-7 | enemy body + arms 改 per-enemy material clone |
| `src/engine/Game.ts` | UPDATE | P1-7 | enemy.colorRamp 字段 + 每帧 sync |
| `src/entities/Enemy.ts` | UPDATE | P1-7 | 加 colorRamp 字段 + helper |
| `tests/component/editor/EditorStatusBar.test.tsx` | UPDATE | P1-6 | +2 case |
| `tests/unit/engine/enemyRendering.test.ts` | UPDATE | P1-7 | +1 case (per-enemy material instance) |
| `tests/unit/engine/Game.enemyColor.test.ts` | NEW | P1-7 | +3 case (patrol/chase/ramp) |

## 任务清单

### Commit 1: P1-6 EditorStatusBar chip 扩展 (transition + per-layer breakdown)
- [ ] **Action 1.1**: `src/ui/editor/EditorStatusBar.tsx` 加 `status-transitions` chip (count level.transitions.length)
- [ ] **Action 1.2**: 加 `status-layer-breakdown` chip, multi-layer only (levelCount > 1)
- [ ] **Action 1.3**: `src/i18n/resources/en.ts` 加 4 key (transitions/aria/layerBreakdown/aria)
- [ ] **Action 1.4**: `src/i18n/resources/zh.ts` 加 4 key
- [ ] **Test**: `tests/component/editor/EditorStatusBar.test.tsx` +2 case (transition + breakdown multi-layer)
- [ ] **Validate**: `npx tsc --noEmit && npx vitest run`
- [ ] **Commit 1**: `feat(p1-statusbar-enemycolor): P1-6 — transition + per-layer breakdown chip`

### Commit 2: P1-7 per-instance color damage flash
- [ ] **Action 2.1**: `src/entities/Enemy.ts` 加 colorRamp 字段 + start/end + lerp helper
- [ ] **Action 2.2**: `src/engine/Scene.ts` body + arms 改 per-enemy material clone (head 保持 shared)
- [ ] **Action 2.3**: `src/engine/Game.ts` 每帧 sync enemy.colorRamp → body.material.color + emissive
- [ ] **Action 2.4**: chase enter → 0.3s linear ramp base → red, chase exit → 0.5s linear ramp red → base
- [ ] **Test**: `tests/unit/engine/enemyRendering.test.ts` +1 case (per-enemy material instance)
- [ ] **Test**: `tests/unit/engine/Game.enemyColor.test.ts` (NEW) +3 case (patrol base / chase red / ramp back)
- [ ] **Validate**: `npx tsc --noEmit && npx vitest run`
- [ ] **Commit 2**: `feat(p1-statusbar-enemycolor): P1-7 — per-instance color damage flash on chase`

## 验证

```bash
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
npm run build
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| per-enemy material 内存 | 低 | 50×2=100 materials, ~10KB |
| colorRamp 永久红 | 中 | null terminate + per-frame check (跟 activeTransition 模式) |
| EditorStatusBar chip 布局 | 低 | 横向 wrap 自然 |
| FOV cone 红 vs body 红混淆 | 低 | FOV 是 decal (远看), body 是 PBR (近看) |

## 验收

- [ ] 所有 Task 勾选完成
- [ ] 验证命令全部通过
- [ ] spec §11 完成清单全部勾选
- [ ] 1 PR 2 commit push

---

## 执行日志（实施时填写）

### 实施日期
2026-08-14

### 实际改动文件
（实施后填）

### 遇到的偏差
（实施后填）

### 测试覆盖
- 单元覆盖率：（实施后跑 coverage 填）

### 备注
（实施后填）
