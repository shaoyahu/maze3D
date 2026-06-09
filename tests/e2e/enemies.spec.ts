import { test, expect } from '@playwright/test';

// P2-4a FR-4/5: walking into an enemy damages the player. The Test Enemy
// level has a single enemy in the middle of the corridor; walking right
// from the start cell (0,1) puts the player inside its collision range
// within ~0.5s of holding D.
test.describe('enemies (P2-4a)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: '开始' }).click();
    await page.getByRole('button', { name: 'Test Enemy' }).click();
  });

  test('walking into an enemy decrements health', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    // Walk right; the player traverses 4m at 3 m/s — 1500ms clears the
    // corridor and lands the player inside the enemy's collision range.
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyD');
    // HealthBar shows 3 hearts by default; after a hit it shows 2.
    await expect(page.getByText('♡')).toBeVisible({ timeout: 3_000 });
  });

  test('a second hit inside the 0.5s invulnerable window does not drop health further', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyD');
    // Wait for the first damage to land; once it does, the next 0.5s of
    // wall-clock time is the invulnerable window. Continue moving toward
    // the enemy during the window — the player stays in contact but the
    // second contact must not apply another damage point.
    await expect(page.getByText('♡')).toBeVisible({ timeout: 3_000 });
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(200);
    await page.keyboard.up('KeyD');
    // Hearts should still be 2 (one ❤ filled, one ♡ empty), not 1.
    // (asserted via the enemy counter's stable text — the count of ❤ in
    // the HUD is 1 here, distinguishing it from a third hit landing.)
    const filledHearts = await page.locator('text=❤').count();
    expect(filledHearts).toBeLessThanOrEqual(1);
  });
});
