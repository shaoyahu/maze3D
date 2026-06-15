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

  // Toggle dark mode on. The dark-mode switch is a custom <input> wrapped
  // by a `.console-switch__track` overlay; `.check()` hits the overlay
  // span instead of the input, which silently no-ops. Click the input
  // directly via its accessible name (the aria-label still resolves to
  // '深色模式' under the default 'zh' locale).
  await page.getByLabel('深色模式').click({ force: true });
  const afterOn = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(afterOn).toBe('dark');

  // Toggle dark mode off — attribute should be removed
  await page.getByLabel('深色模式').click({ force: true });
  const afterOff = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(afterOff).toBeUndefined();
});
