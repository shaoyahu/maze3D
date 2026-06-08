import { test, expect } from '@playwright/test';

test('walking through health/key/time pickups lets the player reach the exit', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole('button', { name: '开始' }).click();
  await page.getByRole('button', { name: 'Pickup Test' }).click();

  // Walk right through the corridor. The key is collected at the second
  // pickup; the inventory slot 0 should render the type name "key" right
  // after. We sample the inventory mid-traverse (before the win overlay
  // hides the HUD) by walking in short pulses.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(250);
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(150);
  }

  // Inventory slot 0 should display "key" (the key pickup filled it).
  await expect(page.getByText('key').first()).toBeVisible({ timeout: 3_000 });

  // Press 1 to use the key — no crash, no error. The flash is transient so
  // we don't assert on it here; Rules.onUseItem + store.useItem are
  // unit-tested.
  await page.keyboard.press('Digit1');

  // Resume walking to reach the exit and trigger the win overlay.
  await page.keyboard.down('KeyD');
  await expect(page.getByText('通关')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.up('KeyD');
});
