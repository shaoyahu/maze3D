# 3D First-Person Maze Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete playable 3D first-person maze mini-game in Vite + React 18 + Three.js, with fixed-maze JSON levels, a countdown win condition, and localStorage best records.

**Architecture:** Strict two-layer split — a vanilla-TS Three.js engine (`src/engine/`) that owns the WebGL scene, plus a React UI layer that reads/dispatches through Zustand stores. Engine never imports React or stores. `MazeProvider` interface lets the future level editor (Phase 2) plug in without engine changes.

**Tech Stack:** Vite, React 18, TypeScript (strict), Three.js, Zustand, Vitest, @testing-library/react, Playwright, happy-dom.

**Spec:** `docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md`

---

## File Structure

Files created across all tasks. Engine layer (`src/engine/`, `src/maze/`, `src/entities/`, `src/game/`, `src/utils/`) is pure TypeScript — no React imports. UI layer (`src/ui/`, `src/store/`) owns all React/Zustand code.

```
maze3D/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── .gitignore
├── README.md
├── public/
│   └── levels/
│       ├── level-small.json
│       └── level-tiny.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/{reset.css, theme.css}
│   ├── ui/
│   │   ├── MainMenu.tsx
│   │   ├── LevelSelect.tsx
│   │   ├── Settings.tsx
│   │   ├── PauseOverlay.tsx
│   │   ├── GameOverOverlay.tsx
│   │   ├── WinOverlay.tsx
│   │   ├── HUD.tsx
│   │   ├── GameCanvas.tsx
│   │   └── components/{Timer, HealthBar, InventoryBar, ControlHints, Button}.tsx
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
│   └── utils/
│       ├── time.ts
│       ├── random.ts
│       ├── events.ts
│       └── errors.ts
└── tests/
    ├── setup.ts
    ├── unit/
    │   ├── collision.test.ts
    │   ├── rules.test.ts
    │   ├── time.test.ts
    │   ├── mazeProvider.test.ts
    │   ├── scene.test.ts
    │   ├── inputManager.test.ts
    │   ├── gameStore.test.ts
    │   └── persist.test.ts
    ├── component/
    │   ├── hud.test.tsx
    │   └── overlays.test.tsx
    └── e2e/
        ├── play-through.spec.ts
        ├── pause-resume.spec.ts
        └── persistence.spec.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/reset.css`, `src/styles/theme.css`

- [ ] **Step 1.1: Create `.gitignore`**

```gitignore
node_modules/
dist/
.vite/
coverage/
.superpowers/
test-results/
playwright-report/
playwright/.cache/
*.log
.DS_Store
```

- [ ] **Step 1.2: Create `package.json`**

```json
{
  "name": "maze3d",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:install": "playwright install --with-deps chromium",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "^0.169.0",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@types/three": "^0.169.0",
    "@vitejs/plugin-react": "^4.3.2",
    "happy-dom": "^15.7.4",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 1.3: Create `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 1.4: Create `tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 1.5: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 1.6: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

- [ ] **Step 1.7: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'tests/component/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
```

- [ ] **Step 1.8: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 1.9: Create `index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>3D Maze</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 1.10: Create `src/styles/reset.css`**

```css
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { margin: 0; padding: 0; height: 100%; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--fg); }
button { font: inherit; cursor: pointer; }
```

- [ ] **Step 1.11: Create `src/styles/theme.css`**

```css
:root {
  --bg: #0e0e16;
  --fg: #f5f5f7;
  --accent: #ffb84d;
  --danger: #ff5252;
  --panel: rgba(20, 20, 28, 0.85);
  --border: rgba(255, 255, 255, 0.12);
}
```

- [ ] **Step 1.12: Create `src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/reset.css';
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 1.13: Create `src/App.tsx`**

```tsx
export function App() {
  return <div className="app">Maze 3D — bootstrapping…</div>;
}
```

- [ ] **Step 1.14: Install deps and run dev server to verify**

```bash
npm install
npm run dev
```

Expected: Vite reports `Local: http://localhost:5173/` and the page renders "Maze 3D — bootstrapping…".

- [ ] **Step 1.15: Initialize git and commit**

```bash
git init
git add .
git commit -m "chore: scaffold vite + react + ts project"
```

---

## Task 2: Time Utility (TDD)

**Files:**
- Create: `src/utils/time.ts`, `tests/setup.ts`, `tests/unit/time.test.ts`

- [ ] **Step 2.1: Create `tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2.2: Write failing test `tests/unit/time.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { formatTime, clampTime } from '../../src/utils/time';

describe('formatTime', () => {
  it('formats whole minutes and seconds as mm:ss', () => {
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(125)).toBe('02:05');
    expect(formatTime(0)).toBe('00:00');
  });
  it('rounds down to nearest second', () => {
    expect(formatTime(59.9)).toBe('00:59');
  });
  it('clamps negative values to 0', () => {
    expect(formatTime(-10)).toBe('00:00');
  });
  it('handles values > 99 minutes without truncation', () => {
    expect(formatTime(60 * 60)).toBe('60:00');
  });
});

describe('clampTime', () => {
  it('clamps below 0', () => {
    expect(clampTime(-5, 60)).toBe(0);
  });
  it('clamps above max', () => {
    expect(clampTime(120, 60)).toBe(60);
  });
  it('passes through valid values', () => {
    expect(clampTime(30, 60)).toBe(30);
  });
});
```

- [ ] **Step 2.3: Run test, expect FAIL**

```bash
npm test -- time.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2.4: Implement `src/utils/time.ts`**

```ts
export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function clampTime(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}
```

- [ ] **Step 2.5: Run test, expect PASS**

```bash
npm test -- time.test.ts
```

- [ ] **Step 2.6: Commit**

```bash
git add src/utils/time.ts tests/unit/time.test.ts tests/setup.ts
git commit -m "feat(utils): add formatTime and clampTime"
```

---

## Task 3: Maze Types and JSON Validation (TDD)

**Files:**
- Create: `src/maze/types.ts`, `src/maze/JsonMazeProvider.ts`, `src/utils/errors.ts`, `tests/unit/mazeProvider.test.ts`

- [ ] **Step 3.1: Write failing test `tests/unit/mazeProvider.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { JsonMazeProvider } from '../../src/maze/JsonMazeProvider';
import { LevelLoadError } from '../../src/utils/errors';

const validMaze = {
  id: 'm1',
  name: 'Test',
  size: { width: 3, depth: 3 },
  cellSize: 2,
  start: { x: 0, z: 0 },
  exit: { x: 2, z: 2 },
  walls: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  pickups: [],
  rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
};

describe('JsonMazeProvider', () => {
  it('parses a valid maze object', async () => {
    const provider = new JsonMazeProvider({ 'm1': validMaze });
    const maze = await provider.load('m1');
    expect(maze.id).toBe('m1');
    expect(maze.size).toEqual({ width: 3, depth: 3 });
  });

  it('throws LevelLoadError on missing id', async () => {
    const provider = new JsonMazeProvider({ 'm1': validMaze });
    await expect(provider.load('nope')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError on missing required field', async () => {
    const bad = { ...validMaze, start: undefined } as any;
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when walls row length does not match width', async () => {
    const bad = { ...validMaze, walls: [[1, 1], [1, 1, 1], [1, 1]] };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when walls is not an array of arrays of 0/1', async () => {
    const bad = { ...validMaze, walls: [[2, 0], [1, 1], [1, 1]] };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when start or exit is on a wall cell', async () => {
    const bad = { ...validMaze, start: { x: 0, z: 0 } };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError on invalid victory type', async () => {
    const bad = { ...validMaze, rules: { ...validMaze.rules, victory: 'invalid' } };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });
});
```

- [ ] **Step 3.2: Create `src/utils/errors.ts`**

```ts
export class GameError extends Error {
  constructor(public kind: string, message: string, public userMessage: string) {
    super(message);
    this.name = 'GameError';
  }
}

export class LevelLoadError extends GameError {
  constructor(message: string, public detail?: unknown) {
    super('LevelLoad', message, '关卡加载失败，请检查关卡文件');
    this.name = 'LevelLoadError';
  }
}
```

- [ ] **Step 3.3: Run test, expect FAIL**

```bash
npm test -- mazeProvider.test.ts
```

- [ ] **Step 3.4: Create `src/maze/types.ts`**

```ts
export type CellType = 0 | 1;
export type PickupType = 'time' | 'health' | 'key';
export type VictoryType = 'reach-exit' | 'survive' | 'time-trial';

export interface Pickup {
  x: number;
  z: number;
  type: PickupType;
  value: number;
}

export interface LevelRules {
  initialTime: number;
  maxHealth: number;
  victory: VictoryType;
  timeOnPickup: number;
}

export interface MazeData {
  id: string;
  name: string;
  size: { width: number; depth: number };
  cellSize: number;
  start: { x: number; z: number };
  exit: { x: number; z: number };
  walls: CellType[][];
  pickups: Pickup[];
  rules: LevelRules;
}

export interface MazeProvider {
  load(id: string): Promise<MazeData>;
  list(): Promise<string[]>;
}
```

- [ ] **Step 3.5: Implement `src/maze/JsonMazeProvider.ts`**

```ts
import { LevelLoadError } from '../utils/errors';
import type { MazeData, MazeProvider, CellType, PickupType, VictoryType } from './types';

const VALID_PICKUP_TYPES: PickupType[] = ['time', 'health', 'key'];
const VALID_VICTORY: VictoryType[] = ['reach-exit', 'survive', 'time-trial'];

export class JsonMazeProvider implements MazeProvider {
  constructor(private data: Record<string, unknown>) {}

  async list(): Promise<string[]> {
    return Object.keys(this.data);
  }

  async load(id: string): Promise<MazeData> {
    const raw = this.data[id];
    if (!raw) throw new LevelLoadError(`Maze '${id}' not found`);
    return validateMaze(raw, id);
  }
}

function validateMaze(raw: unknown, id: string): MazeData {
  if (typeof raw !== 'object' || raw === null) {
    throw new LevelLoadError(`Maze '${id}' is not an object`);
  }
  const m = raw as Record<string, unknown>;

  requireString(m, 'id', id);
  requireString(m, 'name', id);
  requireObject(m, 'size', id);
  const size = m.size as Record<string, unknown>;
  requireNumber(size, 'width', `${id}.size`);
  requireNumber(size, 'depth', `${id}.size`);
  requireNumber(m, 'cellSize', id);

  requireObject(m, 'start', id);
  const start = m.start as Record<string, unknown>;
  requireNumber(start, 'x', `${id}.start`);
  requireNumber(start, 'z', `${id}.start`);

  requireObject(m, 'exit', id);
  const exit = m.exit as Record<string, unknown>;
  requireNumber(exit, 'x', `${id}.exit`);
  requireNumber(exit, 'z', `${id}.exit`);

  if (!Array.isArray(m.walls)) throw new LevelLoadError(`Maze '${id}': walls must be array`);
  const width = size.width as number;
  const depth = size.depth as number;
  if (m.walls.length !== depth) {
    throw new LevelLoadError(`Maze '${id}': walls row count (${m.walls.length}) does not match depth (${depth})`);
  }
  const walls: CellType[][] = [];
  for (let z = 0; z < depth; z++) {
    const row = m.walls[z];
    if (!Array.isArray(row) || row.length !== width) {
      throw new LevelLoadError(`Maze '${id}': walls[${z}] length does not match width (${width})`);
    }
    const cells: CellType[] = [];
    for (let x = 0; x < width; x++) {
      const v = row[x];
      if (v !== 0 && v !== 1) {
        throw new LevelLoadError(`Maze '${id}': walls[${z}][${x}] must be 0 or 1 (got ${v})`);
      }
      cells.push(v as CellType);
    }
    walls.push(cells);
  }

  if (walls[start.z as number][start.x as number] === 1) {
    throw new LevelLoadError(`Maze '${id}': start is on a wall`);
  }
  if (walls[exit.z as number][exit.x as number] === 1) {
    throw new LevelLoadError(`Maze '${id}': exit is on a wall`);
  }

  const pickups = Array.isArray(m.pickups) ? m.pickups : [];
  for (const p of pickups) {
    if (typeof p !== 'object' || p === null) {
      throw new LevelLoadError(`Maze '${id}': invalid pickup`);
    }
    const pp = p as Record<string, unknown>;
    if (typeof pp.x !== 'number' || typeof pp.z !== 'number') {
      throw new LevelLoadError(`Maze '${id}': pickup missing x/z`);
    }
    if (!VALID_PICKUP_TYPES.includes(pp.type as PickupType)) {
      throw new LevelLoadError(`Maze '${id}': invalid pickup type`);
    }
    if (walls[pp.z as number][pp.x as number] === 1) {
      throw new LevelLoadError(`Maze '${id}': pickup is on a wall`);
    }
  }

  requireObject(m, 'rules', id);
  const r = m.rules as Record<string, unknown>;
  requireNumber(r, 'initialTime', `${id}.rules`);
  requireNumber(r, 'maxHealth', `${id}.rules`);
  requireNumber(r, 'timeOnPickup', `${id}.rules`);
  if (!VALID_VICTORY.includes(r.victory as VictoryType)) {
    throw new LevelLoadError(`Maze '${id}': invalid victory type`);
  }

  return m as unknown as MazeData;
}

function requireString(o: Record<string, unknown>, key: string, ctx: string) {
  if (typeof o[key] !== 'string') throw new LevelLoadError(`Maze '${ctx}': missing string '${key}'`);
}
function requireNumber(o: Record<string, unknown>, key: string, ctx: string) {
  if (typeof o[key] !== 'number') throw new LevelLoadError(`Maze '${ctx}': missing number '${key}'`);
}
function requireObject(o: Record<string, unknown>, key: string, ctx: string) {
  if (typeof o[key] !== 'object' || o[key] === null) {
    throw new LevelLoadError(`Maze '${ctx}': missing object '${key}'`);
  }
}
```

- [ ] **Step 3.6: Run test, expect PASS**

```bash
npm test -- mazeProvider.test.ts
```

- [ ] **Step 3.7: Commit**

```bash
git add src/maze src/utils/errors.ts tests/unit/mazeProvider.test.ts
git commit -m "feat(maze): add JsonMazeProvider with validation"
```

---

## Task 4: Author Level JSONs

**Files:**
- Create: `public/levels/level-small.json`, `public/levels/level-tiny.json`

These are static assets; the provider in Task 3 validates them.

- [ ] **Step 4.1: Create `public/levels/level-small.json`**

```json
{
  "id": "level-small",
  "name": "小试身手",
  "size": { "width": 10, "depth": 10 },
  "cellSize": 2,
  "start": { "x": 0, "z": 0 },
  "exit": { "x": 9, "z": 9 },
  "walls": [
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,0,1],
    [1,0,1,0,1,0,1,1,0,1],
    [1,0,1,0,0,0,0,1,0,1],
    [1,0,1,1,1,1,0,1,0,1],
    [1,0,0,0,0,1,0,0,0,1],
    [1,1,1,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,1,1,1,1,0,1],
    [1,1,1,1,1,1,1,1,1,1]
  ],
  "pickups": [
    { "x": 3, "z": 1, "type": "time", "value": 15 },
    { "x": 6, "z": 5, "type": "time", "value": 15 }
  ],
  "rules": {
    "initialTime": 60,
    "maxHealth": 3,
    "victory": "reach-exit",
    "timeOnPickup": 15
  }
}
```

- [ ] **Step 4.2: Create `public/levels/level-tiny.json`**

A 3x3 maze with a straight corridor — guaranteed solvable for E2E.

```json
{
  "id": "level-tiny",
  "name": "Test Corridor",
  "size": { "width": 3, "depth": 3 },
  "cellSize": 2,
  "start": { "x": 0, "z": 1 },
  "exit": { "x": 2, "z": 1 },
  "walls": [
    [1,1,1],
    [1,0,0],
    [1,1,1]
  ],
  "pickups": [],
  "rules": {
    "initialTime": 30,
    "maxHealth": 3,
    "victory": "reach-exit",
    "timeOnPickup": 15
  }
}
```

- [ ] **Step 4.3: Verify both files parse**

Create temporary `scripts/validate-levels.ts`:

```ts
import { JsonMazeProvider } from '../src/maze/JsonMazeProvider';
import * as fs from 'fs';

const data = {
  'level-small': JSON.parse(fs.readFileSync('public/levels/level-small.json', 'utf8')),
  'level-tiny': JSON.parse(fs.readFileSync('public/levels/level-tiny.json', 'utf8')),
};
const p = new JsonMazeProvider(data);
(async () => {
  console.log(await p.load('level-small'));
  console.log(await p.load('level-tiny'));
})();
```

Run with `npx tsx scripts/validate-levels.ts` (install `tsx` as dev dep if not present: `npm i -D tsx`). Expected: both load without throwing. Then delete `scripts/validate-levels.ts`.

- [ ] **Step 4.4: Commit**

```bash
git add public/levels/
git commit -m "feat(levels): add level-small and level-tiny"
```

---

## Task 5: Collision (TDD)

**Files:**
- Create: `src/engine/Collision.ts`, `tests/unit/collision.test.ts`

- [ ] **Step 5.1: Write failing test `tests/unit/collision.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { resolveMove, type WallGrid } from '../../src/engine/Collision';

const grid: WallGrid = (() => {
  const w = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  return { width: 5, depth: 5, cellSize: 2, get: (x, z) => w[z][x] };
})();

describe('resolveMove', () => {
  it('allows free movement inside corridor', () => {
    const p = { x: 2, z: 2, r: 0.3 };
    const next = resolveMove(p, { dx: 0.5, dz: 0 }, grid);
    expect(next.x).toBeCloseTo(2.5);
    expect(next.z).toBeCloseTo(2);
  });

  it('blocks movement into a wall on +x', () => {
    const p = { x: 3.6, z: 2, r: 0.3 };
    const next = resolveMove(p, { dx: 1, dz: 0 }, grid);
    expect(next.x).toBeLessThanOrEqual(3.7);
  });

  it('blocks movement into a wall on -x', () => {
    const p = { x: 0.4, z: 2, r: 0.3 };
    const next = resolveMove(p, { dx: -1, dz: 0 }, grid);
    expect(next.x).toBeGreaterThanOrEqual(0.3);
  });

  it('blocks movement into a wall on +z', () => {
    const p = { x: 2, z: 3.6, r: 0.3 };
    const next = resolveMove(p, { dx: 0, dz: 1 }, grid);
    expect(next.z).toBeLessThanOrEqual(3.7);
  });

  it('blocks movement into a wall on -z', () => {
    const p = { x: 2, z: 0.4, r: 0.3 };
    const next = resolveMove(p, { dx: 0, dz: -1 }, grid);
    expect(next.z).toBeGreaterThanOrEqual(0.3);
  });

  it('slides along a wall (diagonal into corner is clamped)', () => {
    const p = { x: 3.6, z: 3.6, r: 0.3 };
    const next = resolveMove(p, { dx: 1, dz: 1 }, grid);
    expect(next.x).toBeLessThanOrEqual(3.7);
    expect(next.z).toBeLessThanOrEqual(3.7);
  });

  it('zero-delta returns same position', () => {
    const p = { x: 2, z: 2, r: 0.3 };
    const next = resolveMove(p, { dx: 0, dz: 0 }, grid);
    expect(next.x).toBeCloseTo(2);
    expect(next.z).toBeCloseTo(2);
  });
});
```

- [ ] **Step 5.2: Run test, expect FAIL**

```bash
npm test -- collision.test.ts
```

- [ ] **Step 5.3: Implement `src/engine/Collision.ts`**

Axis-separated AABB resolution. Player is a circle of radius `r`; wall cells are AABB rectangles.

```ts
export interface WallGrid {
  width: number;
  depth: number;
  cellSize: number;
  get(x: number, z: number): 0 | 1;
}

export interface PlayerPos { x: number; z: number; r: number; }
export interface Delta { dx: number; dz: number; }

export function resolveMove(p: PlayerPos, d: Delta, grid: WallGrid): { x: number; z: number } {
  let { x, z, r } = p;
  // Resolve X
  const newX = x + d.dx;
  if (!collidesAt(newX, z, r, grid)) x = newX;
  // Resolve Z
  const newZ = z + d.dz;
  if (!collidesAt(x, newZ, r, grid)) z = newZ;
  return { x, z };
}

function collidesAt(px: number, pz: number, r: number, grid: WallGrid): boolean {
  const cs = grid.cellSize;
  const minCellX = Math.floor((px - r) / cs);
  const maxCellX = Math.floor((px + r) / cs);
  const minCellZ = Math.floor((pz - r) / cs);
  const maxCellZ = Math.floor((pz + r) / cs);
  for (let cz = minCellZ; cz <= maxCellZ; cz++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      if (cx < 0 || cz < 0 || cx >= grid.width || cz >= grid.depth) return true;
      if (grid.get(cx, cz) === 1) {
        const cellMinX = cx * cs;
        const cellMaxX = cellMinX + cs;
        const cellMinZ = cz * cs;
        const cellMaxZ = cellMinZ + cs;
        const closestX = Math.max(cellMinX, Math.min(px, cellMaxX));
        const closestZ = Math.max(cellMinZ, Math.min(pz, cellMaxZ));
        const dx = px - closestX;
        const dz = pz - closestZ;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
  }
  return false;
}
```

- [ ] **Step 5.4: Run test, expect PASS**

```bash
npm test -- collision.test.ts
```

- [ ] **Step 5.5: Commit**

```bash
git add src/engine/Collision.ts tests/unit/collision.test.ts
git commit -m "feat(engine): add AABB collision resolver"
```

---

## Task 6: GameStore (Zustand) with TDD

**Files:**
- Create: `src/store/gameStore.ts`, `tests/unit/gameStore.test.ts`

- [ ] **Step 6.1: Write failing test `tests/unit/gameStore.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';

const initialMaze = {
  id: 'm1', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 2, z: 2 },
  walls: [[1,1,1],[1,0,1],[1,1,1]],
  pickups: [],
  rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit' as const, timeOnPickup: 15 },
};

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().goToMenu();
  });

  it('starts at the menu screen', () => {
    expect(useGameStore.getState().screen).toBe('menu');
  });

  it('startLevel transitions to playing and seeds state', () => {
    useGameStore.getState().startLevel(initialMaze);
    const s = useGameStore.getState();
    expect(s.screen).toBe('playing');
    expect(s.currentLevelId).toBe('m1');
    expect(s.timeRemaining).toBe(60);
    expect(s.health).toBe(3);
    expect(s.pickupCount).toEqual({ collected: 0, total: 0 });
  });

  it('tick decrements time', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().tick(1);
    expect(useGameStore.getState().timeRemaining).toBeCloseTo(59);
  });

  it('tick transitions to game-over at zero', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().tick(60);
    expect(useGameStore.getState().screen).toBe('game-over');
  });

  it('pause/resume transitions are correct', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().pause();
    expect(useGameStore.getState().screen).toBe('paused');
    useGameStore.getState().resume();
    expect(useGameStore.getState().screen).toBe('playing');
  });

  it('pickup adds time and increments collected count', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.setState({ timeRemaining: 30 });
    useGameStore.getState().pickup({ x: 1, z: 1, type: 'time', value: 15 });
    const s = useGameStore.getState();
    expect(s.timeRemaining).toBe(45);
    expect(s.pickupCount.collected).toBe(1);
  });

  it('damage decrements health and triggers game-over at 0', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().damage(1);
    expect(useGameStore.getState().health).toBe(2);
    useGameStore.getState().damage(2);
    expect(useGameStore.getState().screen).toBe('game-over');
  });

  it('reachExit transitions to win', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().reachExit();
    expect(useGameStore.getState().screen).toBe('win');
  });

  it('goToMenu returns to menu from any screen', () => {
    useGameStore.getState().startLevel(initialMaze);
    useGameStore.getState().reachExit();
    useGameStore.getState().goToMenu();
    expect(useGameStore.getState().screen).toBe('menu');
  });
});
```

- [ ] **Step 6.2: Run test, expect FAIL**

```bash
npm test -- gameStore.test.ts
```

- [ ] **Step 6.3: Implement `src/store/gameStore.ts`**

```ts
import { create } from 'zustand';
import type { MazeData, Pickup } from '../maze/types';

export type Screen = 'menu' | 'playing' | 'paused' | 'game-over' | 'win';

export interface GameState {
  screen: Screen;
  currentLevelId: string | null;
  currentMaze: MazeData | null;
  timeRemaining: number;
  health: number;
  pickupCount: { collected: number; total: number };
  inventory: (Pickup | null)[];

  startLevel: (maze: MazeData) => void;
  pause: () => void;
  resume: () => void;
  tick: (dt: number) => void;
  pickup: (p: Pickup) => void;
  damage: (n: number) => void;
  reachExit: () => void;
  goToMenu: () => void;
}

const INVENTORY_SIZE = 2;

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'menu',
  currentLevelId: null,
  currentMaze: null,
  timeRemaining: 0,
  health: 0,
  pickupCount: { collected: 0, total: 0 },
  inventory: [null, null],

  startLevel: (maze) =>
    set({
      screen: 'playing',
      currentLevelId: maze.id,
      currentMaze: maze,
      timeRemaining: maze.rules.initialTime,
      health: maze.rules.maxHealth,
      pickupCount: { collected: 0, total: maze.pickups.length },
      inventory: Array(INVENTORY_SIZE).fill(null),
    }),

  pause: () => {
    if (get().screen === 'playing') set({ screen: 'paused' });
  },
  resume: () => {
    if (get().screen === 'paused') set({ screen: 'playing' });
  },

  tick: (dt) => {
    const s = get();
    if (s.screen !== 'playing') return;
    const next = s.timeRemaining - dt;
    if (next <= 0) set({ timeRemaining: 0, screen: 'game-over' });
    else set({ timeRemaining: next });
  },

  pickup: (p) => {
    const s = get();
    if (s.screen !== 'playing') return;
    const inv = [...s.inventory];
    if (p.type === 'time') {
      set({
        timeRemaining: s.timeRemaining + (s.currentMaze?.rules.timeOnPickup ?? p.value),
        pickupCount: { ...s.pickupCount, collected: s.pickupCount.collected + 1 },
      });
    } else {
      const idx = inv.findIndex((slot) => slot === null);
      if (idx >= 0) inv[idx] = p;
      set({
        inventory: inv,
        pickupCount: { ...s.pickupCount, collected: s.pickupCount.collected + 1 },
      });
    }
  },

  damage: (n) => {
    const s = get();
    if (s.screen !== 'playing') return;
    const next = s.health - n;
    if (next <= 0) set({ health: 0, screen: 'game-over' });
    else set({ health: next });
  },

  reachExit: () => {
    if (get().screen === 'playing') set({ screen: 'win' });
  },

  goToMenu: () => set({ screen: 'menu', currentLevelId: null, currentMaze: null }),
}));
```

- [ ] **Step 6.4: Run test, expect PASS**

```bash
npm test -- gameStore.test.ts
```

- [ ] **Step 6.5: Commit**

```bash
git add src/store/gameStore.ts tests/unit/gameStore.test.ts
git commit -m "feat(store): add gameStore with screen state machine"
```

---

## Task 7: Persistence Stores (levelStore + settingsStore) with TDD

**Files:**
- Create: `src/store/persist.ts`, `src/store/levelStore.ts`, `src/store/settingsStore.ts`, `tests/unit/persist.test.ts`

- [ ] **Step 7.1: Write failing test `tests/unit/persist.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadJSON, saveJSON, isStorageAvailable } from '../../src/store/persist';

describe('persist', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isStorageAvailable returns true in happy-dom', () => {
    expect(isStorageAvailable()).toBe(true);
  });

  it('saveJSON then loadJSON round-trips an object', () => {
    saveJSON('k', { a: 1, b: 'x' });
    expect(loadJSON('k')).toEqual({ a: 1, b: 'x' });
  });

  it('loadJSON returns fallback when key missing', () => {
    expect(loadJSON('nope', { a: 0 })).toEqual({ a: 0 });
  });

  it('loadJSON returns fallback on parse error', () => {
    localStorage.setItem('bad', '{not json');
    expect(loadJSON('bad', { fallback: true })).toEqual({ fallback: true });
  });

  it('saveJSON silently no-ops when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveJSON('k', { a: 1 })).not.toThrow();
    spy.mockRestore();
  });
});
```

- [ ] **Step 7.2: Run test, expect FAIL**

```bash
npm test -- persist.test.ts
```

- [ ] **Step 7.3: Implement `src/store/persist.ts`**

```ts
export function isStorageAvailable(): boolean {
  try {
    const k = '__test__';
    localStorage.setItem(k, k);
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('persist: failed to save', key, e);
  }
}
```

- [ ] **Step 7.4: Run test, expect PASS**

```bash
npm test -- persist.test.ts
```

- [ ] **Step 7.5: Implement `src/store/levelStore.ts`**

```ts
import { create } from 'zustand';
import { loadJSON, saveJSON } from './persist';

export interface BestRecord {
  levelId: string;
  timeUsed: number;
  collected: number;
  total: number;
  date: string; // ISO
}

interface LevelStore {
  bestByLevel: Record<string, BestRecord>;
  record: (r: BestRecord) => void;
  getBest: (levelId: string) => BestRecord | undefined;
}

const STORAGE_KEY = 'maze3d.levels.v1';

export const useLevelStore = create<LevelStore>((set, get) => ({
  bestByLevel: loadJSON<Record<string, BestRecord>>(STORAGE_KEY, {}),
  record: (r) => {
    const cur = get().bestByLevel[r.levelId];
    const isBetter =
      !cur ||
      r.timeUsed < cur.timeUsed ||
      (r.timeUsed === cur.timeUsed && r.collected > cur.collected);
    if (!isBetter) return;
    const next = { ...get().bestByLevel, [r.levelId]: r };
    saveJSON(STORAGE_KEY, next);
    set({ bestByLevel: next });
  },
  getBest: (levelId) => get().bestByLevel[levelId],
}));
```

- [ ] **Step 7.6: Implement `src/store/settingsStore.ts`**

```ts
import { create } from 'zustand';
import { loadJSON, saveJSON } from './persist';

export interface Settings {
  pointerSensitivity: number; // rad/px
  darkMode: boolean;
}

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}

const DEFAULTS: Settings = { pointerSensitivity: 0.002, darkMode: false };
const STORAGE_KEY = 'maze3d.settings.v1';

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...loadJSON<Settings>(STORAGE_KEY, DEFAULTS),
  set: (k, v) => {
    const next = { ...get(), [k]: v } as Settings;
    saveJSON(STORAGE_KEY, next);
    set(next as Partial<SettingsStore>);
  },
}));
```

- [ ] **Step 7.7: Commit**

```bash
git add src/store tests/unit/persist.test.ts
git commit -m "feat(store): add persistence + level/settings stores"
```

---

## Task 8: Engine — Renderer, Camera, Scene (TDD on Scene)

**Files:**
- Create: `src/engine/Renderer.ts`, `src/engine/Camera.ts`, `src/engine/Scene.ts`, `tests/unit/scene.test.ts`

- [ ] **Step 8.1: Write failing test `tests/unit/scene.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildScene, disposeScene } from '../../src/engine/Scene';

const maze = {
  id: 'm1', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 1 }, exit: { x: 2, z: 1 },
  walls: [[1,1,1],[1,0,0],[1,1,1]],
  pickups: [{ x: 1, z: 1, type: 'time' as const, value: 15 }],
  rules: { initialTime: 30, maxHealth: 3, victory: 'reach-exit' as const, timeOnPickup: 15 },
};

describe('buildScene', () => {
  it('returns a Three.js Scene with a floor, walls, exit, and pickup', () => {
    const { scene, walls, exit, pickups } = buildScene(maze);
    expect(scene).toBeTruthy();
    // 9 cells - 2 empty (start and exit corridor) = 7 walls
    expect(walls.length).toBe(7);
    expect(exit).toBeTruthy();
    expect(pickups.length).toBe(1);
  });

  it('disposeScene releases geometry/material without throwing', () => {
    const { scene, walls, exit, pickups } = buildScene(maze);
    expect(() => disposeScene(scene, walls, exit, pickups)).not.toThrow();
  });
});
```

- [ ] **Step 8.2: Run test, expect FAIL**

```bash
npm test -- scene.test.ts
```

- [ ] **Step 8.3: Implement `src/engine/Renderer.ts`**

```ts
import * as THREE from 'three';

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.setSize(window.innerWidth, window.innerHeight, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  return r;
}
```

- [ ] **Step 8.4: Implement `src/engine/Camera.ts`**

```ts
import * as THREE from 'three';

export function createCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  cam.position.set(0, 1.6, 0);
  return cam;
}
```

- [ ] **Step 8.5: Implement `src/engine/Scene.ts`**

```ts
import * as THREE from 'three';
import type { MazeData } from '../maze/types';

export interface SceneRefs {
  scene: THREE.Scene;
  walls: THREE.Mesh[];
  exit: THREE.Mesh;
  pickups: THREE.Mesh[];
}

export function buildScene(maze: MazeData): SceneRefs {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2a);

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 10, 5);
  scene.add(dir);

  const floorMat = new THREE.MeshLambertMaterial({ color: 0x6e6e80 });
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xb2a06b });
  const exitMat = new THREE.MeshLambertMaterial({ color: 0x5cff5c, emissive: 0x115511 });
  const pickupMat = new THREE.MeshLambertMaterial({ color: 0xffb84d, emissive: 0x553300 });

  const cs = maze.cellSize;
  const w = maze.size.width;
  const d = maze.size.depth;

  const floorGeom = new THREE.PlaneGeometry(w * cs, d * cs);
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((w * cs) / 2 - cs / 2, 0, (d * cs) / 2 - cs / 2);
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(w * cs, d * cs),
    new THREE.MeshLambertMaterial({ color: 0x2a2a3a }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((w * cs) / 2 - cs / 2, 2.4, (d * cs) / 2 - cs / 2);
  scene.add(ceiling);

  const walls: THREE.Mesh[] = [];
  const wallGeom = new THREE.BoxGeometry(cs, 2.4, cs);
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      if (maze.walls[z][x] === 1) {
        const m = new THREE.Mesh(wallGeom, wallMat);
        m.position.set(x * cs, 1.2, z * cs);
        scene.add(m);
        walls.push(m);
      }
    }
  }

  const exitGeom = new THREE.BoxGeometry(cs * 0.6, 0.1, cs * 0.6);
  const exit = new THREE.Mesh(exitGeom, exitMat);
  exit.position.set(maze.exit.x * cs, 0.05, maze.exit.z * cs);
  scene.add(exit);

  const pickups: THREE.Mesh[] = [];
  const pickupGeom = new THREE.OctahedronGeometry(0.3);
  for (const p of maze.pickups) {
    const m = new THREE.Mesh(pickupGeom, pickupMat);
    m.position.set(p.x * cs, 0.6, p.z * cs);
    m.userData = { pickup: p };
    scene.add(m);
    pickups.push(m);
  }

  return { scene, walls, exit, pickups };
}

export function disposeScene(scene: THREE.Scene, walls: THREE.Mesh[], exit: THREE.Mesh, pickups: THREE.Mesh[]) {
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
  });
  walls.length = 0;
  pickups.length = 0;
  void exit;
}
```

- [ ] **Step 8.6: Run test, expect PASS**

```bash
npm test -- scene.test.ts
```

- [ ] **Step 8.7: Commit**

```bash
git add src/engine tests/unit/scene.test.ts
git commit -m "feat(engine): add Renderer, Camera, Scene builder"
```

---

## Task 9: Input Manager (TDD)

**Files:**
- Create: `src/engine/InputManager.ts`, `tests/unit/inputManager.test.ts`

- [ ] **Step 9.1: Write failing test `tests/unit/inputManager.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InputManager } from '../../src/engine/InputManager';

describe('InputManager', () => {
  let im: InputManager;
  beforeEach(() => {
    im = new InputManager();
  });

  it('reports no movement initially', () => {
    expect(im.getMove()).toEqual({ x: 0, z: 0 });
  });

  it('W key sets forward movement', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(im.getMove().z).toBeLessThan(0);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(im.getMove().z).toBe(0);
  });

  it('ArrowDown sets backward movement', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
    expect(im.getMove().z).toBeGreaterThan(0);
  });

  it('A and D pressed together cancel out', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    expect(im.getMove().x).toBeCloseTo(0);
  });

  it('P key fires togglePause listener', () => {
    const fn = vi.fn();
    im.onTogglePause(fn);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('pointer move accumulates delta and consumeMouseDelta resets it', () => {
    Object.defineProperty(document, 'pointerLockElement', { value: document.body, configurable: true });
    const im2 = new InputManager();
    im2.onMouseMove({ movementX: 10, movementY: 5 } as MouseEvent);
    const yaw = im2.consumeMouseDelta();
    expect(yaw.x).toBeCloseTo(10 * 0.002);
    expect(yaw.y).toBeCloseTo(5 * 0.002);
    expect(im2.consumeMouseDelta()).toEqual({ x: 0, y: 0 });
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
  });
});
```

- [ ] **Step 9.2: Run test, expect FAIL**

```bash
npm test -- inputManager.test.ts
```

- [ ] **Step 9.3: Implement `src/engine/InputManager.ts`**

```ts
export interface Move { x: number; z: number; }
export interface MouseDelta { x: number; y: number; }

export class InputManager {
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0 };
  private togglePauseListener: (() => void) | null = null;

  constructor(private sensitivity = 0.002) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }

  onTogglePause(fn: () => void) { this.togglePauseListener = fn; }

  getMove(): Move {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    return { x, z };
  }

  consumeMouseDelta(): MouseDelta {
    const d = { x: this.mouse.x, y: this.mouse.y };
    this.mouse.x = 0;
    this.mouse.y = 0;
    return d;
  }

  // Exposed for tests
  onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement) {
      this.mouse.x += e.movementX * this.sensitivity;
      this.mouse.y += e.movementY * this.sensitivity;
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'KeyP') this.togglePauseListener?.();
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onLockChange = () => { /* host can subscribe via store */ };
}
```

- [ ] **Step 9.4: Run test, expect PASS**

```bash
npm test -- inputManager.test.ts
```

- [ ] **Step 9.5: Commit**

```bash
git add src/engine/InputManager.ts tests/unit/inputManager.test.ts
git commit -m "feat(engine): add InputManager (keys + pointer lock)"
```

---

## Task 10: Game Loop + Player + Game Singleton

**Files:**
- Create: `src/engine/Loop.ts`, `src/entities/Player.ts`, `src/engine/Game.ts`, `src/game/GameState.ts`, `src/game/Rules.ts`

`Game` is integration-tested in Task 12 via Playwright. `Loop` and `Player` are exercised by the engine.

- [ ] **Step 10.1: Implement `src/engine/Loop.ts`**

```ts
export class Loop {
  private raf = 0;
  private last = 0;
  constructor(private update: (dt: number) => void) {}

  start() {
    this.last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() { cancelAnimationFrame(this.raf); }
}
```

- [ ] **Step 10.2: Implement `src/entities/Player.ts`**

```ts
import * as THREE from 'three';

export interface PlayerState {
  position: { x: number; z: number };
  yaw: number;
  pitch: number;
  speed: number;
  radius: number;
}

export function createPlayer(startCell: { x: number; z: number }, cellSize: number): PlayerState {
  return {
    position: { x: startCell.x * cellSize, z: startCell.z * cellSize },
    yaw: 0,
    pitch: 0,
    speed: 3,
    radius: 0.3,
  };
}

export function applyLook(player: PlayerState, mouse: { x: number; y: number }) {
  player.yaw -= mouse.x;
  player.pitch -= mouse.y;
  player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
}

export function updatePlayerCamera(camera: THREE.PerspectiveCamera, player: PlayerState): void {
  camera.position.set(player.position.x, 1.6, player.position.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}
```

- [ ] **Step 10.3: Implement `src/game/GameState.ts`**

```ts
export type Phase = 'idle' | 'playing' | 'paused' | 'game-over' | 'win';
export const PHASE_PLAYING: Phase = 'playing';
```

- [ ] **Step 10.4: Implement `src/game/Rules.ts`**

```ts
import type { MazeData, Pickup } from '../maze/types';

export function isAtExit(player: { x: number; z: number }, maze: MazeData): boolean {
  const cs = maze.cellSize;
  const cellX = Math.round(player.x / cs);
  const cellZ = Math.round(player.z / cs);
  return cellX === maze.exit.x && cellZ === maze.exit.z;
}

export function findPickupAt(player: { x: number; z: number }, maze: MazeData, remaining: Pickup[]): Pickup | null {
  const cs = maze.cellSize;
  const cellX = Math.round(player.x / cs);
  const cellZ = Math.round(player.z / cs);
  for (const p of remaining) {
    if (p.x === cellX && p.z === cellZ) return p;
  }
  return null;
}
```

- [ ] **Step 10.5: Implement `src/engine/Game.ts`**

```ts
import * as THREE from 'three';
import { createRenderer } from './Renderer';
import { createCamera } from './Camera';
import { buildScene, disposeScene, type SceneRefs } from './Scene';
import { InputManager } from './InputManager';
import { Loop } from './Loop';
import { resolveMove, type WallGrid } from './Collision';
import { createPlayer, applyLook, updatePlayerCamera, type PlayerState } from '../entities/Player';
import { isAtExit, findPickupAt } from '../game/Rules';
import type { MazeData, Pickup } from '../maze/types';

export interface GameBridge {
  onTick: (dt: number) => void;
  onPauseToggle: () => void;
  onPickupCollected: (p: Pickup) => void;
  onReachExit: (timeUsed: number) => void;
}

export class Game {
  private renderer?: THREE.WebGLRenderer;
  private camera?: THREE.PerspectiveCamera;
  private sceneRefs?: SceneRefs;
  private player?: PlayerState;
  private input?: InputManager;
  private loop?: Loop;
  private startedAt = 0;
  private remainingPickups: Pickup[] = [];
  private currentMaze?: MazeData;
  private bridge: GameBridge;

  constructor(bridge: GameBridge) {
    this.bridge = bridge;
  }

  init(canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.camera = createCamera();
    this.input = new InputManager();
    this.input.onTogglePause(() => this.bridge.onPauseToggle());
  }

  startLevel(maze: MazeData) {
    if (!this.renderer || !this.camera) throw new Error('Game not initialized');
    if (this.sceneRefs) {
      disposeScene(this.sceneRefs.scene, this.sceneRefs.walls, this.sceneRefs.exit, this.sceneRefs.pickups);
    }
    this.sceneRefs = buildScene(maze);
    this.player = createPlayer(maze.start, maze.cellSize);
    updatePlayerCamera(this.camera, this.player);
    this.currentMaze = maze;
    this.remainingPickups = [...maze.pickups];
    this.startedAt = performance.now();
    if (this.loop) this.loop.stop();
    this.loop = new Loop((dt) => this.update(dt));
    this.loop.start();
  }

  pauseLoop() { this.loop?.stop(); }
  resumeLoop() {
    if (!this.loop) return;
    this.loop = new Loop((dt) => this.update(dt));
    this.loop.start();
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.loop?.stop();
    this.input?.dispose();
    if (this.sceneRefs) {
      disposeScene(this.sceneRefs.scene, this.sceneRefs.walls, this.sceneRefs.exit, this.sceneRefs.pickups);
    }
    this.renderer?.dispose();
  }

  private update(dt: number) {
    if (!this.camera || !this.player || !this.sceneRefs || !this.currentMaze || !this.input) return;

    applyLook(this.player, this.input.consumeMouseDelta());

    const move = this.input.getMove();
    const cosY = Math.cos(this.player.yaw);
    const sinY = Math.sin(this.player.yaw);
    const dx = (move.x * cosY + move.z * sinY) * this.player.speed * dt;
    const dz = (-move.x * sinY + move.z * cosY) * this.player.speed * dt;
    const grid: WallGrid = {
      width: this.currentMaze.size.width,
      depth: this.currentMaze.size.depth,
      cellSize: this.currentMaze.cellSize,
      get: (x, z) => (this.currentMaze!.walls[z]?.[x] === 1 ? 1 : 0),
    };
    const next = resolveMove(
      { x: this.player.position.x, z: this.player.position.z, r: this.player.radius },
      { dx, dz },
      grid,
    );
    this.player.position = { x: next.x, z: next.z };

    updatePlayerCamera(this.camera, this.player);

    const hit = findPickupAt(this.player.position, this.currentMaze, this.remainingPickups);
    if (hit) {
      this.remainingPickups = this.remainingPickups.filter((p) => p !== hit);
      const mesh = this.sceneRefs.pickups.find((m) => m.userData?.pickup === hit);
      if (mesh) mesh.visible = false;
      this.bridge.onPickupCollected(hit);
    }

    if (isAtExit(this.player.position, this.currentMaze)) {
      const used = (performance.now() - this.startedAt) / 1000;
      this.bridge.onReachExit(used);
      this.pauseLoop();
    }

    this.bridge.onTick(dt);
    this.renderer!.render(this.sceneRefs.scene, this.camera);
  }
}
```

- [ ] **Step 10.6: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 10.7: Commit**

```bash
git add src/engine src/entities src/game
git commit -m "feat(engine): add Game singleton + Loop + Player + Rules"
```

---

## Task 11: React UI — HUD, Overlays, Menus

**Files:**
- Create: `src/ui/components/Button.tsx`, `src/ui/components/Timer.tsx`, `src/ui/components/HealthBar.tsx`, `src/ui/components/InventoryBar.tsx`, `src/ui/components/ControlHints.tsx`, `src/ui/HUD.tsx`, `src/ui/MainMenu.tsx`, `src/ui/LevelSelect.tsx`, `src/ui/Settings.tsx`, `src/ui/PauseOverlay.tsx`, `src/ui/GameOverOverlay.tsx`, `src/ui/WinOverlay.tsx`, `src/ui/GameCanvas.tsx`, `src/App.tsx` (replace), `tests/component/hud.test.tsx`, `tests/component/overlays.test.tsx`

- [ ] **Step 11.1: Implement `src/ui/components/Button.tsx`**

```tsx
import { type ReactNode } from 'react';

export interface ButtonProps {
  onClick: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export function Button({ onClick, children, variant = 'primary', disabled }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
      style={{
        padding: '10px 22px',
        fontSize: 16,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: variant === 'primary' ? 'var(--accent)' : variant === 'danger' ? 'var(--danger)' : 'var(--panel)',
        color: variant === 'secondary' ? 'var(--fg)' : '#1a1a1a',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 11.2: Implement `src/ui/components/Timer.tsx`**

```tsx
import { formatTime } from '../../utils/time';

export function Timer({ seconds, urgent }: { seconds: number; urgent: boolean }) {
  return (
    <div
      role="timer"
      style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        background: 'var(--panel)', color: urgent ? 'var(--danger)' : 'var(--fg)',
        padding: '8px 18px', borderRadius: 10, fontWeight: 700, fontSize: 28, fontVariantNumeric: 'tabular-nums',
        border: '1px solid var(--border)',
      }}
    >
      ⏱ {formatTime(seconds)}
    </div>
  );
}
```

- [ ] **Step 11.3: Implement `src/ui/components/HealthBar.tsx`**

```tsx
export function HealthBar({ health, max }: { health: number; max: number }) {
  const hearts = Array.from({ length: max }, (_, i) => i < health);
  return (
    <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 6 }}>
      {hearts.map((filled, i) => (
        <span key={i} style={{ fontSize: 24, color: filled ? 'var(--danger)' : 'var(--border)' }}>
          {filled ? '❤' : '♡'}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 11.4: Implement `src/ui/components/InventoryBar.tsx`**

```tsx
import type { Pickup } from '../../maze/types';

export function InventoryBar({ slots }: { slots: (Pickup | null)[] }) {
  return (
    <div
      style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8,
      }}
    >
      {slots.map((s, i) => (
        <div
          key={i}
          style={{
            width: 56, height: 56, border: '2px solid var(--border)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--panel)', fontSize: 14,
          }}
        >
          {s ? s.type : <span style={{ color: 'var(--border)' }}>{i + 1}</span>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 11.5: Implement `src/ui/components/ControlHints.tsx`**

```tsx
export function ControlHints() {
  const items = [
    { k: 'WASD', l: '移动' },
    { k: '鼠标', l: '视角' },
    { k: 'P', l: '暂停' },
    { k: 'ESC', l: '释放鼠标' },
  ];
  return (
    <div
      style={{
        position: 'absolute', top: 80, left: 16, display: 'flex', flexDirection: 'column', gap: 6,
        background: 'var(--panel)', padding: 10, borderRadius: 8, border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      {items.map((it) => (
        <div key={it.k} style={{ display: 'flex', gap: 8 }}>
          <kbd style={{ background: '#000', color: 'var(--fg)', padding: '1px 6px', borderRadius: 4, minWidth: 50, textAlign: 'center' }}>{it.k}</kbd>
          <span>{it.l}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 11.6: Implement `src/ui/HUD.tsx`**

```tsx
import { useGameStore } from '../store/gameStore';
import { Timer } from './components/Timer';
import { HealthBar } from './components/HealthBar';
import { InventoryBar } from './components/InventoryBar';
import { ControlHints } from './components/ControlHints';

export function HUD() {
  const timeRemaining = useGameStore((s) => s.timeRemaining);
  const health = useGameStore((s) => s.health);
  const inventory = useGameStore((s) => s.inventory);
  const maxHealth = useGameStore((s) => s.currentMaze?.rules.maxHealth ?? 3);
  return (
    <>
      <Timer seconds={timeRemaining} urgent={timeRemaining <= 10} />
      <ControlHints />
      <InventoryBar slots={inventory} />
      <HealthBar health={health} max={maxHealth} />
    </>
  );
}
```

- [ ] **Step 11.7: Implement `src/ui/MainMenu.tsx`**

```tsx
import { Button } from './components/Button';

export function MainMenu({ onStart, onSettings }: { onStart: () => void; onSettings: () => void; }) {
  return (
    <div style={overlayStyle}>
      <h1 style={{ fontSize: 48, margin: 0 }}>3D Maze</h1>
      <p style={{ opacity: 0.7, marginTop: 4 }}>在限时内找到出口</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
        <Button onClick={onStart}>开始</Button>
        <Button onClick={onSettings} variant="secondary">设置</Button>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', background: 'var(--bg)',
};
```

- [ ] **Step 11.8: Implement `src/ui/LevelSelect.tsx`**

```tsx
import { Button } from './components/Button';

export interface LevelDef { id: string; name: string; }

export function LevelSelect({
  available,
  onPick,
  onBack,
}: {
  available: LevelDef[];
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <h2>选择关卡</h2>
      {available.length === 0 ? <p>暂无可用关卡</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {available.map((lv) => (
            <Button key={lv.id} onClick={() => onPick(lv.id)}>{lv.name}</Button>
          ))}
        </div>
      )}
      <Button onClick={onBack} variant="secondary">返回</Button>
    </div>
  );
}
```

- [ ] **Step 11.9: Implement `src/ui/Settings.tsx`**

```tsx
import { useSettingsStore } from '../store/settingsStore';
import { Button } from './components/Button';

export function Settings({ onBack }: { onBack: () => void }) {
  const sens = useSettingsStore((s) => s.pointerSensitivity);
  const set = useSettingsStore((s) => s.set);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20 }}>
      <h2>设置</h2>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        鼠标灵敏度
        <input
          type="range" min={0.0005} max={0.006} step={0.0005}
          value={sens}
          onChange={(e) => set('pointerSensitivity', Number(e.target.value))}
        />
        <span style={{ opacity: 0.7, fontSize: 12 }}>{sens.toFixed(4)} rad/px</span>
      </label>
      <Button onClick={onBack} variant="secondary">返回</Button>
    </div>
  );
}
```

- [ ] **Step 11.10: Implement `src/ui/PauseOverlay.tsx`**

```tsx
import { useGameStore } from '../store/gameStore';
import { useLevelStore } from '../store/levelStore';
import { Button } from './components/Button';
import { formatTime } from '../utils/time';

export function PauseOverlay({ onResume, onQuit }: { onResume: () => void; onQuit: () => void; }) {
  const pickupCount = useGameStore((s) => s.pickupCount);
  const currentLevelId = useGameStore((s) => s.currentLevelId);
  const best = useLevelStore((s) => (currentLevelId ? s.bestByLevel[currentLevelId] : undefined));
  return (
    <div style={overlayStyle}>
      <h2>已暂停</h2>
      <p>已收集: {pickupCount.collected} / {pickupCount.total}</p>
      {best && <p>历史最佳: {formatTime(best.timeUsed)}</p>}
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <Button onClick={onResume}>继续</Button>
        <Button onClick={onQuit} variant="secondary">返回主菜单</Button>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
};
```

- [ ] **Step 11.11: Implement `src/ui/GameOverOverlay.tsx`**

```tsx
import { Button } from './components/Button';

export function GameOverOverlay({ onRetry, onQuit }: { onRetry: () => void; onQuit: () => void; }) {
  return (
    <div style={overlayStyle}>
      <h2 style={{ color: 'var(--danger)' }}>时间到！</h2>
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <Button onClick={onRetry}>重试</Button>
        <Button onClick={onQuit} variant="secondary">返回主菜单</Button>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
};
```

- [ ] **Step 11.12: Implement `src/ui/WinOverlay.tsx`**

```tsx
import { useGameStore } from '../store/gameStore';
import { useLevelStore } from '../store/levelStore';
import { Button } from './components/Button';
import { formatTime } from '../utils/time';

export function WinOverlay({ onRetry, onQuit, onNext }: { onRetry: () => void; onQuit: () => void; onNext?: () => void; }) {
  const pickupCount = useGameStore((s) => s.pickupCount);
  const currentLevelId = useGameStore((s) => s.currentLevelId);
  const timeRemaining = useGameStore((s) => s.timeRemaining);
  const initial = useGameStore((s) => s.currentMaze?.rules.initialTime ?? 0);
  const best = useLevelStore((s) => (currentLevelId ? s.bestByLevel[currentLevelId] : undefined));
  const timeUsed = initial - timeRemaining;
  const newRecord = !best || timeUsed < best.timeUsed;
  return (
    <div style={overlayStyle}>
      <h2 style={{ color: 'var(--accent)' }}>通关！</h2>
      <p>用时 {formatTime(timeUsed)}</p>
      <p>收集 {pickupCount.collected} / {pickupCount.total}</p>
      {best && <p>历史最佳 {formatTime(best.timeUsed)}</p>}
      {newRecord && <p style={{ color: 'var(--accent)' }}>新纪录！</p>}
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <Button onClick={onRetry}>重玩</Button>
        {onNext && <Button onClick={onNext}>下一关</Button>}
        <Button onClick={onQuit} variant="secondary">返回主菜单</Button>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
};
```

- [ ] **Step 11.13: Implement `src/ui/GameCanvas.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Game, type GameBridge } from '../engine/Game';
import { useGameStore } from '../store/gameStore';
import { useLevelStore } from '../store/levelStore';
import type { MazeData } from '../maze/types';

export function GameCanvas({ maze }: { maze: MazeData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const bridge: GameBridge = {
      onTick: (dt) => useGameStore.getState().tick(dt),
      onPauseToggle: () => {
        const s = useGameStore.getState();
        if (s.screen === 'playing') s.pause();
        else if (s.screen === 'paused') s.resume();
      },
      onPickupCollected: (p) => useGameStore.getState().pickup(p),
      onReachExit: (timeUsed) => {
        const s = useGameStore.getState();
        if (s.currentLevelId) {
          useLevelStore.getState().record({
            levelId: s.currentLevelId,
            timeUsed,
            collected: s.pickupCount.collected,
            total: s.pickupCount.total,
            date: new Date().toISOString(),
          });
        }
        s.reachExit();
      },
    };
    const game = new Game(bridge);
    game.init(ref.current);
    game.startLevel(maze);
    gameRef.current = game;
    const onResize = () => game.resize();
    window.addEventListener('resize', onResize);
    const onVisibility = () => {
      if (document.hidden) useGameStore.getState().pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      game.dispose();
      gameRef.current = null;
    };
  }, [maze.id]);

  useEffect(() => {
    const unsub = useGameStore.subscribe((s, prev) => {
      if (s.screen === 'paused' && prev && prev.screen !== 'paused') gameRef.current?.pauseLoop();
      if (s.screen === 'playing' && prev && prev.screen === 'paused') gameRef.current?.resumeLoop();
    });
    return unsub;
  }, []);

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, display: 'block' }} />;
}
```

- [ ] **Step 11.14: Replace `src/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { MainMenu } from './ui/MainMenu';
import { LevelSelect } from './ui/LevelSelect';
import { Settings } from './ui/Settings';
import { HUD } from './ui/HUD';
import { PauseOverlay } from './ui/PauseOverlay';
import { GameOverOverlay } from './ui/GameOverOverlay';
import { WinOverlay } from './ui/WinOverlay';
import { GameCanvas } from './ui/GameCanvas';
import { JsonMazeProvider } from './maze/JsonMazeProvider';
import type { MazeData } from './maze/types';

type UiScreen = 'menu' | 'levels' | 'settings' | 'game';

async function loadAllLevels(): Promise<{ id: string; name: string; data: MazeData }[]> {
  const modules = import.meta.glob('/public/levels/*.json', { eager: true });
  const provider = new JsonMazeProvider(
    Object.fromEntries(
      Object.entries(modules).map(([path, mod]) => {
        const id = path.split('/').pop()!.replace('.json', '');
        const data = (mod as any).default ?? mod;
        return [id, data];
      }),
    ),
  );
  const ids = await provider.list();
  const out: { id: string; name: string; data: MazeData }[] = [];
  for (const id of ids) {
    const m = await provider.load(id);
    out.push({ id: m.id, name: m.name, data: m });
  }
  return out;
}

export function App() {
  const [uiScreen, setUiScreen] = useState<UiScreen>('menu');
  const [levels, setLevels] = useState<{ id: string; name: string; data: MazeData }[]>([]);
  const [activeMaze, setActiveMaze] = useState<MazeData | null>(null);
  const gameScreen = useGameStore((s) => s.screen);

  useEffect(() => {
    loadAllLevels().then(setLevels).catch((e) => console.error('Failed to load levels', e));
  }, []);

  const startLevel = (id: string) => {
    const lv = levels.find((l) => l.id === id);
    if (!lv) return;
    useGameStore.getState().startLevel(lv.data);
    setActiveMaze(lv.data);
    setUiScreen('game');
  };

  const quitToMenu = () => {
    useGameStore.getState().goToMenu();
    setActiveMaze(null);
    setUiScreen('menu');
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {uiScreen === 'game' && activeMaze && <GameCanvas maze={activeMaze} />}
      {uiScreen === 'game' && gameScreen === 'playing' && <HUD />}
      {uiScreen === 'game' && gameScreen === 'paused' && (
        <>
          <HUD />
          <PauseOverlay onResume={() => useGameStore.getState().resume()} onQuit={quitToMenu} />
        </>
      )}
      {uiScreen === 'game' && gameScreen === 'game-over' && (
        <GameOverOverlay onRetry={() => activeMaze && startLevel(activeMaze.id)} onQuit={quitToMenu} />
      )}
      {uiScreen === 'game' && gameScreen === 'win' && (
        <WinOverlay onRetry={() => activeMaze && startLevel(activeMaze.id)} onQuit={quitToMenu} />
      )}
      {uiScreen === 'menu' && (
        <MainMenu onStart={() => setUiScreen('levels')} onSettings={() => setUiScreen('settings')} />
      )}
      {uiScreen === 'levels' && (
        <LevelSelect
          available={levels.map(({ id, name }) => ({ id, name }))}
          onPick={startLevel}
          onBack={() => setUiScreen('menu')}
        />
      )}
      {uiScreen === 'settings' && <Settings onBack={() => setUiScreen('menu')} />}
    </div>
  );
}
```

- [ ] **Step 11.15: Write HUD component test `tests/component/hud.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HUD } from '../../src/ui/HUD';
import { useGameStore } from '../../src/store/gameStore';

const maze = {
  id: 'm1', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 2, z: 2 },
  walls: [[1,1,1],[1,0,1],[1,1,1]],
  pickups: [], rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit' as const, timeOnPickup: 15 },
};

describe('HUD', () => {
  beforeEach(() => {
    useGameStore.getState().goToMenu();
    useGameStore.getState().startLevel(maze);
  });

  it('shows the timer with formatted time', () => {
    useGameStore.setState({ timeRemaining: 125 });
    render(<HUD />);
    expect(screen.getByRole('timer').textContent).toContain('02:05');
  });

  it('renders hearts matching health', () => {
    useGameStore.setState({ health: 2 });
    render(<HUD />);
    expect(screen.getAllByText('❤').length).toBeGreaterThanOrEqual(2);
  });

  it('renders inventory slot placeholders', () => {
    render(<HUD />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
```

- [ ] **Step 11.16: Write overlay component test `tests/component/overlays.test.tsx`**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PauseOverlay } from '../../src/ui/PauseOverlay';
import { GameOverOverlay } from '../../src/ui/GameOverOverlay';
import { WinOverlay } from '../../src/ui/WinOverlay';
import { useGameStore } from '../../src/store/gameStore';

const maze = {
  id: 'm1', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 2, z: 2 },
  walls: [[1,1,1],[1,0,1],[1,1,1]],
  pickups: [], rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit' as const, timeOnPickup: 15 },
};

describe('overlays', () => {
  beforeEach(() => useGameStore.getState().goToMenu());

  it('PauseOverlay shows collected count and resume callback', () => {
    useGameStore.getState().startLevel(maze);
    useGameStore.setState({ pickupCount: { collected: 2, total: 5 } });
    const onResume = vi.fn();
    render(<PauseOverlay onResume={onResume} onQuit={() => {}} />);
    expect(screen.getByText(/已收集/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('继续'));
    expect(onResume).toHaveBeenCalled();
  });

  it('GameOverOverlay shows retry button', () => {
    const onRetry = vi.fn();
    render(<GameOverOverlay onRetry={onRetry} onQuit={() => {}} />);
    fireEvent.click(screen.getByText('重试'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('WinOverlay shows time used', () => {
    useGameStore.getState().startLevel(maze);
    useGameStore.setState({ timeRemaining: 35 });
    render(<WinOverlay onRetry={() => {}} onQuit={() => {}} />);
    expect(screen.getByText(/用时 00:25/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 11.17: Run all unit + component tests**

```bash
npm test
```

Expected: all green.

- [ ] **Step 11.18: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 11.19: Run dev server and manually verify**

```bash
npm run dev
```

Open http://localhost:5173 — main menu shows, click 开始, level select shows "小试身手", pick it, 3D view renders, WASD moves.

- [ ] **Step 11.20: Commit**

```bash
git add src/ui src/App.tsx tests/component
git commit -m "feat(ui): add HUD, menus, overlays, and game canvas"
```

---

## Task 12: E2E Tests (Playwright)

**Files:**
- Create: `tests/e2e/play-through.spec.ts`, `tests/e2e/pause-resume.spec.ts`, `tests/e2e/persistence.spec.ts`

- [ ] **Step 12.1: Create `tests/e2e/play-through.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('user can start a tiny level and reach the exit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始' }).click();
  await page.getByRole('button', { name: 'Test Corridor' }).click();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // level-tiny: start (0,1) -> exit (2,1), one step right reaches exit
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyD');

  await expect(page.getByText('通关')).toBeVisible({ timeout: 5_000 });
});
```

- [ ] **Step 12.2: Create `tests/e2e/pause-resume.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('P toggles pause overlay', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始' }).click();
  await page.getByRole('button', { name: 'Test Corridor' }).click();
  await page.keyboard.press('KeyP');
  await expect(page.getByText('已暂停')).toBeVisible();
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.getByText('已暂停')).not.toBeVisible();
});
```

- [ ] **Step 12.3: Create `tests/e2e/persistence.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('best record persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole('button', { name: '开始' }).click();
  await page.getByRole('button', { name: 'Test Corridor' }).click();
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyD');
  await expect(page.getByText('通关')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('新纪录')).toBeVisible();

  await page.getByRole('button', { name: '返回主菜单' }).click();
  await page.reload();
  await page.getByRole('button', { name: '开始' }).click();
  await page.getByRole('button', { name: 'Test Corridor' }).click();
  await page.keyboard.press('KeyP');
  await expect(page.getByText(/历史最佳/)).toBeVisible();
});
```

- [ ] **Step 12.4: Install Playwright browsers**

```bash
npm run test:e2e:install
```

- [ ] **Step 12.5: Run E2E**

```bash
npm run test:e2e
```

Expected: 3/3 pass. If timing-sensitive, adjust `waitForTimeout` values; the E2E relies on holding KeyD long enough for the player to traverse 2 cells (4m) at speed 3 m/s ≈ 1.4s.

- [ ] **Step 12.6: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): add play-through, pause-resume, persistence specs"
```

---

## Task 13: Coverage Check & README

**Files:**
- Create: `README.md`

- [ ] **Step 13.1: Run full test suite with coverage**

```bash
npm test -- --coverage
```

Expected: ≥80% lines/functions/statements.

- [ ] **Step 13.2: Create `README.md`**

```markdown
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
```

- [ ] **Step 13.3: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Self-Review

**Spec coverage:**
- Section 3 product decisions — covered: tech stack (Task 1), HUD layout (Task 11), localStorage (Task 7), Three.js imperative (Task 8/10), countdown (Task 6/10)
- Section 5 architecture — React/UI ↔ engine ↔ MazeProvider boundary enforced (Task 10 `Game.ts` has no React/store imports; Task 11 is the only React code)
- Section 6 win condition — `GameState` (Task 6) + `Rules.isAtExit` (Task 10)
- Section 6 HUD layout — Task 11 (Timer top center, ControlHints left, InventoryBar bottom, HealthBar bottom-left, Pause overlay with collected + best)
- Section 6 state machine — Task 6 (`gameStore` covers all 5 transitions)
- Section 7 data model — Task 3 (types + provider)
- Section 7 level JSON — Task 4 (level-small + level-tiny)
- Section 7 zustand stores — Task 6 (gameStore), Task 7 (levelStore, settingsStore, persist)
- Section 8 engine modules — Task 8 (Renderer/Camera/Scene), Task 9 (InputManager), Task 10 (Loop, Game)
- Section 8 entity model — Task 10 (Player)
- Section 8 pointer lock flow — Task 9 (InputManager pointer-lock guarded mouse delta)
- Section 9 error handling — Task 3 (LevelLoadError, JsonMazeProvider validation), Task 10 (Game throws if not init)
- Section 9 typed errors — Task 3 (GameError base + LevelLoadError)
- Section 10 testing — Task 2/3/5/6/7/8/9 unit tests, Task 11 component tests, Task 12 E2E
- Section 11 project structure — all files in plan match spec section 11 layout
- Section 12 phased delivery — Phase 1 implemented across Tasks 1-13; Phase 2 listed in README future-increments section

**Placeholder scan:** No TBD/TODO. Every code block is the actual file content.

**Type consistency:**
- `MazeData` shape consistent across Task 3, 4, 6, 8, 10, 11
- `Pickup` shape consistent
- `WallGrid` / `PlayerPos` / `Delta` consistent between Task 5 (Collision) and Task 10 (Game usage)
- `LevelLoadError` consistent between Task 3 (definition) and Task 3/11 (consumption)
- `GameBridge` shape consistent between Task 10 (definition) and Task 11 (GameCanvas wiring)
- `useGameStore` actions match between Task 6 and Task 11 callers

**Scope:** Focused on Phase 1 (MVP small level). No Phase 2 work included; README documents it as future.

**Ambiguity check:** No two-interpretable requirements. The pointer sensitivity default (0.002 rad/px) is documented in spec section 13 and set in Task 7 settingsStore.

Plan is complete and ready for execution.
