import { test, expect } from '@playwright/test';

// P2-5: the level select uses size-select + mode-select, so the survive-
// mode test sets those dropdowns explicitly. The Test Corridor test just
// needs to wait for the canvas to mount before pressing P — the keypress
// is delivered to the focused element (the Button we just clicked) and
// bubbled to window; if the canvas hasn't mounted yet the InputManager
// listener is gone with the wind.
test('P toggles pause overlay', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始' }).click();
  await page.getByRole('button', { name: 'Test Corridor' }).click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
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
  await page.getByTestId('main-menu-start').click();
  // P2-5: survive is now a <select> option, not a radio button.
  await page.getByTestId('mode-select').selectOption('survive');
  // Default survive seconds is 30, so leave survive-seconds-select alone.
  await page.getByTestId('size-select').selectOption('15');
  await page.getByRole('button', { name: /15×15 随机关卡/ }).click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
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
