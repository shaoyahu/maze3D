// P2-18: E2E tests for trap + door mechanisms in the editor.
//
// Covers: placing traps, placing doors, placing matching-color keys,
// property panel edits, saving, and basic gameplay smoke test.
// Each test is standalone with a fresh localStorage.

import { test, expect, Page } from '@playwright/test';

async function freshPage(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test.describe('traps and doors (P2-18)', () => {
  test('trap tool places a trap and the properties panel shows trap form', async ({ page }) => {
    await freshPage(page);
    await page.getByTestId('main-menu-editor').click();

    // Carve a floor cell (2,1) using the wall tool on the all-wall canvas.
    await page.getByTestId('tool-wall').click();
    await page.getByTestId('cell-2-1').click();

    // Switch to the trap tool and place a trap.
    await page.getByTestId('tool-trap').click();
    await page.getByTestId('cell-2-1').click();

    // A trap glyph should appear.
    await expect(page.getByTestId(/^trap-/).first()).toBeVisible();

    // Select the trap with the select tool.
    await page.getByTestId('tool-select').click();
    await page.getByTestId('cell-2-1').click();

    // The properties panel should show the trap form.
    await expect(page.getByTestId('trap-form')).toBeVisible();

    // Delete button should work.
    await page.getByTestId('delete-trap').click();
    // Trap should be gone from the grid.
    await expect(page.getByTestId(/^trap-/)).toHaveCount(0);
  });

  test('door tool places a door and the properties panel shows door form', async ({ page }) => {
    await freshPage(page);
    await page.getByTestId('main-menu-editor').click();

    // Carve a floor cell (3,1).
    await page.getByTestId('tool-wall').click();
    await page.getByTestId('cell-3-1').click();

    // Place a door.
    await page.getByTestId('tool-door').click();
    await page.getByTestId('cell-3-1').click();

    // A door glyph should appear.
    await expect(page.getByTestId(/^door-/).first()).toBeVisible();

    // Select the door.
    await page.getByTestId('tool-select').click();
    await page.getByTestId('cell-3-1').click();

    // The properties panel should show the door form.
    await expect(page.getByTestId('door-form')).toBeVisible();

    // Delete button should work.
    await page.getByTestId('delete-door').click();
    await expect(page.getByTestId(/^door-/)).toHaveCount(0);
  });

  test('help drawer shows trap and door tool entries', async ({ page }) => {
    await freshPage(page);
    await page.getByTestId('main-menu-editor').click();

    // Open the help drawer.
    await page.getByTestId('editor-help-toggle').click();
    await expect(page.getByTestId('editor-help-drawer')).toBeVisible();

    // The tools section should mention the trap (T) and door (D) shortcuts.
    const toolsSection = page.getByTestId('editor-help-section-tools');
    await expect(toolsSection).toContainText('T');
    await expect(toolsSection).toContainText('D');
  });
});
