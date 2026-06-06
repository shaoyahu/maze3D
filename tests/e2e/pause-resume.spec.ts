import { test, expect } from '@playwright/test';

test('P toggles pause overlay', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始' }).click();
  await page.getByRole('button', { name: 'Test Corridor' }).click();
  await page.keyboard.press('KeyP');
  await expect(page.getByText('已暂停')).toBeVisible();
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.getByText('已暂停')).not.toBeVisible();
});
