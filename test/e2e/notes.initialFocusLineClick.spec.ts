import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  waitForEditorAnimationFrame,
} from './notesE2E';

test.describe('notes initial focus line clicks', () => {
  test.setTimeout(120_000);

  test('moves directly from the initial first line to a later line end', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-initial-focus-line-click');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'initial-focus-line-click.md',
        content: [
          '---',
          'vlaina_icon: "🔄"',
          '---',
          'First line initial caret',
          '',
          'Second line direct caret',
        ].join('\n'),
      });

      const firstTextRange = await page.evaluate(() => (
        window as any
      ).__vlainaE2E.getEditorTextRange('First line initial caret'));
      expect(firstTextRange).toBeTruthy();
      const secondTextRange = await page.evaluate(() => (
        window as any
      ).__vlainaE2E.getEditorTextRange('Second line direct caret'));
      expect(secondTextRange).toBeTruthy();

      await page.locator('[data-note-header-icon-button="true"]').click();
      const pickerIcon = page.locator('[data-no-auto-close="true"] [data-icon]').nth(8);
      await expect(pickerIcon).toBeVisible();
      await pickerIcon.click();
      await expect(page.locator('[data-no-auto-close="true"]')).toHaveCount(0);
      const afterIconSelection = await page.evaluate(() => (
        window as any
      ).__vlainaE2E.getEditorSelectionSummary());
      expect(afterIconSelection?.from).toBe(firstTextRange.to);

      const secondParagraph = page.locator(`${EDITOR_SELECTOR} p`, {
        hasText: 'Second line direct caret',
      });
      await expect(secondParagraph).toBeVisible();
      const clickPoint = await secondParagraph.evaluate((paragraph) => {
        const textNode = paragraph.firstChild;
        if (!textNode) throw new Error('Expected second paragraph text');
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const textRect = range.getBoundingClientRect();
        const paragraphRect = paragraph.getBoundingClientRect();
        const editorRect = paragraph.closest('.ProseMirror')?.getBoundingClientRect();
        const shellRect = paragraph.closest('[data-note-content-root="true"]')?.getBoundingClientRect();
        if (!editorRect || !shellRect) throw new Error('Expected editor geometry');
        return {
          x: Math.min(editorRect.right + 24, shellRect.right - 4),
          y: (textRect.top + textRect.bottom) / 2,
          editorRight: editorRect.right,
          paragraphRight: paragraphRect.right,
          shellRight: shellRect.right,
          textRight: textRect.right,
        };
      });
      expect(clickPoint.x, { clickPoint }).toBeGreaterThan(clickPoint.editorRight);

      await page.mouse.move(clickPoint.x, clickPoint.y);
      await page.mouse.down();
      const afterMouseDown = await page.evaluate(() => (window as any).__vlainaE2E.getEditorSelectionSummary());
      await page.mouse.up();
      const afterMouseUp = await page.evaluate(() => (window as any).__vlainaE2E.getEditorSelectionSummary());
      await waitForEditorAnimationFrame(page);
      const afterSettled = await page.evaluate(() => (window as any).__vlainaE2E.getEditorSelectionSummary());

      expect({ afterMouseDown, afterMouseUp, afterSettled }, { clickPoint }).toMatchObject({
        afterMouseDown: { from: secondTextRange.to },
        afterMouseUp: { from: secondTextRange.to },
        afterSettled: { from: secondTextRange.to },
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
