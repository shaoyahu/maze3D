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
    // grid layout
    const display = await root.evaluate((el) => window.getComputedStyle(el).display);
    expect(display).toBe('grid');
  });

  test('switching mode to 存活模式 reveals enemy / survive / progressive', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('main-menu-start').click();
    await page.getByTestId('mode-select').selectOption('survive');
    await expect(page.getByTestId('enemy-count-select')).toBeVisible();
    await expect(page.getByTestId('survive-seconds-select')).toBeVisible();
    await expect(page.getByTestId('progressive-spawn')).toBeVisible();
  });

  test('reaching-exit mode shows 当前模式无敌人 placeholder', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('main-menu-start').click();
    await page.getByTestId('mode-select').selectOption('reach-exit');
    await expect(page.getByText(/当前模式无敌人/)).toBeVisible();
  });

  test('进阶 ▾ reveals the seed input; second click hides it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('main-menu-start').click();
    await expect(page.getByLabel(/seed/i)).toHaveCount(0);
    await page.getByTestId('advanced-toggle').click();
    await expect(page.getByLabel(/seed/i)).toBeVisible();
    await page.getByTestId('advanced-toggle').click();
    await expect(page.getByLabel(/seed/i)).toHaveCount(0);
  });
});
