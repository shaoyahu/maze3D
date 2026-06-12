import { test, expect } from '@playwright/test';

test.describe('P2-5 UI revamp', () => {
  test('main menu has a scene backdrop and translucent panel', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu-scene')).toBeVisible();
    await expect(page.getByTestId('main-menu-panel')).toBeVisible();
  });

  test('clicking 开始 routes to level select with two-column layout', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('main-menu-start').click();
    const root = page.getByTestId('level-select-root');
    await expect(root).toBeVisible();
    // P2-6: level-select-root switched from CSS grid to flex column layout
    // (the inner <div> still uses grid for the procedural-controls fieldset
    // contents, but the root container itself is a flex column for stacking
    // the source dropdown / sublevel-select / fieldset / seed section /
    // custom-levels-group / start-button). The "two-column" intent of the
    // test is preserved by the grid inside the fieldset; here we only assert
    // the root's stacked layout.
    const display = await root.evaluate((el) => window.getComputedStyle(el).display);
    expect(display).toBe('flex');
  });

  test('switching mode to 存活模式 reveals enemy / survive / progressive', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('main-menu-start').click();
    // P2-6: default source is 'teaching'; switch to 'random' to expose
    // the procedural mode + size + start controls.
    await page.getByTestId('level-source-select').selectOption('random');
    await page.getByTestId('mode-select').selectOption('survive');
    await expect(page.getByTestId('enemy-count-select')).toBeVisible();
    // P2-6: survive-seconds-select was replaced by a free <input> (range
    // 10..600) + 4 chip presets (30/60/90/120). Assert the input is
    // visible to confirm the new control is wired up.
    await expect(page.getByTestId('survive-seconds-input')).toBeVisible();
    await expect(page.getByTestId('progressive-spawn')).toBeVisible();
  });

  test('reaching-exit mode shows 当前模式无敌人 placeholder', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('main-menu-start').click();
    // P2-6: see note in the previous test re: source switch.
    await page.getByTestId('level-source-select').selectOption('random');
    await page.getByTestId('mode-select').selectOption('reach-exit');
    await expect(page.getByText(/当前模式无敌人/)).toBeVisible();
  });

  // P2-6 REMOVED the 进阶 fold that P2-5 used to gate the seed input.
  // The new gating mechanism is the 4-way source dropdown: switching
  // to the 种子 source reveals the seed input, and switching to any
  // other source hides it. That replacement is covered in the new
  // tests/e2e/level-select-cascading.spec.ts spec; this test is kept
  // here (skipped + JIRA-style reason per T7 spec) so the removal is
  // visible in the test history.
  test.skip('进阶 ▾ reveals the seed input; second click hides it (P2-6 removed 进阶 fold; see level-select-cascading.spec.ts)', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('main-menu-start').click();
    await expect(page.getByLabel(/seed/i)).toHaveCount(0);
    await page.getByTestId('advanced-toggle').click();
    await expect(page.getByLabel(/seed/i)).toBeVisible();
    await page.getByTestId('advanced-toggle').click();
    await expect(page.getByLabel(/seed/i)).toHaveCount(0);
  });
});
