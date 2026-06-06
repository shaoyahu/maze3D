import { test, expect } from '@playwright/test';

test('best record persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole('button', { name: '开始' }).click();
  await page.getByRole('button', { name: 'Test Corridor' }).click();
  // 4m traversal at speed 3 m/s = ~1.4s; use 1600ms to be safe
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1600);
  await page.keyboard.up('KeyD');
  await expect(page.getByText('通关')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('新纪录')).toBeVisible();

  await page.getByRole('button', { name: '返回主菜单' }).click();
  await page.reload();
  await page.getByRole('button', { name: '开始' }).click();
  await page.getByRole('button', { name: 'Test Corridor' }).click();
  await page.keyboard.press('KeyP');
  await expect(page.getByText(/历史最佳/)).toBeVisible();
});
