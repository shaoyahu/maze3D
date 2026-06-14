# Project Review — maze3D 全项目代码评审 (2026-06-14)

**Slug**: project-review-2026-06-14
**日期**: 2026-06-14
**前置评审**: [`2026-06-13-project-review.md`](./project-review.md)（138 条 baseline）
**关联文档**: [`findings/E-2026-06-14.md`](./findings/E-2026-06-14.md)

---

## 0. 元数据 & 评审方法

| 项目 | 值 |
|---|---|
| 项目类型 | React 18 + TypeScript + Vite + zustand + Three.js |
| 评审范围 | 65 个 `src/**` 源文件 + `tsconfig.app.json` 类型检查 + `vitest` 测试套件 |
| 评审方式 | 4 个并行 Sonnet-style 子代理 (engine/entities · maze · store/utils · ui/hooks) + 主代理自己验证 |
| 评审窗口 | 截止 `f09a05f feat(maze): P3-Theme 6 misc hardening` |
| 上一评审窗口 | `b02fc5d docs: 增量子目录加 p2-N- 前缀…` |

---

## 1. 概览

| 严重度 | 数量 | 与 baseline 对比 |
|---|---|---|
| **CRITICAL** | 1 | ↑ (baseline 0) |
| **HIGH** | 2 | ↓ (baseline 13) |
| **MEDIUM** | 4 | ↓↓ (baseline 60) |
| **LOW** | 3 | ↓↓ (baseline 65) |
| **总计** | **10** | ↓↓ (baseline 138) |

**一句话结论**: P3-Theme 2-6 收尾后 codebase 整体质量明显改善,bug 密度从 138 降到 10。但**新发现一个 CRITICAL 等级的编辑器流程 bug**:`EditorToolbar.handleSaveAndExit` 中的 `onSaveAndExit?.() ?? onExit?.()` 调用链错误,会让"保存并退出"按钮触发**双重退出流程**(且当 `dirty=true` 时会再弹一个 dirty-exit 对话框)。

---

## 2. 严重度统计

```
CRITICAL  ▏ 1
HIGH      ▏▏ 2
MEDIUM    ▏▏▏▏ 4
LOW       ▏▏▏ 3
```

---

## 3. CRITICAL（1 条）

### 3.1 `src/ui/editor/EditorToolbar.tsx:176` — "保存并退出"按钮双重触发 `handleExit`（E-C-1）

```ts
// EditorToolbar.tsx:176
onSaveAndExit?.() ?? onExit?.();
```

**问题**: `?.()` 调用结果始终是 `undefined`(void return 或属性本身是 undefined),所以 `?? onExit?.()` 总是会执行。当 `EditorPage.tsx:179` 同时把 `onExit` 和 `onSaveAndExit` 都绑定到 `handleExit` 时,点击"保存并退出"会触发**两次** `handleExit` 调用:

- 第一次(`onSaveAndExit?.()`)→ 如果 `dirty===true`,弹出 dirty-exit 确认对话框 — **这是严重 UX bug**,因为用户已经明确选择"保存并退出",不应该再被询问
- 第二次(`onExit?.()`)→ 同样的逻辑再走一遍,`localStorage.removeItem(DRAFT_KEY)` 跑两次

**影响**:
- 总是触发两次 localStorage 写入(removeItem)
- 当 `dirty===true` 时会弹出不需要的确认对话框,用户流程被破坏
- 任何 `onSaveAndExit` 副作用都会跑两遍
- 测试很难稳定 — "保存并退出"按钮的 E2E 路径在第一次点击后会被对话框拦下

**修复**: 改成明确分支,不要用 `??` 合并:

```ts
// 修复方案 1: 优先 onSaveAndExit,只有在它为 undefined 时才退而求其次
if (onSaveAndExit) {
  onSaveAndExit();
} else {
  onExit?.();
}

// 修复方案 2: 把 handleExit 拆成 onSaveAndExit 和 onExit 两份,
// EditorPage 传入真正的不同 handler (而不是同一个 handleExit)
```

---

## 4. HIGH（2 条）

### 4.1 `src/ui/components/Button.tsx:45` — TypeScript 索引错误 TS7053（E-H-1）

```ts
// Button.tsx:45
data-testid={rest['data-testid']}
```

**问题**: `tsc -b --noEmit` 在 `Button.tsx:45` 报告 TS7053:`'data-testid'` 不能索引 `ButtonHTMLAttributes<HTMLButtonElement>` 类型。原因是 `ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>` 但 `data-*` 属性在 React 类型中是被支持的索引访问。`tsc -b` 在某些场景下退出码 0 但仍然输出错误(此次观察:退出 0 但 stderr 有 error)。

**注意**: 退出码不可靠 — 应该以输出为准。CI 系统如果只看退出码会漏掉这个错误。

**影响**: 类型不安全;`data-testid` 在测试中是关键属性,如果传递出问题整个组件测试套件都会失败。

**修复**: 在 `ButtonProps` 中显式声明 `data-testid`:

```ts
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  // ...
  'data-testid'?: string;
}
```

或使用 spread:

```ts
return <button {...rest} ... />;
```

---

### 4.2 `src/maze/JsonMazeProvider.ts:86-91` — 死代码:cellSize 重复校验（E-H-2）

```ts
// JsonMazeProvider.ts:79-91
const cellSize = requireNumber(m, 'cellSize', id);
if (cellSize <= 0) {                                  // ✓ 真正的校验
  throw new LevelLoadError(`Maze '${id}': cellSize must be a finite positive number`);
}
if (cellSize < MIN_CELL_SIZE) {                        // ✓ 真正的校验
  throw new LevelLoadError(`Maze '${id}': cellSize must be at least ${MIN_CELL_SIZE} to fit the player`);
}
if (!Number.isFinite(m.cellSize as number) || (m.cellSize as number) <= 0) {  // ✗ 死代码
  throw new LevelLoadError(`Maze '${id}': cellSize must be a finite positive number`);
}
if ((m.cellSize as number) < MIN_CELL_SIZE) {          // ✗ 死代码
  throw new LevelLoadError(`Maze '${id}': cellSize must be at least ${MIN_CELL_SIZE} to fit the player`);
}
```

**问题**: 第 86-91 行的两个 `if` 永远不会触发,因为第 80-85 行已经用 `requireNumber` 校验并返回了 typed `number`。如果 cellSize 不存在、非数字、或 `<=0`,已经在第 79 行的 `requireNumber` 抛出。同样,`as number` 强转(`m.cellSize as number`)会**绕过类型保护** — 这是 P2/D-6 重构时引入的回归。

**影响**: 死代码 + 重新引入 unsafe cast,可能掩盖未来 `requireNumber` 行为变更。

**修复**: 删除第 86-91 行。

---

## 5. MEDIUM（4 条）

### 5.1 `src/store/editorStore.ts:511-526` — `placePickup` 不检查 exit 单元格（E-M-1）

```ts
// editorStore.ts:511-526
placePickup: (x, z) => {
  const { level } = get();
  if (!isFloor(level, x, z)) return;
  // Match the runtime: never let a pickup sit on the start cell.
  if (level.start.x === x && level.start.z === z) return;
  // ❌ 不检查 exit cell!
  const newPickup: Pickup = { id: generateId(), x, z, type: 'time', value: 10 };
  ...
}
```

**问题**: 只挡掉 start cell,没挡掉 exit cell。但 `validateMaze` 在 save 时会拒绝 pickup on exit,所以 save 时才会发现。`placeStart`/`placeExit` 也都不挡对向。

**影响**:
- 编辑器 UX 不一致 — 用户可以把 pickup 放在 exit 上,只在 save 时报错
- 错误信息在 "保存" 那一刻才出现,而不是点选时就提示

**修复**: 加入 exit 检查:

```ts
if (level.exit.x === x && level.exit.z === z) return;
```

同理 `placeStart` 应该挡 exit,`placeExit` 应该挡 start。

---

### 5.2 `src/maze/JsonMazeProvider.ts:70-78` — `size.width`/`size.depth` 没验证为正整数（E-M-2）

```ts
// JsonMazeProvider.ts:77-78
const width = requireNumber(size, 'width', `${id}.size`);
const depth = requireNumber(size, 'depth', `${id}.size`);
```

**问题**: `requireNumber` 只检查 "is finite number"。手工构造的 JSON `{size: {width: -5, depth: 10.5}}` 会通过。后续:

- `depth = 10.5`:`m.walls.length !== depth` 会失败,但错误信息是"walls 行数不匹配",误导
- `width = -5`:`Array.from({length: -5}, ...)` 行为是空数组,然后下游 `walls[z]?.[x]` 会返回 undefined,然后 `level.start.x` 检查也会出错,但错误链很长

**影响**: 错误信息不友好;攻击面更宽(虽然 `validateMaze` 的下游检查最终会兜住)。

**修复**: 在 requireNumber 后加:

```ts
if (!Number.isInteger(width) || width <= 0) {
  throw new LevelLoadError(`Maze '${id}': size.width must be a positive integer`);
}
if (!Number.isInteger(depth) || depth <= 0) {
  throw new LevelLoadError(`Maze '${id}': size.depth must be a positive integer`);
}
```

---

### 5.3 `src/maze/JsonMazeProvider.ts:95-101,128,131,236-237,263-264` — `requireNumber` 返回值在多处被丢弃（E-M-3）

```ts
// 多处:
requireNumber(start, 'x', `${id}.start`);
requireNumber(start, 'z', `${id}.start`);
// 后续:
walls[startX]?.[startZ]  // startX / startZ 仍然要 `as number` 强转
```

**问题**: F-L11 把 `requireNumber` 改成返回 typed `number`,目的是消除 `as number` 强转。但这些调用点仍然把返回值丢了,然后用 `as number` 拿值。这违反了 P2/D-6 重构的初衷。

**影响**: 代码气味 + 重新引入不安全的 cast。type safety 不一致。

**修复**: capture 返回值:

```ts
const startX = requireNumber(start, 'x', `${id}.start`);
const startZ = requireNumber(start, 'z', `${id}.start`);
// 用 startX, startZ 直接使用,无需 cast
```

---

### 5.4 `src/maze/importExport.ts:135-137` — `sanitizeFilename` 允许 `.` 且 `\w` 是 ASCII-only（E-M-4）

```ts
// importExport.ts:135-137
export function sanitizeFilename(name: string): string {
  return name.replace(/[^\w-]/g, '_').slice(0, 64);
}
```

**问题**:
- `.` 不在排除集(`[^\w-]`),所以 `..` 或 `.hidden` 会原样通过
- `\w` 在非 Unicode flag 下是 ASCII-only,所以中文/日文文件名会被完全擦掉成 `_`

**影响**:
- `..` 文件名可能让某些浏览器/下载管理器出现特殊行为
- 中文文件名用户看到的是乱码 `_`

**修复**:

```ts
// 显式包含 `.`,或额外拒绝 leading dots
return name.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64).replace(/^\.+/, '') || 'level';
```

---

## 6. LOW（3 条）

### 6.1 `src/maze/AlgorithmMazeProvider.ts:46,56` — `logicalSize = Math.ceil(seed.size / 2)` 掩盖了 size 必须为奇数的假设（E-L-1）

```ts
const logicalSize = Math.ceil(seed.size / 2);
exit: { x: 2 * (logicalSize - 1), z: 2 * (logicalSize - 1) }
```

**问题**: 当前 `MAZE_SIZE_VALUES = [15, 30, 50]`,对于 odd sizes 行为正确;但 `Math.ceil` 掩盖了 "size 必须保证 `(size-1)/2 * 2` 在 grid 内" 的假设。如果未来加入 size=29 或 size=31,`Math.ceil(29/2)=15` 给出 `(28,28)` 在 29×29 grid 内 OK,但如果是 size=30 (even),`Math.ceil(30/2)=15` 也是 `(28,28)`,而 30×30 grid 的最末 logical cell 是 `14` (即 `(28,28)` 也 OK,但 reasoning 不清晰)。

**影响**: 当前无 bug,但未来加新 size 时容易出错。

**修复**: 用更明确的写法 + 注释:

```ts
// 算法生成的 maze 是 odd cells,所以 `(size-1)/2` 是最末 logical cell 索引
const lastLogical = (seed.size - 1) / 2;
exit: { x: 2 * lastLogical, z: 2 * lastLogical }
```

---

### 6.2 `src/maze/JsonMazeProvider.ts:140-141` — pickup 重复检测只用 (x,z) 字符串键（E-L-2）

```ts
const seenCells = new Set<string>();
// ...
const key = `${px},${pz}`;
if (seenCells.has(key)) { /* duplicate */ }
seenCells.add(key);
```

**问题**: 今天没问题(同一格只能放一个 pickup),但如果未来允许同一格放不同类型(key + time),此检查会拒绝合法情况。

**影响**: 未来扩展时容易踩坑。

**修复**: 注释 + 用 `${px},${pz},${type}` 作为 key,或保持现状并写明 "future: generalize if multi-type-per-cell allowed"。

---

### 6.3 `src/engine/Loop.ts:13` — `Math.min(0.1, ...)` magic number（E-L-3）

```ts
const dt = Math.min(0.1, (t - this.last) / 1000);
```

**问题**: `0.1` 是 dt 上限(100ms),防止 backgrounded tab 唤醒时单帧 dt 太大导致物理 teleport。但这是 hardcoded magic number。

**影响**: 可读性差,未来调整需要搜 "0.1"。

**修复**: 提取为常量:

```ts
const MAX_DT_SECONDS = 0.1;
// ...
const dt = Math.min(MAX_DT_SECONDS, (t - this.last) / 1000);
```

---

## 7. 验证结果

| 检查 | 结果 | 说明 |
|---|---|---|
| `tsc -b --noEmit` | ⚠️ 部分失败 | 退出码 0,但 `Button.tsx:45` 报告 TS7053。`tsc -b` 退出码不可信,需看输出。 |
| `vitest run` (824 tests) | ✅ Pass | 64 个 test files, 824 passed, 1 skipped |
| `npm run build` | 未跑 | tsc 类型错误可能阻塞 build |
| `npm run lint` | 未配置 | 项目无 eslint 配置 |

---

## 8. Files Reviewed

| 文件 | 状态 | 备注 |
|---|---|---|
| src/App.tsx | ✅ Reviewed | `provider` useMemo 依赖正确 |
| src/main.tsx | ✅ Reviewed | 标准 React 入口 |
| src/engine/Game.ts | ✅ Reviewed | GameBridge 模式正确,无明显 bug |
| src/engine/Loop.ts | ⚠️ LOW | `0.1` magic number (E-L-3) |
| src/engine/Renderer.ts | ✅ Reviewed | 无发现 |
| src/engine/Scene.ts | ✅ Reviewed | 无发现 |
| src/engine/Camera.ts | ✅ Reviewed | 无发现 |
| src/engine/Collision.ts | ✅ Reviewed | 无发现 |
| src/engine/InputManager.ts | ✅ Reviewed | pointer-lock 状态机正确, dispose 完整 |
| src/entities/Player.ts | ✅ Reviewed | 无发现 |
| src/entities/Enemy.ts | ✅ Reviewed | `moveToward` 用 `resolveMove` 是 wall-aware 的 |
| src/entities/Pickup.ts | ✅ Reviewed | 无发现 |
| src/maze/types.ts | ✅ Reviewed | 接口设计正确 |
| src/maze/AlgorithmMazeProvider.ts | ⚠️ LOW | `Math.ceil` 假设 (E-L-1) |
| src/maze/JsonMazeProvider.ts | ⚠️ HIGH/MED/LOW | 4 个 finding (E-H-2, E-M-2, E-M-3, E-L-2) |
| src/maze/EditorMazeProvider.ts | ✅ Reviewed | 正确 |
| src/maze/reachability.ts | ✅ Reviewed | 无发现 |
| src/maze/enemySpawner.ts | ✅ Reviewed | 无发现 |
| src/maze/builtInLevels.ts | ✅ Reviewed | 无发现 |
| src/maze/importExport.ts | ⚠️ MEDIUM | sanitizeFilename (E-M-4) |
| src/store/gameStore.ts | ✅ Reviewed | 无发现 |
| src/store/settingsStore.ts | ✅ Reviewed | 校验完整 |
| src/store/levelStore.ts | ✅ Reviewed | migration / sanitization 正确 |
| src/store/editorStore.ts | ⚠️ MEDIUM | placePickup 不检查 exit (E-M-1) |
| src/store/migrations.ts | ✅ Reviewed | chokepoint 已建立 |
| src/store/editorHistory.ts | ✅ Reviewed | pure helpers,正确 |
| src/store/persist.ts | ✅ Reviewed | safeSetItem / debounce 正确 |
| src/hooks/useAutoSave.ts | ✅ Reviewed | backoff + mounted guard 正确 (修复 A-HIGH-1 已落地) |
| src/ui/App.tsx/EditorPage.tsx | ⚠️ CRITICAL | E-C-1 |
| src/ui/editor/EditorToolbar.tsx | ⚠️ CRITICAL | E-C-1 |
| src/ui/editor/EditorViewport.tsx | ✅ Reviewed | 无发现 |
| src/ui/editor/EditorPropertiesPanel.tsx | ✅ Reviewed | 无发现 |
| src/ui/editor/EditorStatusBar.tsx | ✅ Reviewed | 无发现 |
| src/ui/components/Button.tsx | ⚠️ HIGH | TS7053 (E-H-1) |
| src/ui/components/Crosshair.tsx | ✅ Reviewed | memo + displayName 正确 |
| src/ui/components/Dialog.tsx | ✅ Reviewed | 无发现 |
| src/ui/components/Minimap.tsx | ✅ Reviewed | 无发现 |
| src/ui/components/Timer.tsx | ✅ Reviewed | 无发现 |
| src/ui/components/{EnemyCounter,HealthBar,InventoryBar,InvulnerableFlash}.tsx | ✅ Reviewed | 无发现 |
| src/ui/HUD.tsx | ✅ Reviewed | 无发现 |
| src/ui/WinOverlay.tsx | ✅ Reviewed | 无发现 |
| src/ui/GameOverOverlay.tsx | ✅ Reviewed | 无发现 |
| src/ui/PauseOverlay.tsx | ✅ Reviewed | 无发现 |
| src/ui/Settings.tsx | ✅ Reviewed | 无发现 |
| src/ui/LevelSelect.tsx | ✅ Reviewed | 大但结构清晰 |
| src/ui/MainMenu.tsx | ✅ Reviewed | 无发现 |
| src/ui/MainMenuScene.ts | ✅ Reviewed | dispose 完整 |
| src/ui/GameCanvas.tsx | ✅ Reviewed | pointerLock + cleanup 正确 |
| src/ui/useConfirm.ts | ✅ Reviewed | 队列逻辑正确 |
| src/utils/errors.ts | ✅ Reviewed | clampErrorValue 防止 XSS-ish 注入 |
| src/utils/seed.ts | ✅ Reviewed | crypto.getRandomValues 已切换 |
| src/utils/id.ts | ✅ Reviewed | crypto.randomUUID 优先 |
| src/utils/time.ts | ✅ Reviewed | 无发现 |
| src/game/Rules.ts | ✅ Reviewed | 纯函数,正确 |

---

## 9. 与上一版评审对比

- **A-HIGH-1 (useAutoSave interval race)** → ✅ 已修复 (mounted flag)
- **A-HIGH-2 (editorStore ↔ levelStore 耦合)** → ✅ 已修复 (saveLevel 改为 validation-only)
- **A-HIGH-3 (localStorage 单 key 易丢)** → ✅ 已修复 (per-record try/catch + migration)
- **A-HIGH-4 (MazeProvider 接口名存实亡)** → ✅ 已修复 (三个实现都符合接口)

**新增**:
- 1 个 CRITICAL (EditorToolbar 双重调用)
- 2 个 HIGH (TypeScript error + 死代码)
- 4 个 MEDIUM (input validation + UX 一致性)
- 3 个 LOW (magic number / fragile assumption)

**整体趋势**: 138 → 10 是大幅改善。但**新发现的 CRITICAL 显示回归测试覆盖率有缺口** — 此 bug 在任何人工测试中都应该被发现,说明 E2E 没有覆盖 "保存并退出"按钮点击后的真实路径。

---

## 10. Next Steps

1. **立即修复 E-C-1** (`onSaveAndExit?.() ?? onExit?.()`) — 这会破坏编辑器保存流程
2. **修复 E-H-1** (Button.tsx TS7053) — 修复后 CI 应该改为看 tsc 输出而非退出码
3. **修复 E-H-2** (JsonMazeProvider 死代码) — 简单删除
4. **修补 E-M-1 / E-M-2 / E-M-3 / E-M-4** — 编辑器 UX 和 input validation 改进
5. **添加 E2E**: "保存并退出"按钮的真实路径(不应再弹 dirty-exit 对话框)
6. **重新考虑 tsc 退出码**: 改用 `tsc --noEmit` 单次调用而非 `-b` 模式,确保退出码反映真实结果
