import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'tests/component/**/*.test.tsx'],
    // LOW: keep the coverage.exclude in lockstep with the test include
    // list above. If a test path is added (e.g. tests/e2e/**/*.test.ts
    // mocked into the unit bucket) the coverage gate should follow
    // automatically — both lists are the same set of "we know about
    // these files" declarations.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // F-2026-06-17-F-H-1: dropped from 80/75/75/80 to 70/65/65/70 so that
      // engine/Game.ts / maze/types.ts / ui/GameCanvas.tsx (the P2-11 CRITICAL
      // sites) can enter the measurement without breaking the gate. Run
      // `npm run test:coverage` to confirm actual coverage stays above the
      // lower threshold; raise the bar again once those three files are well
      // covered.
      thresholds: { lines: 70, functions: 65, branches: 65, statements: 70 },
      // Only score src/ against the threshold. E2E specs run under Playwright
      // (not vitest), so they have no execution trace here and would drag
      // the overall to 0% if counted. The vitest `include` above restricts
      // which *test files* run, but the coverage tool still measures every
      // file in the project unless we restrict its scope.
      include: ['src/**'],
      // F-2026-06-17-F-H-1: remove engine/Game.ts, ui/GameCanvas.tsx, and
      // maze/types.ts from the exclude list. These three files were the sites
      // of all three P2-11 CRITICAL findings (D-CRITICAL-1 validator field
      // swallowing, A-CRITICAL-1 editorStore.s.draft, A-CRITICAL-2
      // VictoryType union). Excluding them was "smoke alarm off in the room
      // with the fire". They are now under coverage measurement.
      exclude: [
        'src/main.tsx',
        'src/App.tsx',
        'src/engine/Camera.ts',
        'src/engine/Renderer.ts',
        'src/engine/Loop.ts',
        'src/game/GameState.ts',
        'src/vite-env.d.ts',
        'playwright.config.ts',
      ],
    },
  },
});
