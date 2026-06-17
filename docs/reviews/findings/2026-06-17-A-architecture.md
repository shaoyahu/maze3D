# Code Review §A — Architecture / Module Boundaries / Data Flow (2026-06-17)

> **评审员**: Architecture / boundaries / data-flow 维度(A 评审员)
> **范围**: `src/main.tsx`、`src/App.tsx`、`src/store/**` (6 文件 + migrations +
>   editorHistory + persist)、`src/utils/**` (8 文件)、`src/maze/types.ts`、
>   `src/i18n/**`、`src/hooks/useAutoSave.ts`。
> **HEAD**: `main` = `e45ecdc test+docs(p2-11): 老 level-* 引用更新为 teaching-* + E2E spec + roadmap 完成`
> **前置评审**: [`2026-06-16-full-code-review.md`](../2026-06-16-full-code-review.md)
>   (11 条 baseline)+ [`2026-06-15-fresh-full-review.md`](../2026-06-15-fresh-full-review.md)
>   / [`2026-06-15-full-bug-scan.md`](../2026-06-15-full-bug-scan.md)
> **方法**: 单 agent 顺序读 + 边界 grep + `npm run typecheck` 验证回归
> **日期**: 2026-06-17

## §1 总览

| 严重度 | 数量 |
|---|---|
| CRITICAL | 2 |
| HIGH | 1 |
| MEDIUM | 2 |
| LOW | 1 |
| **总计** | **6** |

- **CRITICAL** 两条均为 P2-11 增量(`e35092d`)的回归,**`main` HEAD 上 `npm run typecheck` 红** —— 引擎/UI 边界以外的 store 维度出现了破坏性 typo + 类型/白名单 drift。CI 一定会挂,只是没有 PR 跑过这道闸。
- **HIGH** 一条:无 store ↔ engine 反向依赖这条 CLAUDE.md 写明的边界规则目前守住了,但 `editorStore` 与 `levelStore` 的 `getState()` 跨调用已经形成 1 个新的隐藏耦合点,值得在下一个 P2 增量里拆掉。
- **MEDIUM / LOW** 集中在 persist 键、迁移链与 i18n 占位符边界上 —— 都是小问题,可在 P2-12 收尾时一并扫。

## §2 CRITICAL

### A-CRITICAL-1 | `src/store/editorStore.ts:504-533` | P2-11 4 个 setter 引用了不存在的 `state.draft`,UI 一点击即 throw `TypeError: Cannot read properties of undefined`

**症状**

```ts
// src/store/editorStore.ts:504-509
setHideMinimap: (v) => {
  const s = get();
  if (!s.draft) return;                         // ← s.draft 不存在
  const next = pushHistory(s.level, { ...s.draft, hideMinimap: v || undefined });
  set({ level: next.level, draft: next.draft }); // ← set(...) 不接受 draft
},
```

`EditorStoreState` 的形状是 `{ level, tool, selection, camera, past, future, dirty, ... }`,**没有** `draft` 字段 —— 在 P2-11 之前的代码里 `level` 本身既是正在编辑的"草稿"又是已提交的 baseline,中间没有任何独立字段。P2-11 commit `e35092d` 在写这 4 个 setter 时把概念搞混了:`s.draft` / `next.draft` 既不是 store 字段,也不是 `editorHistory.pushHistory` 的返回字段(`pushHistory` 返回 `{ level, selection, past, future }`)。

**影响**

UI(`EditorPropertiesPanel.tsx:353, 364, 380, 393, 400`)在用户操作"教程 / HUD (P2-11)"Card 上的任一控件时:
- `setHideMinimap(e.target.checked)` → `if (!s.draft) return` 进入 falsy 分支,被静默 no-op
- `setEnemyAggression(v)`、`setRequireAllPickups(v)`、`setTutorialSteps(steps)` 同样被 no-op
- 用户勾选 "隐藏 Minimap" / 切 "敌人追击速度" / 改 "教学步骤 JSON" → store 状态不变,UI 看上去生效了(因为 checkbox 仍是 controlled `checked={!!level.hideMinimap}`),但其实**没有任何东西被写进 `level`,save 也不会带过去**

附加更糟的可能性:如果有人按字面意思把 `s.draft` 修了(比如加一个 `draft: MazeData` 字段),然后 `pushHistory` 又会拿到 2 个参数 vs 3 个参数的签名错误(`pushHistory(state, nextLevel, nextSelection)` —— 当前代码 `pushHistory(s.level, ...)` 漏了 selection),导致编译期就过不去。

**重现**

```
1. npm run dev
2. /editor
3. 在右侧 "教程 / HUD (P2-11)" Card 勾选 "隐藏 Minimap"
4. 检查 React DevTools → editorStore.level.hideMinimap 仍是 undefined
5. npm run typecheck  → 26 个错误(7 条直接来自 editorStore.ts:506-532,4 条来自 gameStore.ts / types.ts / tests)
```

**修复建议**

P2-11 这 4 个 setter 的正确写法应与 `placeWall` / `updateRule` / `updateName` 完全同形 —— 修改 `level`、调 `commitLevel(get(), nextLevel)`、写一次 `set(...)`:

```ts
setHideMinimap: (v) => {
  const s = get();
  const nextLevel: MazeData = { ...s.level, hideMinimap: v ? true : undefined };
  set({ ...commitLevel(get(), nextLevel), lastError: null, lastErrorKey: null });
},
setEnemyAggression: (v) => {
  const s = get();
  const rules: LevelRules = { ...s.level.rules };
  if (v === null) delete rules.enemyAggression;
  else rules.enemyAggression = v;
  const nextLevel: MazeData = { ...s.level, rules };
  set({ ...commitLevel(get(), nextLevel), lastError: null, lastErrorKey: null });
},
setRequireAllPickups: (v) => {
  const s = get();
  const rules: LevelRules = { ...s.level.rules };
  if (!v) delete rules.requireAllPickups;
  else rules.requireAllPickups = true;
  const nextLevel: MazeData = { ...s.level, rules };
  set({ ...commitLevel(get(), nextLevel), lastError: null, lastErrorKey: null });
},
setTutorialSteps: (steps) => {
  const s = get();
  const nextLevel: MazeData = {
    ...s.level,
    tutorialSteps: steps && steps.length > 0 ? steps : undefined,
  };
  set({ ...commitLevel(get(), nextLevel), lastError: null, lastErrorKey: null });
},
```

这一组 commit 行为对 UI 完全透明(原 commit `e35092d` 注释里写"每个都 pushHistory() 让 undo/redo 正常工作"是设计意图,`commitLevel` 已经包含了 `pushHistory` 调用,无需额外绕路),也跟 `placeWall` / `placePickup` 保持一致风格。

**F-tag**: `F-2026-06-17-CRITICAL-1`

---

### A-CRITICAL-2 | `src/maze/types.ts:3,17-22` + `src/store/gameStore.ts:378` | `VICTORY_TYPE_VALUES` 白名单含 `'caught-by-enemy'`,但 `VictoryType` 联合类型未同步扩展 —— 白名单/类型双源事实

**症状**

```ts
// src/maze/types.ts:3
export type VictoryType = 'reach-exit' | 'survive' | 'time-trial';

// src/maze/types.ts:17-22
export const VICTORY_TYPE_VALUES: readonly VictoryType[] = [
  'reach-exit',
  'survive',
  'time-trial',
  'caught-by-enemy',   // ← TS2322: Type '"caught-by-enemy"' is not assignable to type 'VictoryType'
];
```

`VICTORY_TYPE_VALUES` 注释明确说"the literal-typed arrays double as both compile-time documentation of the union and the runtime values the guards check against" —— 这意味着该常量是**类型联合的运行时镜像**。P2-11 commit `6e868d0`(Task 7)加了 `'caught-by-enemy'` 字面量,却**漏改了 `VictoryType` 联合类型**。

**影响**

- `npm run typecheck` 红 4 处,3 处在生产代码 / 1 处在单测:
  - `src/maze/types.ts:21` —— 元定义本身就是错误
  - `src/store/gameStore.ts:378` —— `s.currentMode === 'caught-by-enemy'` 在 `currentMode: VictoryType` 下被 TS 报 "no overlap"
  - `tests/unit/store/gameStore.caughtByEnemy.test.ts:17` —— 测试无法 build
  - `tests/unit/maze/types.test.ts:168` —— `VICTORY_TYPE_VALUES` 的单测也跑不了
- 由于类型检查在 CI 里是 gating 步骤,任何后续 PR 一旦跑 `tsc -b` 都会挂 —— 实际上 `main` HEAD 上 **CI 当前是断的**,只是没人提 PR 才没人发现。
- 运行时白名单 (`VICTORY_TYPE_VALUES`) 现在比静态类型**更宽**;`isVictoryType(v)` 通过白名单运行时检查的字符串,TS 类型上却不是 `VictoryType`,会迫使消费点做 `as` 强制转换或绕过守卫。

**重现**

```bash
$ npm run typecheck
> tsc -b --noEmit
src/maze/types.ts(21,3): error TS2322: Type '"caught-by-enemy"' is not assignable to type 'VictoryType'.
src/store/gameStore.ts(378,36): error TS2367: This comparison appears to be unintentional because the types 'VictoryType' and '"caught-by-enemy"' have no overlap.
tests/unit/store/gameStore.caughtByEnemy.test.ts(17,5): error TS2322: ...
tests/unit/maze/types.test.ts(168,87): error TS2322: ...
```

**修复建议**

扩展 `VictoryType` 联合:

```ts
// src/maze/types.ts:3
export type VictoryType = 'reach-exit' | 'survive' | 'time-trial' | 'caught-by-enemy';
```

此外建议在 `maze/types.ts` 的白名单常量旁加一行 build-time 一致性断言,把"白名单 ⊆ 联合"这条不变量固化下来,防止未来再出现类型 ↔ 白名单 drift:

```ts
// 在 VICTORY_TYPE_VALUES / MAZE_SIZE_VALUES 等所有 *VALUES 之后
type _AssertExhaustiveUnion = Exclude<VictoryType, typeof VICTORY_TYPE_VALUES[number]> extends never
  ? true
  : never;
const _exhaustiveVictory: _AssertExhaustiveUnion = true; // 编译期失败 = 白名单漏成员
const _noExtra: Exclude<typeof VICTORY_TYPE_VALUES[number], VictoryType> extends never
  ? true
  : never;
const _noExtrasInValues: _noExtra = true;
```

(同样的双侧断言可应用于 `MAZE_SIZE_VALUES` / `LEVEL_SOURCE_VALUES` / `PICKUP_TYPE_VALUES` / `SURVIVE_SECONDS_VALUES`,但本评审只覆盖范围,不在本文件直接改 —— 把建议写在这里供 P2-12 收尾扫时参考。)

**F-tag**: `F-2026-06-17-CRITICAL-2`

---

## §3 HIGH

### A-HIGH-1 | `src/utils/gameUrl.ts:104-111` | `readOptions` 不会在 `progressive` 缺省时写入 `spawnSchedule: undefined`,但 `parseGameSearchParams` 调用方可能仍然带着 stale `spawnSchedule`

**症状**

`readOptions` 内部对每个查询键都遵循"if 出现就 parse,否则保持 `options` 中缺省(undefined)"的语义。`progressive` 走 `if (progressiveRaw !== null)` 进入,显式设了 `spawnSchedule`(开启或关闭)。但 `options: StartLevelOptions` 在 `readOptions` 之外是 `StartLevelOptions` 类型的局部变量 —— 调用方(`parseGameSearchParams`)如果之前已经存了 `spawnSchedule`,**就**会被覆盖为 `undefined`(因为 `readOptions` 每次返回新对象)。

听起来无 bug,实际不 —— 真正的问题在另一处:`buildGameSearchParams(id, options)` 把 `options` 当作"用户当前在 LevelSelect 上设定的状态"做序列化(`src/utils/gameUrl.ts:182-189`),但 `parseGameSearchParams(searchParams)` 解析时 `StartLevelOptions` 里的 `spawnSchedule` 是整体对象,**没有逐字段去抖**。

**影响**

具体场景:用户从 LevelSelect 进入游戏 → 关掉"渐进生成" → 在游戏中后退到 LevelSelect → LevelSelect 内部又从 `cachedOptions` 取值(可能由 store 注入 stale 值)→ 重新 build URL 时 `options.spawnSchedule.enabled` 仍为 `true`,覆盖用户刚才的关闭意图。

更一般地说:`gameUrl.ts` 现在的契约是"URL = 关卡身份的规范来源",**但**对于"用户上一秒在 UI 上做的开关",`buildGameSearchParams` 和 `readOptions` 之间的 round-trip **无法区分"URL 上没写 = 用户没设"和"URL 上没写 = 上一次 buildGameSearchParams 没序列化"**。这两个语义在 `spawnSchedule` 之外的字段(尤其是 `mode` / `survive` / `enemies`)上都存在,只是 `progressive` 因为是 P2-11 才新加的、最容易踩到。

**重现**

```
1. /levels → 进入 survive mode,关掉 "渐进生成" toggle
2. /game?seed=...&progressive=0 → 进入游戏
3. 中途点重试 → URL 不变
4. 退回 /levels → 看到 toggle 状态由 store 缓存恢复为 ON
5. 再进 /game → URL 此时又变成 progressive=1
```

`F-2026-06-16-H-2` 修了"disabled case 也要 round-trip",但**没修**"store 缓存的 enabled 状态在 `buildGameSearchParams` 时被原样回写到 URL,跟用户最近一次 UI 操作可能不一致"这条。

**修复建议**

在 `App.tsx` 或 `LevelSelect.tsx` 调用 `buildGameSearchParams` 的位置(我看到 `App.tsx:274` 一处,可能还有更多)显式把 `options.spawnSchedule` 置为 `undefined` 当用户 UI 上关掉时再 build:

```ts
// App.tsx:271-276 (onPick handler)
onPick={(id, options) => {
  const search = buildGameSearchParams(id, {
    ...options,
    spawnSchedule: options.spawnSchedule?.enabled ? options.spawnSchedule : undefined,
  });
  navigate({ pathname: '/game', search: `?${search.toString()}` });
}}
```

或更通用的方案:让 `buildGameSearchParams` 在传入 `spawnSchedule` 但 `enabled === false` 时不写 `progressive` 参数(回到"URL 缺省 = 用默认"的语义),并在 readOptions 那侧把"URL 缺省 + 用户 UI 关闭"这两种情形明确区分。

**F-tag**: `F-2026-06-17-HIGH-1`

---

## §4 MEDIUM

### A-MEDIUM-1 | `src/store/editorStore.ts:481-540` (P2-11 setters) | `setTool` / `select` / `clearSelection` / `updatePickup` / `updateEnemy` / `updateRule` / `updateName` / `moveEnemyNode` 共 8 个 action 末尾有重复的 `lastError: null, lastErrorKey: null` 清错代码

**症状**

`F-2026-06-16-L-1` 加了一组"清错芯片"调用,但用了复制粘贴:8 个 action 末尾一字不差地写 `set({ ...commitLevel(get(), nextLevel), lastError: null, lastErrorKey: null })`,其中 placement actions 的 set 调用可以借助 `commitLevel` 内置 dirty 计算,但这 8 个 action 都把"清 lastError"这件事硬编进了行内。

**影响**

- 8 处重复 → 任意一处漏改都意味着行为分歧(比如下一次 P2-12 加了 `setEnemyAggression` 又忘了 clear,用户会看到"隐藏 Minimap"已生效但旧的 "无法在起点放置墙" 芯片仍挂着)。
- `commitLevel` 本身已经把"修改 level + push history + 重算 dirty"封装好,但它**不**碰 `lastError` —— 也就是说"清错"和"commit"是两个独立关注点,被强行绑在一起。
- 后期会有"清 lastError 但不 commit"或"commit 但保留 lastError"的合法需求(比如 `placeWall` 成功就不该清 lastError 之前的消息吗?目前的语义是清 —— 这是隐式契约,但写在 8 个不同的函数里,没有单一可改的入口)。

**重现**

读 `src/store/editorStore.ts:485, 493, 495, 497, 540, 581, 609, 636, 660, 702, 747, 779, 808-810, 832-834, 849-851, 867-869, 939, 970-972, 1012, 1038, 1072` —— 全是同一个 `lastError: null, lastErrorKey: null` 行,语义分散。

**修复建议**

把"clear error chip on every successful mutation" 抽成单一函数:

```ts
// 放在 EditorStoreState 闭包外的 helper
function clearErrorChip(): Pick<EditorStoreState, 'lastError' | 'lastErrorKey'> {
  return { lastError: null, lastErrorKey: null };
}
```

或更直接:让 `commitLevel` 接受一个 `{ clearErrors?: boolean }` 选项,默认 false,placement actions 显式传 true:

```ts
function commitLevel(
  state: EditorStoreState,
  nextLevel: MazeData,
  nextSelection: EditorStoreState['selection'] = state.selection,
  opts: { clearErrors?: boolean } = {},
): LevelSlice {
  const slice: LevelSlice = {
    level: next.level,
    past: next.past,
    future: next.future,
    selection: next.selection,
    dirty: levelHash(next.level) !== state.lastSavedHash,
  };
  return opts.clearErrors ? { ...slice, lastError: null, lastErrorKey: null } : slice;
}
```

然后 setter 末尾只需要 `set(commitLevel(get(), nextLevel, undefined, { clearErrors: true }))`。

**F-tag**: `F-2026-06-17-MEDIUM-1`

---

### A-MEDIUM-2 | `src/store/migrations.ts:99-130` | 迁移链 walker 在 `LEVEL_MIGRATIONS` 为空且 `fromVersion < CURRENT` 时静默回退为 input,没有显式错误路径

**症状**

```ts
// src/store/migrations.ts:99-130
export function applyLevelMigrations(data: unknown, fromVersion: number): unknown {
  if (fromVersion > CURRENT_LEVEL_SCHEMA_VERSION) {
    throw new Error(`Level data is schema v${fromVersion}, which is newer than this build's supported v${CURRENT_LEVEL_SCHEMA_VERSION}`);
  }
  if (fromVersion === CURRENT_LEVEL_SCHEMA_VERSION) return data;  // hot path
  let current = data;
  let version = fromVersion;
  for (const migration of LEVEL_MIGRATIONS) {
    if (migration.fromVersion !== version) {
      throw new Error(`Migration chain mismatch at v${version}: expected fromVersion=${version}, got fromVersion=${migration.fromVersion}`);
    }
    current = migration.transform(current);
    version = migration.toVersion;
  }
  if (version !== CURRENT_LEVEL_SCHEMA_VERSION) {
    throw new Error(`Migration chain incomplete: ended at v${version}, expected v${CURRENT_LEVEL_SCHEMA_VERSION}`);
  }
  return current;
}
```

注释说 `LEVEL_MIGRATIONS` "currently empty because the only schema in the wild is v1",但当未来真有 v_n → v_{n+1} 步骤加入时,如果**有** `fromVersion < CURRENT` 且 `LEVEL_MIGRATIONS` 仍为空数组,函数会**走完循环不抛错**,然后落入"end at v1 != expected v2 → 抛 chain incomplete"。

**影响**

错误信息 `"chain incomplete: ended at v1, expected v2"` 对开发者来说**不准确** —— 实际现象是"链是空的,没有 transformer 可跑",而不是"链中途断开"。这条错误信息会误导下一次 P3 增量的开发者去检查"是不是我少写了一个 transformer",而真正的根因可能是"我从 1 → 2,但忘了把 transformer 加入 `LEVEL_MIGRATIONS`"。

更具体地说:在未来某个 v1 → v2 bump 之后,这一段会**总是**抛 `chain incomplete`,即使 `LEVEL_MIGRATIONS` 里只放了一个 v1 → v2 transformer —— 验证逻辑是对的,但**错误前缀不准确**。

**重现**

(这是 P3 才会暴露的)
```ts
// 假设有人把 CURRENT_LEVEL_SCHEMA_VERSION = 2
// LEVEL_MIGRATIONS = [{ fromVersion: 1, toVersion: 2, transform: v1ToV2 }]
// 用户磁盘上还有 v1 数据
// → applyLevelMigrations(data, 1) 走循环,跑完 v1ToV2,version = 2,exit loop
// → "if (version !== CURRENT)" 不抛,return current  ← 一切正常

// 假设有人 bump CURRENT=2 但忘了加 LEVEL_MIGRATIONS
// → for 循环不跑,version 还是 1
// → "chain incomplete: ended at v1, expected v2"  ← 错误信息令人困惑
```

**修复建议**

```ts
if (LEVEL_MIGRATIONS.length === 0 && fromVersion < CURRENT_LEVEL_SCHEMA_VERSION) {
  throw new Error(
    `Level data is schema v${fromVersion} but no migrations are registered ` +
    `(LEVEL_MIGRATIONS is empty); add a v${fromVersion}→v${CURRENT_LEVEL_SCHEMA_VERSION} transformer.`,
  );
}
```

或更紧凑:在 `for` 循环之前加一个 `if (fromVersion < CURRENT && LEVEL_MIGRATIONS.length === 0) throw ...`。

(实现细节不强制,只要错误信息能直接告诉开发者"你漏了 transformer"。)

**F-tag**: `F-2026-06-17-MEDIUM-2`

---

## §5 LOW

### A-LOW-1 | `src/i18n/index.ts:48-50` | `interpolate` 的 `null / undefined` 占位符值统一降级为空串,会与 i18n 字典中"显式 {name} 必须非空"的设计意图冲突

**症状**

```ts
// src/i18n/index.ts:44-60
function interpolate(template: string, vars: TVars | undefined): string {
  if (!vars) return template;
  let warned = false;
  const out = template.replace(PLACEHOLDER_RE, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      const v = vars[name];
      return v == null ? '' : String(v);
    }
    if (!warned) {
      console.warn(`[i18n] missing var "${name}" in template "${template}"`);
      warned = true;
    }
    return match;
  });
  return out;
}
```

`v == null` 把 `null` 和 `undefined` 都映射为 `''`。这意味着 `t('app.error.writeFailedRecord', { reason: undefined })` 会渲染成 `"本次最佳成绩未能保存(原因：)"`,括号里是空的。

**影响**

- 当前所有 6 个调用方(`App.tsx:178, 35, 38, 43, 48, 51`)都是传入 `string` 值,所以**今天没有 UI 上会看到空括号**。但 `lastWriteError.reason` 在 `WriteError` 类型上是 `Extract<PersistResult, { ok: false }>['reason']` —— 是个 discriminated union,如果未来新增 `reason: 'something-new'` 而资源字典漏翻,`t('editor.persist.reason.something-new')` 返回 key 字符串本身,再经 `String(v)` 渲染会得到非空字符串(不是空),但消费者**可能**误以为 `v == null` 不会发生。
- 真正的小问题:`v == null` 的语义合并发生在 `interpolate` 里,而**不是**翻译层。如果 `vars` 是 `{ reason: null }`(显式 null),i18n 也走空串路径 —— 这跟"missing var"的语义不一样(`missing` 是 var 不在对象里,`null` 是显式给 null),但 UI 上分不出来。

**修复建议**

把 "missing" 和 "explicit null" 区分:
- 缺 var → 保留 `{name}` token + warn(已有行为)
- 显式 `null` / `undefined` → 也保留 `{name}` token + 不 warn(因为是显式意图)
- 想"如果 var 是 null 就空串" → 消费者用 `t('key', { reason: msg ?? '' })` 显式表示

```ts
if (Object.prototype.hasOwnProperty.call(vars, name)) {
  const v = vars[name];
  if (v == null) return match;  // explicit null/undefined → keep token, no warn
  return String(v);
}
// not in vars → keep token + warn
```

`F-tag`: `F-2026-06-17-LOW-1`

---

## §6 假阳性 / 已记录 finding 段

下列怀疑已被读历史 review 排除,不报告:

| 怀疑 | 排除依据 |
|---|---|
| `engine/**` / `entities/**` / `game/**` / `maze/{generators,JsonMazeProvider,...}` 反向 import 任何 store | `grep -rn "useGameStore\|useLevelStore\|useSettingsStore\|useEditorStore\|useTutorialStore" src/engine/ src/entities/ src/game/ src/maze/` 仅命中 `src/engine/Game.ts:81` 的一行注释(描述 wire shape,无 import)。**引擎边界干净**。 |
| `utils/**` / `maze/types.ts` / `i18n/types.ts` 反向 import `react` / `zustand` | `grep -n "from 'react'\|from 'zustand'"` 在 9 个纯模块上全空。仅 5 个 `*Store.ts` 文件合法 `import { create } from 'zustand'`。 |
| `gameUrl.ts` 用 `JSON.parse` 直接吃 raw 字符串 | 实际是 `new URLSearchParams(params)` 入口,所有值都过 `isVictoryType` / `Number.isFinite` / `Number.parseInt` 守卫,`parseGameSearchParams` 在 7 类错误下返回 `{ ok: false, error: GameUrlError }`,`App.tsx:391-395` 把它翻译成 `urlError` 渲染。`F-2026-06-16-H-2` 修过的 progressive round-trip 已经在读路径上有显式 `if (progressiveRaw !== '0' && progressiveRaw !== '1') return { ok: false, error: 'bad-progressive' }`。 |
| `isPickupType` / `isVictoryType` / `isMazeSize` / `isLevelSource` / `isSurviveSeconds` 5 个守卫有运行时入口漏掉 | 5 个守卫的调用点清单:LevelSelect.tsx 5 处(全部是 UI 边界),gameUrl.ts 1 处(`isVictoryType` / `isMazeSize`),EditorPropertiesPanel.tsx 2 处(`isVictoryType` / `isPickupType`),JsonMazeProvider.ts 2 处(`isPickupType` / `isVictoryType`)。**没有**任何 `as PickupType` / `as VictoryType` / `as MazeSize` 的 unsafe cast 出现在我范围内。`as MazeSize` 仅在 `seed.ts:83, 88` + `levelStore.ts:130` 出现,均紧跟 `VALID_SIZES.includes(...)` 守卫 + `Number.isFinite` 校验 —— 守卫后置 + cast 模式,与 SPEC 的"白名单镜像"契约一致。 |
| `parseGameSearchParams` 在畸形 URL 下会让游戏崩 | 7 类 `GameUrlError` 字符串全部归到 `urlError` state,GamePage 渲染 `game-load-error` 面板 (`App.tsx:424-461`)。 |
| `tutorialStore` 使用 module-level 闭包变量 (`_timeoutRef` / `_accumMouseLook` / `_pickupCount`) 可能在 HMR 下不重置 | HMR 不在生产 hot path 上,文档级注释 `tutorialStore.ts:27-29` 已经标记 `_timeoutRef` 等。`reset()` / `start()` 都先 `clearTimer()` + 重置计数。**架构上可接受**,不算 finding。 |
| `useAutoSave.ts` 仍把"saveLevel→useLevelStore.saveCustom"放在 hook 里,而不是上层 | `F-project-review-2026-06-13-A-HIGH-2` 已经把这事从 `editorStore.saveLevel` 拆到 hook,这里属于"已修复"。 |
| `gameStore.goToMenu` 漏 reset 的某个字段 | `F-2026-06-15-C-2` 已修 `currentMode` + `currentEnemyCount`;`currentSurviveSeconds` / `lastHitBy` / `lastWinKind` / `lastSpawnAt` 全部都有显式 reset。**已修**。 |

## §7 验证为阴性的检查

下列检查跑了,没发现问题:

- **循环依赖扫描**:`grep -rn` 全仓,store 之间没有 import;`utils/` / `i18n/` / `maze/types.ts` / `editorHistory.ts` / `migrations.ts` / `persist.ts` 全部模块依赖单向流入 `store/`。
- **`useT()` 死循环**:`useT` 在 `useSettingsStore((s) => s.language)` 上订阅,`getT` 内部用 `useMemo([locale])` 缓存,不会因 render 抖动重建 t 函数。
- **`getT(locale)` 纯函数性**:`getT` 不读 store / 不读 global / 不读 clock;`resolveLocale` / `interpolate` 都是无副作用。多次调用同 locale 返回的 `t` 行为完全一致。✓
- **`{name}` 占位符插值**:`PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g`,只匹配以字母/下划线开头的标识符,与 TypeScript 变量名规则一致。`interpolate` 用 `String(v)` 转换,数字 / boolean 会得到 `"42"` / `"true"`,不会 crash。
- **`unknown` locale 回退**:`resolveLocale` 用 `(LOCALES as readonly string[]).includes(locale as string)` 守卫后置 cast,`LOCALES = ['zh', 'en']`,`DEFAULT_LOCALE = 'zh'`,未知 locale → `console.warn` + 返回 'zh'。✓
- **store `getState()` 跨调用新增点**:`App.tsx` / `useAutoSave.ts` / `GameCanvas.tsx` / `EditorTopBar.tsx` / `EditorPage.tsx` / `EditorPropertiesPanel.tsx` 总共 22 处 `.getState()` 调用 —— 所有 22 处都属于"事件回调中更新另一 store"的合法模式,**没有**意外的循环调用(读 store A → 触发 store A 的 setter → setter 反向读 store A → ...)。
- **`persist.ts` 的 `pagehide` / `visibilitychange` 监听在 SSR / 单元测试下注册**:`if (typeof window !== 'undefined')` 守卫 (line 188) 完整,Node 22 测试环境下不会注册监听器。
- **`saveJSONDebounced` 的 `pendingWrites` Map 是模块级 mutable**:`tests/setup.ts` 通过 `vi.useFakeTimers()` + `flushPendingWrites()` 在测试之间清理(`persist.ts:165-180` 暴露了 `flushPendingWrites` 作为测试 seam)。✓
- **maze/types.ts 的所有 `as` cast**:`(PICKUP_TYPE_VALUES as readonly string[])` / `(VICTORY_TYPE_VALUES as readonly string[])` / `(LEVEL_SOURCE_VALUES as readonly string[])` / `(MAZE_SIZE_VALUES as readonly number[])` / `(SURVIVE_SECONDS_VALUES as readonly number[])` 全部是为绕过 TS 模板字面量 `readonly tuple` 与 `string[]` / `number[]` 之间的协变差异,让 `.includes(v)` 编译通过 —— 这是 TypeScript 标准做法,不算"未守卫的强制转换"。✓

## §8 跨切关注

- **A-CRITICAL-1 + A-CRITICAL-2 都是 P2-11 引入的回归**:`git log` 显示 `e35092d` (Task 12-14) 改 editorStore.ts 时直接没编译就跑;`6e868d0` (Task 7) 改 `VICTORY_TYPE_VALUES` 时也漏改了联合类型。这说明 **P2-11 增量缺乏 typecheck gate**:在内部 commit 之前没人跑 `npm run typecheck` + `npm test`,否则这两个 bug 一个都过不去。`main` HEAD 上的 typecheck 输出 26 个错误,意味着自 `e35092d` 之后的所有 commit 都没经过编译。
- **store action 的"清 lastError"重复** (`A-MEDIUM-1`) 也是 `F-2026-06-16-L-1` 的副作用:那次评审发现"在 placement actions 上要清",于是用复制粘贴扩散到 8 个 action。本可以用 `commitLevel({ clearErrors: true })` 一次性解决,但当时评审员(包括我)都低估了扩散面。
- **P2-11 教程文案** (`tutorial.teaching01.step1` ... `tutorial.teaching04.step3`, 共 10 条双语文案) 已经在 `src/i18n/resources/{zh,en}.ts` 中添加,i18n `keysParity.test.ts` 也加了 allowlist。但**没有任何 e2e 测试或单元测试覆盖 tutorialStore 的 `_accumMouseLook` / `_pickupCount` 重置逻辑**,这是 P2-12 收尾时需要补的(因为这两个是 module-level mutable 状态,行为依赖全局副作用)。

## §9 优先级行动建议

按"工作量 / 严重度"排序,先做这两条:

1. **(5 min, 必做)**:在 `src/maze/types.ts:3` 把 `VictoryType` 联合加上 `'caught-by-enemy'` 字面量 → 跑 `npm run typecheck` 验证 4 处错误全部消失。
2. **(15 min, 必做)**:把 `src/store/editorStore.ts:504-533` 4 个 setter 改成走 `commitLevel(get(), nextLevel)` 模式,去掉 `s.draft` / `next.draft` 引用 → 跑 `npm run typecheck` 验证 22 处错误全部消失 + 手动 / 单元测试 `setHideMinimap` / `setEnemyAggression` / `setRequireAllPickups` / `setTutorialSteps` 真的改了 `level` 字段。

(两条修完,`main` HEAD 才会重新 green。两条独立,可一并 PR。)

之后 P2-12 收尾时一并扫:
- A-MEDIUM-1 (清错 helper 抽取)
- A-MEDIUM-2 (迁移链错误信息)
- A-HIGH-1 (URL round-trip 的 stale spawnSchedule)

A-LOW-1 (i18n null 占位符) 可以留到 P3 再做。

## §10 Files Reviewed

| 模块 | 文件 | 行数 | 备注 |
|---|---|---|---|
| `src/` (root) | `main.tsx` | 12 | trivial,无 finding |
| `src/` (root) | `App.tsx` | 537 | store 边界 + URL 解析 + toast 桥,基本无 bug |
| `src/store/` | `gameStore.ts` | 467 | A-CRITICAL-1 通过,`goToMenu` reset 完整 |
| `src/store/` | `levelStore.ts` | 350 | 持久化 + sanitize + migration 接入,完整 |
| `src/store/` | `settingsStore.ts` | 115 | sanitize 守卫 + debounced 写入,完整 |
| `src/store/` | `editorStore.ts` | 1248 | A-CRITICAL-1 + A-MEDIUM-1 在此 |
| `src/store/` | `tutorialStore.ts` | 127 | module-level mutable 状态,但 `reset()` 覆盖 |
| `src/store/` | `editorHistory.ts` | 105 | 纯函数,无 finding |
| `src/store/` | `migrations.ts` | 131 | A-MEDIUM-2 在此 |
| `src/store/` | `persist.ts` | 194 | debounce + flush 监听,完整 |
| `src/utils/` | `errors.ts` | 28 | 纯,无 finding |
| `src/utils/` | `gameUrl.ts` | 207 | A-HIGH-1 在此 |
| `src/utils/` | `getDisplayName.ts` | 21 | 纯,无 finding |
| `src/utils/` | `id.ts` | 27 | 3-tier fallback,无 finding |
| `src/utils/` | `seed.ts` | 120 | encode/decode 完整,无 finding |
| `src/utils/` | `time.ts` | 7 | 纯,无 finding |
| `src/utils/` | `tutorialValidator.ts` | 99 | 纯 validator,无 finding |
| `src/maze/` | `types.ts` | 317 | A-CRITICAL-2 在此 |
| `src/i18n/` | `index.ts` | 93 | A-LOW-1 在此 |
| `src/i18n/` | `types.ts` | 36 | 纯,无 finding |
| `src/i18n/resources/` | `zh.ts` / `en.ts` | 大 | 翻译资源,本次未逐条审查(在 E 评审员范围) |
| `src/hooks/` | `useAutoSave.ts` | 142 | A-HIGH-1 fix 后正确 |

## §11 统计

**A-6 条发现,其中 CRITICAL=2 / HIGH=1 / MEDIUM=2 / LOW=1**
