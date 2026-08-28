import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  waitForEditorAnimationFrame,
} from './notesE2E';

test.describe('notes horizontal rule keyboard navigation', () => {
  test.setTimeout(90_000);

  test('draws the caret after the horizontal rule source when ArrowDown enters it', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-hr-keyboard-navigation');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'hr-keyboard-navigation.md',
        content: 'before\n\n---\n\nafter',
      });

      const before = page.locator(`${EDITOR_SELECTOR} > p`).first();
      await before.click();
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowDown');
      await waitForEditorAnimationFrame(page);

      const geometry = await page.evaluate(() => {
        const source = document.querySelector<HTMLElement>('[data-markdown-syntax="hr"]');
        const text = source?.firstChild;
        const caret = document.querySelector<HTMLElement>('.editor-textblock-caret-overlay');
        if (!(text instanceof Text) || !caret || text.length < 1) return null;

        const first = document.createRange();
        first.setStart(text, 0);
        first.setEnd(text, 1);
        const firstRect = first.getBoundingClientRect();
        first.detach();

        const last = document.createRange();
        last.setStart(text, text.length - 1);
        last.setEnd(text, text.length);
        const lastRect = last.getBoundingClientRect();
        last.detach();

        const caretRect = caret.getBoundingClientRect();
        return {
          caretLeft: caretRect.left,
          firstLeft: firstRect.left,
          lastRight: lastRect.right,
          sourceText: text.textContent,
        };
      });

      expect(geometry).not.toBeNull();
      expect(geometry?.sourceText).toBe('---');
      expect(Math.abs((geometry?.caretLeft ?? 0) - (geometry?.lastRight ?? 0))).toBeLessThan(2);
      expect((geometry?.caretLeft ?? 0) - (geometry?.firstLeft ?? 0)).toBeGreaterThan(8);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
