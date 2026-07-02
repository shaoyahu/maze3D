import { test, expect } from '@playwright/test';

// P2-11: teaching-flow smoke test. Walks through teaching levels and
// verifies the TutorialBanner appears, advances after the configured
// trigger, and disappears after the exit is crossed. F-2026-07-01-FCR-M-10
// expands coverage to teaching-02 (deterministic pickup-collected + exit
// path; no page.clock dependency). teaching-03 / teaching-04 still rely
// on enemy-chase or timeout triggers that are timing-sensitive —
// unit / RTL coverage in tests/unit/store/tutorialStore.test.ts and
// tests/component/overlays.test.tsx is sufficient.

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

// F-2026-07-01-FCR-M-10: deterministic teaching-02 walkthrough. 5x1 corridor
// with one health pickup at cell (2,0); start (0,0) → exit (4,0). Two
// tutorial steps: pickup-collected (count=1) → reached-exit. No mouse
// movement, no enemy interaction, no page.clock required.
test('teaching-02: banner advances on pickup + exit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始' }).click();
  await page.getByTestId('sublevel-select').selectOption('teaching-02');
  await page.getByTestId('start-button').click();

  const banner = page.getByTestId('tutorial-banner');
  await expect(banner).toBeVisible({ timeout: 5_000 });
  await expect(banner).toContainText('1/2');

  // Walk right past the pickup at cell x=2 (cellSize=2 → world x=4).
  // 800ms at default speed 3 m/s ≈ 2.4 m → reaches cell x=1.
  // Two pulses of 700ms each ≈ 4.2 m total → past cell x=2.
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(150);
  }

  await expect(banner).toContainText('2/2', { timeout: 5_000 });

  // Continue walking to reach exit at cell x=4 (world x=8).
  await page.keyboard.down('KeyD');
  await expect(page.getByText('通关')).toBeVisible({ timeout: 5_000 });
  await page.keyboard.up('KeyD');
});