import { test, expect } from '@playwright/test';

test('user can start a tiny level and reach the exit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始' }).click();
  // P2-6: source defaults to 'teaching', but the first sublevel in glob
  // order is `level-small` (initialTime 60, start (0,0)→exit (9,9) across
  // a 10x10 grid), not `level-tiny` (initialTime 30, start (0,1)→exit
  // (2,1) across an open 3x3 corridor). This test cares about the open
  // corridor, so pin the sublevel explicitly.
  await page.getByTestId('sublevel-select').selectOption('level-tiny');
  await page.getByTestId('start-button').click();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // level-tiny: start (0,1) -> exit (2,1), one step right reaches exit
  // 4m traversal at speed 3 m/s = ~1.4s; use 1600ms to be safe
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1600);
  await page.keyboard.up('KeyD');

  await expect(page.getByText('通关')).toBeVisible({ timeout: 5_000 });
});
