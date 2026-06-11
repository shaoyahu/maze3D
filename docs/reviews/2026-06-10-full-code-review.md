# 全量代码评审（Code Review）

**Slug**: full-code-review-2026-06-10
**评审范围**: 整个 `src/`（60 个 TS/TSX 源文件，覆盖 engine / entities / game / maze / store / ui 全部 7 层）+ `src/App.tsx` 路由 + `src/main.tsx` 入口
**评审时间**: 2026-06-10
**评审强度**: high（3+4 角度 × 6 候选 → 1-vote 验证（recall-biased） → ≤10 findings）
**状态**: 7 个 finder 角度（3 正确性 + 3 清理 + 1 高度）已收齐，去重 + 验证后保留 10 条最严重项

> 本轮做了完整 Phase 1 + Phase 2（1-vote 验证）。每条 finding 已通过阅读源代码确认其触发链，不再仅停留候选状态。

---

## 0. 修复状态（截至 2026-06-10）

新会话接手时先看这张表 — 还剩哪些 P0/P1/P2 没修。

| ID | 严重度 | 一句话 | 状态 | 修复日期 | 工作区 / 提交 |
|---|---|---|---|---|---|
| F1 | 致命（P0） | InvulnerableFlash wall-clock / game-time 单位错位 | ✅ **已修复** | 2026-06-10 | 工作区（未 commit） |
| F2 | 致命（P0） | 敌人 `moveToward` 不查墙 — 追击穿墙 | ✅ **已修复** | 2026-06-11 | 工作区（未 commit） |
| F3 | 致命（P0） | 编辑器退出对话框"取消"按钮语义反转 | ✅ **已修复** | 2026-06-11 | 工作区（未 commit） |
| F4 | 严重（P1） | EditorPropertiesPanel re-sync effect 跨字段重置 in-flight 编辑 | ✅ **已修复** | 2026-06-11 | 工作区（未 commit） |
| F5 | 严重（P1） | time pickup `value` 字段是死代码（survive 模式 pickup 看似无效果） | ✅ **已修复** | 2026-06-11 | 工作区（未 commit） |
| F6 | 严重（P1） | JsonMazeProvider 允许 `start === exit` — 加载即 victory | ✅ **已修复** | 2026-06-11 | 工作区（未 commit） |
| F7 | 严重（P1） | `parseEnemies` 不验证 path 节点 in-bounds | ✅ **已修复** | 2026-06-11 | 工作区（未 commit） |
| F8 | 严重（P2） | `buildScene` / `setDarkMode` 闭包 darkMode 让初始 palette 与切换 OFF 行为都不对 | ✅ **已修复** | 2026-06-11 | 工作区（未 commit） |
| F9 | 严重（P2） | Retry 按钮不传 options — mode / 敌人配置丢回默认 | ✅ **已修复** | 2026-06-11 | 工作区（未 commit） |
| F10 | 中（P2） | `Game.setFov` 缺 `Number.isFinite` + 范围检查 | ✅ **已修复** | 2026-06-11 | 工作区（未 commit） |

**修复累计**: 10/10
**P0 阻塞 ship 的剩余**: （已清空 — F2、F3 全部修复）
**P1 功能 bug 剩余**: （已清空 — F4、F5、F6、F7 全部修复）
**P2 UX / 边缘剩余**: （已清空 — F8、F9、F10 全部修复）

---

## 1. 评审方法

全项目 60 个源文件、约 4 千行 TS/TSX，工作树 HEAD = `88ae74a`（与 origin/main 一致，无未提交 diff）。本次评审 **不是针对单个 commit 或 PR**，而是对整个代码库做一次"高 recall"扫描：宁可多报，也不要漏掉真正的 bug。

**7 个独立 finder 角度**:
- A: 逐行扫描（line-by-line）— engine / entities / maze / game / utils
- B: 删除行为审计（removed-behavior auditor）— engine / entities
- C: 跨文件追踪（cross-file tracer）— store + provider + UI
- D: 复用检查（reuse）— 全 src
- E: 简化检查（simplification）— 全 src
- F: 效率检查（efficiency）— 全 src
- G: 高度检查（altitude）— 全 src

**1-vote 验证**: 对每条候选，spot-check 源码（grep + 读相关文件）以判断其触发链是否真实成立。验证后的 finding 按"对最终用户可见性 × 修复成本 × 触发频率"加权排序，取前 10。

**关键已知项（已剔除，不在 10 条内）**:
- `Enemy.ts` `isValidEnemyPath` 导出但仅测试用（types.ts 旁路）— 死代码
- `levelStore.saveJSON` 内部 try/catch 吞 quota 错误，导致 in-memory 与 disk 偏离 — 触发条件罕见（仅 Safari 隐私模式 / localStorage 满）
- `listCustom()` 每次返回新数组 → 任何 store 改动都触发订阅者重渲染 — 性能问题，非正确性
- `editorStore.updatePickup/Enemy/Rule/Name` 4 个 patch action 不入 history — 代码注释里已显式标注为"待 Task 12 补"，是文档化已知 gap
- `EditorPage` 无 `beforeunload` 守卫 — 浏览器刷新 / 关 tab 静默丢未保存改动（仅 last 2s）
- `EditorToolbar.handleImportChange` 不检查 dirty — 导入直接覆盖未保存的关卡
- `LevelSelect.startSpecified` 调裸 `localStorage.setItem` 未走 `isStorageAvailable()` 守卫 — Safari 隐私模式抛错
- `GameCanvas` `setTimeout(setPointerLockError, 3000)` 未在 unmount 时 clear — 切换路由 3s 内 setState 在已 unmount 组件
- `Enemy.canSeePlayer` 在 `dwell` 状态不复用 `heading` — 视野锥锁在上次巡逻方向（FOV 永久盲点）
- `JsonMazeProvider` pickup 允许放在 exit 格里（只 check start 不 check exit）— 罕见 hand-crafted 边界
- `survive` 模式下拾取 `time` 类型不递增 `elapsedTime` 反向计时 — pickup 看似无效果
- `placeEnemy(x, z, width)` 用调用方传入的 `width` 而非 `level.size.width` 做 clamp — 依赖调用方传入正确参数
- `addEnemyNode(enemyId, x, z)` 无 bounds check — 移到网格外可保存
- `updateSize` 不清理新尺寸外的 pickup/enemy — resize 留下孤儿坐标
- `Game.update` `crossesExit` 在 survive 模式 + 玩家踩在 exit 上时仍 fire `onReachExit` — 但 `reachExit` action 自身有 `screen==='playing'` guard，被自然吞掉（潜在问题，实际被掩盖）
- `Game.init` 不 dispose 已有 `InputManager` — React StrictMode / HMR 双重挂载时旧监听器泄漏
- `Game.setFov` 缺 `Number.isFinite` 检查（已在 F10 列入）— 也缺范围检查（FOV<=0 / >=180 同样破坏投影矩阵）
- `loadAllLevels(App.tsx)` 串行 `for...await` — 应 `Promise.all`，启动延迟可优化
- `pickup colors` / `enemy defaults` / `cellKey` 在多处独立硬编码 — 高度问题，列入 `docs/cleanup-backlog.md` 待后续增量顺手清理

---

## 2. 严重度排序的发现清单（验证后）

按"对最终用户可见性 × 修复成本 × 触发频率"加权排序。所有条目已通过 1-vote 验证（CONFIRMED）。

---

### F1 · 致命 · ✅ 已修复（2026-06-10）
**无敌闪烁的 wall-clock / game-time 单位错位 — 一次受伤后红屏与 health bar 闪烁类永久开启**

- 来源: A · C · D · I · G
- 文件: `src/ui/components/InvulnerableFlash.tsx:22` + `src/ui/components/HealthBar.tsx:15` + 根因在 `src/store/gameStore.ts:285`
- 问题描述:
  - `gameStore.damage(n)` 把 `invulnerableUntil` 设为 **wall-clock 秒**（`now ?? Date.now() / 1000`，约 `1.7e9` 量级）
  - `InvulnerableFlash` 用 `invulnerableUntil > elapsedTime` 判定是否处于无敌 — `elapsedTime` 是 **game-time 秒**（0..N 量级）
  - `1.7e9 > 5` 永远为真 → 第一次受伤后，红屏 `<div>` 永久挂载（0.5s `invulnerable-fade` 动画结束后停在 opacity 0 但元素不卸载）；`HealthBar` 永久带 `health-bar--flashing` 类
  - 代码注释（InvulnerableFlash.tsx:5-9）明确假设"the store has already moved `invulnerableUntil` into the past" — 作者把 `invulnerableUntil` 当作 game-time，但实际是 wall-clock
  - 顺带破坏了"两次受伤都能看到屏闪"的核心视觉反馈契约
- 触发场景: 玩家受第一次伤 → 屏闪播放一次 → 之后所有帧 `active=true` → DOM 永久多一个透明 `<div>`，health bar 永久带 `flashing` class（虽然视觉上 0.5s 后动画结束但 React 没卸载）
- 影响范围: 任何带敌人的关卡（reach-exit + enemy / time-trial + enemy / survive）— 也就是当前 P2-4a 的所有关卡
- 修复方案: 把 `damage()` 留在 wall-clock 域（保住 F5 后台 tab 防护），把 UI 比较改回 wall-clock：
  - `InvulnerableFlash.tsx` 去掉 `elapsedTime` 订阅，`active = invulnerableUntil > Date.now() / 1000`
  - `HealthBar.tsx` 同样把 `flashing` 计算改成 wall-clock 比较
  - 组件只在 `invulnerableUntil` 或 `hitCount` 变化时重渲染；CSS 一次性动画自然衰减到 opacity 0；下次受伤 `key={hitCount}` 强制重挂载
  - 同步更新 `tests/component/hud.test.tsx`：旧测试用 `invulnerableUntil: 1.0`（game-time 数值）做 setup，是单位错配 bug 的"帮凶"；改成 `invulnNow()` / `invulnExpired()` 辅助函数返回 wall-clock 相对值
  - `theme.css` 的 `invulnerable-fade` keyframe 注释同步更新
- 验证: `npm test` 552/552 通过；`npm run typecheck` 干净；改动只触及 4 个文件（2 UI + 1 css + 1 test）

---

### F2 · 致命 · ✅ 已修复（2026-06-11）
**敌人 `moveToward` 不查墙网格 — chase 状态下直接穿墙**

- 来源: A · C
- 文件: `src/entities/Enemy.ts:119-131`（`moveToward` 函数）+ 调用方 `tickChase:115-117`
- 问题描述:
  - `moveToward` 仅做 `position += (target - position).normalize() * step`，零墙检查
  - 玩家的 `resolveMove` 走 `Collision.ts`，逐轴 try-move 撞墙回退
  - 敌人 chase 时直接调用 `moveToward(player.position, ...)`，1.6m 墙在中间时一秒钟后敌人 mesh 出现在玩家一侧
  - 装饰胶囊 mesh 同步：`Game.ts:336-338` 把 `enemy.position` 镜像到 `sceneRefs.enemies[i]`，所以视觉穿透立刻可见
  - 墙只挡玩家不挡敌人 — 角色换位后 FOV 视野锥可任意通过
- 触发场景: 任意 `level-tiny-enemy.json` / 算法生成关卡里玩家与敌人之间隔一堵墙 → 敌人进入 chase → 一秒内胶囊 mesh 嵌到墙另一侧
- 建议修复: 在 `moveToward` 之前过一遍 `Collision.tryMoveAxis(enemy.position, dx, dz, grid, enemy.radius)`；或者更简单 — 把敌人在 chase 时也走玩家同款 `resolveMove`（并相应降低 `chaseSpeed` 抵消额外开销）

---

### F3 · 致命 · ✅ 已修复（2026-06-11）
**编辑器退出对话框的"取消"按钮语义反转 — 取消 = 直接退出并丢草稿**

- 来源: A · B
- 文件: `src/ui/editor/EditorPage.tsx:92-110`（`handleExit`）
- 问题描述:
  - 对话框文字：`'当前关卡有未保存的修改。是否保存？\n（取消 = 不退出，确定 = 保存并退出）'`
  - 实际代码：`if (choice) { save + exit } else { localStorage.removeItem(DRAFT_KEY); fall through to onExit() }`
  - "取消"分支执行 `removeItem` + `onExit()`，与"不退出"语义完全相反
  - 注释（line 103）自己都写着 `// User chose "不保存"` — 实现者把"取消"等同"不保存"，但 UI 文案把"取消"等同"不退出"
  - 用户在 10 分钟雕刻 + dirty 状态下点退出 → 读对话 → 点"取消"想继续编辑 → 被静默送回主菜单，in-memory 关卡消失，localStorage 草稿被 `removeItem` 抹掉
- 触发场景: 任何 dirty 状态下点编辑器右上角退出按钮 → 取消 = 数据丢失
- 建议修复: 把 `if (choice)` 改成"保存"分支；"取消"分支应 `return`（不退出）；再增加一个"不保存"按钮（3 选项对话框），或者把当前对话框换成 `confirm('有未保存的修改，是否放弃？')` 二选一，措辞与行为对齐

---

### F4 · 严重 · ✅ 已修复（2026-06-11）
**EditorPropertiesPanel 的 re-sync useEffect 跨字段重置 in-flight 编辑**

- 来源: A · C
- 文件: `src/ui/editor/EditorPropertiesPanel.tsx:73-81`（`LevelMetadataForm` 内 useEffect）+ 关联的 `useDebouncedCommit:48-53`
- 问题描述:
  - useEffect 依赖列表含 `level.rules`（整个对象）
  - `updateRule({ initialTime: 90 })` 创建一个新的 `nextRules = { ...level.rules, ...patch }`，新 `level.rules` 引用必然变化
  - effect 重跑，调用 `setWidth(level.size.width)` / `setDepth(level.size.depth)` / `setInitialTime(level.rules.initialTime)` / 等 — 把所有 local state 重置到当前 store 值
  - 用户同时在 width 字段（local width=20）和 initialTime 字段（local initialTime=90）各打 1 个数 → 300ms 后任一字段的 debounce fire → commit → rules 引用变 → 重置 effect 把另一个字段的 in-flight local 编辑抹掉
  - 作者加的"sibling values 读 store 而非闭包"补丁（line 83-87）只解决了 width/depth 之间的竞速，没解决 effect 重跑抹编辑
- 触发场景: 用户先在 width 字段输 20 → 切到 initialTime 字段输 90 → 300ms 后 width 的 debounce fire 提交 `updateSize(20, 10)` → rules 引用变（level 是新对象）→ effect 重跑 → setInitialTime(60) 把 local 90 抹掉 → 300ms 后 initialTime debounce fire 提交 `updateRule({initialTime: 60})` — 用户的 90 静默丢失
- 建议修复:
  - 方案 A（最小）：把 useEffect 拆成"level 身份变更时同步"和"外部 patch 进来时不同步"两个 effect；后者用 `useEditorStore.subscribe` 订阅而不是 effect 重跑
  - 方案 B（彻底）：在 store 里用 `useShallow` 等价物，或在 form 内对每个字段只 watch 自己的标识符（如 `level.id`），把 sibling 字段的同步放到用户主动切换时（用 onBlur 触发 setState）

---

### F5 · 严重 · ✅ 已修复（2026-06-11）
**time 类型 pickup 的 `value` 字段是死代码 — `p.value` 永远不被读取**

- 来源: A · C
- 文件: `src/store/gameStore.ts:237`（`pickup()` action 的 `if (p.type === 'time')` 分支）+ 关联 schema 在 `src/maze/JsonMazeProvider.ts:118-120`
- 问题描述:
  - 代码：`timeRemaining: s.timeRemaining + (s.currentMaze?.rules.timeOnPickup ?? p.value)`
  - `s.currentMaze?.rules.timeOnPickup` 必然有值（`validateMaze:156-158` 强制 `> 0` 有限数）
  - `??` 右侧 `p.value` 永远不会执行
  - `health` 分支（line 244）真用 `p.value`：`Math.min(maxHealth, s.health + p.value)`，与 time 分支行为不对称
  - 关卡设计师写 `{type:'time', value:5}` 和 `{type:'time', value:30}` 期望"小时间 vs 大时间"两种 pickup — 实际运行时两者给同样的 `rules.timeOnPickup` 增量
  - `p.value` 字段在 schema 层被强制要求（`requireNumber(pp, 'value', ...)`），但运行时零效果 — 隐性契约违反
- 触发场景: 任何关卡作者（手写 JSON / 编辑器 / 导入）的 `time` 类 pickup 的 `value` 字段无运行时效果；UI 不会显示差异；编辑器里的 value 输入框让用户以为能影响行为
- 建议修复:
  - 把 `pickup()` 改为：`timeRemaining + (p.type === 'time' && p.value > 0 ? p.value : s.currentMaze?.rules.timeOnPickup ?? 0)`
  - 在 README / spec 里明确：`value` 优先级 > `rules.timeOnPickup`（让关卡设计者能 override 默认值）
  - 顺带修：survive 模式下 `time` pickup 只增 `timeRemaining`，但 HUD 显示 `currentSurviveSeconds - elapsedTime`（HUD.tsx:21-23），玩家以为 pickup 失效 — `pickup` 应同时把 survive 模式的"剩余秒数"也加回来（建议把 `timeRemaining` 在 survive 模式下改为语义名 `bonusSeconds` 并加进 `elapsedTime` 反向计算）

---

### F6 · 严重 · ✅ 已修复（2026-06-11）
**JsonMazeProvider 允许 `start === exit` — 加载后立即 victory**

- 来源: A · C
- 文件: `src/maze/JsonMazeProvider.ts:95-102`（`validateMaze` 对 start/exit 的检查）
- 问题描述:
  - 现有检查：`start.inBounds` + `exit.inBounds` + `walls[start]==0` + `walls[exit]==0`
  - 缺：没有 `start.x === exit.x && start.z === exit.z` 的禁止
  - `Game.update` 第一个 tick 就跑 `crossesExit`，玩家在 spawn cell 上已"踩到"出口
  - `reachExit` 立即 fire，screen 翻 `win`，`timeUsed` 几乎为 0 写进 best record
  - 编辑器拖拽退出标记时如果把 exit 放到 start 上，save 通过 validation，下次启动直接 win
- 触发场景: hand-crafted JSON 或编辑器里把 exit 拖到 start 上 → 保存 → 下次加载 → 0 秒胜利
- 建议修复: 在 `requireInBounds(exit, ...)` 之后加：
  ```ts
  if (start.x === exit.x && start.z === exit.z) {
    throw new LevelLoadError(`Maze '${id}': start and exit are on the same cell`);
  }
  ```

---

### F7 · 严重 · ✅ 已修复（2026-06-11）
**`parseEnemies` 不验证 path 节点的 in-bounds / integer / walkable — 敌人可走出网格或穿墙**

- 来源: A · C
- 文件: `src/maze/JsonMazeProvider.ts:175-228`（`parseEnemies`）+ 运行时消费 `src/entities/Enemy.ts`
- 问题描述:
  - 现有检查：`spawn.x/z` 通过 `requireInBounds`（强制 integer + 范围）；path 节点只走 `requireNumber`（line 199-200）— 不检查 integer、不检查 in-bounds、不检查 walkable
  - hand-crafted JSON 可放 `path: [{x:1,z:1}, {x:99,z:-2}]` 通过 validation
  - 运行时 `Enemy` 构造把 `path` 节点转世界米数（Game.ts:222-227），敌人 patrol 在 (99*cs+cs/2, -2*cs+cs/2) 处循环
  - 装饰 mesh 渲染到该点（Game.ts:336-338），玩家看到敌人浮在墙外
  - 编辑器 `addEnemyNode`（editorStore.ts:420-427）允许无 bounds 添加节点；`moveEnemyNode`（line 407-418）有 clamp 但起点也可能越界
  - line 174 注释"path nodes are scene-level concerns the engine validates separately" 是空头承诺 — `Enemy.update` / `Collision.hasEnemyContact` 都不验证 path 节点
- 触发场景: 编辑器拖拽 path 节点到网格外 → 保存 → 关卡加载通过 → 敌人 mesh 浮在墙外，玩家无法碰撞它
- 建议修复:
  1. 在 `parseEnemies` 内部循环里把 `requireNumber` 升级为 `requireInBounds(nn, 'x', 'z', ..., width, depth)`（+ 检查 `walls[nz][nx] === 0`）
  2. 顺带：编辑器 `addEnemyNode` 也加 `inBounds` 检查
  3. 删 line 174 那条与现实不符的注释

---

### F8 · 严重 · ✅ 已修复（2026-06-11）
**`buildScene` 与 `setDarkMode` 的闭包 darkMode 让初始 palette 与切换 OFF 行为都不对**

- 来源: A · C
- 文件: `src/engine/Scene.ts:115`（`buildScene` 签名）+ `:152`（无脑 LIGHT）+ `:154-174`（`setDarkMode` 闭包分支）
- 问题描述:
  - line 152 无条件 `applyPalette(LIGHT_PALETTE, null)` — 忽略 `darkMode` 入参
  - `setDarkMode(enabled)` 的 else 分支（line 160-173）检查的是**闭包捕获**的 `darkMode`（buildScene 时的入参），不是 `enabled` 入参：
    ```ts
    } else {
      if (darkMode) {        // 闭包变量，不是 enabled
        applyPalette(DARK_PALETTE, ...);
      } else {
        applyPalette(LIGHT_PALETTE, null);
      }
    }
    ```
  - 用户启动时 darkMode=on → `buildScene(maze, true)` → line 152 涂 LIGHT → 玩家看到浅色场景
  - 玩家切 darkMode=off → `setDarkMode(false)` → 闭包 darkMode===true → 涂 DARK（与意图相反）
- 触发场景: 设置里开启 dark mode → 进入任意关卡 → 第一帧画面是 LIGHT（不响应偏好）；切到 off → 画面变 DARK
- 建议修复:
  ```ts
  // 删 line 152
  const setDarkMode = (enabled: boolean) => {
    if (enabled) applyPalette(DARK_PALETTE, new THREE.FogExp2(...));
    else         applyPalette(LIGHT_PALETTE, null);
  };
  // line 204 之后 Game.startLevel 调 setDarkMode(this.bridge.getCurrentDarkMode()) 一次
  ```
  或更简洁：line 152 改为 `applyPalette(darkMode ? DARK_PALETTE : LIGHT_PALETTE, ...)`，else 分支只涂 LIGHT

---

### F9 · 严重 · ✅ 已修复（2026-06-11）
**Retry 按钮不传 options — time-trial / survive / 敌人配置全部丢回默认**

- 来源: A · C
- 文件: `src/App.tsx:163` + `:166`（GameOverOverlay / WinOverlay 的 onRetry 回调）+ `App.tsx:43`（state `activeOptions`）
- 问题描述:
  - `onRetry={() => activeMaze && startLevel(activeMaze.id)}` — `options` 形参未传
  - `App` 已经在 line 105-106 把 `options` 存进 `activeOptions` state，retry 时本可复用
  - 后果：`gameStore.startLevel` 走 `options?.mode ?? maze.rules.victory` → 玩家选的 time-trial 退回 reach-exit；`surviveSeconds` 退回 90；`enemyCount` 退回 3；`spawnSchedule` 退回 `{enabled:true, ...}`
  - 每次 retry 都是一次"开新关"，违背"重试"语义
- 触发场景: 玩家选 time-trial + enemyCount=5 + progressive=checked → 30s 内 game over → 点重试 → 变成 reach-exit + 3 敌人 + 关 progressive
- 建议修复: `onRetry={() => activeMaze && startLevel(activeMaze.id, activeOptions)}`（一行）
  - 顺带：去重 App.tsx:43 activeOptions 与 App.tsx:124 重置的 useState（line 142 已存）；startLevel 内部不修改 activeOptions 但保证"retry 等于同 options 重启"

---

### F10 · 中 · ✅ 已修复（2026-06-11）
**`Game.setFov` 缺 `Number.isFinite` + 范围检查 — 坏 FOV 输入产生黑屏 / 奇点投影矩阵**

- 来源: A · C
- 文件: `src/engine/Game.ts:149-153`
- 问题描述:
  - 当前实现：
    ```ts
    setFov(degrees: number) {
      if (!this.camera) return;
      this.camera.fov = degrees;
      this.camera.updateProjectionMatrix();
    }
    ```
  - 无 `Number.isFinite`、无范围检查
  - 对比 `InputManager.setSensitivity:22-24`：`if (Number.isFinite(n) && n > 0) this.#sensitivity = n` — 同类函数有守卫
  - FOV=0 / FOV=NaN / FOV=Infinity 都会破坏 `PerspectiveCamera` 的 `f = 1 / tan(fov * DEG2RAD / 2)`：`tan(0)=0` → `f=Infinity` → 投影矩阵奇异 → 画布渲染全黑 / 全空
  - settingsStore 从 localStorage 恢复时如果存在损坏条目（手改 / 旧版本 / JSON.parse 异常）就直接落库 0 / NaN
- 触发场景: 用户在 DevTools 改 `localStorage.maze3d.settings` 把 `fov` 改成 0 / `NaN` → 刷新 → 进入任意关卡 → 画布黑屏
- 建议修复:
  ```ts
  setFov(degrees: number) {
    if (!this.camera) return;
    if (!Number.isFinite(degrees)) return;
    const clamped = Math.max(1, Math.min(179, degrees));
    this.camera.fov = clamped;
    this.camera.updateProjectionMatrix();
  }
  ```
  顺带：settingsStore 持久化前在 `sanitizeSettings` 里对 `fov` 做同样校验

---

## 3. 修复优先级建议

**P0 — 阻塞 ship（修复前不应发布）**:
- ✅ **F1**: InvulnerableFlash wall-clock vs game-time 单位错位 — 核心视觉契约（**已修复 2026-06-10**）
- ✅ **F2**: 敌人 chase 穿墙 — 核心玩法契约（**已修复 2026-06-11**）
- ✅ **F3**: 编辑器取消按钮语义反转 — 静默数据丢失（**已修复 2026-06-11**）

**P1 — 用户可感知的功能 / 数据 bug**:
- ✅ **F4**: EditorPropertiesPanel 跨字段重置 — 编辑器"输完字才看到丢字"
- ✅ **F5**: time pickup value 死代码 — 隐性契约违反，survive 模式 pickup 失效（**已修复 2026-06-11**）
- ✅ **F6**: start === exit 允许 — 编辑器 / 导入关卡可零秒胜利（**已修复 2026-06-11**）
- ✅ **F7**: enemy path 节点无 bounds — 编辑器拖越界（**已修复 2026-06-11**）

**P2 — UX / 边缘场景，可后续增量清理**:
- ✅ **F8**: Scene setDarkMode 闭包分支 — 仅 dark mode 用户感知（**已修复 2026-06-11**）
- ✅ **F9**: Retry 丢 options — 每次 retry 变样（**已修复 2026-06-11**）
- ✅ **F10**: setFov 缺校验 — 仅损坏设置条目触发（**已修复 2026-06-11**）

---

## 4. 已剔除候选一览（避免重新审视）

| 候选 | 角度 | 剔除原因 |
|---|---|---|
| `editorStore.saveDraft` / `loadDraft` 手写 localStorage 不用 `persist.loadJSON/saveJSON` | F | 行为正确，仅代码重复；已记录待清理 |
| `EditorToolbar.importJson` 不查 dirty → 直接覆盖 | A | 数据丢失但仅"导入"路径；P1 备选 |
| `EditorPage` 无 `beforeunload` | A | 数据丢失但仅 2s autosave 窗口内；P2 备选 |
| `LevelSelect` `setItem` 缺 `isStorageAvailable` 守卫 | D | Safari 私有模式；P2 备选 |
| `GameCanvas` `setTimeout` 3s 未在 unmount 时清 | D | 3s 内 setState 警告，行为无副作用 |
| `Enemy.dwell` 状态下 FOV 锥不更新 heading | A · C | 影响范围小（dwell 期间短） |
| `JsonMazeProvider` pickup 允许在 exit 格里 | A | hand-crafted 边界，下条比更严重 |
| `survive` 模式 `time` pickup 不影响 HUD 倒计时 | A | F5 已涵盖根因 |
| `placeEnemy(x, z, width)` 用调用方 width clamp | A | 调用方 EditorViewport 总传 `level.size.width`，无 bug |
| `addEnemyNode` 无 bounds | A | F7 已涵盖根因（parseEnemies 升级会顺手修） |
| `updateSize` 不清理孤儿 pickup/enemy | A | F7 同上 |
| `Game.update` crossesExit 在 survive 触发 | C | `reachExit` 自身有 `screen==='playing'` 守卫，行为安全 |
| `Game.init` 不 dispose 旧 InputManager | A | 仅 dev HMR / StrictMode 触发，prod 无影响 |
| `loadAllLevels` 串行 await | F | 启动延迟优化，非正确性 |
| `pickup colors` / `enemy defaults` / `cellKey` 多处硬编码 | G · I | 设计 smell，已列入 cleanup-backlog |
| `enemyChaseMultiplier` 与 settings.enemyAggression 解耦 | I | P2-4a 评审已记录，本次确认仍未修 |

---

## 5. 与之前评审的关系

- `docs/increments/enemies-editor/review.md`（P2-4a）记录的 F1（敌人管线未接入）已在后续 commit 修复
- 之前提到的 F4（无敌窗口内二次受伤视觉反馈）通过加 `hitCount` 计数器已修
- 之前提到的 F5（后台 rAF 节流卡无敌）通过改用 wall-clock 修了 — 但**制造了 F1 当前的 wall-clock vs game-time 单位错位**（这是一次"修 B 时不小心踩 A"的典型足迹）

---

## 6. 修复建议执行顺序

✅ 1. **F1**: InvulnerableFlash wall-clock 单位对齐 — **2026-06-10 已修复**（改动 4 文件：InvulnerableFlash.tsx / HealthBar.tsx / theme.css / hud.test.tsx）
✅ 2. **F2**: 敌人 move 走玩家同款 `Collision.resolveMove`（一行 patch）— **2026-06-11 已修复**（Enemy.moveToward 改用 `resolveMove` + WallGrid 闭包，"reached" 判定从 `step >= dist` 改为实际距离；改动 2 文件：Enemy.ts / Enemy.test.ts）
✅ 3. **F3**: 对话框按钮三选一，或把"取消"分支改成 `return` — **2026-06-11 已修复**（handleExit 抽出 `DIRTY_EXIT_PROMPT` 常量 + 二选一 `confirm` + "取消"分支改 `return`；"保存并退出"由工具栏按钮负责；改动 2 文件：EditorPage.tsx / EditorPage.test.tsx）
✅ 4. **F4**: EditorPropertiesPanel 拆 effect / 改 subscribe — **2026-06-11 已修复**（方案 A 最小：useEffect 依赖收紧为 `[level.id]`；改动 2 文件：EditorPropertiesPanel.tsx / EditorPropertiesPanel.test.tsx，新增 2 个回归测试）
✅ 5. **F5**: time pickup 死代码 + survive 模式 pickup 无效 — **2026-06-11 已修复**（pickup 改用 `p.value > 0 ? p.value : rulesBonus`；survive 模式同笔 bonus 也加到 `currentSurviveSeconds`；`currentSurviveSeconds` 字段从 `SurviveSeconds` 字面量联合放宽为 `number` 以承载运行时累加，`startLevel` 处仍由 `normalizeSurviveSeconds` 守门；改动 2 文件：gameStore.ts / gameStore.test.ts，新增 3 个回归测试）
✅ 5b. **F8**: Scene.buildScene darkMode 入参用对 — **2026-06-11 已修复**（提取私有 `applyDarkMode(enabled)` helper；line 152 改为 `applyDarkMode(darkMode)`，让 build-time 参数 frame-0 即生效；`setDarkMode` 改为单行 `applyDarkMode(enabled)` 转发，闭包捕获彻底消除；改动 1 源文件：Scene.ts；测试：1 文件 + 3 新 case 含 1 个 control case 验证旧路径仍正确，570/570 全绿）
✅ 6. **F6 + F7**: JsonMazeProvider 加 `start !== exit` 检查 + 升级 `requireNumber` 为 `requireInBounds`（含 `walls[z][x] === 0` walkable 检查）— **2026-06-11 已修复**（F6 4 行 guard 放在 start/exit walls check 之后；F7 在 `parseEnemies` 内对 path 节点改用 `requireInBounds` + 显式 walkable check，更新 JSDoc，删 line 174 误导注释；编辑器 `addEnemyNode` 加 OOB silent-reject；改动 2 源文件：JsonMazeProvider.ts / editorStore.ts；测试：2 文件 + 7 个新 case；mazeProvider 旧 fixture 2 处 wall 节点改为 corner 节点，567/567 全绿）
✅ 7. **F9**: App.tsx onRetry 加 `activeOptions` 参数 — **2026-06-11 已修复**（`GameOverOverlay` 与 `WinOverlay` 两个 `onRetry` 回调同时改成 `startLevel(activeMaze.id, activeOptions)`；改动 1 源文件：App.tsx（2 行 patch + 注释）；测试：1 新文件 `app.retry.test.tsx` + 4 case（time-trial / survive+surviveSeconds / WinOverlay 重玩 / 无 options control case），红绿循环确认（stash 后 3 failed / 1 passed，restore 后 4/4），574/574 全绿）
✅ 8. **F10**: setFov 加 `clampFov` helper（`Number.isFinite` + [30, 120] clamp）— **2026-06-11 已修复**（提新常量 `FOV_MIN=30` / `FOV_MAX=120` / `FOV_DEFAULT=60` + 纯函数 `clampFov(degrees)` 暴露供单测；`setFov(degrees)` 改为先 `clampFov` 再写 `camera.fov` + `updateProjectionMatrix`；settingsStore 侧已经守门（`sanitizeSettings` + `isValidSetting` 都已带 `Number.isFinite` + 范围检查），无需重复加；改动 1 源文件：Game.ts；测试：1 新文件 `engine/game.test.ts` + 10 case（4 个 `clampFov` 单测 + 6 个 `setFov` 行为测试，含 NaN / ±Infinity / OOB / 0 值 / init 之前 no-op），红绿循环确认（stash 后 8 failed / 2 passed，restore 后 10/10），584/584 全绿）

**🎉 全量完成**：F1–F10 全部修复，2 个 P0 + 4 个 P1 + 4 个 P2（连带 F5 拆出的 F8）全清，剩余工作量 0 人天。
