#巡逻敌人 + 关卡编辑器 —实施计划（Plan）

**Spec**: `docs/increments/enemies-editor/spec.md`
**复杂度**: X-Large
**日期**:2026-06-08

>步骤使用 `- []`语法追踪。执行时建议使用 `superpowers:subagent-driven-development` 子技能。
> 分两部分实施：(A)敌人系统；(B) 关卡编辑器。每部分独立 commit。

## 文件改动总览

### (A)敌人系统
| 文件 | 操作 |原因 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | `EnemySpawn` + `MazeData.enemies` |
| `src/maze/JsonMazeProvider.ts` | UPDATE |解析 enemies |
| `src/entities/Enemy.ts` | CREATE |敌人实体 +巡逻逻辑 |
| `src/engine/Scene.ts` | UPDATE | 注册敌人 mesh |
| `src/engine/Collision.ts` | UPDATE | `playerVsEnemy` AABB |
| `src/game/Rules.ts` | UPDATE |敌人更新 +伤害事件 |
| `src/store/gameStore.ts` | UPDATE | `damage(n)` action |
| `src/ui/components/HealthBar.tsx` | UPDATE |受伤时闪烁 |

### (B) 关卡编辑器
| 文件 | 操作 |原因 |
|---|---|---|
| `src/maze/EditorMazeProvider.ts` | CREATE | 基于 EditorState 生成 MazeData |
| `src/ui/Editor.tsx` | CREATE | 编辑器 UI（3D视口 +工具栏） |
| `src/store/levelStore.ts` | UPDATE | `customLevels`字段 |
| `src/ui/LevelSelect.tsx` | UPDATE | "自定义"分组 |
| `src/ui/MainMenu.tsx` | UPDATE | 新增"关卡编辑器"入口 |
| `src/main.tsx` | UPDATE | 新增 editor route |

### 测试
| 文件 | 操作 |原因 |
|---|---|---|
| `tests/unit/entities/Enemy.test.ts` | CREATE |巡逻状态机 |
| `tests/unit/engine/Collision.test.ts` | UPDATE | playerVsEnemy |
| `tests/unit/game/Rules.test.ts` | UPDATE |敌人更新 +伤害 |
| `tests/unit/maze/EditorMazeProvider.test.ts` | CREATE | EditorState转换 |
| `tests/unit/maze/JsonMazeProvider.test.ts` | UPDATE | enemies字段解析 |
| `tests/unit/store/levelStore.test.ts` | UPDATE | customLevels持久化 |
| `tests/unit/ui/HealthBar.test.tsx` | CREATE | RTL受伤状态 |
| `tests/unit/ui/Editor.test.tsx` | CREATE | RTL工具栏 |
| `tests/e2e/enemies.spec.ts` | CREATE |碰敌人 → game-over |
| `tests/e2e/editor.spec.ts` | CREATE |画墙 →试玩通关 |
| `tests/e2e/pause-resume.spec.ts` | UPDATE |敌人在暂停时不移动 |
| `README.md` | UPDATE |移除 P2-4 |

##任务清单

### Task1: 类型扩展
- [] **Action**：`src/maze/types.ts` 新增 `EnemySpawn` 接口；`MazeData` 增加 `enemies: EnemySpawn[]`（旧 JSON 不含时默认空数组）。
- [] **Validate**：`npm run typecheck` 通过。

### Task2: JsonMazeProvider解析 enemies
- [] **Action**：`JsonMazeProvider`解析 `enemies`字段，缺省 `[]`。
- [] **Validate**：`npm run test -- JsonMazeProvider` 新增 enemies fixture 测试。

### Task3: Enemy.ts实体
- [] **Action**：`src/entities/Enemy.ts`：
 -字段：`id, position, path, currentIndex, dwellTime, state, lastHitTime`。
 - `update(dt)`：在 path节点间线性插值移动；到达节点后 `dwellTime` 秒后切下一节点；循环。
 -状态机：`moving | dwelling | invulnerable`（受伤后0.5s 无敌）。
- [] **Validate**：`npm run test -- Enemy`覆盖状态机所有分支。

### Task4: Scene 注册敌人 mesh
- [] **Action**：`Scene.ts`接收 `MazeData.enemies`，为每个 enemy 创建低多边形胶囊 mesh（深灰色），加入 scene。
- [] **Validate**：手动启动关卡含敌人时，scene 中可见敌人 mesh；`dispose()`释放。

### Task5: Collision playerVsEnemy
- [] **Action**：`src/engine/Collision.ts` 新增 `playerVsEnemy(player, enemy, radius)`：圆形 vs胶囊 AABB，返回 boolean。
- [] **Validate**：`npm run test -- Collision`覆盖边缘情况（精确相切 / 部分重叠 /远离）。

### Task6: Rules.ts敌人更新 +伤害
- [] **Action**：`Rules.ts`：
 - 每帧 `enemy.update(dt)`。
 - 检测 `playerVsEnemy`：是 →触发 `DAMAGE`事件（除非敌人在 `invulnerable`）。
 -敌人进入 `invulnerable`0.5s 后恢复。
- [] **Validate**：`npm run test -- rules`敌人巡逻 +伤害分支。

### Task7: gameStore.damage action
- [] **Action**：`gameStore.ts` 新增 `damage(n: number)`：health = max(0, health + n)；health=0 → `state='game-over'`。
- [] **Validate**：`npm run test -- gameStore`覆盖 damage状态机。

### Task8: HealthBar受伤闪烁
- [] **Action**：`HealthBar.tsx`监听 health变化；受伤时 CSS class `flash-red`0.3s。
- [] **Validate**：`npm run test -- HealthBar` RTL断言受伤状态。

### Task9: EditorMazeProvider
- [] **Action**：`src/maze/EditorMazeProvider.ts` 实现 `MazeProvider` 接口，输入 `EditorState`，输出 `MazeData`。`getMaze({ id, editorState })`。
- [] **Validate**：`npm run test -- EditorMazeProvider` 单测覆盖转换 +校验。

### Task10: Editor.tsx UI（3D视口 +工具栏）
- [] **Action**：`src/ui/Editor.tsx`：
 -左侧：`canvas` +独立 Three.js Scene 实例（与游戏引擎解耦）。
 -右侧：工具栏按钮（墙 /起点 /出口 / pickup /敌人 / 清空 / 保存 /试玩）。
 -底部：当前 EditorState JSON预览。
 -工具栏激活态高亮当前选中的工具。
 -3D视口点击根据当前工具修改 EditorState。
- [] **Validate**：`npm run test -- Editor` RTL工具栏存在性 +切换激活态。

### Task11: levelStore.customLevels
- [] **Action**：`levelStore.ts` 新增 `customLevels: Record<string, string>`（id → JSON字符串）；actions：`saveCustom`, `loadCustom`, `deleteCustom`。持久化到 localStorage。
- [] **Validate**：`npm run test -- levelStore`覆盖增删改 +持久化。

### Task12: LevelSelect 自定义分组
- [] **Action**：`LevelSelect.tsx` 新增"自定义关卡"分组，列出 `customLevels` 中的关卡（点击 →启动该关卡）。每个卡片含"删除"按钮。
- [] **Validate**：`npm run test -- LevelSelect`覆盖自定义分组渲染。

### Task13: MainMenu + route
- [] **Action**：
 - `MainMenu.tsx` 新增"关卡编辑器"按钮 →跳转 editor route。
 - `main.tsx` 新增 editor route（如 React Router 或简单 state切换）。
- [] **Validate**：手动点击进入编辑器；返回主菜单正常。

### Task14: 编辑器保存前可达性校验
- [] **Action**：`EditorMazeProvider.getMaze`内部跑 DFS校验 start ↔ exit；不可达时抛 `EditorValidationError`，编辑器 UI红色提示，不允许保存。
- [] **Validate**：保存无解关卡时被阻止；保存可达关卡成功。

### Task15: E2E
- [] **Action**：
 - `enemies.spec.ts`：碰敌人 → health-1 → game-over。
 - `editor.spec.ts`：画墙 → 设起点 → 保存 →试玩通关。
 - `pause-resume.spec.ts`扩展：暂停时敌人在原位不动。
- [] **Validate**：`npm run test:e2e` 全绿。

### Task16:文档同步
- [] **Action**：README / roadmap / spec同步；spec §7 `MazeData`反映 `enemies`字段。
- [] **Validate**：grep验证。

##验证

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e
#验证引擎层边界
grep -r "levelStore" src/engine/ src/maze/EditorMazeProvider.ts src/entities/Enemy.ts && echo "FAIL" || echo "OK"
grep -E "import .*react" src/entities/Enemy.ts src/maze/EditorMazeProvider.ts && echo "FAIL" || echo "OK"
```

##风险
|风险 |可能性 |缓解 |
|---|---|---|
|敌人 AI性能 | 中 | 每帧仅更新当前活跃 enemy |
| 编辑器3D视口与游戏引擎冲突 | 中 | 编辑器用独立 Scene 实例，独立 dispose |
| 编辑关卡无解 | 高 | Task14 保存前 DFS校验 |
| localStorage容量 | 低 |限制单 JSON <100KB，超出提示下载 |
| damage事件频率过高 | 中 |0.5s 无敌间隔 +合并多次碰撞 |

##验收
- [] 所有 Task勾选完成（A 部分 + B 部分）
- [] 验证命令全部通过
- [] spec §11 完成清单全部勾选
- [] README.md / roadmap.md / spec.md同步更新
- [] 编辑器创建的关卡可被另一个玩家打开（导出 JSON验证）

##执行日志（实施时填写）

###实施日期
待填写

###实际改动文件
（实施后与上方对照）

###遇到的偏差
（spec 中计划 ...，实际做了 ...，原因 ...）

###备注
