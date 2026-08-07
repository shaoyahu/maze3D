# P4b 实施计划 (3D 全景 minimap — 3 y-layer 堆叠)

**Slug**: p4b-panorama
**复杂度**: M (半天-1 天, 1 session ship)
**依赖**: P4a + P4b-Lerp + P4b-Minimap + P4b-HudLayer 全部 ✅

---

## Task Table (P4b-Panorama)

| # | 文件 | 类型 | 内容 | 状态 |
|---|---|---|---|---|
| 1 | docs/increments/p4b-panorama/{spec,plan}.md | ADD | 增量文档 | [x] |
| 2 | src/ui/components/Minimap.tsx | UPDATE | 3D path 升级 3 strip 堆叠 (新增 `YStripPanorama` 组件) + 越界 strip 不渲染 + 1px 灰分隔线 + 玩家 arrow 只在当前 y strip + 出口 / visited 只在当前 y strip | [ ] |
| 3 | tests/component/Minimap.3D.test.tsx (UPDATE) | UPDATE | 8 旧 case 改 dispatch (3D 走 P4b-Panorama 路径,断言 3 strip + 越界 strip 不渲染) | [ ] |
| 4 | tests/component/Minimap.Panorama.test.tsx (NEW) | ADD | 5+ case: 3 strip 渲染 / 越界 strip 不渲染 / 玩家 arrow 只在中间 / 出口 off-layer hint 复用 / strip 滚动 (y 变化时整体重渲染) | [ ] |
| 5 | CLAUDE.md | UPDATE | P4b-Panorama 段 (在 P4b-HudLayer 段后) | [ ] |
| 6 | docs/roadmap.md | UPDATE | 加 P4b-Panorama 行 + 活跃锚点 | [ ] |
| 7 | spec.md | UPDATE | 状态 in-progress → done | [ ] |
| 8 | Commit + push | — | `feat(p4b): 3D 全景 minimap — 3 y-layer 堆叠` | [ ] |

## 实施顺序

1. **Task 1 (docs)** — spec + plan 锁 ✓
2. **Task 2 (minimap 3 strip 堆叠)** — Minimap.tsx 加 YStripPanorama 组件
3. **Task 3 (旧 3D test 改 dispatch)** — Minimap.3D.test.tsx 8 case 改 P4b-Panorama 路径
4. **Task 4 (新 panorama test)** — Minimap.Panorama.test.tsx 5+ case
5. **集成验证** — typecheck + test + build + Browser E2E
6. **Task 5-7 (docs)** — CLAUDE.md + roadmap + spec
7. **Task 8 (commit + push)** — 独立 ship

## 关键设计点 (Q&A 复盘)

### Q1 3 strip 堆叠 vs orthographic projection

**选 3 strip 堆叠**。原因:
- SVG 实现简单 — 3 个嵌套 SVG,各 40px 高,跟 P4b-Minimap 渲染同形
- 代码复用率高 — `StaticMaze` 组件已经接受 walls2D prop,直接复用
- 视觉清晰 — 玩家一眼看出"上面 / 中间 / 下面" 3 层,不需要 isometric 数学解码
- 性能好 — 3 strip × ≤ 225 rect 跟单层 225 rect 同一量级,React.memo 优化
- orthographic 投影需要 isometric 数学,SVG path 命令复杂,视觉密度高反而不易读 (P4c+ 候选)

### Q2 3 strip × 40px 高 (硬约束)

**选 40px**。原因:
- 120 / 3 = 40 整数,跟 CSS grid 友好
- 跟 P2-3 锁的 120×120 容器总高度对齐,不需要扩容器
- visualSize=15 时每 cell 4px × 4px 略方,visualSize=5 时每 cell 8px × 8px 正常
- 玩家 arrow 在 40px 中间位置 (cell 8px 高度) 仍有空间渲染

### Q3 当前 y 满色,相邻 50% opacity

**选 当前 y 满色,相邻 50%**。原因:
- 玩家位置在当前 y,中间 strip 是主视图,满色强化"现在位置"
- 上下相邻 layer 是"context",50% opacity 退到背景,不抢戏
- 1px 灰分隔线在 50% opacity 之上再强化视觉边界
- 整体可读性:玩家一眼分清"主 / 副" 视图

### Q4 越界 strip 不渲染 (留白)

**选 不渲染**。原因:
- y < 0 / y >= visualSize 不存在 (VALID_3D_SIZES = [5,7,9,11,13,15],currentY 永远 0..visualSize-1)
- currentY=0 没有下层,留白是正确的物理反映
- currentY=visualSize-1 没有上层,留白也是正确的物理反映
- 显式画 "out of bounds" 边界反而误导 (玩家会以为那里有 layer 只是看不见)

### Q5 出口 dispatch 复用 P4b-Minimap

**选 复用**。原因:
- P4b-Minimap 的 exit dispatch (同层 rect / off-layer "↑/↓ exit" text) 已经 work,代码不动
- 出口只在当前 y strip 渲染 (玩家位置决定),相邻 layer 不画 exit
- off-layer hint 方向 (↑ 上 / ↓ 下) 跟 strip 视觉位置对齐 (上 strip 在屏幕上方,下 strip 在屏幕下方)
- 零代码重复,只是渲染位置从 1 strip 移到 3 strip 的中间 strip

### Q6 玩家 arrow 只在当前 y strip

**选 是**。原因:
- 玩家物理位置在当前 y,arrow 视觉位置 = 玩家位置
- 上下相邻 layer 不画 arrow (玩家没在那里,画了会误导)
- arrow 跟 strip 一起滚动,玩家 y 变化时 arrow 跳到新中间 strip

### Q7 visited cells 只当前 y strip

**选 是**。原因:
- 玩家在当前 y 走过的格只在当前 y strip 显示
- 上下相邻 layer 是 "context"(知道上面有什么),不显示 visited (玩家没走过)
- 跟 P4b-Minimap 行为一致,只是渲染位置从 1 strip 移到 3 strip 的中间 strip

## 锁的 contracts (跨 scope)

- 3D minimap 容器 120×120 不动 (P2-3 锁)
- 3 strip × 40px 高 (硬约束,本 scope 锁)
- visualSize=15 时每 cell 4×4,visualSize=5 时 8×8 (cell 尺寸派生,跟 P4b-Minimap 一致)
- 越界 strip 不渲染 (currentY=0 没下层,currentY=visualSize-1 没上层)
- 1px 灰分隔线 strip 间 (本 scope 锁)
- 当前 y 满色,相邻 50% opacity (本 scope 锁)
- 玩家 arrow / visited cells / 出口 rect 只在当前 y strip (本 scope 锁)
- off-layer exit hint 方向 (↑/↓) 跟 strip 视觉位置对齐 (本 scope 锁)
- y-level 标签 "L{n}/{total}" 容器右上角保留 (P4b-Minimap 锁)
- `getPlayerY()` + `PlayerSnapshot.y` + `Y_EPSILON` 完全复用 (P4b-Minimap 锁)
- 2D minimap 走 P4b-Minimap 单层路径,3D minimap 走 P4b-Panorama 3 strip 路径,互斥 dispatch
- HUD `LevelIndicator` chip 跟 P4b-HudLayer 一致,跟当前 y 同步

## 不在 scope

- ❌ 全 orthographic projection (isometric 3D top-down) — P4c+ 候选
- ❌ 4+ strip 堆叠 (e.g. 上 2 / 当前 / 下 2) — 120×120 容器放不下,需要扩容器或缩小 cell
- ❌ strip 透明度动态变化 (e.g. 远端 strip 更透明) — 增加视觉噪音,本 scope 锁 50% 固定
- ❌ strip 间平滑滚动动画 (CSS transition) — 玩家 y 变化时 strip 整体重渲染已经够,平滑滚动是 polish 留给 P4c+
- ❌ 越界 strip "ghost" 渲染 (e.g. 视觉上看到 "无数据" 边框) — 留白就是正确视觉
- ❌ minimap 容器扩大 (150×150 / 180×180) — P2-3 锁 120×120,扩容器影响周围 layout
- ❌ 玩家在中间 strip 的具体位置 (e.g. "你在这里") — arrow 已经显示,不需要额外标记
- ❌ 出口所在 strip 高亮 (e.g. 中间 strip 边框) — 出口 rect / hint 已经视觉强化
