import { test, expect } from '@playwright/test';

// P2-8: language switch UX. Three flows to lock in:
//   1. Settings page exposes a "中文 / English" toggle
//   2. Clicking English flips the Settings title immediately
//      (and the main menu hero on navigation back to /)
//   3. Reload after switching to English keeps English
//      (the new language is persisted in maze3d.settings.v1)

test.describe('P2-8 language switch', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('settings page exposes the locale toggle with default zh', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByTestId('locale-zh')).toBeVisible();
    await expect(page.getByTestId('locale-en')).toBeVisible();
    await expect(page.getByText('设置', { exact: true }).first()).toBeVisible();
  });

  test('switching to English re-renders Settings and main menu in English', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();
    await page.getByTestId('locale-en').click({ force: true });
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: '3D Maze' })).toBeVisible();
  });

  test('reload after switching to English keeps English (persistence)', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();
    await page.getByTestId('locale-en').click({ force: true });
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByRole('heading', { name: '3D Maze' })).toBeVisible();
  });

  test('switching back to zh restores Chinese', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();
    await page.getByTestId('locale-en').click({ force: true });
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByTestId('locale-zh').click({ force: true });
    await expect(page.getByText('设置', { exact: true }).first()).toBeVisible();
  });
});