# Phase2增量路线图 + 总任务列表

> 镜像副本：`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` 的 §12 Roadmap。两份应保持同步；以 `_template/` 为单一入口维护时同步 spec。

---

## 🚧 当前进行中（跨设备启动锚点）

> **新会话/换设备时，Claude 必须先读本块再做任何事。**

| 字段 | 值 |
|---|---|
| 活跃增量 | **P2-2** 深色模式 + 新 pickup 视觉 + UseItem 数字键 |
| 已完成 | 13 / 14 |
| 下一个任务 | **#14 文档同步：README / roadmap / spec 状态** |
| 最后更新 | 2026-06-08 |
| 最近 commit | 见 `git log --oneline -1`（避免追尾，由 Claude 主动查） |

**约束**：
- 一次只做一个任务（见下方「总任务列表」）
- 任务完成后立即勾 `[x]` + 更新本块「已完成」「下一个任务」「最后更新」+ commit + 等用户确认
- 不跳着做、不批量做、不主动开下一个任务

---

## Phase1 — MVP（✅ 已完成）
1. Project scaffold (Vite + React + TS + deps)
2. `maze/types.ts` + `JsonMazeProvider` + first level JSON
3. Engine: Renderer + Camera + Scene + Loop (gray box + walls only)
4. InputManager + Player + Collision
5. Pickup + Rules + GameState
6. HUD components + store wiring
7. MainMenu + LevelSelect + Pause/GameOver/Win overlays
8. Persistence: levelStore + settingsStore
9. Tests (unit + E2E)
10. README + run instructions

## Phase2 — 增量路线图

|序 |名称 |优先级 | 前置依赖 |复杂度 |文档目录 |状态 |
|---|---|---|---|---|---|---|
| P2-2 | 深色模式 + 新 pickup 视觉 + UseItem 数字键 | P0 | — | Small | `docs/increments/dark-mode-pickups/` | pending |
| P2-3 | 算法关卡（4 算法 × 3 尺寸 × time-trial） | P1 | — | Large | `docs/increments/procedural-modes/` | pending |
| P2-4a | 巡逻敌人 + survive mode | P2 | P2-3 | Large | `docs/increments/enemies-editor/` | pending |
| P2-4b | 关卡编辑器 | P2 | — | Large | `docs/increments/enemies-editor/` | pending |

> **P2-1 已删除**：原计划"多关卡 JSON（中/大尺寸）"被 P2-3 算法生成取代。MVP 保留 `level-small.json` 作为"教学关"，`level-tiny.json` 留 E2E。
> **P2-4 拆分**：原"敌人 + 编辑器"X-Large 拆成 P2-4a（敌人+survive mode，依赖 P2-3）和 P2-4b（编辑器，独立）。

### 优先级说明
- **P0** = 不依赖其他增量，立即可做
- **P1** = 独立，建议 P0 之后做
- **P2** = 有显式前置依赖

### 复杂度说明
- Small ≤1 天
- Medium 1–3 天
- Large 3–7 天
- X-Large >7 天

### 流程
每个增量有两阶段产物：
1. `docs/increments/<slug>/spec.md` — 设计文档
2. `docs/increments/<slug>/plan.md` — 任务清单

模板见本目录其他文件。

### 候选池
本表仅列入已决定进入规划的增量。其他候选保留：
- 音频（deferred audio pipeline）
- 移动端 / 触摸支持
- 额外的 pickup 子类型

待需求明确后再升级为 P2-N 行。

---

## 总任务列表（执行视图）

> 跨增量任务清单。每个增量内的子任务也列在此。状态用 `[ ]` / `[x]` 跟踪。**一个时间只进行一个任务**，完成后等用户确认。

### P2-2: 深色模式 + 新 pickup 视觉 + UseItem 数字键（Small）

> 范围：补全差异（Q1 决策）。已实现：settingsStore.darkMode 字段、gameStore.inventory、gameStore.damage、gameStore.pickup 处理 time/health/key。本次 ship：darkMode UI 切换、theme.css 暗色变量、Scene.setDarkMode、InputManager 数字键 1/2、gameStore.useItem、Pickup mesh 颜色按 type 分、InventoryBar 高亮。

| # | 任务 | 工作量 | 状态 |
|---|---|---|---|
| 1 | 升级 roadmap.md（**本任务**） | XS | [x] |
| 2 | 重写 P2-2 spec.md（按 Q1/Q3 决策：补全差异 + 严格 engine 边界） | XS | [x] |
| 3 | `theme.css` 新增 `[data-theme="dark"]` 变量集 | XS | [x] |
| 4 | `App.tsx` useEffect 同步 `settingsStore.darkMode → data-theme` | XS | [x] |
| 5 | `Scene.ts` 新增 `setDarkMode(bool)` 方法（Q3 严格：不 import store） | S | [x] |
| 6 | `Settings.tsx` 新增 darkMode toggle 控件 | S | [x] |
| 7 | Q3 严格化：`Game.ts` 去除 store import，改走 `GameBridge` 回调（initial fov/sensitivity/darkMode + isActiveLevel/isPlaying） | S | [x] |
| 8 | `InputManager.ts` 监听 `Digit1`/`Digit2` → 触发 useItem | S | [x] |
| 9 | `gameStore` 新增 `useItem(slot: 0\|1)` action | S | [x] |
| 10 | `Rules.ts` 实现 useItem handler（无锁门 = slot 高亮闪烁） | S | [x] |
| 11 | `Pickup` mesh 按 type 选颜色：time 金黄 / health 红 / key 蓝 | S | [x] |
| 12 | `InventoryBar` 加数字键提示 + slot 高亮激活态 | S | [x] |
| 13 | E2E：`dark-mode.spec.ts` + `pickup-types.spec.ts` | M | [x] |
| 14 | 文档同步：README / roadmap / spec 状态 | XS | [ ] |

> 进度：13/14

### P2-3: 算法关卡（Large）

> 范围：4 算法 × 3 尺寸（15×15、30×30、50×50）× 2 mode（time-trial 默认、reach-exit 可切）。Seed 自包含（算法+版本+尺寸+64-bit mazeSeed），localStorage 缓存 `seed → {algorithm, mazeSeed}` 元数据。LevelSelect 两个入口："随机关卡" / "指定种子关卡"。

> **待 P2-2 完成后展开任务清单**。

### P2-4a: 巡逻敌人 + survive mode（Large）

> 依赖 P2-3。`MazeData.enemies: EnemySpawn[]`；`gameStore.damage` 已在但需要强化；survive mode 框架在 P2-3 ship。

> **待 P2-3 完成后展开任务清单**。

### P2-4b: 关卡编辑器（Large）

> 独立。`EditorMazeProvider` 实现完整 `MazeProvider` 接口；`levelStore.customLevels: Record<id, json>`；3D viewport 用独立 Scene 实例。

> **待 P2-4a 排期时展开任务清单**。

---

## 设计决策记录（Q1–Q15）

| # | 决策 | 选项 |
|---|---|---|
| Q1 | P2-2 范围 | A. 补全差异 |
| Q2 | MazeProvider 接口扩展 | A. `load(id, options?)`，向后兼容 |
| Q3 | Engine/store 边界 | A. 严格不变（DoD §14.2） |
| Q4 | P2-4 拆分 | A. 拆 P2-4a 敌人 + P2-4b 编辑器 |
| Q5 | survive mode 耦合 | A. P2-3 只做 time-trial，survive 推迟到 P2-4a |
| Q6 | 手工 JSON 关卡去留 | A. 删除 P2-1，算法生成统一所有尺寸 |
| Q7 | localStorage 缓存 | B. 缓存 `seed → {algorithm, mazeSeed}` 元数据 |
| Q8 | seed 编码版本 | B. 编码算法版本（`algo-v1-size-hex`） |
| Q9 | "随机关卡" mazeSeed | C. 时间戳 + 32-bit 加密随机 = 64-bit |
| Q10 | LevelSelect 入口 | A. 两个独立按钮 |
| Q11 | 3 种尺寸 UI | D. 卡片=尺寸，算法玩家不感知 |
| Q12 | time-trial 模式呈现 | C. time-trial 默认，可切 reach-exit |
| Q13 | level-small.json 去留 | C. 保留在"固定关卡"组 |
| Q14 | best record 索引 | B. `BestRecord.seed?: string` 字段 |
| Q15 | 执行顺序 | A. P2-2 → P2-3 → P2-4a/b 并行 |
