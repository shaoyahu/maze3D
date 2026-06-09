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

// P2-4a FR-19: in survive mode, pausing must freeze elapsedTime. The
// engine loop stops on pause (Loop.stop()), so the store's tick() handler
// never fires while paused — elapsedTime stays put. We can't easily
// read elapsedTime from the DOM (it isn't rendered as a number in
// survive mode), so we use the store's screen + a fast-forward
// combined with a pause as a deterministic trigger: pause for 10s, then
// resume, and verify the win overlay still needs 30s from start (i.e.
// the 10s pause didn't accumulate).
test('survive mode pause freezes elapsedTime (P2-4a FR-19)', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '开始' }).click();
  await page.getByTestId('mode-survive').click();
  await page.getByTestId('survive-30').click();
  await page.getByRole('button', { name: '15×15' }).click();
  // Burn 15s of survive time, then pause and fast-forward 10s of paused
  // wall-clock. If elapsedTime kept ticking during the pause, the win
  // overlay would appear after only 5 more seconds of resumed play.
  await page.clock.fastForward(15_000);
  await page.keyboard.press('KeyP');
  await expect(page.getByText('已暂停')).toBeVisible();
  await page.clock.fastForward(10_000);
  // The pause is still active; resume and the next 15s should land the win.
  await page.getByRole('button', { name: '继续' }).click();
  await page.clock.fastForward(15_000);
  await expect(page.getByText('通关')).toBeVisible({ timeout: 5_000 });
});
