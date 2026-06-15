# P2-8: 第二语言支持（English）— 实施计划 (Plan)

**Spec**: `docs/increments/p2-8-i18n/spec.md`
**复杂度**: Medium
**日期**: 2026-06-15

> 引入一个零依赖的轻量 i18n 抽象（`getT` + `useT` + `settingsStore.language`），把约 200+ 条面向用户的中文字符串迁出到独立资源文件，玩家在 `/settings` 实时切换「中文 / English」，切换后整个游戏所有 UI 立即重新渲染为目标语言。
>
> **范围声明**：本次只动 UI 层 + 1 个 store 字段 + 测试。引擎层（`src/engine/`、`src/maze/`、`src/entities/`、`src/game/`、`src/utils/`）**不**引入对 `react` / `store/` 的 import；`editorStore` 同样**不** import `src/i18n`，仅接受调用方传入的 `message: string`。
>
> **用户澄清记录**（需在 Task 0 之前通过 `AskUserQuestion` 确认）：
> 1. `editorStore.lastError` 的 i18n 归属 → **采用 spec §3.5 方案**（store 接 `t()` 调用结果作为参数，关注点分离）
> 2. 关卡 JSON `name` → **MVP 不翻译**（视为内容数据；如需则为 `MazeData` 扩 `i18n` 字段，本期不做）
>
> **设计基线**：
> - `src/i18n/` 新建模块；`getT(locale)` 纯函数 + `useT()` hook 订阅 `settingsStore.language`
> - `Settings.language: 'zh' | 'en'`，默认 `'zh'`，lenient 迁移（旧 record 无字段 = `'zh'`）
> - 缺失 key 策略：`console.warn` + 返回 `key` 字符串本身（不返回 `"[zh]"` 标签）
> - 占位符：`{name}` 简单插值，无 ICU；语法错误的占位符原样保留 + warn

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/i18n/types.ts` | CREATE | `Locale` / `Translations` / `TFunction` 类型 |
| `src/i18n/resources/zh.ts` | CREATE | 中文翻译资源（从现有源码抄出原字符串） |
| `src/i18n/resources/en.ts` | CREATE | 英文翻译资源（同 key 集合） |
| `src/i18n/index.ts` | CREATE | `getT()` 纯函数 + `useT()` hook + resource 路由 |
| `src/i18n/__tests__/getT.test.ts` | CREATE | `getT` 单测：命中 / 插值 / 缺失 key / locale 越界 / 占位符错误 |
| `src/i18n/__tests__/keysParity.test.ts` | CREATE | 中英 key 集合完全一致 |
| `src/maze/types.ts` | UPDATE | `MazeData.i18n?: { en?: string }` 可选字段 |
| `src/utils/getDisplayName.ts` | CREATE | 纯函数 `getDisplayName(maze, locale)` |
| `src/utils/__tests__/getDisplayName.test.ts` | CREATE | 5 case：zh 命中 / en 命中 / 缺失降级 / 空对象降级 / 未知 locale 降级 |
| `public/levels/level-tiny.json` | UPDATE | 新增 `"i18n": { "en": "Empty Court" }` |
| `public/levels/level-tiny-pickups.json` | UPDATE | `"Supply Line"` |
| `public/levels/level-tiny-enemy.json` | UPDATE | `"Sentry Corridor"` |
| `public/levels/level-small.json` | UPDATE | `"Proving Grounds"` |
| `src/store/settingsStore.ts` | UPDATE | 新增 `language: Locale` 字段；扩 `DEFAULTS` / `sanitizeSettings` / `pickSettings` / `isValidSetting` |
| `src/store/__tests__/settingsStore.language.test.ts` | CREATE（追加到既有 settingsStore.test.ts） | 默认值 / 接受 zh+en / 拒绝其他字符串 / 旧 record 回退 / round-trip |
| `src/ui/Settings.tsx` | UPDATE | `display` 分组新增「语言 / Language」segmented 控件 |
| `src/ui/App.tsx` | UPDATE | 错误兜底 banner 中文字面量 |
| `src/ui/MainMenu.tsx` | UPDATE | 同上 |
| `src/ui/LevelSelect.tsx` | UPDATE | `LEVEL_SOURCE_OPTIONS` / `MODE_OPTIONS` / `SECTIONS_BY_SOURCE` / 各种胜利模式映射 |
| `src/ui/PauseOverlay.tsx` | UPDATE | 同上 |
| `src/ui/WinOverlay.tsx` | UPDATE | 同上 |
| `src/ui/GameOverOverlay.tsx` | UPDATE | 同上 |
| `src/ui/GameCanvas.tsx` | UPDATE | `pointerLockError` |
| `src/ui/components/ControlHints.tsx` | UPDATE | `WASD / 鼠标 / P / ESC` 提示 |
| `src/ui/components/EnemyCounter.tsx` | UPDATE | `敌人 N/M` 文案 |
| `src/ui/editor/EditorTopBar.tsx` | UPDATE | 工具栏提示 + 状态消息 |
| `src/ui/editor/EditorPropertiesPanel.tsx` | UPDATE | pickup / victory / enemy 表单标签 |
| `src/ui/editor/EditorStatusBar.tsx` | UPDATE | 状态栏文案 |
| `src/ui/editor/EditorPage.tsx` | UPDATE | `DIRTY_EXIT_TITLE` / `DIRTY_EXIT_MESSAGE` 走 i18n |
| `src/store/editorStore.ts` | UPDATE | `lastError` 改由调用方传 message；`persist reason` map 改成可注入 |
| `tests/component/_helpers/renderWithLocale.tsx` | CREATE | 测试 helper：注入 `language` + 包路由 |
| `tests/component/settings.test.tsx` | UPDATE | 新增「切换语言 → 标题立即变 EN」断言 |
| `tests/e2e/locale-switch.spec.ts` | CREATE | 端到端：导航 /settings → 切 EN → 回主页 → 截图比对 |
| `README.md` | UPDATE | 第 8 节加入「语言」一行 + `maze3d.settings.v1` schema 说明 |
| `docs/roadmap.md` | UPDATE | 增量表加 P2-8 行；活跃锚点切到 P2-8 |

## testid 清单

**新增**：
- `locale-zh` — Settings 页语言控件的「中文」按钮
- `locale-en` — Settings 页语言控件的「English」按钮

> 命名沿用项目"语义 + testid 后缀"风格（参考 `aggression-{easy,medium,hard}`）。

**保留**：所有原 testid 不变。

## 任务清单

### Task 0: 用户澄清（前置）
- [x] **Action**: 在「开始之前」通过 `AskUserQuestion` 确认 spec §7 两点
  1. `editorStore.lastError` i18n 归属（推荐方案 A：store 接 `t()` 结果作为参数）
  2. 关卡 JSON `name` 是否 MVP 翻译（推荐：不翻译）
- [x] **Validate**: ✅ 用户已确认（2026-06-15）：采用方案 A（store 接 t() 参数）+ **关卡 JSON name 纳入本增量**（推翻原推荐"不翻译"）

### Task 1: 资源结构 + 草稿
- [ ] **Action**:
  - 新建 `src/i18n/resources/zh.ts` 与 `src/i18n/resources/en.ts`
  - 资源按命名空间分组：`app.*` / `settings.*` / `levels.*` / `overlays.*` / `editor.*` / `common.*` / `persist.*`
  - 中文字符串**逐字面量**从现有源码抄出（grep 验证无遗漏）；英文先做占位 + 大致翻译，实施时人工润色
- [ ] **Mirror**: 命名风格 `domain.entity.field`；与 `editorStore` action 命名一致
- [ ] **Validate**: `tests/unit/i18n/keysParity.test.ts` 跑过——`Object.keys(zh)` 与 `Object.keys(en)` 集合完全一致

### Task 2: `i18n/types.ts` + `i18n/index.ts` — TDD（RED 优先）
- [ ] **Action**: 先在 `src/i18n/__tests__/getT.test.ts` 写 8 case，确认全部失败（RED）：
  1. `getT('zh')('settings.title')` → `'设置'`
  2. `getT('en')('settings.title')` → `'Settings'`
  3. `getT('zh')('overlay.win.timeUsed', { time: '01:23' })` → `'用时 01:23'`
  4. `getT('en')('overlay.win.timeUsed', { time: '01:23' })` → `'Time 01:23'`
  5. `getT('zh')('nope.missing')` → `'nope.missing'` + 触发 `console.warn`
  6. `getT('xx')('settings.title')` → 抛错或回退 `'zh'`（决策：回退 `'zh'`，与 `sanitizeSettings` lenient 模式一致）
  7. `{0}` 数字下标占位符 → 原样保留 + warn
  8. `{undefinedVar}` 未传 var → 原样保留 + warn
- [ ] **Mirror**: warn 行为与 `src/store/settingsStore.ts:83-86` 一致
- [ ] **Validate**: `pnpm test src/i18n/__tests__/getT.test.ts` 8 case 全 RED

### Task 3: `getT` 实现 — GREEN
- [ ] **Action**: 实现 `src/i18n/index.ts`：
  - `import { zh } from './resources/zh'`
  - `import { en } from './resources/en'`
  - `const resources: Record<Locale, Translations> = { zh, en }`
  - `export function getT(locale: Locale): TFunction`：
    - 若 `locale` 不在 `resources`，`console.warn` + 回退 `'zh'`
    - 命中 → 返回字符串
    - 缺失 key → `console.warn` + 返回 key
    - 替换 `{name}` 占位符；`/\{(\w+)\}/g` 正则 + `vars[key]` 取值；找不到的占位符原样保留 + warn
- [ ] **Mirror**: 与 `LevelSelect.tsx:632` 的 `?? lv.data?.rules.victory?.toUpperCase() ?? 'N/A'` 风格 fallback 一致
- [ ] **Validate**: 8 case 全 GREEN；`getT.ts` 行覆盖 ≥ 90%

### Task 4: `useT` hook — 实现 + 单测
- [ ] **Action**:
  - `export function useT(): TFunction { const locale = useSettingsStore(s => s.language); return useMemo(() => getT(locale), [locale]) }`
  - 注意 `useT` 在组件渲染时调用，订阅 `language` 变化 → 组件级 re-render
- [ ] **Action**: 在 `__tests__/getT.test.ts` 加 2 case：
  9. `useT()` 默认 locale = `'zh'`
  10. `useSettingsStore.setState({ language: 'en' })` 后组件重渲染 → `t('settings.title')` 返回 `'Settings'`
- [ ] **Test**: `@testing-library/react` `renderHook`
- [ ] **Validate**: 10 case 全 GREEN

### Task 5: 扩展 `settingsStore.language` — TDD
- [ ] **Action**: 在 `src/store/__tests__/settingsStore.test.ts` 追加 6 case：
  1. `useSettingsStore.getState().language` 默认 `'zh'`
  2. `useSettingsStore.getState().set('language', 'en')` 接受
  3. `useSettingsStore.getState().set('language', 'xx')` 拒绝 + `console.warn` + 值不变
  4. 持久化：load 后 `language` 正确恢复
  5. 旧 record 无 `language` 字段 → sanitize 回退 `'zh'`
  6. round-trip：写入 → 清 store → reload → 等同
- [ ] **Action**: 实现 `src/store/settingsStore.ts`：
  - `Settings.language: Locale`
  - `DEFAULTS.language = 'zh'`
  - `sanitizeSettings` 加 `language` 分支（lenient）
  - `pickSettings` 加 `language` 字段
  - `isValidSetting` 加 `language` 分支
- [ ] **Mirror**: 沿用 `src/store/settingsStore.ts:39-43`（`enemyAggression`）的 lenient 模式
- [ ] **Validate**: 6 case 全 GREEN

### Task 6: Settings 页新增语言控件 — TDD
- [ ] **Action**: 在 `tests/component/settings.test.tsx` 加 5 case（RED）：
  1. 默认渲染：「语言」标签 + 中文按钮 + English 按钮；中文按钮 `aria-checked=true`
  2. 点 `locale-en` → 控件 active 切到 EN
  3. 点 `locale-en` → Settings 自身标题 `<h2>` 立即变 `'Settings'`
  4. 点 `locale-zh` 切回 → 标题恢复 `'设置'`
  5. 切语言不引起 darkMode / fov / sens 丢失（store 内其它字段不变）
- [ ] **Validate**: 5 case 全 RED

### Task 7.5: 关卡 i18n（schema + 4 JSON + helper） — 必在 Task 8 之前完成
- [ ] **Action**:
  - `src/maze/types.ts` `MazeData` 加 `i18n?: { en?: string }` 可选字段
  - `src/utils/getDisplayName.ts` 新建：`getDisplayName(maze, locale)` 纯函数，locale='zh' 直接返回 `name`，否则 `maze.i18n?.[locale] ?? maze.name`
  - 4 个内置关卡 JSON 加 `"i18n": { "en": "..." }` 字段：
    - `level-tiny.json` `"空庭"` → `"Empty Court"`
    - `level-tiny-pickups.json` `"补给线"` → `"Supply Line"`
    - `level-tiny-enemy.json` `"哨兵走廊"` → `"Sentry Corridor"`
    - `level-small.json` `"试炼场"` → `"Proving Grounds"`
- [ ] **Mirror**: 与 `sanitizeSettings` 的 lenient 模式一致——`i18n` 字段缺失/不合法一律降级到 `name`
- [ ] **Test**: `src/utils/__tests__/getDisplayName.test.ts` 5 case（zh 命中 / en 命中 / 缺 i18n 降级 / 空对象降级 / 未知 locale 降级）
- [ ] **Validate**: 5 case 全 GREEN；`getDisplayName.ts` 行覆盖 ≥ 90%

### Task 8: 迁移 UI 组件（中→t()）— 按依赖底向上分批
- [ ] **Action**: 修改 `src/ui/Settings.tsx`：
  - 在 `display` section 末尾加一行（与 `darkMode` 行同形态）：
    - 标签 + 描述（描述本身走 `t('settings.locale.desc')`）
    - 二态 segmented：中文 / English
    - `data-testid="locale-zh"` / `locale-en`
  - 注意控件自身的 `aria-label` 也走 i18n
- [ ] **Mirror**: 沿用 `src/ui/Settings.tsx:216-261`（aggression segmented）结构
- [ ] **Test**: 5 case 全 GREEN
- [ ] **Validate**: `pnpm test tests/component/settings.test.tsx` 全绿；Settings 行覆盖 ≥ 80%

### Task 8: 迁移 UI 组件（中→t()）— 按依赖底向上分批
- [ ] **Action**: 按以下顺序，每个文件单独迁移 + 跑该文件测试：
  1. **`App.tsx`**（错误兜底 banner ~10 处字符串）→ `t('app.error.*')`
  2. **`MainMenu.tsx`**（~5 处）→ `t('app.menu.*')`
  3. **`GameCanvas.tsx`**（`pointerLockError`）→ `t('app.error.pointerLockFailed')`
  4. **`components/ControlHints.tsx`**（4 行 WASD/鼠标/P/ESC）→ `t('controls.*')`
  5. **`components/EnemyCounter.tsx`**（`敌人 N/M`）→ `t('hud.enemyCount', { current, max })`
  6. **`PauseOverlay.tsx`**（~5 处）→ `t('overlay.pause.*')`
  7. **`WinOverlay.tsx`**（~7 处）→ `t('overlay.win.*')`
  8. **`GameOverOverlay.tsx`**（~5 处）→ `t('overlay.gameOver.*')`
  9. **`LevelSelect.tsx`**（最大文件，~50 处；`LEVEL_SOURCE_OPTIONS` 等数据数组 `label` 改 `(t) => string`；**关卡卡片标题与删除确认 `lv.name` 改用 `getDisplayName(lv.data, locale)`**）→ `t('levels.*')`
  10. **`editor/EditorTopBar.tsx`**（~25 处）→ `t('editor.toolbar.*')`
  11. **`editor/EditorStatusBar.tsx`**（~10 处）→ `t('editor.status.*')`
  12. **`editor/EditorPropertiesPanel.tsx`**（~30 处）→ `t('editor.properties.*')`
  13. **`editor/EditorPage.tsx`**（`DIRTY_EXIT_TITLE` / `DIRTY_EXIT_MESSAGE` 走 i18n）→ `t('editor.dirtyExit.*')`
- [ ] **Mirror**: 模板用法参见 spec §3.6（数据数组 label 改函数）
- [ ] **Validate**:
  - 每个文件改完跑对应测试全绿
  - `grep -rn -P '[\x{4e00}-\x{9fff}]' src/` 排除 `src/i18n/resources/zh.ts` + 注释后 → **业务代码 0 命中**

### Task 9: 迁移 `editorStore` lastError + persist reason — TDD
- [ ] **Action**: 在 `tests/unit/store/editorStore.test.ts` 加 3 case：
  1. `editorStore.persistUnavailable(t('editor.persist.reason.unavailable'))` → `lastError` 等于传入字符串
  2. `editorStore.lastError` 写入 → 组件读出 → 渲染为传入文本（不在 store 层做翻译）
  3. 旧的 `unavailable: '浏览器存储不可用...'` 默认文案从 store 删除（保证 grep 通过）
- [ ] **Action**: 修改 `src/store/editorStore.ts`：
  - `lastError` setter 接受 message 参数
  - 删掉 `PERSIST_REASON_MESSAGE` 默认文案字典（spec §3.5）
  - 调用方（`useAutoSave` hook / EditorTopBar 的 `onAutoSaveError`）改为先 `const t = useT(); ... onAutoSaveError: (msg) => setStatus({ ..., message: t('editor.persist.reason.unavailable', { msg }) })`
- [ ] **Mirror**: 沿用 `editorStore.ts:893-900` 现有结构
- [ ] **Validate**: 3 case 全 GREEN；`editorStore.test.ts` 全绿

### Task 10: 测试 helper + 切换断言（合并 Task 6/7）
- [ ] **Action**: 创建 `tests/component/_helpers/renderWithLocale.tsx`：
  ```ts
  export function renderWithLocale(ui: ReactElement, locale: Locale = 'zh') {
    useSettingsStore.setState({ language: locale });
    return render(ui);
  }
  ```
- [ ] **Action**: 新增 `tests/e2e/locale-switch.spec.ts`（Playwright）：
  - case 1：导航 `/settings` → 默认中文标题 `'设置'` 可见
  - case 2：点 `locale-en` → 标题变 `'Settings'`
  - case 3：导航 `/` → 主页 hero 文案变英文
  - case 4：刷新页面 → 语言仍是 `'en'`（持久化生效）
  - case 5：点 `locale-zh` 切回 → 主页恢复中文
- [ ] **Validate**: 5 case 全 GREEN

### Task 11: 完整回归
- [ ] **Action**: 跑全套：
  ```bash
  pnpm typecheck
  pnpm test
  pnpm build
  pnpm test:e2e
  grep -rn -P '[\x{4e00}-\x{9fff}]' src/ \
    | grep -v 'src/i18n/resources/zh.ts' \
    | grep -v '// ' \
    | grep -v '^\s*\*'    # 业务代码中 CJK 应为 0 命中（注释里的中文不算）
  grep -rn "aria-label=\"中文" src/   # 必须 0 命中
  ```
- [ ] **Action**: 浅色 / 深色主题各加载一次，目视检查主要页面（中英文各跑一次）
- [ ] **Action**: 写 `docs/increments/p2-8-i18n/review.md`（实施日志 + 偏差 + 测试覆盖）
- [ ] **Action**: 更新 `docs/roadmap.md`：
  - 增量表加一行 `P2-8 | 第二语言支持（English） | P1 | — | Medium | docs/increments/p2-8-i18n/`
  - 总任务列表加一段 P2-8 进度
  - 活跃锚点更新到 P2-8
- [ ] **Action**: 更新 `README.md` 第 8 节加入「语言」行 + `maze3d.settings.v1` schema 说明
- [ ] **Action**: 提交 + 等用户确认
- [ ] **Validate**: 上述全部 0 错误 0 警告

## 验证

```bash
# 必须全部通过才能标记 P2-8 为 done
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
grep -rn -P '[\x{4e00}-\x{9fff}]' src/ \
  | grep -v 'src/i18n/resources/zh.ts' \
  | grep -v '// ' \
  | grep -v '^\s*\*'    # 业务代码 CJK 应为 0 命中
grep -rn "aria-label=\"中文" src/   # 必须 0 命中
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 现有测试断言硬编码中文（279 行 / 28 文件），迁移 i18n 时大面积失败 | **高** | Task 8 一个一个文件迁移；每个文件完成时该文件测试先绿再继续；spec §3.7 已锁定「默认 `'zh'`」不动既有断言 |
| LevelSelect 的 `LEVEL_SOURCE_OPTIONS`/`MODE_OPTIONS` 是数据数组+JSX混合，需把 label 改成函数 | 中 | spec §3.6 已锁定方案；Task 8 step 9 单独 grep 验证 |
| `LevelSelect` 中 `s === 'teaching' ? '任务简报' : ...` 三元，抽取成 `t(key by s)` 表 | 中 | 用 `Record<SourceKey, string>` 在资源里建表，组件内 `t(table[s])` |
| `editorStore.lastError` 在 store 层产出消息，违反"store 不依赖 i18n" | 中 | spec §3.5 + Task 9 已锁定方案：store 接受 message 参数，调用方传 `t()` 结果 |
| 切换语言时整页 re-render 导致编辑器未保存状态丢失 | 低 | 仅 React 层重渲染，zustand store 不变；编辑器的 `editorStore` 数据完全独立；E2E 切语言后保留编辑器脏状态作为回归哨 |
| 关卡 JSON 的 `name`（4 个）是中文 → 英文切换后仍是中文 | **N/A** | **已纳入本增量**（spec §2.1 目标）：`MazeData.i18n?: { en?: string }` 可选字段 + `getDisplayName(maze, locale)` 工具函数；4 个内置关卡在 JSON 里写 `i18n.en`，消费者统一改走 `getDisplayName`（spec §5.1） |
| `aria-label` 等无障碍属性仍写死中文 | 中 | Task 8 同步处理所有 `aria-label="中文"`；grep 验证 |
| `npm run build` 通过但运行时语言切换瞬间白屏 | 低 | 翻译文件是同步 import，无 async init；切换只触发 React reconcile，不卸载 Three.js canvas |
| `useT()` 在 `useSettingsStore` 还未注入（极早期 mount）时拿到 undefined | 低 | `useSettingsStore(s => s.language)` 默认 `'zh'`，不会 undefined |

## 验收

- [ ] 所有 Task 勾选完成
- [ ] 验证命令全部通过
- [ ] spec §8 完成清单全部勾选
- [ ] `docs/roadmap.md` 的 P2-8 行存在（实施完成后状态从 `pending` 改为 `done`）
- [ ] 活跃锚点指向 P2-8
- [ ] `review.md` 填写完整
- [ ] README.md 第 8 节同步
- [ ] 用户最终确认（yes / proceed）

---

## 执行日志（实施时填写）

### 实施日期
YYYY-MM-DD

### 实际改动文件
（与上面"文件改动总览"对照，列出真实改动的文件）

### 遇到的偏差
- spec 中计划 ...，实际做了 ...，原因 ...

### 测试覆盖
- 单元覆盖率：...%
- 新增 / 修改测试：...

### 备注
（任何给后续增量有参考价值的发现）