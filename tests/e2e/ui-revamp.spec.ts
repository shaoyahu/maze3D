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

  // F-project-review-2026-06-13-C-H3: the P2-6 进阶 ▾ fold test was
  // skipped because P2-6 replaced the fold with a 4-way source dropdown.
  // The replacement behavior (seed input reveals on 种子 source) is
  // covered by tests/e2e/level-select-cascading.spec.ts. Per the
  // review's mitigation, this stale skip is deleted (the new spec
  // already exercises the same user-facing behavior).
});
