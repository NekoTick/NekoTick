import { expect, test, type Page } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
} from './notesE2E';

test('changes the color of a selected line from the bottom toolbar', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('whiteboard-selection-line-color');

  try {
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.evaluate(() => (window as any).__vlainaE2E.setAppViewMode('whiteboard'));

    const board = page.locator('[data-whiteboard-active="true"]');
    await expect(board).toBeVisible();
    const surface = board.locator(':scope > div').first();
    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).not.toBeNull();

    await board.getByRole('button', { name: /^(Line|直线)$/ }).click();
    await drawLine(page, {
      x: surfaceBox!.x + 420,
      y: surfaceBox!.y + 320,
    }, {
      x: surfaceBox!.x + 650,
      y: surfaceBox!.y + 320,
    });

    const colorControl = board.locator('[data-whiteboard-selection-color-control="true"]');
    await expect(colorControl).toBeVisible();
    expect(await colorControl.evaluate((node) => Boolean(node.closest('[data-whiteboard-main-toolbar="true"]')))).toBe(true);
    await colorControl.locator('[data-whiteboard-color-trigger="true"]').click();
    const picker = page.getByRole('dialog');
    await expect(picker).toBeVisible();
    const originalColor = await board.locator('[data-whiteboard-stroke] path').first().getAttribute('stroke');
    await picker.locator('[data-whiteboard-common-colors="true"] button[aria-label="#ff5b61"]').click();
    await expect.poll(async () => (
      (await board.locator('[data-whiteboard-stroke] path').first().getAttribute('stroke'))?.toLowerCase()
    )).toBe('#ff5b61');
    await picker.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
    await expect.poll(async () => (
      (await board.locator('[data-whiteboard-stroke] path').first().getAttribute('stroke'))?.toLowerCase()
    )).toBe(originalColor?.toLowerCase());

    await colorControl.locator('[data-whiteboard-color-trigger="true"]').click();
    await expect(picker).toBeVisible();
    await picker.locator('[data-whiteboard-common-colors="true"] button[aria-label="#ff5b61"]').click();
    await picker.getByRole('button', { name: /^(Apply|应用)$/ }).click();

    await expect(colorControl.locator('[data-whiteboard-applied-color="true"]'))
      .toHaveCSS('background-color', 'rgb(255, 91, 97)');
    await expect.poll(async () => board.locator('[data-whiteboard-stroke] path').evaluateAll(
      (paths) => paths.map((path) => path.getAttribute('stroke')?.toLowerCase()),
    )).toContain('#ff5b61');

    await page.keyboard.press('Control+z');
    await expect.poll(async () => board.locator('[data-whiteboard-stroke] path').evaluateAll(
      (paths) => paths.map((path) => path.getAttribute('stroke')?.toLowerCase()),
    )).toContain('#000000');
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});

test('changes the color of an existing pen stroke after selecting it again', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('whiteboard-selection-existing-pen-color');

  try {
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.evaluate(() => (window as any).__vlainaE2E.setAppViewMode('whiteboard'));

    const board = page.locator('[data-whiteboard-active="true"]');
    await expect(board).toBeVisible();
    const surface = board.locator(':scope > div').first();
    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).not.toBeNull();

    await board.getByRole('button', { name: /^(Pen|钢笔)$/ }).click();
    const start = { x: surfaceBox!.x + 420, y: surfaceBox!.y + 320 };
    const end = { x: surfaceBox!.x + 650, y: surfaceBox!.y + 350 };
    await drawLine(page, start, end);

    await board.getByRole('button', { name: /^(Lasso|套索)$/ }).click();
    await page.mouse.click(surfaceBox!.x + 120, surfaceBox!.y + 120);
    await expect(board.locator('[data-whiteboard-selection-color-control="true"]')).toHaveCount(0);

    await page.mouse.click((start.x + end.x) / 2, (start.y + end.y) / 2);
    const colorControl = board.locator('[data-whiteboard-selection-color-control="true"]');
    await expect(colorControl).toBeVisible();
    expect(await colorControl.evaluate((node) => Boolean(node.closest('[data-whiteboard-main-toolbar="true"]')))).toBe(true);
    const originalColor = await board.locator('[data-whiteboard-stroke] path').first().getAttribute('stroke');
    expect(originalColor).toBeTruthy();

    await colorControl.locator('[data-whiteboard-color-trigger="true"]').click();
    const picker = page.getByRole('dialog');
    await expect(picker).toBeVisible();
    await picker.locator('[data-whiteboard-common-colors="true"] button[aria-label="#ff5b61"]').click();
    await picker.getByRole('button', { name: /^(Apply|应用)$/ }).click();
    await expect.poll(async () => (
      (await board.locator('[data-whiteboard-stroke] path').first().getAttribute('stroke'))?.toLowerCase()
    )).toBe('#ff5b61');

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (
      (await board.locator('[data-whiteboard-stroke] path').first().getAttribute('stroke'))?.toLowerCase()
    )).toBe(originalColor?.toLowerCase());
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});

async function drawLine(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}
