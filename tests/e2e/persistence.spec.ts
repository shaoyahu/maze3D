import { test, expect } from '@playwright/test';

test('best record persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole('button', { name: '开始' }).click();
  await page.getByRole('button', { name: 'Test Corridor' }).click();
  // P2-5: wait for the canvas to mount + InputManager listener to attach
  // before sending keys. Same pattern as play-through.spec.ts.
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
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
  // P2-5: same canvas-mount wait as the first playthrough.
  await expect(page.locator('canvas')).toBeVisible();
  await page.keyboard.press('KeyP');
  await expect(page.getByText(/历史最佳/)).toBeVisible();
});
