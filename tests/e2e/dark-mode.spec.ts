import { test, expect } from '@playwright/test';

test('toggling darkMode flips data-theme on documentElement', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Open settings from main menu
  await page.getByRole('button', { name: '设置' }).click();

  // Light mode default: data-theme not set
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(before).toBeUndefined();

  // Toggle dark mode on
  await page.getByLabel('深色模式').check();
  const afterOn = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(afterOn).toBe('dark');

  // Toggle dark mode off — attribute should be removed
  await page.getByLabel('深色模式').uncheck();
  const afterOff = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(afterOff).toBeUndefined();
});
