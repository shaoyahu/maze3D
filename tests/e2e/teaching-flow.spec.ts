import { test, expect } from '@playwright/test';

// P2-11: teaching-flow smoke test. Walks through one teaching level
// (基础教学 / teaching-01) and verifies the TutorialBanner appears,
// advances after mouse + WASD input, and disappears after the exit is
// crossed. The other 3 teaching levels are not E2E-covered here — they
// depend on timing-sensitive interactions (enemy chase, pickup routing)
// that flake under page.clock. Unit / RTL coverage for those is in
// tests/unit/store/tutorialStore.test.ts + tests/component/overlays.test.tsx.

test('teaching-01: banner advances through mouse + WASD + exit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始' }).click();
  await page.getByTestId('sublevel-select').selectOption('teaching-01');
  await page.getByTestId('start-button').click();

  // Banner appears with step 1 (mouse-look)
  const banner = page.getByTestId('tutorial-banner');
  await expect(banner).toBeVisible({ timeout: 5_000 });
  await expect(banner).toContainText('1/3');
  await expect(banner).toContainText('移动鼠标转动视角');

  // Simulate mouse movement to advance past step 1. page.mouse.move
  // dispatches a series of mousemove events; the engine accumulates
  // yaw + pitch deltas until the 0.3 rad threshold fires.
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not visible');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  // Sweep through enough pixels to accumulate > 0.3 rad (~17°).
  for (let i = 1; i <= 20; i += 1) {
    await page.mouse.move(cx + i * 20, cy);
  }

  await expect(banner).toContainText('2/3', { timeout: 5_000 });
  await expect(banner).toContainText('按 WASD 键移动');

  // Step 2 (key-pressed): press W to advance.
  await page.keyboard.down('KeyW');
  // Hold briefly so the player walks + the engine fires key-pressed.
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');

  await expect(banner).toContainText('3/3', { timeout: 5_000 });
  await expect(banner).toContainText('走到出口即可通关');

  // Step 3 (reached-exit): walk right to cross the exit cell.
  await page.keyboard.down('KeyD');
  await expect(page.getByText('通关')).toBeVisible({ timeout: 5_000 });
  await page.keyboard.up('KeyD');
});