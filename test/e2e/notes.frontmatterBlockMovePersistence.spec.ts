import { expect, test, type Page } from '@playwright/test';
import {
  BLOCK_CONTROLS_SELECTOR,
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';
import { moveMouseToBlockHandleGutter } from './notesBlockSelectionShared';

const FRONTMATTER_MOVE_MARKDOWN = [
  '---',
  'hi',
  '',
  'vlaina_cover: "./assets/13.jpg" x=50 y=38.56146469049695 height=200 scale=1',
  'vlaina_icon: "icon:common.sparkle"',
  '---',
  '1',
  '',
  '2',
].join('\n');

const EXPECTED_MOVED_MARKDOWN = [
  '---',
  'vlaina_cover: "./assets/13.jpg" x=50 y=38.56146469049695 height=200 scale=1',
  'vlaina_icon: "icon:common.sparkle"',
  '---',
  '1',
  '',
  'hi',
  '',
  '2',
].join('\n');

async function dragSelectedHandleBeforeParagraph(page: Page, targetText: string): Promise<void> {
  const handleBox = await page.locator('.editor-block-control-handle').boundingBox();
  if (!handleBox) {
    throw new Error('Could not resolve block drag handle geometry');
  }

  const targetBox = await page.locator(`${EDITOR_SELECTOR} p`, { hasText: targetText }).boundingBox();
  if (!targetBox) {
    throw new Error(`Could not resolve target paragraph geometry for ${targetText}`);
  }

  const dragStartX = handleBox.x + handleBox.width / 2;
  const dragStartY = handleBox.y + handleBox.height / 2;
  const dropX = targetBox.x + Math.min(32, Math.max(8, targetBox.width / 3));
  const dropY = targetBox.y + Math.max(2, Math.min(targetBox.height / 3, targetBox.height - 2));

  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + 28, dragStartY, { steps: 4 });
  await expect.poll(async () => page.evaluate(() =>
    document.body.classList.contains('editor-block-drag-active')
  ), { message: 'Expected frontmatter block drag to become active' }).toBe(true);
  await page.mouse.move(dropX, dropY, { steps: 8 });
  const indicator = page.locator('.editor-block-drop-indicator.visible');
  await expect(indicator).toBeVisible();
  const dragLayerOrder = await page.evaluate(() => {
    const dropIndicator = document.querySelector<HTMLElement>('.editor-block-drop-indicator.visible');
    const dragPreview = document.querySelector<HTMLElement>('.editor-block-drag-preview');
    return {
      indicator: Number.parseInt(getComputedStyle(dropIndicator!).zIndex, 10),
      preview: Number.parseInt(getComputedStyle(dragPreview!).zIndex, 10),
    };
  });
  expect(dragLayerOrder.indicator).toBeGreaterThan(dragLayerOrder.preview);
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() =>
    document.body.classList.contains('editor-block-drag-active')
  ), { message: 'Expected frontmatter block drag to settle' }).toBe(false);
}

test.describe('notes frontmatter block move persistence', () => {
  test.setTimeout(90_000);

  test('moves visible frontmatter text into the body without hardbreaks and keeps managed metadata', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-frontmatter-block-move-persistence');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const { notePath } = await openMarkdownFixture(page, {
        filename: 'frontmatter-block-move-persistence.md',
        content: FRONTMATTER_MOVE_MARKDOWN,
      });

      await expect(page.locator(`${EDITOR_SELECTOR} .frontmatter-block-container`, { hasText: 'hi' }))
        .toBeVisible({ timeout: 30_000 });
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: '1' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: '2' })).toBeVisible();

      const selectedCount = await page.evaluate(() =>
        (window as any).__vlainaE2E.selectNoteBlocksByText(['hi'])
      );
      expect(selectedCount).toBe(1);
      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} .frontmatter-block-container`, { hasText: 'hi' }),
      );
      await expect(page.locator(BLOCK_CONTROLS_SELECTOR)).toBeVisible();

      await dragSelectedHandleBeforeParagraph(page, '2');

      await expect.poll(async () => page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks();
        return blocks.map((block: { text: string }) => block.text);
      }), { timeout: 10_000 }).toEqual(['1', '', 'hi', '', '2']);

      await expect.poll(async () => page.evaluate(() =>
        String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '')
      ), { timeout: 10_000 }).toBe(EXPECTED_MOVED_MARKDOWN);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), notePath
      ), { timeout: 10_000 }).toBe(EXPECTED_MOVED_MARKDOWN);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
