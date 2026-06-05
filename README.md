# maze3D

A web-based 3D first-person maze game. Built with Vite + React 18 + Three.js.

## Overview

You spawn inside a maze with a countdown timer running. Find the exit before time runs out. Optional pickups scattered through the maze add time when collected. Best records and settings are stored locally in the browser.

The MVP delivers a complete, playable mini-game on desktop (mouse + keyboard). The architecture is shaped so a future in-browser level editor and additional game modes (time-trial, survival) can be added incrementally without rework.

## Tech Stack

- **Build:** Vite
- **UI:** React 18
- **3D:** Three.js (imperative API)
- **State:** Zustand (with `localStorage` persistence)
- **Language:** TypeScript (strict)
- **Tests:** Vitest + @testing-library/react + Playwright

## Getting Started

```bash
npm install
npm run dev
```

Open the printed local URL in a desktop browser.

## Available Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Produce a production build |
| `npm run preview` | Preview the production build |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run E2E tests (Playwright) |

## Project Status

**MVP — design approved, implementation pending.**

- [x] Product scope and visual style approved
- [x] Design spec and implementation plan written
- [ ] MVP implementation

See `docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` for the full design and `docs/superpowers/plans/2026-06-05-maze3d-first-person-game.md` for the implementation plan.

## Controls (planned)

- **WASD / Arrow keys** — move
- **Mouse** — look around
- **P** — pause / resume
- **Esc** — open menu
