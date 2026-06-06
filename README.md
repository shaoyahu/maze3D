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
- **ESC** — Release pointer

## Adding a new level

1. Drop a new JSON into `public/levels/level-X.json`. See `level-small.json` for schema.
2. Reload — the level appears in the selection screen.
3. For deterministic E2E paths, follow `level-tiny.json` patterns.

## Architecture

- `src/engine/` — Vanilla TS Three.js engine. No React imports.
- `src/ui/` — React UI (menus, HUD, overlays).
- `src/store/` — Zustand stores: `gameStore` (runtime), `levelStore` (best records), `settingsStore` (persisted).
- `src/maze/` — `MazeProvider` interface + `JsonMazeProvider` (MVP). Future `AlgorithmMazeProvider` and `EditorMazeProvider` plug in here.
- `src/entities/` — Player and other game entities.
- `src/game/` — Game state machine and rules.

See `docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` for the full design.

## Future increments (Phase 2)

- Medium / large level JSONs
- Dark mode toggle
- Pickup types beyond `time`
- Sound
- Mobile / touch support
- Procedural maze generation
- Survival / time-trial modes
- Patrol enemies
- In-browser level editor
