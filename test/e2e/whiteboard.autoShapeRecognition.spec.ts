import { expect, test, type Page } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
} from './notesE2E';

async function startWobblyCircle(page: Page, center: { x: number; y: number }, radius: number) {
  const points = Array.from({ length: 61 }, (_, index) => {
    const progress = index / 60;
    const angle = 0.1 + progress ** 1.35 * (Math.PI * 2 - 0.2);
    const wobble = radius * (Math.sin(angle * 3 + 0.4) * 0.055 + Math.sin(angle * 7) * 0.025);
    return {
      x: center.x + Math.sin(angle * 2) * 4 + Math.cos(angle) * (radius + wobble),
      y: center.y + Math.sin(angle) * (radius - wobble * 0.55),
    };
  });

  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y);
}

test('recognizes a circle drawn through the Board auto shape tool', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('whiteboard-autoshape-circle');

  try {
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.evaluate(() => (window as any).__vlainaE2E.setAppViewMode('whiteboard'));

    const board = page.locator('[data-whiteboard-active="true"]');
    await expect(board).toBeVisible();
    const autoShapeButton = board.getByRole('button', { name: /^(Auto shape|自动形状)$/ });
    await autoShapeButton.click();
    await expect(autoShapeButton).toHaveAttribute('aria-pressed', 'true');

    const surface = board.locator(':scope > div').first();
    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).not.toBeNull();
    await startWobblyCircle(page, {
      x: surfaceBox!.x + surfaceBox!.width / 2,
      y: surfaceBox!.y + surfaceBox!.height * 0.42,
    }, 110);

    await expect(board.locator('[data-whiteboard-draft-stroke="raw"] [data-whiteboard-brush="pen"]')).toHaveCount(1);
    const previewShape = board.locator('[data-whiteboard-draft-stroke="preview"] [data-whiteboard-autoshape="ellipse"]');
    await expect(previewShape).toHaveCount(1);
    await expect(previewShape.locator('path')).toHaveAttribute('stroke-width', '2.5');

    await page.mouse.up();

    const committedStroke = board.locator('[data-whiteboard-stroke]');
    await expect(committedStroke).toHaveCount(1);
    const committedShape = committedStroke.locator('[data-whiteboard-autoshape="ellipse"]');
    await expect(committedShape).toHaveCount(1);
    await expect(committedShape.locator('path')).toHaveAttribute('stroke-width', '2.5');
    await expect(committedStroke.locator('[data-whiteboard-brush="pen"]')).toHaveCount(0);
    await expect(board.locator('[data-whiteboard-draft-stroke]')).toHaveCount(0);
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});
