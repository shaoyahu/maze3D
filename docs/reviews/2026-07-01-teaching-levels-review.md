# Code Review — P2-18 Teaching Levels (2026-07-01)

**Slug**: teaching-levels-review
**日期**: 2026-07-01
**评审窗口**: `main` HEAD = `95308bd fix(p2-17): full code review batch (170 findings) + P2-16/17 wrap-up` (本次会话工作树未提交)
**前置评审**: [`2026-07-01-full-p2-18-review.md`](./2026-07-01-full-p2-18-review.md)
**评审方式**: 3 个并行子代理 (cavecrew-reviewer × 3) + 主线程手动路径验证
**状态**: 全部 finding 已修复 (2026-07-01)

## §0 元数据 & 方法

**范围**: 用户明确指示 "review 新增的几个功能对应的教学关卡" → 锁定到本次会话新增的:

- `public/levels/teaching-05.json` — 烈焰试炼 (火焰陷阱)
- `public/levels/teaching-06.json` — 涉水而行 (水洼陷阱)
- `public/levels/teaching-07.json` — 红钥开门 (1 钥匙 + 1 门)
- `public/levels/teaching-08.json` — 双门试炼 (2 钥匙 + 2 门 + 2 陷阱)
- `src/i18n/resources/zh.ts` — `tutorial.teaching05-08.step*` × 15
- `src/i18n/resources/en.ts` — 同上 × 15
- `tests/unit/maze/builtInLevels.test.ts` — `EXPECTED_BUILT_IN_IDS` 白名单补 4 项

不评审 P2-18 主体实现 (引擎 / Rules / Scene / store) — 已在 [`2026-07-01-full-p2-18-review.md`](./2026-07-01-full-p2-18-review.md) 完成且 finding 全部修复。

**方法**: 3 个 `cavecrew-reviewer` 子代理并行评审 (关卡 JSON / i18n / 测试白名单), 主线程手动路径验证子代理关键声明。

## §1 总览

| 严重度 | 数量 |
|--------|------|
| CRITICAL | 0 (子代理报的 1 条经手动验证为假阳性) |
| HIGH | 0 |
| MEDIUM | 3 |
| LOW | 1 |

**一句话结论**: 4 个关卡全部 `validateMaze` 通过、路径可达、tutorial 完整, 但 07/08 共用 5×5 十字布局, 玩家可经外圈列 (column 0 或 column 4) 完全绕开两道门 — 这破坏了"教开门"的教学目标, 是设计层面的 MEDIUM 缺陷。i18n 与测试白名单无问题。

## §2 CRITICAL (0)

子代理 reviewer A 报出 1 条 CRITICAL:

> `public/levels/teaching-08.json:38` — step 3 "open-red" 6s 超时后玩家若未开红门, tutorial 推进至 step 4, 但蓝钥匙在 `(3,4)` 物理上不可达, 因为红门是唯一通路。

**验证结果**: **假阳性**。墙图:

```
z\x  0 1 2 3 4
0    . . . . .
1    . W D W .
2    . . F . .
3    . W D W .
4    . . . K .
```

(0,0) → (0,1) → (0,2) → (0,3) → (0,4) → (1,4) → (2,4) → (3,4) 蓝钥匙 — **不需开任何门**。

外圈列 (x=0 与 x=4) 是开放走廊, 玩家从 (0,0) 一路绕到 (4,4) 出口全程不接触门。子代理只看了行 0-1 入口, 漏了 (0,1) → (0,2) → (0,3) 这条贯穿南北的开放列。

**结论**: 关卡可解, 但教学意图 (必须开门) 被完全绕过 — 见 §3 M-1。

## §3 MEDIUM (3)

### M-1: `teaching-07.json` + `teaching-08.json` — 5×5 十字布局允许外圈列完全绕开所有门

**位置**: `public/levels/teaching-07.json:9-15`, `public/levels/teaching-08.json:9-15`

**影响**: 两个"教开门"的关卡都可以不碰任何门直接通关。

- teaching-07: (0,2)→(0,1)→(0,0)→(1,0)[红钥]→(0,0)→(0,1)→(0,2)→(1,2)→(2,2)→(3,2)→(4,2)[出口] — 红门 (2,1) 全程未触发。
- teaching-08: (0,0)→(0,1)→(0,2)→(0,3)→(0,4)→(1,4)→(2,4)→(3,4)[蓝钥]→(4,4)[出口] — 红门 (2,1) 和蓝门 (2,3) 全程未触发。

玩家可以拾取钥匙 (因为走过去会触发), 但可以**永远不用**, 直接绕路到出口。教学目标 ("按数字键用钥匙开门") 退化成了可选项。

**修复方向** (任选其一):

1. **改墙布局**: 把外圈列也加墙, 强制只能经门通行。例如:
   ```
   [1, 0, 0, 0, 1]   z=0
   [0, 1, 0, 1, 0]   z=1
   [0, 0, 0, 0, 0]   z=2
   [0, 1, 0, 1, 0]   z=3
   [1, 0, 0, 0, 1]   z=4
   ```
   现在 (0,0) 和 (4,4) 是墙, 玩家只能从 (0,0)/(0,2) 或 (4,2) 区域内部通行, 而穿越到对面半区必须经门。

2. **改起终点位置**: 把起点和终点放在必须经门才可达的位置 (如 teaching-07 把 exit 放 (3,2), 中间放门)。

3. **改教学意图**: 接受"可选开门", 把 tutorial 文案改成"你也可以绕路, 但试试用钥匙开门 — 那是另一条路"。但这削弱了"教开门"的力度, 不推荐。

### M-2: `teaching-08.json:38` — step 3 "open-red" 6s 超时可能过早推进

**位置**: `public/levels/teaching-08.json:38` — `{ "id": "open-red", ..., "trigger": { "type": "timeout", "timeoutSec": 6 } }`

**影响**: 玩家拾取红钥 (step 2) 后, 有 6 秒开红门。如果玩家在这 6 秒里被火/水陷阱分神、走错路, tutorial 直接跳到 step 4 (等待第 2 个 pickup), 但此时红门未开, 而 `pickup-collected count=2` 又不会触发 (只有 1 个 pickup) — 玩家**卡在 step 3 与 step 4 之间**, 红门的提示永久消失。

若玩家接着经 M-1 的外圈绕路拿到蓝钥, step 4 触发, 再 6s 后又跳 step 5, 蓝门提示也消失。

**修复**: 把这两个 step 的 `timeoutSec` 调大 (30s+) 或直接去掉 (让 step 永不超时, 但保留 step 1/4 等事件触发型 step 自动推进)。考虑到玩家可能死亡重试, 30s 上限比较稳。

### M-3: `teaching-08.json:40` — step 5 "open-blue" 6s 超时同理

**位置**: `public/levels/teaching-08.json:40`

同 M-2 根因, 同修复方案。

## §4 LOW (1)

### L-1: `teaching-07.json:33` — step 2 "useKey" 5s 超时偏紧

**位置**: `public/levels/teaching-07.json:33`

**影响**: 玩家拾取红钥后只有 5s 时间意识到"要走到门旁按 1 键"。考虑到 5×5 地图的视觉扫描 + WASD 移动到位 + 找数字键, 5s 对新手偏紧。

**修复**: 调到 8-10s, 或完全去掉 timeout (与 M-2 同思路)。

## §5 i18n 评审 (子代理 B)

子代理 B 全量检查 zh.ts / en.ts, 确认:

- 15 个新 key 在两文件均存在, keyParity 测试通过
- 4 个 JSON `messageKey` 全部能 resolve
- 风格与 teaching01-04 一致 (em-dash `—`, 简短祈使句)
- 翻译自然、无机翻痕迹

**结论**: 0 finding。

## §6 测试白名单评审 (子代理 C)

子代理 C 检查 `builtInLevels.test.ts` 与相关测试:

- 白名单顺序正确 (teaching-01 → teaching-08)
- `arrayContaining` + `toHaveLength` 双重断言正确
- 其他测试文件 (`levelSelect.*.test.tsx`, `JsonMazeProvider.test.ts`) 不用硬编码 ID, 不受影响

**结论**: 0 finding。

**观察** (非 finding): `tests/unit/levels.test.ts` 只为 teaching-01/04 写了 per-level 形状断言, teaching-05~08 没对应断言。这是 P2-11 起的既有格局, 本次未引入回归, 但如果以后关卡形状变化 (例如改 cellSize), 这些新关不会被该测试捕获。

## §7 验证为假阳性的子代理报告

### FPA-1: "teaching-08 step 3 超时后蓝钥匙不可达"

**来源**: 子代理 reviewer A, 标 CRITICAL。

**否定理由**: 见 §2。手动路径验证显示 (0,0)→(0,1)→(0,2)→(0,3)→(0,4)→(1,4)→(2,4)→(3,4) 完整可达, 不经任何门。子代理未考虑外圈列作为替代通路。

**经验**: 评审可达性时, 必须从起点系统枚举所有 4-邻居连接, 而非只看主路径。下次 review 加一句: "把所有 wall=0 的 cell 都标成可达集, 看 exit ∈ 可达集, 再看可达集是否必须经门"。

## §8 验证结果

| 检查 | 状态 |
|------|------|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 1246 passed (1 skipped) |
| `npm run build` | ✅ 138 modules, 1.37s |

新增 4 个关卡加载到 `BUILT_IN_JSON_PROVIDER.list()` 后, 白名单测试通过, 证明 `validateMaze` 全量接受新关 schema。

## §9 优先级行动建议

按修复成本排:

1. **M-1 (设计缺陷)**: 改 teaching-07 和 teaching-08 的 walls, 强制门为必经路径。最小改法: 外圈四角设墙 (见 §3 修复方向 1)。一次性修复两块教学关卡的核心意图, **强烈建议**.
2. **M-2 + M-3 (timeout)**: teaching-08 把 step 3/5 的 timeoutSec 改成 30 (或不写)。2 行 JSON 改动。
3. **L-1 (timeout)**: teaching-07 step 2 timeoutSec 改 8。1 行 JSON 改动。

总改动量: 2 个 JSON 文件, 约 10 行。预计不影响测试 (现有断言不依赖特定 walls 形状)。

## §10 修复记录 (2026-07-01)

### M-1 修复 — 强制门为必经路径

**teaching-07 新 walls**:
```
[0, 0, 0, 0, 0]   z=0
[0, 1, 0, 1, 1]   z=1  -- (0,1) 仍开放作入口
[0, 1, 0, 0, 0]   z=2  -- (1,2) 墙切断东西向
[1, 1, 0, 1, 1]   z=3  -- 整行墙, 仅 (2,3) 开放 (教学-07 无蓝门, 该格纯走廊)
[0, 0, 0, 0, 0]   z=4
```
外圈行 1 与行 3 加墙切断南北向; 行 2 的 (1,2) 设墙让起点 (0,2) 不能直接东进, 必须先往北取得钥匙再开门。

**teaching-08 新 walls**:
```
[0, 0, 0, 0, 0]   z=0
[1, 1, 0, 1, 1]   z=1  -- 红门 (2,1) 是唯一南北通道
[0, 0, 0, 0, 0]   z=2  -- 整行开放
[1, 1, 0, 1, 1]   z=3  -- 蓝门 (2,3) 是唯一南北通道
[0, 0, 0, 0, 0]   z=4
```
红门和蓝门都是唯一通道, 玩家无法绕开。

**teaching-08 蓝钥匙位置调整**: `(3,4)` → `(3,2)`。原位置在蓝门南侧, 必须先开蓝门才能取, 形成死循环; 新位置在蓝门北侧, 开红门后可达。

### M-2 + M-3 修复 — timeout 30s

teaching-08 step 3 (open-red) 与 step 5 (open-blue) 的 `timeoutSec` 从 `6` 改为 `30`。给玩家充足缓冲期, 不再因短暂走神而丢失教学提示。

### L-1 修复 — timeout 8s

teaching-07 step 2 (useKey) 的 `timeoutSec` 从 `5` 改为 `8`。

### 修复后强制路径验证

**teaching-07**: (0,2)→(0,1)→(0,0)→(1,0)[红钥]→(2,0)→开(2,1)→(2,2)→(3,2)→(4,2)[出口]。红门必经。

**teaching-08**: (0,0)→(1,0)[红钥]→(2,0)[水]→开(2,1)→(2,2)[火]→(3,2)[蓝钥]→(2,2)→开(2,3)→(2,4)→(3,4)→(4,4)[出口]。两道门都必经, 1 火伤 + 1 水减速。

### 修复后回归

- typecheck ✅
- vitest 1246 passed (1 skipped) ✅
- build ✅

## §10 Files Reviewed

| 文件 | 行数变化 | findings |
|------|---------|----------|
| `public/levels/teaching-05.json` | NEW (25 行) | 0 |
| `public/levels/teaching-06.json` | NEW (25 行) | 0 |
| `public/levels/teaching-07.json` | NEW (30 行) | M-1, L-1 |
| `public/levels/teaching-08.json` | NEW (43 行) | M-1, M-2, M-3 |
| `src/i18n/resources/zh.ts` | +16 行 | 0 |
| `src/i18n/resources/en.ts` | +20 行 | 0 |
| `tests/unit/maze/builtInLevels.test.ts` | +4 行 | 0 |
| **总计** | **~160 行新增** | **3 MEDIUM, 1 LOW, 1 FPA** |