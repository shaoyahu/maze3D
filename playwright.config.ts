import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  // F-project-review-2026-06-13-C-M1: HTML reporter (open: 'never') so
  // failure triage has the per-test detail the prior 'list' only path
  // lacked; 'list' is kept for terminal output. The HTML report lands
  // in playwright-report/ on each run (gitignored) and survives
  // alongside the trace on failure (trace: 'retain-on-failure').
  reporter: [['html', { open: 'never' }], ['list']],
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
