import { test, expect } from '@playwright/test';

// P2-4a FR-12: survive mode's win condition is `elapsedTime >=
// currentSurviveSeconds` -> state='win'. The LevelSelect exposes the
// mode dropdown (P2-4a FR-13 / P2-5 FR-13) so the test can opt in via
// the UI rather than poking the store. Playwright's `page.clock`
// (v1.45+) lets us fast-forward 30 seconds of wall-clock time in a
// fraction of real time — running the spec would otherwise burn 30s on
// the runner.
test('survive 30s triggers the win overlay (P2-4a)', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('main-menu-start').click();
  // P2-5: survive is a <select> option.
  await page.getByTestId('mode-select').selectOption('survive');
  // Default survive-seconds is 30, so we don't touch survive-seconds-select.
  await page.getByTestId('size-select').selectOption('15');
  await page.getByRole('button', { name: /15×15 随机关卡/ }).click();
  // 30s of survive ticks. The store's tick() handler runs via the
  // engine loop, which uses requestAnimationFrame; page.clock fast-
  // forward ticks the synthetic clock and lets those rAFs fire.
  await page.clock.fastForward(30_000);
  await expect(page.getByText('通关')).toBeVisible({ timeout: 5_000 });
});
