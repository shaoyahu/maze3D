# P5-editor-multilayer — 编辑器支持多层迷宫

**Slug**: p5-editor-multilayer
**状态**: draft — **待用户 review 后开始实施**
**日期**: 2026-08-12
**对应路线图项**: P5 (editor 多层支持) — P5-multi-layer-teaching (数据层) 的姊妹增量
**依赖**: P5-multi-layer-teaching ship 状态(`MazeData.walls2d` 已就位 + engine 读 `walls2d`)
**复杂度**: Large (X-Large if 拆文件)

## 1. 概述

P5-multi-layer-teaching 落地了 `MazeData.walls2d` 数据层 + 1 个 hand-crafted 2 层教学关卡。**但编辑器还不会用它** — 调研发现:

- 编辑器已经有 `levelCount` + `currentLevel` 字段(`editorStore.ts`)
- 已经有 `addLevel()` / `removeLevel()` actions(只 bump `levelCount` 数字)
- 已经有 `LevelTabs` UI(L1/L2/L3 tab + add/remove 按钮)
- 已经有 entity 按 `currentLevel` 过滤(`EditorViewport.tsx`)
- 已经有 transition ghost overlay(显示跨层连接)
- **但**:`addLevel()` 改 `levelCount` 不改 `walls`,导致新 layer 渲染同 L0
- **但**:`EditorViewport` 画 `maze.walls` 始终是 L0,新 layer 的 walls 没 source
- **但**:用户加 layer 期望能编辑不同的 wall,但实际两个 layer 看起来一样

本 increment 把数据层真正接到编辑器,让"加 layer"是真"加一层独立的 walls"。

locked contracts (跟 P5-multi-layer-teaching 共享):
- `MazeData.walls2d?: CellType[][][]` 长度 = `levelCount`,每层 width × depth
- 编辑器读写 `walls2d`(多 layer)或 `walls`(单 layer),**互斥**(一个 level 不会两个都填)
- 转换:`addLevel` 在单层 level 上把 `walls` 提到 `walls2d[0]`,再 clone 一层 `walls2d[1]`;`removeLevel` 反之
- 引擎的 `Scene.resolvePerLayerWalls` 已经先读 `walls2d`,编辑器不用动

## 2. 调研发现(代码现状)

### 2.1 `editorStore.ts` 关键代码

```ts
// currentLevel + levelCount 已有
addLevel() {
  const current = level.levelCount ?? 1;
  const next = Math.min(6, current + 1);
  const nextLevel: MazeData = { ...level, levelCount: next };
  // ❌ 缺:不更新 walls → 新 layer 渲染同 L0
  set({ ...commitLevel(get(), nextLevel), currentLevel: next - 1 });
}

removeLevel() {
  const current = level.levelCount ?? 1;
  if (current <= 1) return; // 保护
  // ❌ 缺:不更新 walls
  const removed = current - 1;
  const nextLevel: MazeData = { ...level, levelCount: removed };
  set({ ...commitLevel(get(), nextLevel), currentLevel: Math.min(get().currentLevel, removed - 1) });
}
```

### 2.2 `EditorViewport.tsx` 渲染

```tsx
// 渲染 walls 部分(line ~750+):
const cellLoop = (() => {
  // ...
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      // ❌ 一直读 maze.walls,不看 currentLayer
      if (maze.walls[z]?.[x] === 1) { /* draw wall */ }
    }
  }
})();
```

### 2.3 `LevelTabs.tsx` UI(已 OK)

- 渲染 1..levelCount 个 tab,active 标记
- + / - 按钮(addLevel / removeLevel)
- 不需要改

### 2.4 transition ghost overlay(已 OK)

- `EditorViewport` 已经画所有 transitions + 半透明标记跨层连接
- 多 layer 加进来后,自然 work

### 2.5 `editorValidation.ts` 多层校验(部分 OK)

- `isReachable(walls, start, exit)` — 只用 `walls`,**没考虑 multi-layer**
- 多层:需要按 `start.level` 选对应 layer 的 walls,做 BFS
- transition 校验:已经在 P5-1 落到 JsonMazeProvider,编辑器端 JSON 导出后会自动 validate

### 2.6 `importExport.ts`(已 OK)

```ts
export function exportLevel(level: MazeData): string {
  return JSON.stringify(
    { schemaVersion: 1, level: { ...level, name: safeName } },
    null, 2,
  );
}
```

- `...level` 自动 spread `walls2d`
- 不需要改

## 3. 目标 / 非目标

### 目标
- `addLevel` / `removeLevel` 真改 `walls2d` (单/多层转换正确)
- `EditorViewport` 渲染 `walls2d[currentLevel]`(多 layer 时)或 `walls`(单 layer)
- 编辑器 import 解析 `walls2d`(`JsonMazeProvider` 已支持,只需 `importExport` 不丢字段)
- `editorValidation` 多层 reachability check(用 `walls2d[start.level]`)
- UI 加个 hint:"这是多层关卡,L1 / L2 / L3 切换编辑",点 tab 立刻看到对应层 walls
- 单层关卡不变,back-compat

### 非目标
- 新的 layer 切换动画(继续用 React state 切换,无动画)
- per-layer wall 美术工具(继续用 brush 画 0/1,跟单层一样)
- transition 5 kind UI 改动(已经能 place)
- 3D 编辑器(2D-only)
- schemaVersion bump(继续 v1,`walls2d` 是 optional back-compat)

## 4. 用户故事
- 作为编辑器用户,我点"+" 加 layer,看到 L2 tab 出现,新 L2 的 walls 是 L1 的 clone(我可以马上编辑 L2 walls 跟 L1 不同)
- 我点"-" 删最顶层,如果删完只剩 1 层,UI 自动塌缩回单层布局
- 我切 L1/L2/L3 tab,viewport 立刻切到对应层 walls
- 我在 L2 放 pickup / enemy,标 `level: 2` 字段,JSON 导出后 `walls2d[2]` 是我编辑的版本
- 我 reload 已有的多层 JSON,编辑器自动识别 + 渲染 L1 walls

## 5. 数据 / 类型变更

无新字段。`MazeData.walls2d` 已经在 P5-multi-layer-teaching 加了。

## 6. 文件改动(预估)

| 文件 | 操作 | 改动 | 说明 |
|---|---|---|---|
| `src/store/editorStore.ts` | UPDATE | `addLevel` / `removeLevel` / `commitLevel` 改 `walls2d` | 核心:管理 per-layer walls |
| `src/ui/editor/EditorViewport.tsx` | UPDATE | walls 渲染用 `walls2d[currentLevel] or walls` fallback | 切换 layer 时 viewport 立刻换 |
| `src/ui/editor/editorValidation.ts` | UPDATE | `isReachable` 接 `walls2d: CellType[][][] \| undefined` | 多层 BFS |
| `src/ui/editor/LevelTabs.tsx` | MINOR | 加 visual hint "multi-layer mode" + tab tooltip | UI 提示 |
| `src/ui/editor/EditorHelpDrawer.tsx` | MINOR | 加 "working with multi-layer" 段 | 帮助文档 |
| `src/utils/perLayerWalls.ts` (NEW) | NEW | `cloneLayer`、`dropLayer`、`getCurrentLayerWalls` 工具函数 | 复用 addLevel / removeLevel / EditorViewport |
| `src/maze/importExport.ts` | MINOR | `parseImport` import 后 store 端把 `walls` / `walls2d` normalize(单层无 walls2d,多层有) | 跟 store 同步 |
| `tests/unit/store/editorStore.test.ts` | UPDATE | +3 case:addLevel/removeLevel walls2d,单→多→单转换 | 核心逻辑 |
| `tests/unit/utils/perLayerWalls.test.ts` | NEW | +6 case:工具函数 | 单测 |

**预估 8 文件,+~250 行,净 +150 行**

## 7. 新文件:`src/utils/perLayerWalls.ts`(用户提示的"分不同的文件")

> "可能需要分不同的文件来处理" — 把 per-layer walls 操作集中到一个工具模块,避免在 editorStore 里 inline 一堆 if/else。

```ts
// 单一 source of truth:per-layer walls 操作
export function getCurrentLayerWalls(
  level: MazeData,
  currentLevel: number,
): CellType[][] {
  if (level.walls2d && level.walls2d[currentLevel]) {
    return level.walls2d[currentLevel];
  }
  return level.walls;
}

// 单层 → 多层 promote:把 `walls` 提到 `walls2d[0]`,新加一层 clone
export function promoteToMultiLayer(
  level: MazeData,
  newLayerClone: 'clone' | 'empty' = 'clone',
): MazeData {
  const firstLayer = level.walls;
  const newLayer = newLayerClone === 'clone'
    ? firstLayer.map(row => [...row])
    : createEmptyGrid(level.size.width, level.size.depth);
  return {
    ...level,
    walls2d: [firstLayer, newLayer],
    walls: undefined as any, // 类型上不能 undefined,但我们用 walls2d 替
    // 实际:删 walls 字段
  };
}

// 多层 → 单层 collapse:删 walls2d,把 walls2d[0] 降级成 walls
export function collapseToSingleLayer(level: MazeData): MazeData {
  if (!level.walls2d) return level;
  const { walls2d, ...rest } = level;
  return { ...rest, walls: walls2d[0] };
}
```

注:TypeScript 严格上 MazeData.walls 必填,不能让 `walls: undefined`。需要:
- `MazeData.walls` 改 optional(允许 undefined)?
- 或 `walls2d` 互斥时,walls 存 placeholder `[]`?

我的倾向:`MazeData.walls` 改 optional(`walls?: CellType[][]`),`walls2d?: CellType[][][]`。validator 强制:**必须有** `walls xor walls2d`。**单层 → 必有 walls;多层 → 必有 walls2d**。

这是 schema 1 个小改,跟 P5-1 兼容,只是把 `walls` 从 required 改 optional。

## 8. 引擎 / 架构影响

| 边界 | 检查 |
|---|---|
| 引擎层不引入 react / store | ✅ perLayerWalls.ts 是纯 utils,无 react/store 依赖 |
| 2D 模式全链路零回归 | ✅ 单层关卡(98% 现存关卡)`walls2d` 仍 undefined,viewport 走 `walls` fallback,无变化 |
| JsonMazeProvider 一致 | ✅ 解析 `walls2d` 已经支持(见 P5-1),编辑器 export 后能 round-trip |
| dispose path | ✅ per-layer mesh 在 disposeScene 里 walk 一遍,新增 layer 不需要新 dispose 逻辑 |

## 9. UI / UX 变更

- **LevelTabs**:激活 tab 视觉强化(已有),+ tooltip 显示该 layer 的 entity count
- **EditorStatusBar**:多 layer 时显示 "Layer 1/3" 而不是 "1 layer",让用户知道当前在多层模式
- **EditorHelpDrawer**:加一节 "多层迷宫",教用户:
  - 单层 → 多层:点 + 加新 layer,新 layer 默认是当前 layer 的 clone
  - 多层 → 单层:点 - 删到只剩 1 layer 自动塌缩
  - 跨层连接:place transition (stair / hole / ladder),transition ghost overlay 显示跨层
  - JSON 输出:`walls2d` 数组长度 = `levelCount`

## 10. 错误处理
- 试图 `addLevel` 到 `levelCount = 6` → toast error "已达最大层数 6"
- 试图 `removeLevel` 到 `levelCount = 1` → disabled 按钮(已经实现)
- 编辑单层 level 时删 walls2d(用户在 UI 看不到,但 validator 端要防):JsonMazeProvider 已经 reject

## 11. 测试策略

### 单元测试
- `tests/unit/utils/perLayerWalls.test.ts`(NEW, 6 case):
  - `getCurrentLayerWalls` 单层/多层
  - `promoteToMultiLayer` clone / empty
  - `collapseToSingleLayer` 多层 → 单层
- `tests/unit/store/editorStore.test.ts`(UPDATE, +3 case):
  - `addLevel` 单层 → 多层,`walls2d[0]` = 原 walls,`walls2d[1]` = clone
  - `addLevel` 多层 → 多层,`walls2d[currentCount] = clone`
  - `removeLevel` 多层 → 单层,walls 回到 `walls2d[0]`
  - `addLevel` 边界:levelCount = 6 不动
  - `removeLevel` 边界:levelCount = 1 不动

### 组件测试
- `tests/unit/ui/editor/LevelTabs.test.tsx`(UPDATE):+1 case "shows multi-layer mode hint when levelCount > 1"

### 集成
- 端到端:创建多层 level → 导出 JSON → reload → 验证 EditorState
- 用 dev server 跑手动 QA,加 layer 后看 walls 变化

## 12. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| `MazeData.walls` 改 optional 破旧 import | 中 | `walls: undefined` 在 runtime 没意义(JsonMazeProvider strict reject),但 type system 允许 |
| `addLevel` clone 误把同一份 reference 放进 walls2d | 中 | 强制 `firstLayer.map(row => [...row])` deep clone |
| 编辑器 export 后 import 丢字段 | 低 | 验证 `importExport.test.ts` round-trip 加 walls2d case |
| 多层 reachability check O(N) | 低 | 教学 5×5 + procedural 50×50 × 6 层都 < 1ms |

## 13. 完成清单

### 13.1 功能验收
- [ ] 单层关卡加 layer → 多层,viewport 切 tab 立刻换 walls
- [ ] 多层关卡删到 1 层 → 自动塌缩回单层
- [ ] 多层 JSON import 进编辑器,识别 + 渲染 L1 walls
- [ ] 多层 JSON export 出来有 `walls2d` 字段
- [ ] transition ghost overlay 跨多层显示
- [ ] 2D 模式所有既有 test 通过

### 13.2 引擎 / 架构边界
- [ ] 引擎层不新增 react / store import(perLayerWalls.ts 是 utils)
- [ ] 2D 模式单层关卡行为不变

### 13.3 测试
- [ ] +6 perLayerWalls case
- [ ] +3 editorStore 多层 case
- [ ] +1 LevelTabs 多层 hint case
- [ ] 既有 1705 test 全 pass(0 回归)

### 13.4 文档
- [ ] spec.md / plan.md 写入
- [ ] EditorHelpDrawer 加多层段
- [ ] README + roadmap 标 P5-editor-multilayer

## 14. 实施阶段(预估 2-3 天)

### Phase 1: 数据层 + utils (3-4h)
- 加 `MazeData.walls` → optional
- 创建 `src/utils/perLayerWalls.ts` + 6 单测
- 改 `editorStore.addLevel` / `removeLevel` 真实操作 `walls2d` + 3 单测

### Phase 2: viewport 切换 (2-3h)
- `EditorViewport` 渲染改用 `getCurrentLayerWalls`
- 多层时 entity 过滤已经按 `currentLevel`,验证 OK
- UI 验证 + 手测

### Phase 3: validation + import/export (2h)
- `editorValidation.isReachable` 接 `walls2d`
- `importExport` import 路径验证 `walls2d` 不丢
- `importExport.test.ts` round-trip 加 walls2d case

### Phase 4: 文档 + UI 提示 (1-2h)
- `EditorHelpDrawer` 加多层段
- `LevelTabs` tooltip
- `EditorStatusBar` 多层显示
- `docs/increments/p5-editor-multilayer/{spec,plan}.md` (已写)
- `roadmap.md` 标 P5 完成

**总预估 8-11h**

## 15. 关键决策(已确认)

1. **MazeData.walls 改 optional** ✅ **Decision: A**
   - 改 optional,validator 强制 `walls xor walls2d`
   - 单层 → 必有 `walls`;多层 → 必有 `walls2d`(互斥)

2. **addLevel 新 layer 行为** ✅ **Decision: A**
   - 克隆当前 layer(默认,跟 user 心智模型一致)
   - UI 可后续加"空 grid"选项(本 increment 不做)

3. **removeLevel 删哪一层** ✅ **Decision: A**
   - 删最顶层(跟现有行为一致,UI 也只放"删最顶"按钮)

4. **是否拆 EditorViewport** ✅ **Decision: A**
   - 不拆,在 viewport 里加 if/else 分支
   - 改动小,viewport 改动只在 walls 渲染部分,其他不变

5. **perLayerWalls.ts 单独文件** ✅ **Decision: A**
   - 单独 utils 文件,加 3 个工具函数 + 6 单测(用户提示"分不同的文件")

---

## 16. 后续候选 (P5+)
- P5-cleanup: L-1 `getPlayerY()` + L-2 `_mode?: never` dead code + 注释噪音(P4 refactor-fp2d 推下来的)
- 3D enemy 球体:spec §11.1 偏差,P+ 候选
- 多人协作:level 多 user 编辑,不在 scope
- Per-instance color: 墙实例颜色自定义,P+ 候选
