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
  test('allows text dragging within a callout body', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-callout-text-selection');
    const text = 'Callout body text remains selectable like an ordinary paragraph.';

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'callout-text-selection.md',
        content: `> 💡 ${text}\n\n> Quote color reference`,
      });

      await expect(page.locator(`${EDITOR_SELECTOR} .callout-title`)).toHaveAttribute('contenteditable', 'false');
      await expect(page.locator(`${EDITOR_SELECTOR} .callout-icon`)).toHaveAttribute('contenteditable', 'false');
      await expect(page.locator(`${EDITOR_SELECTOR} .callout-content`)).toHaveCSS('user-select', 'text');
      const calloutColor = await page.locator(`${EDITOR_SELECTOR} .callout-content`).evaluate((element) => (
        getComputedStyle(element).color
      ));
      const quoteColor = await page.locator(`${EDITOR_SELECTOR} blockquote`).evaluate((element) => (
        getComputedStyle(element).color
      ));
      expect(calloutColor).toBe(quoteColor);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const points = await getTextDragPoints(page, text);
      await page.mouse.move(points.start.x, points.start.y);
      await page.mouse.down();
      await page.mouse.move(points.end.x, points.end.y, { steps: 18 });
      await page.mouse.up();
      await waitForEditorAnimationFrame(page);

      await expect.poll(async () => page.evaluate(() => (
        (window as any).__vlainaE2E.getEditorSelectionSummary()
      ))).toMatchObject({
        empty: false,
        selectedText: expect.stringContaining('body text remains selectable'),
      });
      await expect.poll(async () => page.evaluate(({ editorSelector }) => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const inlineDecorations = Array.from(
          document.querySelectorAll<HTMLElement>(
            `${editorSelector} .callout-content .editor-text-selection-overlay`
          )
        );
        return {
          inlineDecorationCount: inlineDecorations.length,
          inlinePaint: editor?.classList.contains('editor-text-selection-inline-paint') ?? false,
          pointerSelecting: editor?.hasAttribute('data-editor-pointer-selecting') ?? true,
          visiblyPaintedCount: inlineDecorations.filter((decoration) => {
            const backgroundColor = getComputedStyle(decoration).backgroundColor;
            return decoration.getBoundingClientRect().width > 0
              && backgroundColor !== 'transparent'
              && backgroundColor !== 'rgba(0, 0, 0, 0)';
          }).length,
        };
      }, { editorSelector: EDITOR_SELECTOR })).toMatchObject({
        inlineDecorationCount: expect.any(Number),
        inlinePaint: true,
        pointerSelecting: false,
        visiblyPaintedCount: expect.any(Number),
      });
      await expect(page.locator(
        `${EDITOR_SELECTOR} .callout-content .editor-text-selection-overlay`
      )).not.toHaveCount(0);
      expect(await page.locator(
        `${EDITOR_SELECTOR} .callout-content .editor-text-selection-overlay`
      ).evaluateAll((decorations) => decorations.filter((decoration) => {
        const backgroundColor = getComputedStyle(decoration).backgroundColor;
        return decoration.getBoundingClientRect().width > 0
          && backgroundColor !== 'transparent'
          && backgroundColor !== 'rgba(0, 0, 0, 0)';
      }).length)).toBeGreaterThan(0);
      await app.evaluate(({ clipboard }) => clipboard.writeText('stale callout selection'));
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
      await expect.poll(async () => app.evaluate(({ clipboard }) => clipboard.readText()))
        .toContain('body text remains selectable');
      const diagnostics = await page.evaluate(() => {
        const entries = window.__vlainaDiagnosticsLog
          ?.filter((entry) => entry.channel === 'notes-callout-selection') ?? [];
        return {
          events: entries.map((entry) => entry.event),
          postReleaseDetails: entries.findLast((entry) => entry.event === 'post-release-frame')
            ?.details ?? null,
        };
      });
      expect(diagnostics.events).toEqual(expect.arrayContaining([
        'overlay-bypass',
        'pointer-down',
        'session-start',
        'drag-start',
        'pointer-up',
        'post-release-frame',
      ]));
      expect(diagnostics.postReleaseDetails).toMatchObject({
        inlinePaint: true,
        overlayActive: true,
      });
      expect((diagnostics.postReleaseDetails as { calloutInlineDecorationCount: number })
        .calloutInlineDecorationCount).toBeGreaterThan(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

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
