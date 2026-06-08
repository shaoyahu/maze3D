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
      thresholds: { lines: 80, functions: 75, branches: 75, statements: 80 },
      // Only score src/ against the threshold. E2E specs run under Playwright
      // (not vitest), so they have no execution trace here and would drag
      // the overall to 0% if counted. The vitest `include` above restricts
      // which *test files* run, but the coverage tool still measures every
      // file in the project unless we restrict its scope.
      include: ['src/**'],
      exclude: [
        'src/main.tsx',
        'src/App.tsx',
        'src/engine/Game.ts',
        'src/engine/Camera.ts',
        'src/engine/Renderer.ts',
        'src/engine/Loop.ts',
        'src/ui/GameCanvas.tsx',
        'src/maze/types.ts',
        'src/game/GameState.ts',
        'src/vite-env.d.ts',
        'playwright.config.ts',
      ],
    },
  },
});
