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
