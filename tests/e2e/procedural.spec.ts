import { test, expect } from '@playwright/test';

// P2-3 FR-10 + P2-5 FR-13/16: the LevelSelect has two extra entries for
// procedural play (随机关卡 with a size dropdown, 指定种子关卡 with a seed
// input behind a 进阶 fold). These E2E tests verify the wiring is
// end-to-end: clicking a procedural entry loads a generated maze,
// transitions the store to 'playing', and renders the 3D canvas — the
// same way a hand-crafted level does.
test.describe('procedural levels (P2-3) + P2-5 UI revamp', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId('main-menu-start').click();
  });

  test('LevelSelect exposes a 迷宫尺寸 dropdown with three sizes (15/30/50)', async ({ page }) => {
    // P2-5: '<h3>随机关卡</h3>' and '<button>开始 ... 随机关卡</button>'
    // both contain the substring, so use getByRole('heading', ...) to
    // disambiguate.
    await expect(page.getByRole('heading', { name: '随机关卡' })).toBeVisible();
    const sizeSelect = page.getByTestId('size-select');
    await expect(sizeSelect).toBeVisible();
    // FR-16: 15/30/50 are the three procedurally-supported sizes.
    await expect(sizeSelect.locator('option', { hasText: '15×15' })).toHaveCount(1);
    await expect(sizeSelect.locator('option', { hasText: '30×30' })).toHaveCount(1);
    await expect(sizeSelect.locator('option', { hasText: '50×50' })).toHaveCount(1);
  });

  test('clicking a 随机关卡 card loads a generated maze and starts the game', async ({ page }) => {
    // Pick the smallest size so the test is fast and the maze is walkable.
    await page.getByTestId('size-select').selectOption('15');
    await page.getByRole('button', { name: /15×15 随机关卡/ }).click();
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
    // FR-13: seed input lives behind 进阶 fold — first click to expand.
    await page.getByTestId('advanced-toggle').click();
    await page.getByLabel(/seed/i).fill('0123456789abcdef');
    // P2-5: '开始 30×30 随机关卡' also contains '开始' as a prefix, so
    // scope to the seed section to avoid strict-mode ambiguity.
    await page.getByTestId('specified-seed-section').getByRole('button', { name: '开始' }).click();
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 5_000 });
  });

  test('指定种子关卡 with a non-hex seed does NOT start a game', async ({ page }) => {
    await page.getByTestId('advanced-toggle').click();
    await page.getByLabel(/seed/i).fill('not-hex');
    // P2-5: scope to the seed section (see note above).
    await page.getByTestId('specified-seed-section').getByRole('button', { name: '开始' }).click();
    // We should still be on the level-select screen (no canvas rendered).
    await expect(page.getByRole('heading', { name: '随机关卡' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
