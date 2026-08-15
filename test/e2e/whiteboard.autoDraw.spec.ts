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

test('keeps an AutoDraw circle sketch unchanged until a candidate is chosen', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('whiteboard-autodraw-circle');

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
    await expect(board.locator('[data-whiteboard-draft-stroke="preview"]')).toHaveCount(0);
    const suggestions = board.locator('[data-whiteboard-autodraw-suggestions="true"]');
    await expect(suggestions).toBeVisible();
    await expect(suggestions.locator('[data-whiteboard-autodraw-candidate="ellipse"]')).toBeVisible();

    await page.mouse.up();

    const committedStroke = board.locator('[data-whiteboard-stroke]');
    await expect(committedStroke).toHaveCount(1);
    await expect(committedStroke.locator('[data-whiteboard-autoshape]')).toHaveCount(0);
    await expect(committedStroke.locator('[data-whiteboard-brush="pen"]')).toHaveCount(1);
    await expect(suggestions).toBeVisible();
    await expect(board.locator('[data-whiteboard-draft-stroke]')).toHaveCount(0);
    await expect(autoShapeButton).toHaveAttribute('aria-pressed', 'true');
    await expect(board.getByRole('button', { name: /^(Lasso|套索)$/ })).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});

test('combines multiple house strokes before applying a Board AutoDraw candidate', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('whiteboard-autodraw-house');

  try {
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.evaluate(() => (window as any).__vlainaE2E.setAppViewMode('whiteboard'));
    const board = page.locator('[data-whiteboard-active="true"]');
    await board.getByRole('button', { name: /^(Auto shape|自动形状)$/ }).click();
    const surfaceBox = await board.locator(':scope > div').first().boundingBox();
    expect(surfaceBox).not.toBeNull();
    const origin = { x: surfaceBox!.x + surfaceBox!.width / 2 - 90, y: surfaceBox!.y + surfaceBox!.height / 2 - 90 };

    await drawStroke(page, [
      { x: 0, y: 65 }, { x: 90, y: 0 }, { x: 180, y: 65 },
      { x: 180, y: 180 }, { x: 0, y: 180 }, { x: 0, y: 65 },
    ].map((point) => ({ x: origin.x + point.x, y: origin.y + point.y })));
    await drawStroke(page, [
      { x: 68, y: 180 }, { x: 68, y: 110 }, { x: 112, y: 110 }, { x: 112, y: 180 },
    ].map((point) => ({ x: origin.x + point.x, y: origin.y + point.y })));

    await expect(board.locator('[data-whiteboard-stroke]')).toHaveCount(2);
    const houseCandidate = board.locator('[data-whiteboard-autodraw-candidate="house"]');
    await expect(houseCandidate).toBeVisible();
    await houseCandidate.click();

    await expect(board.locator('[data-whiteboard-stroke]')).toHaveCount(0);
    await expect(board.locator('[data-whiteboard-element="true"] [data-whiteboard-autodraw-icon="house"]')).toHaveCount(1);
    await expect(board.locator('[data-whiteboard-autodraw-suggestions="true"]')).toHaveCount(0);
    await expect(board.getByRole('button', { name: /^(Lasso|套索)$/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(board.locator('[data-whiteboard-selection-move-target="true"]')).toBeVisible();

    await page.keyboard.press('Control+z');
    await expect(board.locator('[data-whiteboard-element="true"]')).toHaveCount(0);
    await expect(board.locator('[data-whiteboard-stroke]')).toHaveCount(2);
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});

test('moves only the pressed AutoDraw shape while another shape was selected', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('whiteboard-autodraw-move-preview');

  try {
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.evaluate(() => (window as any).__vlainaE2E.setAppViewMode('whiteboard'));
    const board = page.locator('[data-whiteboard-active="true"]');
    const surfaceBox = await board.locator(':scope > div').first().boundingBox();
    expect(surfaceBox).not.toBeNull();
    const firstCenter = { x: surfaceBox!.x + 600, y: surfaceBox!.y + 330 };
    const secondCenter = firstCenter;
    const firstRadius = 130;
    const secondRadius = 60;

    await board.getByRole('button', { name: /^(Auto shape|自动形状)$/ }).click();
    await startWobblyCircle(page, firstCenter, firstRadius);
    await page.mouse.up();
    await board.locator('[data-whiteboard-autodraw-candidate="ellipse"]').click();
    await board.getByRole('button', { name: /^(Auto shape|自动形状)$/ }).click();
    await startWobblyCircle(page, secondCenter, secondRadius);
    await page.mouse.up();
    await board.locator('[data-whiteboard-autodraw-candidate="ellipse"]').click();

    const shapes = board.locator('[data-whiteboard-stroke]');
    await expect(shapes).toHaveCount(2);
    await page.mouse.click(firstCenter.x + firstRadius, firstCenter.y);
    const selection = board.locator('[data-whiteboard-selection-move-target="true"]');
    await expect(selection).toBeVisible();
    await expect.poll(async () => (await selection.boundingBox())?.x ?? Infinity)
      .toBeLessThan(firstCenter.x);

    const firstBefore = await shapes.nth(0).boundingBox();
    const secondBefore = await shapes.nth(1).boundingBox();
    expect(firstBefore).not.toBeNull();
    expect(secondBefore).not.toBeNull();
    await page.mouse.move(secondCenter.x + secondRadius, secondCenter.y);
    await page.mouse.down();
    await page.mouse.move(secondCenter.x + secondRadius + 70, secondCenter.y + 35, { steps: 6 });

    await expect.poll(async () => (await shapes.nth(1).boundingBox())?.x ?? -Infinity)
      .toBeGreaterThan(secondBefore!.x + 50);
    const firstDuring = await shapes.nth(0).boundingBox();
    expect(firstDuring?.x).toBeCloseTo(firstBefore!.x, 0);
    expect(firstDuring?.y).toBeCloseTo(firstBefore!.y, 0);

    await page.mouse.up();
    const firstAfter = await shapes.nth(0).boundingBox();
    expect(firstAfter?.x).toBeCloseTo(firstBefore!.x, 0);
    expect(firstAfter?.y).toBeCloseTo(firstBefore!.y, 0);
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});

async function drawStroke(page: Page, points: Array<{ x: number; y: number }>) {
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 8 });
  await page.mouse.up();
}
