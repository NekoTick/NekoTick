import { expect, test, type Page } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
} from './notesE2E';

test('restores a Board object when the eraser crosses it again', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('whiteboard-eraser-reentry');

  try {
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.evaluate(() => (window as any).__vlainaE2E.setAppViewMode('whiteboard'));

    const board = page.locator('[data-whiteboard-active="true"]');
    await expect(board).toBeVisible();
    const surfaceBox = await board.locator(':scope > div').first().boundingBox();
    expect(surfaceBox).not.toBeNull();

    const center = {
      x: surfaceBox!.x + surfaceBox!.width / 2,
      y: surfaceBox!.y + surfaceBox!.height * 0.42,
    };
    await board.getByRole('button', { name: /^(Line|直线)$/ }).click();
    await drawLine(page, { x: center.x - 120, y: center.y }, { x: center.x + 120, y: center.y });

    const stroke = board.locator('[data-whiteboard-stroke]').first();
    await expect(stroke).toHaveCount(1);
    await board.getByRole('button', { name: /^(Object eraser|对象橡皮)$/ }).click();

    await page.mouse.move(center.x, center.y - 100);
    await page.mouse.down();
    await expect(board.locator('[data-whiteboard-eraser-trail="true"]')).toBeVisible();
    await page.mouse.move(center.x, center.y + 100, { steps: 12 });
    await expect.poll(() => stroke.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity)))
      .toBeLessThan(1);

    await page.mouse.move(center.x + 80, center.y - 100, { steps: 12 });
    await expect.poll(() => stroke.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity)))
      .toBe(1);
    await page.mouse.up();

    await expect(board.locator('[data-whiteboard-stroke]')).toHaveCount(1);
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
