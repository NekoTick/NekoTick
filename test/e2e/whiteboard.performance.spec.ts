import { expect, test, type Page } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  startMainThreadFrameProbe,
  stopMainThreadFrameProbe,
} from './notesE2E';

test('keeps live AutoDraw responsive during a dense stroke', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('whiteboard-autodraw-performance');

  try {
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.evaluate(() => (window as any).__vlainaE2E.setAppViewMode('whiteboard'));

    const board = page.locator('[data-whiteboard-active="true"]');
    await expect(board).toBeVisible();
    await board.getByRole('button', { name: /^(Auto shape|自动形状)$/ }).click();
    const surfaceBox = await board.locator(':scope > div').first().boundingBox();
    expect(surfaceBox).not.toBeNull();

    const center = {
      x: surfaceBox!.x + surfaceBox!.width / 2,
      y: surfaceBox!.y + surfaceBox!.height * 0.44,
    };
    const points = createDenseLoop(center, 125, 180);
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    await startMainThreadFrameProbe(page, '__whiteboardAutoDrawFrameProbe');

    for (const point of points.slice(1)) {
      await moveOnNextFrame(page, point);
    }
    await page.mouse.up();

    await expect(board.locator('[data-whiteboard-stroke]')).toHaveCount(1);
    await expect(board.locator('[data-whiteboard-selection-move-target="true"]')).toBeVisible();
    const metrics = await stopMainThreadFrameProbe(page, '__whiteboardAutoDrawFrameProbe');
    console.info('whiteboard live AutoDraw frame metrics', metrics);

    expect(metrics.frameCount).toBeGreaterThanOrEqual(150);
    expect(metrics.p95FrameMs).toBeLessThan(40);
    expect(metrics.maxFrameMs).toBeLessThan(100);
    expect(metrics.longFramesOver100).toBe(0);
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});

function createDenseLoop(
  center: { x: number; y: number },
  radius: number,
  pointCount: number,
) {
  return Array.from({ length: pointCount }, (_, index) => {
    const angle = Math.PI * 2 * index / (pointCount - 1);
    const wobble = Math.sin(angle * 7) * 7;
    return {
      x: center.x + Math.cos(angle) * (radius + wobble),
      y: center.y + Math.sin(angle) * (radius - wobble),
    };
  });
}

async function moveOnNextFrame(page: Page, point: { x: number; y: number }) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.mouse.move(point.x, point.y);
}
