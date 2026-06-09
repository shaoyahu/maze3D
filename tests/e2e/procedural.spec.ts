import { test, expect } from '@playwright/test';

// P2-3 FR-10: the LevelSelect has two extra entries for procedural play
// (随机关卡 with 3 size cards, 指定种子关卡 with a seed input). These E2E
// tests verify the wiring is end-to-end: clicking a procedural entry
// loads a generated maze, transitions the store to 'playing', and renders
// the 3D canvas — the same way a hand-crafted level does.
test.describe('procedural levels (P2-3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: '开始' }).click();
  });

  test('LevelSelect exposes 随机关卡 with three size cards (15/30/50)', async ({ page }) => {
    await expect(page.getByText('随机关卡')).toBeVisible();
    await expect(page.getByRole('button', { name: '15×15' })).toBeVisible();
    await expect(page.getByRole('button', { name: '30×30' })).toBeVisible();
    await expect(page.getByRole('button', { name: '50×50' })).toBeVisible();
  });

  test('clicking a 随机关卡 card loads a generated maze and starts the game', async ({ page }) => {
    // Pick the smallest size so the test is fast and the maze is walkable.
    await page.getByRole('button', { name: '15×15' }).click();
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    // HUD renders once the store flips to 'playing'. The Timer component is
    // a stable selector (role="timer" + the ⏱ glyph) and only mounts while
    // playing — searching for "血量" no longer works because the HealthBar
    // switched to heart glyphs in the P2-2 dark-mode pass.
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 5_000 });
  });

  test('指定种子关卡 section accepts a valid 16-hex seed and starts the game', async ({ page }) => {
    await expect(page.getByText('指定种子关卡')).toBeVisible();
    await page.getByLabel(/seed/i).fill('0123456789abcdef');
    await page.getByRole('button', { name: '开始' }).click();
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 5_000 });
  });

  test('指定种子关卡 with a non-hex seed does NOT start a game', async ({ page }) => {
    await page.getByLabel(/seed/i).fill('not-hex');
    await page.getByRole('button', { name: '开始' }).click();
    // We should still be on the level-select screen (no canvas rendered).
    await expect(page.getByText('随机关卡')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
