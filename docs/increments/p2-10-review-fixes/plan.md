# P2-10 代码评审 11 项修复 — 实施计划（Plan）

**来源**: `docs/reviews/2026-06-16-full-code-review.md`
**复杂度**: Small
**日期**: 2026-06-16

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/ui/editor/EditorPropertiesPanel.tsx` | UPDATE | H-1 clamp 颠倒 · H-3 NaN 守卫 · M-3 下限改 1 · M-5 穷尽性 · L-1 加 lastErrorKey 清理点 |
| `src/utils/gameUrl.ts` | UPDATE | H-2 progressive=0 往返丢失 |
| `src/store/editorStore.ts` | UPDATE | M-1 updateSize 过滤 OOB · M-2 重复拾取物 · L-1 统一 lastErrorKey 清理 |
| `src/ui/editor/EditorViewport.tsx` | UPDATE | M-4 穷尽性 never check · L-2 ESC 冲突（加 helpOpen 检查）|
| `src/entities/Enemy.ts` | UPDATE | L-3 初始朝向 |
| `src/i18n/resources/zh.ts` | UPDATE | M-2 pickupDuplicate 翻译 |
| `src/i18n/resources/en.ts` | UPDATE | M-2 pickupDuplicate 翻译 |
| `tests/unit/store/editorStore.test.ts` | UPDATE | H-1 clamp · M-1 updateSize · M-2 重复拒绝 · L-1 lastErrorKey |
| `tests/unit/utils/gameUrl.test.ts` | UPDATE | H-2 progressive=0 往返 |

## 任务清单

### 1-1: fix H-1 Stepper clamp
- **文件**: `src/ui/editor/EditorPropertiesPanel.tsx:98`
- **Action**: `Math.max(min, Math.max(max, rounded))` → `Math.max(min, Math.min(max, rounded))`
- **Test**: 加单测验证手动输入超大值/负值被正确 clamp

### 1-2: fix H-2 URL progressive=0
- **文件**: `src/utils/gameUrl.ts:182-184` + `:104-111`
- **Action**: 始终写出 `progressive=0`/`=1`；parse 端始终设置 `spawnSchedule`
- **Test**: 往返测试：disabled → URL → parse → disabled 保持

### 1-3: fix H-3 NaN guard
- **文件**: `src/ui/editor/EditorPropertiesPanel.tsx:469-470`
- **Action**: `const v = Number(e.target.value); if (Number.isFinite(v)) moveEnemyNode(...)`
- **Test**: onBlur 清除值后 store 不变

### 2-1: fix M-1 updateSize OOB
- **文件**: `src/store/editorStore.ts:785-809`
- **Action**: 过滤 pickups / enemies 到新 bounds 内
- **Test**: 缩尺寸后 pickups[0] 及其路径在 bounds 内

### 2-2: fix M-2 duplicate pickup
- **文件**: `src/store/editorStore.ts:609-638`
- **Action**: 加重复检测 → lastErrorKey: `editor.lastError.pickupDuplicate`
- **Test**: 同 cell 二次点击 → no-op + lastErrorKey

### 2-3: fix M-3 initialTime=0
- **文件**: `src/ui/editor/EditorPropertiesPanel.tsx:246,248`
- **Action**: `Math.max(0, ...)` → `Math.max(1, ...)`
- **Test**: 输入 0 → commit 后 store 值为 1

### 2-4: fix M-4/M-5 exhaustive checks
- **文件**: `EditorViewport.tsx` + `EditorPropertiesPanel.tsx`
- **Action**: 各加 `const _exhaustive: never = <union>;`
- **Test**: typecheck 断言（编译期验证）

### 3-1: fix L-1 lastErrorKey cleanup
- **文件**: `src/store/editorStore.ts` 多处
- **Action**: 在所有成功 action 末尾加 `lastError: null, lastErrorKey: null`
- **Test**: 切工具后 lastErrorKey 为 null

### 3-2: fix L-2 ESC conflict
- **文件**: `src/ui/editor/EditorViewport.tsx`
- **Action**: viewport ESC handler 检查 `helpOpen` 状态 → 如果 open 则不 reset
- **Test**: help 抽屉 open → ESC → tool 不变

### 3-3: fix L-3 enemy heading
- **文件**: `src/entities/Enemy.ts:68`
- **Action**: `currentTarget = 1`; heading 指向 `path[1]`
- **Test**: 检查 enemy.heading 不是 {x:1, z:0}

## 验证

```bash
npm run typecheck
npm test
npm run build
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| H-2 URL 格式变更影响已有 shared URL | 中 | 旧 URL（无 progressive 参数）回退到 default enabled，行为不变 |
| L-3 heading 变更影响 enemy 行为 | 低 | 仅初始朝向；第一个 tick 后 patrol 逻辑接管 |
