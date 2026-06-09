# 3D Maze (maze3d)

A web-based 3D first-person maze game built with Vite, React 18, and Three.js.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm test` | Vitest unit + component tests (with coverage) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright E2E (auto-starts dev server) |
| `npm run test:e2e:install` | Install Playwright browsers |
| `npm run typecheck` | `tsc -b --noEmit` |

## Controls

- **WASD / Arrow keys** — Move
- **Mouse** — Look around (click canvas to lock pointer)
- **P** — Pause / Resume
- **1 / 2** — Use inventory item in slot 1 / slot 2 (no-op if slot is empty)
- **ESC** — Release pointer

## Adding a new level

### Fixed (hand-crafted) levels

1. Drop a new JSON into `public/levels/level-X.json`. See `level-small.json` for schema.
2. Reload — the level appears under "固定关卡" in the selection screen.
3. For deterministic E2E paths, follow `level-tiny.json` patterns.

### Procedural levels (P2-3)

The level-select screen also exposes two procedural entries:

- **随机关卡** — three size cards (15×15 / 30×30 / 50×50). Each click
  generates a fresh maze with a 64-bit random seed and starts a
  180-second time-trial.
- **指定种子关卡** — type any 16-char lowercase-hex seed and click "开始"
  to reproduce a specific maze (defaults to 30×30 time-trial).

Both entries are wired through `AlgorithmMazeProvider`, which dispatches
to one of four maze algorithms (recursive backtracker, Kruskal, Prim,
hunt-and-kill). Seeds are self-contained — the encoding
`algo-v1-<algorithm>-<size>-<hex>` round-trips the entire maze identity
so a shared seed always reproduces the same maze.

## Architecture

- `src/engine/` — Vanilla TS Three.js engine. No React imports.
- `src/ui/` — React UI (menus, HUD, overlays).
- `src/store/` — Zustand stores: `gameStore` (runtime), `levelStore` (best records), `settingsStore` (persisted).
- `src/maze/` — `MazeProvider` interface, `JsonMazeProvider` (hand-crafted), and `AlgorithmMazeProvider` (procedural, P2-3). Future `EditorMazeProvider` plugs in here.
- `src/maze/generators/` — Pure-function maze generators (recursive-backtracker, Kruskal, Prim, hunt-and-kill).
- `src/utils/seed.ts` — FNV-1a hash + mulberry32 PRNG + seed encode/decode.
- `src/entities/` — Player and other game entities.
- `src/game/` — Game state machine and rules.

See `docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` for the full design.

## Future increments (Phase 2)

- Sound
- Mobile / touch support
- Survival mode with patrol enemies (P2-4a)
- In-browser level editor (P2-4b)
