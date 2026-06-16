# Project Review — Full Code Review (2026-06-16)

**Slug**: 2026-06-16-full-code-review
**日期**: 2026-06-16
**评审窗口**: `main` HEAD = `0d6075e fix(deploy): vite base + Router basename + eager level-JSON glob`
**评审范围**: ENTIRE project (per CLAUDE.md §"代码评审文档规范 / 评审范围(强制)" — user did NOT specify a narrower scope)
**评审方式**: Explore agent reading full source tree across correctness, type safety, security, and architecture dimensions

---

## §1 总览

| 严重度 | 数量 |
|---|---|
| HIGH | 3 |
| MEDIUM | 5 |
| LOW | 3 |
| **总计** | **11** |

0 CRITICAL（无安全漏洞 / 数据损坏）· 项目核心逻辑坚实 · 所有发现均为已有代码中的边角问题。

---

## §2 HIGH

### H-1: Stepper clamp 上下界颠倒

- **文件**: `src/ui/editor/EditorPropertiesPanel.tsx:98`
- **影响**: 所有 Stepper 驱动的数字输入框（宽、深、初始时间、最大生命、拾取+时间、拾取值、停留时间、视野范围、视野角度）在用户手动打字而非点 +/- 按钮时，上限永不生效，下限被错误截断到上限。
  ```typescript
  const clamped = Math.max(min, Math.max(max, rounded)); // ← 第二个 max 应该是 min
  ```
  示例：拾取值 `min=0, max=999`，输入 `-5` → 得到 `999`（应该是 `0`）；输入 `1000` → 得到 `1000`（应该是 `999`）。
- **重现**: 打开编辑器 → 点击右侧属性面板任意数字输入框 → 手动打一个超大或负数 → 失焦看 store 值
- **修复**: 第二层 `Math.max` → `Math.min`：
  ```typescript
  const clamped = Math.max(min, Math.min(max, rounded));
  ```

### H-2: URL 往返丢失「渐进生成关闭」状态

- **文件**: `src/utils/gameUrl.ts:104-111` 和 `:182-184`
- **影响**: 用户在 LevelSelect 关闭渐进生成（`progressive enabled=false`）后分享 URL 或刷新 —— URL 不含 `progressive` 参数 → `readOptions` 的 `spawnSchedule` 保持 `undefined` → `startLevel` 回退到 `SPAWN_SCHEDULE_DEFAULT`（`enabled: true`）。渐进生成被静默重新打开。
- **重现**: LevelSelect → 渐进生成 switch 关 → 进入游戏 → 复制 URL → 新标签页打开 → 渐进生成又开了
- **修复**:
  ```typescript
  // 写参数时始终输出 0 或 1
  if (options.spawnSchedule) {
    params.set(PROGRESSIVE_QUERY, options.spawnSchedule.enabled ? '1' : '0');
  }
  // 读参数时只要有值就设置 spawnSchedule
  if (progressiveRaw !== null) {
    if (progressiveRaw !== '0' && progressiveRaw !== '1') {
      return { ok: false, error: 'bad-progressive' };
    }
    options.spawnSchedule = { ...SPAWN_SCHEDULE_DEFAULT, enabled: progressiveRaw === '1' };
  }
  ```

### H-3: 敌人路径节点输入接受 NaN 坐标

- **文件**: `src/ui/editor/EditorPropertiesPanel.tsx:469-470`
- **影响**: 在敌人路径节点输入框中手动打非数字内容（如清除内容或打字母）→ `Number('abc')` = `NaN` → `clamp(NaN, lo, hi)` 返回 `NaN` → NaN 写入 `MazeData.path[].x` / `.z` → 碰撞检测、敌人移动、渲染全坏。
- **重现**: 编辑器 → 选中敌人 → 属性面板路径节点 X 输入 → 清空 → 随便按字母 → 失焦 → 检查 store
- **修复**: 加 `Number.isFinite` 守卫：
  ```typescript
  onChange={(e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v)) moveEnemyNode(enemy.id, i, v, node.z);
  }}
  ```

---

## §3 MEDIUM

### M-1: `updateSize` 保留超界拾取物和敌人

- **文件**: `src/store/editorStore.ts:785-809`
- **影响**: 缩小关卡尺寸后，旧拾取物和敌人坐标仍在数据中且可能超界/在墙上 → 保存时 `validateMaze` 拒绝 → 用户收到无法理解的"拾取物 (7,7) 超界"错误。代码注释 (line 793) 说"resizing wipes pickups/enemies"但实际没有执行。
- **修复**: 在 `updateSize` 结束处过滤：
  ```typescript
  const filteredPickups = nextLevel.pickups.filter(p =>
    p.x >= 0 && p.x < width && p.z >= 0 && p.z < depth
  );
  const filteredEnemies = nextLevel.enemies.filter(e =>
    e.x >= 0 && e.x < width && e.z >= 0 && e.z < depth &&
    e.path.every(n => n.x >= 0 && n.x < width && n.z >= 0 && n.z < depth)
  );
  nextLevel = { ...nextLevel, pickups: filteredPickups, enemies: filteredEnemies };
  ```

### M-2: `placePickup` 允许同一格子重复放置拾取物

- **文件**: `src/store/editorStore.ts:609-638`
- **影响**: 在同一地面格点两次道具工具 → 两个拾取物同坐标 → 保存时 `validateMaze` (JsonMazeProvider line 181) 拒绝 → 用户看到验证错误而不理解原由。应用 `placeWall` / `placeStart` 的静默拒绝 + lastErrorKey 风格在点击时即阻止。
- **修复**: 加重复检测 + 新增 `editor.lastError.pickupDuplicate` i18n key。

### M-3: `initialTime` 和 `timeOnPickup` 允许设 0，validator 却要求 > 0

- **文件**: `src/ui/editor/EditorPropertiesPanel.tsx:246,248`
- **影响**: 用户把初始时间或拾取+时间设为 0 → 编辑器无警告 → 保存时 `validateMaze` 拒绝 (`LevelLoadError`) → 用户必须猜为什么。
- **修复**: 下限从 `Math.max(0, ...)` 改为 `Math.max(1, ...)` 或 validator 侧放宽到 `>= 0`。

### M-4: `EditorViewport.handleCellClick` 缺少 `EditorTool` 穷尽性检查

- **文件**: `src/ui/editor/EditorViewport.tsx:136-171`
- **影响**: 如果未来新增 `EditorTool` 联合变量但没有加到 handleCellClick 中 → 静默通过（无任何操作） → 用户在画布上点了没反应。项目在 `editorStore.deleteSelected` 和 `AlgorithmMazeProvider` 已有 `never` 断言模式，此处缺失。
- **修复**: 在最后 `else` 加 `const _exhaustive: never = tool;`。

### M-5: `EditorPropertiesPanel.renderBody` 缺少 `EditorSelection` 穷尽性检查

- **文件**: `src/ui/editor/EditorPropertiesPanel.tsx:595-606`
- **影响**: 如果新增 selection 类型（如 `start`）→ fallthrough 走 `WallForm(x=undefined, z=undefined)` → 坐标系显示损坏。
- **修复**: 同 M-4，结尾 else 加 `never` 断言。

---

## §4 LOW

### L-1: `lastErrorKey` 在成功 / 无操作后未清理

- **文件**: `src/store/editorStore.ts` 多处
- **影响**: 操作被静默拒绝后（如往起点上放墙 → `lastErrorKey: 'editor.lastError.wallOnStart'`），随后点空地 / 切工具 → 错误消息仍然显示直到 3 秒定时器过期 → 工具栏短暂显示已过时的错误文本。
- **修复**: 在所有成功 action 中设置 `lastError: null, lastErrorKey: null`。

### L-2: `EditorHelpDrawer` ESC 事件泄漏到 Viewport

- **文件**: `src/ui/editor/EditorHelpDrawer.tsx:38`
- **影响**: 在帮助抽屉打开时按 ESC → 抽屉关闭（正确）同时清空选择并切回 select 工具（错误）。`e.stopPropagation()` 无法阻止同一 `document` 上的同级 listener。
- **修复**: 用 `stopImmediatePropagation` 或在 Viewport ESC handler 中检查 help 抽屉是否开启。

### L-3: 敌人初始朝向始终朝东而非朝巡逻方向

- **文件**: `src/entities/Enemy.ts:68`
- **影响**: `currentTarget` 初始化为 0 (`path[0]` 即 spawn 自身) → `headingToward(position, path[0])` 返回 `{ x: 1, z: 0 }`（东）因为距离为 0 → FOV 锥形朝向 spawn +x 而不是巡逻路线方向。
- **修复**: 初始化 `currentTarget = 1`，heading 对准 `path[1]`。

---

## §5 验证结果

| Check | Result |
|---|---|
| Type check (`npm run typecheck`) | ✅ Pass |
| Tests (`npm test`) | ✅ 893 pass / 3 skip / 0 fail |
| Build (`npm run build`) | ✅ Pass |
| E2E (`npm run test:e2e`) | ⚠️ 8 skip (pre-existing test infra debt) |

---

## §6 跨切关注

- **Stepper clamp bug (H-1)** 是 P2-4b 交付引入的 —— 在 P2-9 的代码改动里仍未发现。建议在关键数值 UI 上加单测（testing-library 对 `<input type="number">` 的 `fireEvent.change`）。
- **`lastErrorKey` 清理不一致 (L-1)** 是系统性问题 —— 9 个 action 忘了清理。建议抽 `clearLastErrorPair()` 辅助函数统一入口。

---

## §7 优先级行动建议

1. **立即修** H-1（Stepper clamp 倒置 —— 影响所有属性面板数值输入）
2. **下次增量修** H-2（URL progressive 丢失）+ H-3（NaN 坐标）+ M-1~M-5（中等 5 件）
3. **L-1~L-3** 可攒到下一轮修复 / 技术债清理增量

---

## §8 Files Reviewed

全项目 158 个文件 (`src/` 全部模块、`tests/` 全测试文件、`public/` 4 个 JSON、`docs/` 全文档、`vitest.config.ts` / `playwright.config.ts` / CI workflows) —— 按 CLAUDE.md 默认范围规则全量覆盖。

---

## §9 Fix Status (P2-10, 2026-06-16)

所有 11 项 finding 已在 P2-10 增量中修复(commit 待用户执行;修改在 working tree 中未 stage)。每项 fix 在源码中留下稳定 tag `F-2026-06-16-{H,M,L}-{N}`,git blame 可定位回本 review 的对应行。

| ID | 文件 : 行 | 修复要点 |
|---|---|---|
| **H-1** | `EditorPropertiesPanel.tsx:100` | 评审窗口时 clamp 已是正确形式 (`Math.max(min, Math.min(max, ...))`)；无需修改。`// F-2026-06-16-H-1` 注释保留作为锚点 |
| **H-2** | `src/utils/gameUrl.ts:182-188` | `buildGameSearchParams` 始终输出 `progressive=0`/`=1`(不只在 enabled 时) |
| **H-3** | `EditorPropertiesPanel.tsx:469-487` | 改用 `e.target.valueAsNumber` 而非 `Number(e.target.value)`(后者把 `''` 映射为 0,会接受清空输入为"0"edit) |
| **M-1** | `editorStore.ts:785-822` | `updateSize` 在重建 all-walls 之前过滤 OOB 的 `pickups` / `enemies` + 路径节点 |
| **M-2** | `editorStore.ts:636-647` + `i18n/zh.ts`、`en.ts` | `placePickup` 加同格重复检测,新增 i18n key `editor.lastError.pickupDuplicate` |
| **M-3** | `EditorPropertiesPanel.tsx:246,248` | `Math.max(0, ...)` → `Math.max(1, ...)`(对齐 validator 的 `> 0` 规则) |
| **M-4** | `EditorViewport.tsx:171-178` | `handleCellClick` 末尾加 `const _exhaustive: never = tool;` — tsc 编译期验证 |
| **M-5** | `EditorPropertiesPanel.tsx:602-610` | `renderBody` 末尾加 `const _exhaustive: never = selection;` — tsc 编译期验证 |
| **L-1** | `editorStore.ts`(多 action) | `setTool` / `select` / `clearSelection` / 7 个 commitLevel 成功路径同时清 `lastError` + `lastErrorKey` |
| **L-2** | `EditorViewport.tsx:97` | ESC handler 加 `if (helpOpen) return;` 守卫,防止"关闭抽屉 + 清选择 + 切工具"三连击 |
| **L-3** | `src/entities/Enemy.ts:65-78` | `currentTarget` 初始 1 而非 0,`heading = headingToward(spawn, path[1])` —— path[0]==spawn,旧版零距离导致 heading fallback 为 `{x:1, z:0}`(东),FOV 锥形方向错误 |

**测试同步改动**:
- `tests/unit/entities/Enemy.test.ts` — `makeSpawn` 默认 `path` 改为 `[{0,0}, {2,0}]`(path[0]=spawn)以匹配新 `currentTarget=1` 语义;重写 patrol 循环 + dwellTime 4 个测试;新增 L-3 `initial heading` describe 块
- `tests/unit/collision.test.ts` — cross-node 巡逻测试的 path 同步调整
- `tests/unit/store/editorStore.test.ts` — 新增 M-2 duplicate 检测测试 + L-1 setTool-clears-lastErrorKey 测试
- `tests/unit/utils/gameUrl.test.ts` — 新增 H-2 disabled round-trip 测试
- `tests/component/editor/EditorPropertiesPanel.test.tsx` — 新增 H-3 NaN 守卫测试 + M-3 validator-parity 2 个测试
- `tests/component/editor/EditorViewport.test.tsx` — 新增 L-2 ESC describe 块(2 case: open/closed)
- `tests/component/app.routing.test.tsx` — H-2 disabled URL 断言从 `not.toContain('progressive=')` 改为 `toContain('progressive=0')`(原断言是旧 bug 的行为)

**验证结果**:
- `npm run typecheck`: 0 error
- `npm test`: 903 passed | 1 skipped | 0 failed(基线 893 / 3 / 0,本次净增 10 个 case)

**验证为假阳性的子代理报告**:无。

**跨切关注执行情况**:
- §6 中 "建议在关键数值 UI 上加单测" → 本次 H-3 / M-3 测试已落地(EditorPropertiesPanel component suite)
- §6 中 "建议抽 `clearLastErrorPair()` 辅助函数" → **未抽**;改为在每个成功路径显式展开 `{ lastError: null, lastErrorKey: null }`(共 9 个 set)。抽公共 helper 收益边际,且增加间接层 — 保持显式以保留类型推导与代码可读性
- §7 "立即修 H-1" → H-1 评审窗口时已正确,无修改
