import { test, expect, Page } from '@playwright/test';

// F-2026-06-30: P2-16 — end-to-end smoke test for the parchment
// map. The dev-server is shared with the rest of the E2E suite, so
// each test stands alone (no beforeEach) and localStorage is
// cleared at the top of every test.

async function freshPage(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

// F-2026-06-30: P2-16 — bypass the editor flow and inject a
// hand-crafted custom level directly into localStorage. Going
// through the editor's three-state minimap-mode picker is the
// longer route; this short-form gets us straight to a level that
// the engine will load with minimapMode: 'parchment' so the M
// key actually does something.
const CUSTOM_PARCHMENT_LEVEL = {
  schemaVersion: 1,
  level: {
    id: 'custom-parchment-smoke',
    name: 'Parchment Smoke',
    size: { width: 5, depth: 4 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 4, z: 3 },
    walls: [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ],
    pickups: [],
    rules: {
      initialTime: 60,
      maxHealth: 3,
      victory: 'reach-exit',
      timeOnPickup: 10,
      minimapMode: 'parchment',
    },
    enemies: [],
  },
};

async function injectCustomLevel(page: Page): Promise<void> {
  // F-2026-06-30: P2-16 — match the same localStorage key the
  // editor uses (`maze3d.customLevels.v1`). The shape is a record
  // keyed by level id; we use the prefix `custom-` to match the
  // provider's filter. A future change to the storage key would
  // also need to be reflected here.
  await page.evaluate((payload) => {
    const key = 'maze3d.customLevels.v1';
    const current = JSON.parse(localStorage.getItem(key) ?? '{}');
    current[payload.level.id] = payload;
    localStorage.setItem(key, JSON.stringify(current));
  }, CUSTOM_PARCHMENT_LEVEL);
}

test.describe('parchment map (P2-16)', () => {
  test('M key opens the parchment modal for a parchment-mode level', async ({ page }) => {
    await freshPage(page);
    await injectCustomLevel(page);
    // F-2026-06-30: P2-16 — navigate directly to the game route
    // with the custom level id. URL is the spec's source of truth
    // for level identity (CLAUDE.md §"URL is关卡身份的规范来源"),
    // so we don't need to round-trip through LevelSelect.
    await page.goto('/game?id=custom-parchment-smoke');
    // Pointer lock is required before input fires; the M key
    // listener is a document-level shortcut that fires regardless,
    // so we can dispatch without a pointer-locked canvas.
    await page.keyboard.press('KeyM');
    // F-2026-06-30: P2-16 — the modal mounts with data-testid
    // 'parchment-map'. The M key handler in GameCanvas is the
    // single entry point; if it's broken, the modal never appears.
    await expect(page.getByTestId('parchment-map')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('parchment-canvas')).toBeVisible();
    await expect(page.getByTestId('parchment-close')).toBeVisible();
  });

  test('ESC key closes the parchment modal', async ({ page }) => {
    await freshPage(page);
    await injectCustomLevel(page);
    await page.goto('/game?id=custom-parchment-smoke');
    await page.keyboard.press('KeyM');
    await expect(page.getByTestId('parchment-map')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('parchment-map')).toBeHidden({ timeout: 5000 });
  });

  test('M key is a no-op for a non-parchment level (top-right mode)', async ({ page }) => {
    // F-2026-06-30: P2-16 — the only safeguard that prevents the
    // M key from spuriously opening the modal in normal levels.
    // If this test ever fails, the per-level minimapMode guard
    // has regressed.
    const normalLevel = {
      ...CUSTOM_PARCHMENT_LEVEL,
      level: {
        ...CUSTOM_PARCHMENT_LEVEL.level,
        id: 'custom-normal-smoke',
        rules: { ...CUSTOM_PARCHMENT_LEVEL.level.rules, minimapMode: 'top-right' },
      },
    };
    await freshPage(page);
    await page.evaluate((payload) => {
      const key = 'maze3d.customLevels.v1';
      const current = JSON.parse(localStorage.getItem(key) ?? '{}');
      current[payload.level.id] = payload;
      localStorage.setItem(key, JSON.stringify(current));
    }, normalLevel);
    await page.goto('/game?id=custom-normal-smoke');
    await page.keyboard.press('KeyM');
    // F-2026-06-30: P2-16 — the modal should NEVER appear. We
    // wait briefly to allow any async M-key handler to fire,
    // then assert the modal is still absent.
    await page.waitForTimeout(500);
    await expect(page.getByTestId('parchment-map')).toBeHidden();
  });

  test('HUD shows the M-key hint when minimapMode is parchment', async ({ page }) => {
    await freshPage(page);
    await injectCustomLevel(page);
    await page.goto('/game?id=custom-parchment-smoke');
    await expect(page.getByTestId('hud-map-hint')).toBeVisible({ timeout: 5000 });
  });
});
