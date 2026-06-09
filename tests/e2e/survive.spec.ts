import { test, expect } from '@playwright/test';

// P2-4a FR-12: survive mode's win condition is `elapsedTime >=
// currentSurviveSeconds` -> state='win'. The LevelSelect exposes the
// mode radio (P2-4a FR-13) so the test can opt in via the UI rather
// than poking the store. Playwright's `page.clock` (v1.45+) lets us
// fast-forward 30 seconds of wall-clock time in a fraction of real
// time — running the spec would otherwise burn 30s on the runner.
test('survive 30s triggers the win overlay (P2-4a)', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '开始' }).click();
  await page.getByTestId('mode-survive').click();
  await page.getByTestId('survive-30').click();
  await page.getByRole('button', { name: '15×15' }).click();
  // 30s of survive ticks. The store's tick() handler runs via the
  // engine loop, which uses requestAnimationFrame; page.clock fast-
  // forward ticks the synthetic clock and lets those rAFs fire.
  await page.clock.fastForward(30_000);
  await expect(page.getByText('通关')).toBeVisible({ timeout: 5_000 });
});
