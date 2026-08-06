import { test, expect } from '@playwright/test';

// P2-3 FR-10 + P2-5 FR-13/16 + P2-6: the LevelSelect is a single 4-way
// source dropdown (教学 / 随机关卡 / 我的 / 指定种子关卡). The procedural
// tests below cover both procedural sources: 'random' (auto-generated
// seed + size) and 'seed' (user-typed 16-hex seed). These E2E tests
// verify the wiring is end-to-end: picking a procedural source and
// clicking start loads a generated maze, transitions the store to
// 'playing', and renders the 3D canvas — the same way a hand-crafted
// level does.
test.describe('procedural levels (P2-3) + P2-5 UI revamp + P2-6 cascading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId('main-menu-start').click();
  });

  test('LevelSelect exposes a 迷宫尺寸 dropdown with three sizes (15/30/50)', async ({ page }) => {
    // P2-6: switch the main source dropdown to 'random' to expose the
    // procedural size-select (default source is 'teaching').
    await page.getByTestId('level-source-select').selectOption('random');
    const sizeSelect = page.getByTestId('size-select');
    await expect(sizeSelect).toBeVisible();
    // FR-16: 15/30/50 are the three procedurally-supported sizes.
    await expect(sizeSelect.locator('option', { hasText: '15×15' })).toHaveCount(1);
    await expect(sizeSelect.locator('option', { hasText: '30×30' })).toHaveCount(1);
    await expect(sizeSelect.locator('option', { hasText: '50×50' })).toHaveCount(1);
  });

  test('clicking start on the random source loads a generated maze and starts the game', async ({ page }) => {
    // P2-6: switch source to 'random', pick the smallest size for a fast
    // walkable maze, then click the unified start-button.
    await page.getByTestId('level-source-select').selectOption('random');
    await page.getByTestId('size-select').selectOption('15');
    await page.getByTestId('start-button').click();
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    // HUD renders once the store flips to 'playing'. The Timer component is
    // a stable selector (role="timer" + the ⏱ glyph) and only mounts while
    // playing — searching for "血量" no longer works because the HealthBar
    // switched to heart glyphs in the P2-2 dark-mode pass.
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 5_000 });
  });

  test('指定种子关卡 source accepts a valid 16-hex seed and starts the game', async ({ page }) => {
    // P2-6: the 进阶 fold is gone — the seed section is open by default
    // when the source dropdown is set to 'seed'. The seed-input also
    // carries a stable testid now, so we use that directly.
    await page.getByTestId('level-source-select').selectOption('seed');
    await page.getByTestId('seed-input').fill('0123456789abcdef');
    // P2-6: a single unified start-button drives every source — no need
    // to scope by section.
    await page.getByTestId('start-button').click();
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 5_000 });
  });

  test('指定种子关卡 with a non-hex seed does NOT start a game', async ({ page }) => {
    // P2-6: same new source-switch + seed-input path as the previous test.
    await page.getByTestId('level-source-select').selectOption('seed');
    await page.getByTestId('seed-input').fill('not-hex');
    // P2-6: validation failure now disables the start-button (see FR-20),
    // so the click is a no-op. The button is the assertion target.
    const startBtn = page.getByTestId('start-button');
    await expect(startBtn).toBeDisabled();
    // We should still be on the level-select screen (no canvas rendered).
    await expect(page.getByTestId('level-select-root')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  // P2-19: the seed source exposes an algorithm <select> with 8 options
  // (4 P2-3 + 4 new in P2-19). Picking Eller and starting the game
  // must round-trip through encodeSeed → AlgorithmMazeProvider.load →
  // generateEller → walls. The 3D canvas is the smoke check; the unit
  // tests cover the generator itself.
  test('指定种子关卡 with Eller algorithm loads and starts the game', async ({ page }) => {
    await page.getByTestId('level-source-select').selectOption('seed');
    await page.getByTestId('algorithm-select').selectOption('eller');
    await page.getByTestId('seed-input').fill('0123456789abcdef');
    await page.getByTestId('start-button').click();
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 5_000 });
  });

  // P2-20: extended the algorithm <select> to 12. Recursive Division is
  // a particularly distinct visual style (room-based partitions), so we
  // smoke-test it here to confirm the new generator wires through the
  // UI → provider → renderer pipeline end-to-end.
  test('指定种子关卡 with Recursive Division algorithm loads and starts the game', async ({ page }) => {
    await page.getByTestId('level-source-select').selectOption('seed');
    await page.getByTestId('algorithm-select').selectOption('recursive-division');
    await page.getByTestId('seed-input').fill('0123456789abcdef');
    await page.getByTestId('start-button').click();
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 5_000 });
  });

  // P2-21: extended the algorithm <select> to 15 (full jamisbuck
  // coverage). Houston is the AB+Wilson's hybrid; smoke-test it here
  // to confirm the new generator wires through the UI → provider →
  // renderer pipeline end-to-end. The other 2 new algorithms
  // ('growing-binary-tree' and 'blobby-recursive-division') are covered
  // by their unit tests; one E2E for Houston is enough to catch the
  // typical wiring regression.
  test('指定种子关卡 with Houston algorithm loads and starts the game', async ({ page }) => {
    await page.getByTestId('level-source-select').selectOption('seed');
    await page.getByTestId('algorithm-select').selectOption('houston');
    await page.getByTestId('seed-input').fill('0123456789abcdef');
    await page.getByTestId('start-button').click();
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 5_000 });
  });
});
