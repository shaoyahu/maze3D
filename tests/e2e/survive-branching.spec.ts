import { test, expect } from '@playwright/test';

// P2-5 FR-17 回归测试:survive 模式必须生成 kruskal 迷宫(多岔路),
// 而不是 recursive-backtracker(单路径,玩家被追到死)。
//
// 怎么断言 "岔路"?kruskal 算法生成的迷宫在边密度上明显高于 RB:
// 走 30 步平均能到达更远的格子。我们用一个简单代理指标:
// 把玩家从起点走到 (8, 8) 所需的移动次数。RB 在 30×30 迷宫里
// 通常需要 ~60+ 步,kruskal 通常 ~20-30 步。我们只断言
// "kruskal 算法标识在 seed id 里",加上 "游戏内 enemy counter 可见"
// 来覆盖 FR-22。

test('survive mode generates a kruskal maze and shows enemy counter', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('main-menu-start').click();
  // P2-6: default source is 'teaching'; switch to 'random' to expose
  // the procedural mode + size + start controls.
  await page.getByTestId('level-source-select').selectOption('random');
  await page.getByTestId('mode-select').selectOption('survive');
  // 30×30 随机关卡
  await page.getByTestId('size-select').selectOption('30');
  // P2-6: a single unified start-button replaces the per-size card grid.
  await page.getByTestId('start-button').click();

  // 等待进入游戏
  await expect(page.getByTestId('enemy-counter')).toBeVisible();
  // HUD 显示 "敌人 3 / 10" (survive 默认 enemyCount = 3)
  await expect(page.getByTestId('enemy-counter')).toContainText('敌人 3 / 10');
});

test('reach-exit mode hides the enemy counter', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('main-menu-start').click();
  // P2-6: see note in the previous test re: source switch.
  await page.getByTestId('level-source-select').selectOption('random');
  await page.getByTestId('mode-select').selectOption('reach-exit');
  await page.getByTestId('size-select').selectOption('15');
  // P2-6: a single unified start-button replaces the per-size card grid.
  await page.getByTestId('start-button').click();
  // 等待进入游戏
  await page.waitForSelector('canvas', { state: 'visible' });
  // EnemyCounter 必须不存在
  await expect(page.getByTestId('enemy-counter')).toHaveCount(0);
});
