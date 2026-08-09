import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  selectNoteBlocksByText,
  waitForEditorAnimationFrame,
} from './notesE2E';

async function getTextDragPoints(page: Page, text: string) {
  return page.evaluate(({ editorSelector, text }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) throw new Error('Missing editor');

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node instanceof Text)) continue;
      const textIndex = node.data.indexOf(text);
      if (textIndex < 0) continue;

      const pointAt = (offset: number) => {
        const range = document.createRange();
        range.setStart(node, textIndex + offset);
        range.setEnd(node, textIndex + offset + 1);
        const rect = range.getBoundingClientRect();
        range.detach();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      };

      return {
        start: pointAt(8),
        end: pointAt(text.length - 5),
      };
    }

    throw new Error(`Missing text: ${text}`);
  }, { editorSelector: EDITOR_SELECTOR, text });
}

async function getTrailingGutterDragPoints(page: Page, text: string) {
  return page.evaluate(({ editorSelector, text }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) throw new Error('Missing editor');

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node instanceof Text)) continue;
      const textIndex = node.data.indexOf(text);
      if (textIndex < 0) continue;

      const endRange = document.createRange();
      endRange.setStart(node, textIndex + text.length - 1);
      endRange.setEnd(node, textIndex + text.length);
      const endRect = endRange.getBoundingClientRect();
      endRange.detach();

      const targetOffset = text.length - 10;
      const targetRange = document.createRange();
      targetRange.setStart(node, textIndex + targetOffset);
      targetRange.setEnd(node, textIndex + targetOffset + 1);
      const targetRect = targetRange.getBoundingClientRect();
      targetRange.detach();

      return {
        start: {
          x: endRect.right + 24,
          y: endRect.top + endRect.height / 2,
        },
        end: {
          x: targetRect.left + targetRect.width / 2,
          y: targetRect.top + targetRect.height / 2,
        },
      };
    }

    throw new Error(`Missing text: ${text}`);
  }, { editorSelector: EDITOR_SELECTOR, text });
}

test.describe('notes block and text selection handoff', () => {
  test('allows a text drag from the middle of a line after block selection', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-to-text-selection');
    const heading = 'Block selection source';
    const text = 'Ordinary text remains selectable from the middle of this line.';

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'block-to-text-selection.md',
        content: `${heading}\n\n${text}`,
      });

      expect(await selectNoteBlocksByText(page, [heading])).toBe(1);
      const points = await getTextDragPoints(page, heading);
      await page.mouse.move(points.start.x, points.start.y);
      await page.mouse.down();
      await page.mouse.move(points.end.x, points.end.y, { steps: 18 });
      await page.mouse.up();
      await waitForEditorAnimationFrame(page);

      await expect.poll(async () => page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        return {
          blockCount: editor?.querySelectorAll('.editor-block-selected').length ?? -1,
          selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
        };
      })).toMatchObject({
        blockCount: 0,
        selection: {
          empty: false,
          selectedText: expect.stringContaining('lection'),
        },
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('allows native text dragging from the trailing text gutter', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-trailing-text-gutter-selection');
    const text = 'Trailing gutter text remains selectable across the line ending.';

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'trailing-text-gutter-selection.md',
        content: text,
      });

      const points = await getTrailingGutterDragPoints(page, text);
      await page.mouse.move(points.start.x, points.start.y);
      await page.mouse.down();
      await page.mouse.move(points.end.x, points.end.y, { steps: 18 });
      await page.mouse.up();
      await waitForEditorAnimationFrame(page);

      await expect.poll(async () => page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        return {
          blockCount: editor?.querySelectorAll('.editor-block-selected').length ?? -1,
          selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
        };
      })).toMatchObject({
        blockCount: 0,
        selection: {
          empty: false,
          selectedText: expect.stringContaining('ending'),
        },
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
