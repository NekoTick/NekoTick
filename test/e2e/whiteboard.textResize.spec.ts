import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
} from './notesE2E';

test('renders handwritten Board text and resizes it proportionally', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('whiteboard-text-resize');

  try {
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.evaluate(() => (window as any).__vlainaE2E.setAppViewMode('whiteboard'));
    await waitForWhiteboardBoardReady(page);

    const board = page.locator('[data-whiteboard-active="true"]');
    await expect(board).toBeVisible();
    await board.getByRole('button', { name: /^(Text|文本)$/ }).click();

    const surface = board.locator(':scope > div').first();
    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).not.toBeNull();
    await page.mouse.click(surfaceBox!.x + 420, surfaceBox!.y + 300);

    const editor = board.locator('[data-whiteboard-text-editor="true"]');
    await expect(editor).toBeFocused();
    await editor.fill('Board 手写');
    await editor.press('Control+Enter');

    const text = board.locator('[data-whiteboard-text="true"]');
    await expect(text).toHaveText('Board 手写');
    await expect.poll(() => text.evaluate((node) => ({
      excalifontReady: document.fonts.check('24px Excalifont', 'Board'),
      fontFamily: getComputedStyle(node).fontFamily,
      text: node.textContent,
      xiaolaiReady: document.fonts.check('24px Xiaolai', '手写'),
    }))).toMatchObject({
      excalifontReady: true,
      fontFamily: expect.stringContaining('Excalifont'),
      text: 'Board 手写',
      xiaolaiReady: true,
    });
    await expect.poll(() => text.evaluate((node) => {
      const context = document.createElement('canvas').getContext('2d')!;
      const style = getComputedStyle(node);
      context.font = `${style.fontSize} ${style.fontFamily}`;
      return Math.abs(node.parentElement!.getBoundingClientRect().width - context.measureText(node.textContent ?? '').width);
    })).toBeLessThan(1);

    const before = await getTextGeometry(text);
    const southeastHandle = board.locator('[data-whiteboard-selection-resize-handle="se"]');
    const southeastCenter = await getLocatorCenter(southeastHandle);
    await page.mouse.move(southeastCenter.x, southeastCenter.y);
    await page.mouse.down();
    await page.mouse.move(southeastCenter.x + 120, southeastCenter.y + 80);
    await expect.poll(async () => (await getTextGeometry(text)).fontSize).toBeGreaterThan(before.fontSize);
    const preview = await getTextGeometry(text);
    const selectionPreview = await getSelectionGeometry(board);
    await page.mouse.up();
    await expect.poll(async () => getTextGeometry(text)).toEqual(preview);
    await expect.poll(async () => getSelectionGeometry(board)).toEqual(selectionPreview);

    const expectedScale = Math.max(
      (before.width + 120) / before.width,
      (before.height + 80) / before.height,
    );
    const widthScale = preview.width / before.width;
    expect(widthScale).toBeCloseTo(expectedScale, 2);
    expect(preview.height / before.height).toBeCloseTo(widthScale, 2);
    expect(preview.fontSize / before.fontSize).toBeCloseTo(widthScale, 2);
    expect(preview.transform).toBe('none');
    await expect(board.locator('[data-whiteboard-selection-resize-handle]')).toHaveCount(4);

    const northwestCenter = await getLocatorCenter(
      board.locator('[data-whiteboard-selection-resize-handle="nw"]'),
    );
    await page.mouse.move(northwestCenter.x, northwestCenter.y);
    await page.mouse.down();
    await page.mouse.move(
      northwestCenter.x + preview.width / 2,
      northwestCenter.y + preview.height / 2,
    );
    await expect.poll(async () => (await getTextGeometry(text)).fontSize).toBeLessThan(preview.fontSize);
    const shrinkPreview = await getTextGeometry(text);
    const shrinkSelectionPreview = await getSelectionGeometry(board);
    await page.mouse.up();
    await expect.poll(async () => getTextGeometry(text)).toEqual(shrinkPreview);
    await expect.poll(async () => getSelectionGeometry(board)).toEqual(shrinkSelectionPreview);
    expect(shrinkPreview.width / preview.width).toBeCloseTo(0.5, 2);
    expect(shrinkPreview.height / preview.height).toBeCloseTo(0.5, 2);
    expect(shrinkPreview.fontSize / preview.fontSize).toBeCloseTo(0.5, 2);

    const beforeCross = await getSelectionGeometry(board);
    const crossHandleCenter = await getLocatorCenter(
      board.locator('[data-whiteboard-selection-resize-handle="se"]'),
    );
    await page.mouse.move(crossHandleCenter.x, crossHandleCenter.y);
    await page.mouse.down();
    await page.mouse.move(crossHandleCenter.x - beforeCross.width * 2, crossHandleCenter.y);
    await expect.poll(async () => (await getTextGeometry(text)).x).toBeLessThan(shrinkPreview.x);
    const crossPreview = await getTextGeometry(text);
    const crossSelectionPreview = await getSelectionGeometry(board);
    await page.mouse.up();
    await expect.poll(async () => getTextGeometry(text)).toEqual(crossPreview);
    await expect.poll(async () => getSelectionGeometry(board)).toEqual(crossSelectionPreview);
    expect(crossPreview.fontSize).toBeCloseTo(shrinkPreview.fontSize, 2);
    expect(crossPreview.contentX + crossPreview.contentWidth / 2)
      .toBeCloseTo(crossPreview.x + crossPreview.width / 2, 2);
    expect(crossPreview.contentY + crossPreview.contentHeight / 2)
      .toBeCloseTo(crossPreview.y + crossPreview.height / 2, 2);
    expect(crossPreview.contentX).toBeGreaterThanOrEqual(crossPreview.x);
    expect(crossPreview.contentY).toBeGreaterThanOrEqual(crossPreview.y);
    expect(crossPreview.contentX + crossPreview.contentWidth)
      .toBeLessThanOrEqual(crossPreview.x + crossPreview.width);
    expect(crossPreview.contentY + crossPreview.contentHeight)
      .toBeLessThanOrEqual(crossPreview.y + crossPreview.height);
    expect(crossPreview.contentWidth / crossPreview.width).toBeGreaterThan(0.95);
    expect(crossPreview.contentHeight / crossPreview.height).toBeGreaterThan(0.9);

    const selection = await getSelectionGeometry(board);
    const rotationCenter = await getLocatorCenter(
      board.locator('[data-whiteboard-selection-rotation-handle="true"]'),
    );
    const selectionCenter = {
      x: selection.x + selection.width / 2,
      y: selection.y + selection.height / 2,
    };
    await page.mouse.move(rotationCenter.x, rotationCenter.y);
    await page.mouse.down();
    await page.mouse.move(selectionCenter.x + 50, selectionCenter.y - 50);
    await page.mouse.up();
    await expect.poll(async () => (await getTextGeometry(text)).rotation).not.toBe('none');

    const rotated = await getTextGeometry(text);
    const rotatedSoutheastCenter = await getLocatorCenter(
      board.locator('[data-whiteboard-selection-resize-handle="se"]'),
    );
    await page.mouse.move(rotatedSoutheastCenter.x, rotatedSoutheastCenter.y);
    await page.mouse.down();
    await page.mouse.move(rotatedSoutheastCenter.x + 60, rotatedSoutheastCenter.y + 60);
    await expect.poll(async () => (await getTextGeometry(text)).fontSize).toBeGreaterThan(rotated.fontSize);
    const rotatedResizePreview = await getTextGeometry(text);
    const rotatedSelectionPreview = await getSelectionGeometry(board);
    await page.mouse.up();
    await expect.poll(async () => getTextGeometry(text)).toEqual(rotatedResizePreview);
    await expect.poll(async () => getSelectionGeometry(board)).toEqual(rotatedSelectionPreview);

    const rotatedScale = rotatedResizePreview.fontSize / rotated.fontSize;
    expect(rotatedResizePreview.intrinsicWidth / rotated.intrinsicWidth).toBeCloseTo(rotatedScale, 2);
    expect(rotatedResizePreview.intrinsicHeight / rotated.intrinsicHeight).toBeCloseTo(rotatedScale, 2);
    expect(rotatedResizePreview.width / rotated.width).toBeCloseTo(rotatedScale, 2);
    expect(rotatedResizePreview.height / rotated.height).toBeCloseTo(rotatedScale, 2);
    expect(rotatedResizePreview.rotation).toBe(rotated.rotation);
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});

test('reopens Board text with the caret after the clicked character', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('whiteboard-text-caret');

  try {
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.evaluate(() => (window as any).__vlainaE2E.setAppViewMode('whiteboard'));
    await waitForWhiteboardBoardReady(page);

    const board = page.locator('[data-whiteboard-active="true"]');
    await expect(board).toBeVisible();
    await board.getByRole('button', { name: /^(Text|文本)$/ }).click();
    const surface = board.locator(':scope > div').first();
    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).not.toBeNull();
    await page.mouse.click(surfaceBox!.x + 420, surfaceBox!.y + 300);

    const editor = board.locator('[data-whiteboard-text-editor="true"]');
    await editor.fill('Board 手写');
    await editor.press('Control+Enter');
    const text = board.locator('[data-whiteboard-text="true"]');
    await expect(text).toHaveText('Board 手写');
    const clickPoint = await text.evaluate((node) => {
      const context = document.createElement('canvas').getContext('2d')!;
      const style = getComputedStyle(node);
      const bounds = node.parentElement!.getBoundingClientRect();
      context.font = `${style.fontSize} ${style.fontFamily}`;
      const prefixWidth = context.measureText('Board ').width;
      const characterWidth = context.measureText('Board 手').width - prefixWidth;
      return {
        x: bounds.left + prefixWidth + characterWidth * 0.75,
        y: bounds.top + Number.parseFloat(style.fontSize) / 2,
      };
    });

    await page.mouse.dblclick(clickPoint.x, clickPoint.y);
    await expect(editor).toBeFocused();
    await expect.poll(() => editor.evaluate((node) => ({
      end: (node as HTMLTextAreaElement).selectionEnd,
      start: (node as HTMLTextAreaElement).selectionStart,
    }))).toEqual({ end: 7, start: 7 });

    await editor.type('X');
    await expect(editor).toHaveValue('Board 手X写');
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});

async function getTextGeometry(text: Locator) {
  return text.evaluate((node) => {
    const bounds = node.parentElement!.getBoundingClientRect();
    const contentBounds = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const parentStyle = getComputedStyle(node.parentElement!);
    return {
      fontSize: Number.parseFloat(style.fontSize),
      height: bounds.height,
      contentHeight: contentBounds.height,
      contentWidth: contentBounds.width,
      contentX: contentBounds.x,
      contentY: contentBounds.y,
      intrinsicHeight: Number.parseFloat(parentStyle.height),
      intrinsicWidth: Number.parseFloat(parentStyle.width),
      rotation: parentStyle.rotate,
      transform: style.transform,
      width: bounds.width,
      x: bounds.x,
      y: bounds.y,
    };
  });
}

async function getLocatorCenter(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return {
    x: bounds!.x + bounds!.width / 2,
    y: bounds!.y + bounds!.height / 2,
  };
}

async function getSelectionGeometry(board: Locator) {
  const bounds = await board.locator('[data-whiteboard-selection-move-target="true"]').boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}

async function waitForWhiteboardBoardReady(page: Page) {
  const activeBoard = page.locator('[data-whiteboard-board-row="true"][aria-current="page"]');
  await expect(activeBoard).toHaveCount(1);
  await expect(activeBoard.getByRole('button').first()).toBeEnabled();
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}
