# 3D First-Person Maze Game — Design Spec

**Date:** 2026-06-05
**Status:** Approved pending user review
**Author:** Claude (brainstorming session)

## 1. Overview

A web-based 3D first-person maze game built with Vite + React 18 + Three.js. MVP is a complete, playable mini-game; architecture is shaped so that a future in-browser level editor (and additional game modes) can be added incrementally without rework.

## 2. Goals & Non-Goals

### Goals
- Deliver a complete playable mini-game in MVP scope
- Desktop-only (mouse + keyboard) in MVP; mobile support deferred
- Fixed-maze level design with multiple difficulty sizes
- Local persistence for best records and settings
- Architecture that supports future extension (editor, more game modes, dark mode, monsters, etc.)

### Non-Goals (deferred)
- Mobile / touch / virtual joystick controls
- Audio (BGM/SFX)
- Procedural maze generation (interface reserved; JSON is the only MVP implementation)
- In-browser level editor
- Additional game modes (time-trial, survival)
- Enemies / health-loss mechanics
- Server-side persistence / leaderboard

## 3. Product Decisions (User-Confirmed)

| Dimension | Decision |
|---|---|
| Scope | Complete playable mini-game (B), with the architecture extensible to a level editor (C) |
| Core loop | Countdown timer + reach-the-exit; collectible items are optional pickups that add time. Monsters / health-loss / chests are deferred. |
| Maze generation | Fixed maps in JSON. Multiple difficulty sizes (small / medium / large) chosen by player. Small is the MVP; larger sizes are added incrementally. |
| Visual style | Low-poly / stylized, bright tones. A dark mode is a future increment (same architecture, swap lighting/fog). |
| Platform | Desktop only (MVP) |
| Win condition | Reach the exit before the countdown reaches 0. Pickups add time. |
| HUD layout | See section 6. |
| Audio | None in MVP. |
| Persistence | localStorage for best records + settings. |
| Tech stack | Vite + React 18 + Three.js (imperative) + Zustand + Vitest + Playwright. |

## 4. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Build | Vite | Fast HMR, modern ESM, zero config for React + TS |
| UI Framework | React 18 | User-specified |
| 3D Engine | Three.js (imperative API) | Direct control, simpler mental model than R3F wrapper, full performance headroom |
| State Management | Zustand | Lightweight (< 1KB), first-class TypeScript, trivial localStorage persistence, no Provider boilerplate |
| Language | TypeScript (strict) | Type safety for engine contracts, easier refactor of `MazeProvider` interface |
| Testing | Vitest + @testing-library/react + Playwright | Vitest for unit, RTL for component, Playwright for E2E (canvas games need real browser) |
| Styling | Plain CSS + CSS variables (theme) | No design system needed at this scale; CSS vars make dark mode (future) a one-line swap |

### Why not R3F
R3F is excellent for declarative 3D, but it adds a reconciler layer. For a single-canvas game with imperative camera + input + collision, plain Three.js gives a clearer mental model and lower indirection cost. The `MazeProvider` interface is shaped so that, if desired, R3F could be re-introduced later for the editor's 3D viewport without touching the game engine.

## 5. Architecture

### Layer Diagram

```
┌────────────────────────────────────────────────────────┐
│                    React UI Layer                       │
│  MainMenu · LevelSelect · Settings · PauseOverlay ·    │
│  GameOverOverlay · WinOverlay · HUD                    │
│         ↕ read / dispatch                              │
│         Zustand stores (gameStore, levelStore,         │
│         settingsStore)                                 │
└────────────────────────────────────────────────────────┘
            ↕
    localStorage (best records, settings)

┌────────────────────────────────────────────────────────┐
│            Game Engine (Vanilla TS)                     │
│  Game (lifecycle) · Scene · Renderer · Camera ·        │
│  InputManager · Loop · Collision                       │
│         ↕                                              │
│  GameState machine · Rules                             │
│         ↕                                              │
│  MazeProvider → JsonMazeProvider → Builder → Three     │
│  entities: Player · Wall · Floor · Exit · Pickup       │
└────────────────────────────────────────────────────────┘
```

### Key Boundaries

1. **React never holds Three.js objects directly.** All `Scene` / `Camera` / `Mesh` instances live inside the `engine/` module. React interacts through Zustand actions (`startLevel`, `pause`, `resume`, ...) and through a thin event bus for transient events (pickup collected, damage taken).
2. **Engine is a single `Game` singleton** with explicit lifecycle: `init()` → `startLevel(id)` → `dispose()`. React mounts/unmounts the Game via `useEffect`.
3. **`MazeProvider` is an interface.** The MVP ships only `JsonMazeProvider`; future `AlgorithmMazeProvider` and `EditorMazeProvider` plug in without engine changes.
4. **Engine never imports from `react` or `store/`.** Keeps the engine testable in isolation and re-usable.

## 6. Game Design

### Win Condition
- Player spawns at `start`; countdown begins at `rules.initialTime` seconds.
- Player must reach the cell marked `exit` before time hits 0.
- On reaching exit → state transitions to `win`. On time hitting 0 → state transitions to `game-over`.

### Pickups
- `type: "time"` — adds `timeOnPickup` seconds to the countdown (the only pickup type in MVP).
- `type: "health"` and `type: "key"` are reserved in the type union for future use.
- Picking up a pickup removes it from the scene and updates `pickupCount.collected`.

### Inventory Bar
- 2-slot inventory bar (per user spec). Slots are display-only in MVP — pickups auto-apply. The bar is wired so a future "press 1 / 2 to use item" mechanic can be added without UI rework.

### HUD (In-Game)
- **Top center:** Countdown timer (`mm:ss`, red when ≤ 10s)
- **Left side:** Control hints (WASD / Mouse / P / ESC) — vertical column
- **Bottom center:** 2-slot inventory bar
- **Bottom left:** Health bar (`maxHealth` hearts)

### HUD (Paused — P key)
- In-game HUD stays visible
- Centered overlay:
  - Resume button
  - Quit to menu button
  - "Collected: X / N" stat
  - "Best time: 0:48" stat (from localStorage)

### Game States (state machine)
```
menu ─startLevel→ playing
playing ─P→ paused ─P/Resume→ playing
playing ─time=0→ game-over
playing ─reachExit→ win
{paused, game-over, win} ─goToMenu→ menu
```

## 7. Data Model

### Level JSON

```jsonc
{
  "id": "level-small",
  "name": "小试身手",
  "size": { "width": 10, "depth": 10 },
  "cellSize": 2,
  "start": { "x": 0, "z": 0 },
  "exit":  { "x": 9, "z": 9 },
  "walls": [
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,0,1]
    // ... 10 rows
  ],
  "pickups": [
    { "x": 3, "z": 2, "type": "time", "value": 15 }
  ],
  "rules": {
    "initialTime": 60,
    "maxHealth": 3,
    "victory": "reach-exit",
    "timeOnPickup": 15
  }
}
```

### Shared Types (`src/maze/types.ts`)

```ts
export type CellType = 0 | 1;
export type PickupType = 'time' | 'health' | 'key';
export type VictoryType = 'reach-exit' | 'survive' | 'time-trial';

export interface MazeData {
  id: string;
  name: string;
  size: { width: number; depth: number };
  cellSize: number;
  start: { x: number; z: number };
  exit:  { x: number; z: number };
  walls: CellType[][];
  pickups: Pickup[];
  rules: LevelRules;
}

export interface Pickup {
  x: number; z: number;
  type: PickupType;
  value: number;
}

export interface LevelRules {
  initialTime: number;
  maxHealth: number;
  victory: VictoryType;
  timeOnPickup: number;
}
```

### Zustand Stores

- **`gameStore`** — runtime game state (screen, current level, time, health, pickup count, inventory). Actions: `startLevel`, `pause`, `resume`, `tick(dt)`, `pickup`, `damage`, `reachExit`, `goToMenu`. **Not** persisted; resets on reload.
- **`levelStore`** — best records keyed by `levelId`: `{ time, collected, date }`. Persisted to localStorage.
- **`settingsStore`** — settings: dark mode (future), pointer sensitivity, etc. Persisted to localStorage.

A `persist.ts` helper wraps Zustand's `persist` middleware with a try/catch fallback to in-memory mode if localStorage is unavailable.

## 8. Engine Design

### Module Responsibilities
- **`Game.ts`** — singleton orchestrator. Owns Scene, Camera, Renderer, InputManager, Loop. Exposes `init(canvas)`, `startLevel(levelId)`, `dispose()`.
- **`Scene.ts`** — builds Three.js scene graph from `MazeData` via `Builder`; manages disposal.
- **`Renderer.ts`** — WebGL renderer config (antialias, pixel ratio, tone mapping).
- **`Camera.ts`** — first-person camera; reads player position each frame.
- **`InputManager.ts`** — keyboard (WASD/arrows), mouse delta (PointerLock), `P` (pause), `ESC` (release pointer → pause). Handles visibility change → auto-pause.
- **`Loop.ts`** — `requestAnimationFrame` loop with `dt` clamped to 0.1s max.
- **`Collision.ts`** — AABB capsule vs. wall-cell test. Pure function, no engine deps, easy to unit test.

### Entity Model
Each entity has a logical interface (position, state) and a Three.js object reference. The `Builder` constructs Three meshes from `MazeData`; the engine references entities by id and updates them per frame.

### Pointer Lock Flow
1. User clicks the canvas → request pointer lock.
2. Granted → mouse delta drives camera yaw/pitch.
3. ESC pressed → pointer unlocked → state → `paused` (with explicit overlay).
4. Resume click → re-request pointer lock.

## 9. Error Handling

| Error | Handling |
|---|---|
| JSON parse failure / missing level | Main menu shows "关卡加载失败" + retry button. Typed `LevelLoadError`. |
| WebGL unavailable | Boot-time check; show "WebGL required, please update browser" message. |
| PointerLock denied | Show "点击画面进入" hint; engine continues without mouse-look (fallback to keyboard look). |
| localStorage write failure | Silent fallback to in-memory mode; console `warn`. |
| Player out of bounds | Defensive clamp; `console.error` with state snapshot. |
| Tab switched to background | `visibilitychange` → auto-pause. |

All engine errors extend a `GameError` base class with a `userMessage` and `kind` field for testing/UI handling.

## 10. Testing Strategy (>= 80% coverage)

### Unit (Vitest)
- `collision.test.ts` — AABB edge cases (corner clipping, diagonal walls, capsule radius)
- `rules.test.ts` — pickup->time, reachExit->win, time=0->game-over, state transitions
- `time.test.ts` — `mm:ss` formatting, countdown boundaries
- `mazeProvider.test.ts` — JSON validation, missing-field errors
- `engine/Scene.test.ts` — scene graph construction, dispose
- `store/persist.test.ts` — localStorage round-trip, fallback behavior

### Component (RTL)
- HUD components render correctly for each game state
- MainMenu, PauseOverlay, GameOverOverlay, WinOverlay

### E2E (Playwright)
- `play-through.spec.ts` — boot -> start small level -> walk to exit -> win
- `pause-resume.spec.ts` — P toggles pause; resume restores
- `persistence.spec.ts` — win -> reload -> best record visible
- `level-select.spec.ts` — only available levels are enabled

E2E uses a small, hand-crafted "test-only" level (`level-tiny.json`) for deterministic paths.

## 11. Project Structure

```
maze3D/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── public/
│   └── levels/
│       ├── level-small.json       # MVP
│       ├── level-medium.json      # increment
│       ├── level-large.json       # increment
│       └── level-tiny.json        # E2E only
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── ui/
│   │   ├── MainMenu.tsx
│   │   ├── LevelSelect.tsx
│   │   ├── Settings.tsx
│   │   ├── PauseOverlay.tsx
│   │   ├── GameOverOverlay.tsx
│   │   ├── WinOverlay.tsx
│   │   ├── HUD.tsx
│   │   └── components/
│   │       ├── Timer.tsx
│   │       ├── HealthBar.tsx
│   │       ├── InventoryBar.tsx
│   │       └── ControlHints.tsx
│   ├── store/
│   │   ├── gameStore.ts
│   │   ├── levelStore.ts
│   │   ├── settingsStore.ts
│   │   └── persist.ts
│   ├── engine/
│   │   ├── Game.ts
│   │   ├── Scene.ts
│   │   ├── Renderer.ts
│   │   ├── Camera.ts
│   │   ├── InputManager.ts
│   │   ├── Loop.ts
│   │   ├── Collision.ts
│   │   └── events.ts
│   ├── maze/
│   │   ├── types.ts
│   │   ├── MazeProvider.ts
│   │   ├── JsonMazeProvider.ts
│   │   └── Builder.ts
│   ├── entities/
│   │   ├── Player.ts
│   │   ├── Wall.ts
│   │   ├── Floor.ts
│   │   ├── Exit.ts
│   │   └── Pickup.ts
│   ├── game/
│   │   ├── GameState.ts
│   │   ├── Rules.ts
│   │   └── LevelConfig.ts
│   ├── utils/
│   │   ├── time.ts
│   │   ├── random.ts
│   │   └── events.ts
│   └── styles/
│       ├── reset.css
│       └── theme.css
└── tests/
    ├── unit/
    └── e2e/
```

## 12. Roadmap

>镜像副本：`docs/increments/_template/roadmap.md`。两边任一处修改需同步另一处。

### Phase 1 — MVP（✅ 已完成）
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

### Phase 2 — 增量路线图
|序 |名称 |优先级 | 前置依赖 |复杂度 |文档目录 |状态 |
|---|---|---|---|---|---|---|
| P2-2 | 深色模式 + 新 pickup 视觉 + UseItem 数字键 | P0 | — | Small | `docs/increments/dark-mode-pickups/` | pending |
| P2-3 | 算法关卡（4 算法 × 3 尺寸 × time-trial） | P1 | — | Large | `docs/increments/procedural-modes/` | pending |
| P2-4a | 巡逻敌人 + survive mode | P2 | P2-3 | Large | `docs/increments/enemies-editor/` | pending |
| P2-4b | 关卡编辑器 | P2 | — | Large | `docs/increments/enemies-editor/` | pending |

> **P2-1 已删除**：原计划"多关卡 JSON（中/大尺寸）"被 P2-3 算法生成取代。MVP 保留 `level-small.json` 作为"教学关"，`level-tiny.json` 留 E2E。
> **P2-4 拆分**：原"敌人 + 编辑器"X-Large 拆成 P2-4a（敌人+survive mode，依赖 P2-3）和 P2-4b（编辑器，独立）。

**优先级说明**：
- **P0** = 不依赖其他增量，立即可做
- **P1** = 独立，建议 P0 之后做
- **P2** = 有显式前置依赖

**复杂度说明**：Small ≤1 天；Medium 1–3 天；Large 3–7 天；X-Large >7 天

每个增量的两阶段产物为 `docs/increments/<slug>/{spec.md, plan.md}`，模板见 `docs/increments/_template/`。

> 注：本表仅列入已决定进入规划的增量。其他候选（音频、移动端/触摸、额外的 pickup 子类型）保留在候选池，待需求明确后再升级为 P2-N 行。

> 跨增量总任务清单见 `docs/increments/_template/roadmap.md` 的"总任务列表（执行视图）"章节。

## 13. Open Questions (none blocking)

- Exact pixel ratio / antialiasing tuning will be done during Phase 1 step 3.
- Pointer sensitivity default (0.002 rad/px) will be exposed in settings.
- Health default of 3 may be tuned per level size.

## 14. 完成定义 /验收标准模板（Definition of Done）

>镜像副本：`docs/increments/_template/dod.md`。两边任一处修改需同步另一处。

每个增量（Phase2 项）完成后，必须满足以下检查项。所有项以 ✅标记才能视为该增量完成。

**14.1 功能验收**
- [] 增量 spec 中"功能需求"列表全部实现
- [] 用户能从 UI触发该功能端到端走通（点击 →生效 →状态正确）
- [] 边界情况在 spec 或 plan 中显式列出并被覆盖

**14.2引擎 /架构边界**
- [] 引擎层（`src/engine/`、`src/maze/`、`src/entities/`、`src/game/`、`src/utils/`）**不**新增对 `react` / `store/` 的 import
- [] 任何对 `MazeProvider` 的新增实现必须实现完整接口（不靠 duck typing）
- [] 新增 Three.js资源在 `dispose()`路径中被释放

**14.3 测试**
- [] 单元测试覆盖率 ≥80%（`npm run test`）
- [] 新增的 Zustand action / Rule / Collision 分支必须有对应单测
- [] 涉及 UI 的改动必须有 RTL组件测试
- [] 涉及端到端流程的改动必须有 Playwright E2E（沿用 `level-tiny.json`模式）
- [] `npm run typecheck` 与 `npm run build` 通过

**14.4文档**
- [] `docs/increments/<slug>/spec.md`存在且包含"完成"勾选清单（拷贝自 §14.1–14.3）
- [] `docs/increments/<slug>/plan.md` 所有任务 checkbox 已勾
- [] README.md 的"Future increments"列表同步更新（已完成的增量移走或打勾）
- [] 新增的公共类型 / 常量 / 配置项在 spec §7 或对应章节反映

**14.5持久化与兼容**
- [] 不破坏现有 `localStorage` 的 best records / settings schema（必要时做迁移）
- [] 新增设置项使用 `settingsStore`，并在 settings UI 中可调
- [] 浏览器刷新后状态合理恢复

**14.6 安全与健壮性**
- [] 用户输入校验到位（关卡 JSON、关卡编辑器输入等）
- [] 错误处理走 `GameError`体系，有 `userMessage`
- [] 不引入 console.log / debugger残留
- [] 不硬编码密钥 /资源 URL（必要时走 env 或常量）

##15. References

- Three.js docs: `https://threejs.org/docs/`
- Zustand: `https://github.com/pmndrs/zustand`
- Pointer Lock API: MDN
