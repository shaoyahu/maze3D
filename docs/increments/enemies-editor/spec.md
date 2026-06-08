#巡逻敌人 + 关卡编辑器 — 设计文档（Spec）

**Slug**: enemies-editor
**状态**: draft
**日期**:2026-06-08
**对应路线图项**: P2-4
**依赖**: P2-3（程序生成 + 新 mode 提供 EnemySpawn字段）
**复杂度**: X-Large

##1.概述
最大的一项增量，分两部分：
（a）巡逻敌人系统：新增敌人实体、AABB路径巡逻、与玩家的碰撞 /命中事件、health-loss机制；对接 P2-3 的 `survive` mode；
（b）关卡编辑器：在浏览器内可视化编辑迷宫 + 关卡 JSON，保存到 localStorage 或下载为 JSON 文件，实现 `EditorMazeProvider`。

两者一起把游戏从"玩别人设计的关卡"升级到"玩自己设计的关卡 +应对敌人"。

##2.目标 / 非目标

###目标
- 新增 `src/entities/Enemy.ts`：敌人实体 +路径巡逻逻辑
-敌人在预定义巡逻路径节点之间循环移动，到达节点后等 `dwellTime` 秒再继续
-玩家与敌人碰撞 → `damage(1)`事件 → health-1，敌人短暂无敌（0.5s）后继续
-玩家 health=0 → state转为 `game-over`
- 新增 `MazeData`字段：`enemies: EnemySpawn[]`（位置 +巡逻路径）
- 新增 `src/maze/EditorMazeProvider.ts`：基于 `EditorState` 生成 `MazeData`
- 关卡编辑器 UI：3D视口（复用 Three.js Scene）+工具栏（墙 /起点 /出口 / pickup /敌人）+ 保存为 JSON
-玩家可以从编辑器创建一个新关卡并立即试玩

### 非目标
-多种敌人类型（仅一种"巡逻者"）
-敌人 AI路径规划（仅巡逻点循环）
- 关卡 JSON 上传到服务器
- 编辑器撤销 / 重做（v1 仅一次保存）
- 关卡分享 /社区市场

##3. 用户故事
- 作为动作玩家，我想要敌人增加挑战
- 作为关卡设计者，我想要可视化编辑关卡
- 作为休闲玩家，我想要快速试玩我刚设计的关卡

##4. 功能需求

###敌人系统（FR-1 到 FR-6）
- FR-1：新增 `Enemy.ts`实体，包含 `position, path, currentIndex, dwellTime, state`
- FR-2：`Scene.ts` 注册敌人 mesh，简单的低多边形胶囊 +颜色（深灰）
- FR-3：`Rules.ts` 新增 `enemySpawn` 处理；引擎每帧更新敌人位置
- FR-4：`Collision.ts` 新增 `playerVsEnemy`：圆形 vs胶囊 AABB
- FR-5：`gameStore.damage(n)` action；health=0 → game-over
- FR-6：`MazeData`扩展 `enemies: EnemySpawn[]`，JsonMazeProvider解析

###编辑器（FR-7 到 FR-13）
- FR-7：新增 `EditorMazeProvider.ts`，实现 `MazeProvider` 接口，输入 `EditorState`
- FR-8：新增 `src/ui/Editor.tsx`：3D视口 +工具栏 + 当前关卡 JSON预览
- FR-9：工具栏支持：墙 toggle /起点设置 /出口设置 / 添加 pickup / 添加敌人 / 清空
- FR-10：3D视口：点击格子切换墙，点击空白设置起点等
- FR-11：保存到 localStorage（key=`custom-levels/<name>.json`）或下载为 .json 文件
- FR-12：从 localStorage加载自定义关卡并出现在 LevelSelect 的"自定义"分组
- FR-13：从编辑器"试玩"按钮 → 直接进入 `playing`状态

##5. 数据 /类型变更

###新增类型
```ts
// src/maze/types.ts
export interface EnemySpawn {
 id: string;
 x: number; z: number;
 path: Array<{x: number; z: number}>;
 dwellTime: number; // seconds at each waypoint
}

export interface MazeData {
 // ...existing fields
 enemies: EnemySpawn[]; // NEW, default []
}

// src/maze/EditorMazeProvider.ts (new)
export interface EditorState {
 size: { width: number; depth: number };
 walls: CellType[][];
 start: { x: number; z: number };
 exit: { x: number; z: number };
 pickups: Pickup[];
 enemies: EnemySpawn[];
 rules: LevelRules;
}
```

###Store字段
- `levelStore`：新增 `customLevels: Record<string, string>`（id → JSON string）
- `gameStore`：扩展 `damage(n)` action

##6.引擎 /架构影响

###受影响文件（敌人）
| 文件 |改动 |说明 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | 新增 `EnemySpawn` + `MazeData.enemies` |
| `src/maze/JsonMazeProvider.ts` | UPDATE |解析 enemies |
| `src/entities/Enemy.ts` | CREATE |敌人实体 |
| `src/engine/Scene.ts` | UPDATE | 注册敌人 mesh |
| `src/engine/Collision.ts` | UPDATE | 新增 playerVsEnemy |
| `src/game/Rules.ts` | UPDATE |敌人巡逻更新 +伤害处理 |
| `src/store/gameStore.ts` | UPDATE | damage action + health=0 → game-over |
| `src/ui/components/HealthBar.tsx` | UPDATE |受伤时闪烁 |

###受影响文件（编辑器）
| 文件 |改动 |说明 |
|---|---|---|
| `src/maze/EditorMazeProvider.ts` | CREATE | 新 provider |
| `src/ui/Editor.tsx` | CREATE | 编辑器 UI |
| `src/store/levelStore.ts` | UPDATE | customLevels字段 |
| `src/ui/LevelSelect.tsx` | UPDATE | "自定义"分组 |
| `src/main.tsx` | UPDATE | 新增 editor route |

###边界检查
- `Enemy.ts` 与 `EditorMazeProvider.ts` 不 import react/store
- 编辑器 UI 通过 Zustand + events 与引擎通信，不直接持有 mesh引用

##7. UI /UX变更

###屏幕 /组件改动
- `Editor.tsx`（新）：全屏，左侧3D视口，右侧工具栏，底部 JSON预览
- `LevelSelect.tsx`：新增"自定义关卡"分组
- `HealthBar.tsx`：受伤时红色闪烁 +0.5s 无敌提示

###交互流程（编辑器）
1.玩家主菜单 → "关卡编辑器"
2.选尺寸（如15×15）→ 进入编辑器
3.玩家用工具栏在3D视口点击格子画墙
4.玩家设置起点 +出口
5.玩家点"试玩"→ 直接进入游戏状态
6.玩家点"保存"→ 输入名称 →写入 localStorage

##8.错误处理

###新增错误码
- `EnemyPathError`：敌人巡逻路径无效（少于2点）→ 编辑器提示
- `EditorValidationError`：编辑关卡缺起点 /出口 → 编辑器提示
- `CustomLevelLoadError`：加载 customLevels JSON失败 →跳过该关卡

###兜底行为
-敌人巡逻路径只有1点 →原地不动
- 编辑关卡保存时校验不通过 → 不允许保存，UI红色提示
- localStorage满 →阻止保存，提示用户下载 JSON

##9. 测试策略

###单元测试（敌人）
- `Enemy.test.ts`：路径巡逻状态机（推进 / dwell /循环）
- `Collision.test.ts`：playerVsEnemy边缘情况
- `rules.test.ts`：敌人巡逻更新 +伤害事件
- `JsonMazeProvider.test.ts`：enemies字段解析

###单元测试（编辑器）
- `EditorMazeProvider.test.ts`：EditorState → MazeData转换
- `levelStore.test.ts`：customLevels增删改 +持久化

###组件测试
- `HealthBar.tsx` RTL：受伤时状态
- `Editor.tsx` RTL：工具栏按钮可用性

### E2E 测试
- `enemies.spec.ts`：碰敌人 → health-1 → game-over
- `editor.spec.ts`：画墙 → 设起点 → 保存 →试玩通关
-扩展 `pause-resume.spec.ts`：敌人在暂停时不移动

##10.风险

|风险 |可能性 |缓解 |
|---|---|---|
|敌人 AI性能（N 个敌人 ×路径） | 中 | 用简单状态机，每帧仅更新当前敌人；N≤10没问题 |
| 编辑器3D视口与游戏引擎冲突 | 中 | 编辑器使用独立 `Scene` 实例，独立 dispose |
| 编辑器保存的关卡无解 | 高 | 保存前做可达性校验（DFS） |
| localStorage容量限制 | 低 |限制单个 JSON <100KB，超出提示下载 |
| `damage`事件频率过高导致 health暴减 | 中 |0.5s 无敌间隔；多次碰撞合并 |

##11. 完成清单（拷贝自 `_template/dod.md`）

###11.1 功能验收
- [] FR-1 到 FR-13全部实现
- [] 敌人巡逻 +伤害端到端可走通
- [] 编辑器创建关卡 → 保存 →试玩通关完整链路
- [] 边界情况（路径 /校验 /持久化）显式覆盖

###11.2引擎 /架构边界
- [] `Enemy.ts` 与 `EditorMazeProvider.ts` 不 import react/store
- [] 编辑器3D视口独立 `Scene` 实例，独立 `dispose()`
- [] 敌人 mesh / 编辑器 mesh 在 `dispose()` 中释放

###11.3 测试
- [] 单测覆盖率 ≥80%（敌人 + 编辑器各≥5个测试文件）
- [] RTL:HealthBar / Editor工具栏
- [] E2E:enemies / editor / pause-resume扩展
- [] `npm run typecheck` 与 `npm run build` 通过

###11.4文档
- [] `docs/increments/enemies-editor/spec.md`已写入（本文件）
- [] `docs/increments/enemies-editor/plan.md`待写
- [] README.md 的"Future increments"中标 P2-4 完成时移走
- [] spec §7 `MazeData`反映 `enemies`字段

###11.5持久化与兼容
- [] `levelStore.best` schema兼容（enemies字段缺失视为空数组）
- [] `levelStore.customLevels`持久化
- [] 不破坏现有 best records

###11.6 安全与健壮性
- [] 编辑器 JSON 输入校验（size / walls边界 / path节点）
- [] 错误处理走 `GameError`体系
- [] 无 console.log残留
- [] 无硬编码资源 URL

##12. 参考
- 设计 spec:`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` §5 Engine never imports react/store, §7 Data Model
- P2-3 spec:`docs/increments/procedural-modes/spec.md`（survive mode框架）
- DoD模板:`docs/increments/_template/dod.md`
-路线图:`docs/increments/_template/roadmap.md`
