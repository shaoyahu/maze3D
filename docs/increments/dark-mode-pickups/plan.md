# 深色模式 + 新 pickup 类型 —实施计划（Plan）

**Spec**: `docs/increments/dark-mode-pickups/spec.md`
**复杂度**: Medium
**日期**:2026-06-08

>步骤使用 `- []`语法追踪。执行时建议使用 `superpowers:subagent-driven-development` 子技能。

## 文件改动总览
| 文件 | 操作 |原因 |
|---|---|---|
| `src/store/settingsStore.ts` | UPDATE | 新增 `darkMode` |
| `src/store/gameStore.ts` | UPDATE | 新增 `inventory` + `useItem` |
| `src/store/__tests__/settingsStore.test.ts` | UPDATE | darkMode持久化单测 |
| `src/store/__tests__/gameStore.test.ts` | UPDATE | useItem状态机单测 |
| `src/game/Rules.ts` | UPDATE | pickup / useItem 分支 |
| `src/engine/Scene.ts` | UPDATE | darkMode监听 |
| `src/engine/InputManager.ts` | UPDATE |数字键1 /2 → USE_ITEM |
| `src/engine/events.ts` | UPDATE | 新增 `USE_ITEM`事件 |
| `src/entities/Pickup.ts` | UPDATE | 按 type选 mesh颜色 |
| `src/ui/Settings.tsx` | UPDATE | 深色模式 toggle |
| `src/ui/components/InventoryBar.tsx` | UPDATE | 显示槽位 |
| `src/styles/theme.css` | UPDATE | `data-theme="dark"`变量 |
| `src/App.tsx` | UPDATE | 设置根节点 `data-theme` |
| `tests/unit/rules.test.ts` | UPDATE | health / key 分支 |
| `tests/e2e/dark-mode.spec.ts` | CREATE | 深色模式切换 |
| `tests/e2e/pickup-types.spec.ts` | CREATE | health / key拾取 |
| `README.md` | UPDATE | Future increments移除 P2-2 |

##任务清单

### Task1: settingsStore 新增 darkMode
- [] **Action**：`src/store/settingsStore.ts` 增加 `darkMode: false`；`persist` middleware 配置兼容旧 schema（缺失字段默认 false）。
- [] **Validate**：`npm run test -- settingsStore` 通过；localStorage 含 `"darkMode":true/false`。

### Task2: theme.css暗色变量
- [] **Action**：在 `src/styles/theme.css` 新增 `:root[data-theme="dark"] { --bg: #0a0a14; --text: #e8e8f0; --accent: #6c8eff; ... }`。
- [] **Validate**：浏览器手动切换 `data-theme="dark"`，HUD元素颜色变化。

### Task3: App.tsx 应用 data-theme
- [] **Action**：在 `App.tsx` 用 `useEffect`监听 `settingsStore.darkMode`，设置 `document.documentElement.dataset.theme`。
- [] **Validate**：手动 toggle 后 `document.documentElement.dataset.theme === 'dark'`。

### Task4: Scene.ts监听 darkMode
- [] **Action**：`Scene.ts`暴露 `setDarkMode(enabled: boolean)` 方法（或通过 props）；切换 ambient / directional light强度（0.3 vs1.0）与色温（冷色 vs暖色），启用 `scene.fog`颜色切换。
- [] **Mirror**：通过引擎事件总线或 props传 darkMode，不直接 `import settingsStore`。
- [] **Validate**：`grep "settingsStore" src/engine/` 为空；手动 toggle 后 Three.js渲染颜色变化。

### Task5: Settings.tsx 加 toggle
- [] **Action**：在 `Settings.tsx` 新增"外观"分组，含一个 toggle控件，绑定 `settingsStore.darkMode`。
- [] **Validate**：`npm run test -- Settings` RTL断言控件存在且可点击。

### Task6: Pickup.ts 三色 mesh
- [] **Action**：`Pickup.ts` 按 `type`选 mesh颜色：time 金黄 `#ffd84d`、health 红 `#ff5050`、key蓝 `#5fa8ff`。
- [] **Validate**：单元测试构造三个 Pickup，断言 mesh material color 对应。

### Task7: gameStore.inventory + useItem
- [] **Action**：`gameStore.ts` 新增 `inventory: Array<... | null>`（长度2），`pickup(type, value)` 在 slot0 为空时入 slot0，否则 slot1；`useItem(slot)` 清空对应 slot 并触发引擎事件 `USE_ITEM`。
- [] **Validate**：`npm run test -- gameStore`覆盖 inventory状态机。

### Task8: Rules.ts pickup / useItem handler
- [] **Action**：`Rules.ts` 新增 `onPickup(type, value)` 与 `onUseItem(slot)` handler。`health` → `damage(-1)`，`key` → 入 inventory；`useItem` 仅动画反馈（MVP 无锁门）。
- [] **Validate**：`npm run test -- rules` health / key / useItem 分支通过。

### Task9: InputManager数字键
- [] **Action**：`InputManager.ts`监听 keydown `Digit1` / `Digit2`，dispatch `USE_ITEM`事件携带 slot。
- [] **Validate**：单元测试 mock键盘事件，断言事件触发。

### Task10: InventoryBar UI
- [] **Action**：`InventoryBar.tsx` 显示两个槽位（图标 + 高亮可激活态）；slot 内容来自 `gameStore.inventory`。
- [] **Validate**：`npm run test -- InventoryBar` RTL覆盖空 / 非空 / 高亮三态。

### Task11: E2E
- [] **Action**：
 - `dark-mode.spec.ts`：toggle 后 `document.documentElement.dataset.theme === 'dark'`。
 - `pickup-types.spec.ts`：通关含 health 与 key 的关卡。
- [] **Validate**：`npm run test:e2e` 全绿。

### Task12:文档同步
- [] **Action**：
 - `README.md` Future increments移除 P2-2。
 - roadmap.md P2-2状态 `pending` → `done`。
 - spec §12同步。
- [] **Validate**：grep验证。

##验证

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e
#额外验证：引擎层无 settingsStore依赖
grep -r "settingsStore" src/engine/ && echo "FAIL" || echo "OK"
```

##风险
|风险 |可能性 |缓解 |
|---|---|---|
| darkMode 在 `Scene.ts` 未初始化时切换 | 低 |仅更新 store；下次 `startLevel` 时应用 |
| key 无锁门导致空响应 | 低 | slot 高亮闪烁反馈 |
|引擎层意外 import settingsStore | 中 |Task末尾 grep验证 |

##验收
- [] 所有 Task勾选完成
- [] 验证命令全部通过
- [] spec §11 完成清单全部勾选
- [] README.md / roadmap.md / spec.md同步更新
