import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  waitForEditorAnimationFrame,
} from './notesE2E';

test.describe('notes heading link editing', () => {
  test.setTimeout(90_000);

  test('keeps a newly created heading link stable when the caret moves after it', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-link-editing');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-link-editing.md',
        content: '# 1',
      });

      const selected = await page.evaluate(() =>
        (window as any).__vlainaE2E.selectEditorTextByText('1')
      );
      expect(selected).toMatchObject({ selected: true, selectedText: '1' });

      await page.keyboard.press('Control+k');
      const linkInput = page.locator('.link-tooltip-editor textarea');
      await expect(linkInput).toBeVisible();
      await linkInput.fill('2');
      await linkInput.press('Enter');

      await expect.poll(async () => page.evaluate(() =>
        String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '')
      )).toBe('# [1](2)');
      await expect(page.locator(`${EDITOR_SELECTOR} > h1`)).toHaveText('# [1](2)');
      await expect.poll(async () => page.evaluate(() =>
        (window as any).__vlainaE2E.getEditorSelectionSummary()
      )).toMatchObject({ from: 9, to: 9, empty: true });

      const closing = page.locator(
        `${EDITOR_SELECTOR} [data-markdown-syntax="link"][data-markdown-syntax-edge="close"]`
      );
      await expect(closing).toHaveText('](2)');
      const closingBox = await closing.boundingBox();
      expect(closingBox).not.toBeNull();
      for (let clickIndex = 0; clickIndex < 3; clickIndex += 1) {
        await page.mouse.click(
          closingBox!.x + closingBox!.width + 4,
          closingBox!.y + closingBox!.height / 2,
        );
        await waitForEditorAnimationFrame(page);
        await expect(page.locator(`${EDITOR_SELECTOR} > h1`)).toHaveText('# [1](2)');
        await expect.poll(async () => page.evaluate(() =>
          String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '')
        )).toBe('# [1](2)');
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
