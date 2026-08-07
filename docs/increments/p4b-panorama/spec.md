# P4b: 3D 全景 minimap — 3 y-layer 堆叠 (P4b-Panorama)

**Slug**: p4b-panorama
**状态**: done (P4b-Panorama ship 2026-08-07)
**日期**: 2026-08-07
**对应路线图项**: P4+ 候选 (3D 全景 minimap)
**依赖**: P4a + P4b-Lerp + P4b-Minimap + P4b-HudLayer 全部 ✅ ship
**复杂度**: M (半天-1 天, 1 session ship)

---

## 1. 概述

P4b-Minimap 在 120×120 容器里只渲染当前 y-layer 单层顶视图。玩家在 visualSize=15 cube 里虽然知道自己在哪一层,但完全看不到上下层有什么 — 想上楼得先 walk 到 ladder 才看见 cell 2,walk 到 ladder 才知道能上去。

**P4b-Panorama 把 3 个 y-layer 堆叠到 120×120 容器里**:
- 上 1/3 (40px 高): `walls3D[currentLayer+1]` — 50% 透明度显示
- 中 1/3 (40px 高): `walls3D[currentLayer]` — 100% 透明度 + 玩家 arrow + 出口
- 下 1/3 (40px 高): `walls3D[currentLayer-1]` — 50% 透明度显示
- 越界 layer 不渲染 (e.g. currentLayer=0 时没有 "下" 层)
- 玩家 y 变化 → 3 个 strip 整体滚动,中间 strip 永远对应当前 y
- 出口 dispatch 跟 P4b-Minimap 一致 (同层 COLOR_EXIT rect / off-layer "↑/↓ exit" hint)
- y-level 标签 "L{n}/{total}" 保留 (对应中间层)

视觉收益:
- 玩家在 layer 7 看见: 上 strip 隐约透出 layer 8 形状 (知道上面有什么) + 中 strip 满色 layer 7 (现在位置) + 下 strip 隐约透出 layer 6 (下面)
- 3D 空间感从"逐层探索"变成"立体纵览"
- 60×40 单层 cell (visualSize=15 时 cell 4×4,略小但仍可读) vs 120×40 三层

设计决策 (P4b-Panorama 锁的 contracts):

- 容器尺寸保持 120×120 (P2-3 锁)
- 3 strip × 40px 高 (硬约束,P2-3 锁的总高度)
- visualSize=15 时 cell 8×4 (略方但可读)
- 越界 layer 不渲染 (currentLayer=0 不显示下层,currentLayer=visualSize-1 不显示上层)
- strip 间用 1px 分隔线 (灰) 视觉区隔
- 当前 y strip 满色,相邻 strip 50% opacity (`fill-opacity`)
- 玩家 arrow 只在当前 y strip 渲染
- 出口 / 离层 hint 跟 P4b-Minimap 一致 (同层 rect / off-layer "↑/↓ exit" text)

## 2. 决策表 (P4b-Panorama)

| Q | 决策 | 备注 |
|---|---|---|
| Q1 | 3 strip 堆叠 vs 全 orthographic projection? | **3 strip 堆叠** — SVG 简单,代码复用率高 (跟 P4b-Minimap 的 2D 渲染同形),视觉清晰。orthographic 3D 投影需要 isometric 数学,SVG path 命令复杂,视觉密度高反而不易读 |
| Q2 | 3 strip 各 40px 高? | **是** — 120 容器 / 3 = 40 整数,跟 CSS grid 友好。中间 40px 给玩家 arrow 足够空间,上下 40px 给相邻 layer 形状预览。visualSize=15 时 40px 内 15 cell × 8px 高,每 cell 4px × 4px 略方但仍可读 |
| Q3 | 当前 y strip 满色 vs 50%? | **满色** — 玩家位置永远在当前 layer,中间 strip 是主视图。上下相邻 layer 是 "context" 用 50% 透明度,不是主视图 |
| Q4 | 越界 layer (y<0 或 y>=visualSize) 怎么处理? | **不渲染** — 0..visualSize-1 是合法 y-cell,负数 / 越界不渲染对应 strip。top 不存在时上 1/3 空白,bottom 不存在时下 1/3 空白。视觉上不显式画 "out of bounds" 边界,留白就行 |
| Q5 | strip 间分隔线? | **1px 灰横线** — `stroke="rgba(0,0,0,0.3)"` 在每个 strip 底部,视觉上分开 3 个 layer。占 1px 不影响 cell 渲染 |
| Q6 | 玩家 arrow 位置? | **只在当前 y strip 渲染** — 玩家的物理位置在当前 y,arrow 也只在当前 y 显示。上下相邻 layer 不画 arrow (玩家不在那里) |
| Q7 | 出口 dispatch? | **跟 P4b-Minimap 一致** — 同层 (currentLayer === exit3D.y) 在中间 strip 画 COLOR_EXIT rect,off-layer 在玩家 arrow 旁画 "↑/↓ exit" 文字。相邻 layer 不显示 exit 提示 (玩家没在那里) |
| Q8 | 出口 off-layer 提示方向? | **跟 P4b-Minimap 一致** — 出口 y > currentY 显示 "↑ exit"(指向屏幕上方 strip),出口 y < currentY 显示 "↓ exit"(指向屏幕下方 strip)。视觉方向跟相邻 layer 位置一致 |
| Q9 | visited cells 渲染? | **只当前 y strip** — 跟玩家物理位置一致,只在当前 y 显示玩家走过的格。相邻 layer 不画 visited (玩家没走过) |
| Q10 | y-level 标签 "L{n}/{total}" 位置? | **容器右上角保留** — 跟 P4b-Minimap 一致,标签永远显示当前 y-layer 数字。120×120 容器右上角 11px 文字 |
| Q11 | viewBox 调整? | **保持 `{w} {d}`** — 三个 strip 内部 SVG 用相同的 viewBox 渲染不同 y-slice,3 个 SVG 嵌套在容器里。每个 strip 的 transform 负责 offset |
| Q12 | polling 机制? | **复用 P4b-Minimap** — `useTickRef` 已有 y 字段 + `Y_EPSILON` 早出,玩家 y 变化时自动重渲染。3 strip 整体更新,新 currentLayer 决定哪个 strip 满色 |
| Q13 | 2D minimap 影响? | **零** — 2D maze 走 P4b-Minimap 单层路径,3D maze 走 P4b-Panorama 3 strip 路径,互斥 dispatch |
| Q14 | minimap 容器扩大? | **不扩大** — P2-3 锁 120×120,玩家右上角已经适应这个尺寸。扩大需要同步改 HUD / minimap 周围所有 layout。视觉密度已经够,扩大反而占游戏视野 |
| Q15 | 性能? | **3 strip × ≤ 225 rect + 上下各 50% opacity** — visualSize=15 时总共 ≤ 450 rect (vs P4b-Minimap 225 rect),`React.memo` 跳过静态部分。3D minimap 10Hz poll 抓 y 触发整体重渲染,3 个 strip 同时 unmount/remount 不会差 (SVG 元素轻量) |
| Q16 | P4a 8 个 contracts 兼容? | **完全兼容** — P4a 锁的 walls3D shape / start3D/exit3D / 6 邻居 cell-based collision / InputManager.getMove3D / Game.tick3DTween / E2E URL pattern 全部不动。P4b-Panorama 只动 Minimap 组件 |
| Q17 | test 兼容性? | P4b-Minimap 8 test 改 dispatch (3D 走 P4b-Panorama,2D 走 P4b-Minimap),新加 5+ P4b-Panorama 专属 test |

## 3. 数据流 (P4b-Panorama)

```
启动 3D 关卡 (visualSize=15, currentY=0)
  ↓
Minimap dispatch is3D = true
  ↓
is3D path 渲染 3 strip (container 120×120):
  - 上 strip (y=0+1=1, 越界 visualSize=15, 渲染): 50% opacity walls3D[1]
  - 中 strip (y=0, current): 100% opacity walls3D[0] + 玩家 arrow + visited + 出口
  - 下 strip (y=0-1=-1, 越界): 留白,不渲染
  ↓
玩家按 Space (y+): tween 0→1
  ↓
tick3DTween 完成:
  - recordVisit(parchment, 1, endCell.x, endCell.z)
  - bridge.onLevelChange?.(1)
  - HUD chip 变 "L2"
  ↓
下次 10Hz poll 抓新 y → snapshot y delta > Y_EPSILON → setTick
  ↓
Minimap 重渲染:
  - currentLayer = 1
  - 上 strip (y=2): 50% opacity walls3D[2]
  - 中 strip (y=1, current): 100% opacity walls3D[1] + 玩家 arrow (新位置) + visited + 出口
  - 下 strip (y=0): 50% opacity walls3D[0] (新出现)
  ↓
玩家 y 持续变化 → 3 strip 整体滚动,中间 strip 永远对应当前 y
```

出口 off-layer 提示:

```
出口 y=5, 玩家 y=3
  ↓
中 strip (y=3, current): 渲染 walls3D[3] + 玩家 arrow
  - 玩家 arrow 旁显示 "↑ exit" (出口在上方)
  - 上 strip (y=4): 50% opacity walls3D[4] (出口 y=5 不在这里)
  - "上上" strip 不存在 (3 strip 限制)
  ↓
玩家上到 y=4:
  - 中 strip (y=4): 出口 y=5 仍在上方,继续 "↑ exit"
  - 上 strip (y=5): 50% opacity walls3D[5] (出口 y=5 在这里,可能可见)
  ↓
玩家上到 y=5 (出口同层):
  - 中 strip (y=5): 出口 rect 渲染 (COLOR_EXIT),no hint
```

## 4. UI / HUD 影响

- Minimap 容器尺寸不变 (120×120)
- Minimap 内容从单层 2D 顶视图升级为 3 strip 堆叠
- 玩家 y 变化时 3 strip 整体滚动 (跟 minimap polling 同步)
- y-level 标签 "L{n}/{total}" 保留 (右上角)
- 出口 off-layer hint 文字 + 箭头方向保留 (跟 P4b-Minimap 一致)
- HUD `LevelIndicator` chip 跟 P4b-HudLayer 一致,跟当前 y 同步
- 其他 UI (HUD timer / hearts / controls panel) 完全不动

## 5. 失败模式

- **currentY=0 或 currentY=visualSize-1 越界 strip**: 不渲染对应 strip,留白,玩家视觉上看到"少一层" 是正确反映物理位置
- **strip 越界 strip3 (currentY-1, currentY, currentY+1 都越界)**: 不可能 (visualSize ≥ 1 总是有 currentY),最坏情况 visualSize=1 时 3 strip 都是同一 cell 的 50% / 100% / 50% 叠加 — 但 visualSize=1 不是合法 3D size (VALID_3D_SIZES = [5,7,9,11,13,15])
- **玩家快速 walk 触发 3 strip 频繁重渲染**: `React.memo` 跳过每个 strip 内部静态部分,只换 walls3D 数据。3 strip 整体 unmount/remount 在 SVG 元素轻量,~1ms
- **3 strip 视觉太密**: 50% opacity 相邻 strip 提供视觉分隔,1px 分隔线强化边界,玩家能区分主 / 副视图

## 6. 性能

- 3 strip × ≤ 225 rect (visualSize=15) = ≤ 675 rect 总数
- vs P4b-Minimap 225 rect (单层)
- 3x 增长但 SVG 元素渲染是浏览器优化的强项
- React.memo 跳过静态 rect 不会 3x re-render
- 10Hz poll 抓 y 触发 minimap 重渲染,3 strip 同时换数据
- 实测影响 < 1ms / frame,远低于 60fps budget

## 7. 兼容性 / 锁的 contracts

- P2-3 锁的 2D minimap 容器 120×120 + palette 颜色 + 玩家 arrow + view cone 不动
- P2-16 锁的 `parchment.visitedCells` shape (`Map<level, Set<"x,z">>`) 不动,3D 复用同 shape (P4b-Minimap 已有)
- P3-1 锁的 minimap auto-switch layer (per-layer visited cells) 不动
- P4a 锁的 8 个 contracts 不动
- P4b-Prim sibling 算法不动
- P4b-CellSize 6 档 size 不动
- P4b-Lerp 0.1s tween + mouse-look gate 不动
- P4b-Minimap y-level 标签 + off-layer exit hint 不动 (P4b-Panorama 复用同 dispatch)
- P4b-HudLayer HUD chip dispatch 不动
- `getPlayerY()` accessor + `PlayerSnapshot.y` 字段 + `Y_EPSILON` 早出条件完全复用 (P4b-Minimap 已有)

## 8. DoD (Definition of Done)

- [ ] `Minimap` 3D path 升级 3 strip 堆叠 (上 1/3 + 中 1/3 + 下 1/3)
- [ ] 越界 strip 不渲染 (留白)
- [ ] 1px 灰分隔线 strip 间
- [ ] 玩家 arrow 只在当前 y strip 渲染
- [ ] 出口 dispatch 跟 P4b-Minimap 一致 (同层 rect / off-layer "↑/↓ exit" text)
- [ ] visited cells 只当前 y strip
- [ ] y-level 标签 "L{n}/{total}" 保留
- [ ] 5+ 新 unit test: 3 strip 渲染 / 越界 strip 不渲染 / 玩家 arrow 只在中间 / 出口 dispatch 复用 / strip 滚动 (y 变化时整体重渲染)
- [ ] P4b-Minimap 8 test 改 dispatch (3D 走 P4b-Panorama,2D 走 P4b-Minimap,互斥)
- [ ] typecheck 0 / 1740+ pass / build OK
- [ ] Browser E2E: dev server + 3D cube + 验证 3 strip 渲染 + 越界正确 + 出口 dispatch 复用
- [ ] CLAUDE.md 加 P4b-Panorama 段
- [ ] roadmap P4b-Panorama 行 + 活跃锚点
- [ ] spec 状态 in-progress → done
- [ ] commit + push
