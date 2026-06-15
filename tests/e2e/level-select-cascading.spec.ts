import { test, expect } from '@playwright/test';

// P2-6: the LevelSelect is a single 4-way source dropdown (教学 / 随机关卡
// / 我的 / 指定种子关卡) with a unified start-button. Each source reveals
// a different control panel; switching to a different source hides the
// previous panel. This spec locks in the cascade so a future regression
// (e.g. accidentally un-gating the seed input or removing the start-
// button disable-on-invalid-seed behavior) is caught at the e2e layer.

test.describe('P2-6 level-select cascading source dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId('main-menu-start').click();
    // Sanity: the source dropdown and the unified start-button are
    // always visible (the dropdown is the new entry point; the start-
    // button is the single submit affordance).
    await expect(page.getByTestId('level-source-select')).toBeVisible();
    await expect(page.getByTestId('start-button')).toBeVisible();
  });

  test('teaching source is the default and shows the sublevel dropdown', async ({ page }) => {
    // Use Playwright's toHaveValue matcher (locator.value returns a Promise
    // in Playwright; reading the raw DOM property here is brittle).
    await expect(page.getByTestId('level-source-select')).toHaveValue('teaching');
    await expect(page.getByTestId('sublevel-select')).toBeVisible();
    // seed-input is hidden on teaching (the seed section is for the 'seed' source).
    await expect(page.getByTestId('seed-input')).toHaveCount(0);
  });

  test('switching to 随机关卡 reveals the size dropdown and hides sublevel + seed', async ({ page }) => {
    await page.getByTestId('level-source-select').selectOption('random');
    await expect(page.getByTestId('size-select')).toBeVisible();
    await expect(page.getByTestId('mode-select')).toBeVisible();
    // sublevel-select (used for teaching/custom) and seed-input are gone.
    await expect(page.getByTestId('sublevel-select')).toHaveCount(0);
    await expect(page.getByTestId('seed-input')).toHaveCount(0);
  });

  // P3-Theme home revamp regression: after page.reload(), the new
  // .home-shell styles appear to overlay the main-menu-start button
  // (or the URL state doesn't navigate back to / before reload
  // resolves). Mark fixme; root cause is in the home shell + reload
  // interaction, not in the source-switch logic itself.
  test('switching to 我的 reveals the sublevel dropdown (with custom levels)', async ({ page }) => {
    // Seed the level store with one custom level so the sublevel-select
    // is enabled (default empty state would render it disabled).
    await page.evaluate(() => {
      const id = 'custom-cascade-test';
      const w = 10;
      const d = 10;
      const walls = Array.from({ length: d }, () => Array.from({ length: w }, () => 0));
      const payload = {
        id,
        name: 'Cascade Test Level',
        size: { width: w, depth: d },
        cellSize: 2,
        start: { x: 0, z: 0 },
        exit: { x: w - 1, z: d - 1 },
        walls,
        pickups: [],
        enemies: [],
        rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
      };
      // Persist via the same localStorage key the level store reads.
      const raw = localStorage.getItem('maze3d.customLevels.v1');
      const store = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      store[id] = payload;
      localStorage.setItem('maze3d.customLevels.v1', JSON.stringify(store));
    });
    await page.reload();
    // After reload we're still on /levels from beforeEach. The test was
    // originally written assuming reload reset to /, but the URL persists
    // — navigate home first, then click the start button.
    await page.goto('/');
    await page.getByTestId('main-menu-start').click();
    await page.getByTestId('level-source-select').selectOption('custom');
    const sub = page.getByTestId('sublevel-select');
    await expect(sub).toBeVisible();
    await expect(sub).not.toBeDisabled();
    await expect(sub.locator('option', { hasText: 'Cascade Test Level' })).toHaveCount(1);
  });

  test('switching to 指定种子关卡 reveals the seed input + reuse button', async ({ page }) => {
    await page.getByTestId('level-source-select').selectOption('seed');
    await expect(page.getByTestId('seed-input')).toBeVisible();
    await expect(page.getByTestId('reuse-last-seed')).toBeVisible();
    // sublevel-select (used for teaching/custom) is hidden when source=seed.
    // size-select stays visible: the seed id encodes the size, so the user
    // still picks a size alongside their 16-hex seed.
    await expect(page.getByTestId('sublevel-select')).toHaveCount(0);
  });

  test('invalid hex seed disables the start-button (cascade gate)', async ({ page }) => {
    await page.getByTestId('level-source-select').selectOption('seed');
    await page.getByTestId('seed-input').fill('not-hex');
    const startBtn = page.getByTestId('start-button');
    await expect(startBtn).toBeDisabled();
    // Click anyway; must remain on the level-select screen.
    await startBtn.click({ force: true });
    await expect(page.getByTestId('level-select-root')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('valid hex seed enables the start-button and starts the game', async ({ page }) => {
    await page.getByTestId('level-source-select').selectOption('seed');
    await page.getByTestId('seed-input').fill('0123456789abcdef');
    const startBtn = page.getByTestId('start-button');
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    // Canvas + Timer are the canonical "we are in a maze" signals.
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 5_000 });
  });
});
