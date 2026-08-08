import { expect, test, type ElectronApplication } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  NOTE_SCROLL_ROOT_SELECTOR,
  NOTE_SOURCE_FALLBACK_SELECTOR,
  SELECTED_BLOCK_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

const COPY_SHORTCUT = process.platform === 'darwin' ? 'Meta+C' : 'Control+C';
const SELECT_ALL_SHORTCUT = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

async function readSystemClipboard(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ clipboard }) => clipboard.readText());
}

async function setSystemClipboard(app: ElectronApplication, text: string): Promise<void> {
  await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), text);
}

test.describe('Notes select all clipboard', () => {
  test.setTimeout(120_000);

  test('replaces a recent block selection before scrolling and copying', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-select-all-after-block-selection');
    const content = Array.from(
      { length: 80 },
      (_, index) => `Select all clipboard paragraph ${String(index + 1).padStart(2, '0')} sentinel`,
    ).join('\n\n');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 720 });
      await openMarkdownFixture(page, {
        filename: 'select-all-after-block-selection.md',
        content,
      });

      await page.locator(EDITOR_SELECTOR).focus();
      const selectedBlocks = await page.evaluate(() =>
        (window as any).__vlainaE2E.selectNoteBlocksByIndexes([1, 2, 3]));
      expect(selectedBlocks).toBe(3);
      await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(3);

      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      await expect.poll(() => page.evaluate((selectedBlockSelector) => {
        const selection = (window as any).__vlainaE2E.getEditorSelectionSummary();
        return {
          allSelected: selection?.from === 0 && selection?.to === selection?.docTextLength,
          selectedBlockCount: document.querySelectorAll(selectedBlockSelector).length,
        };
      }, SELECTED_BLOCK_SELECTOR)).toEqual({ allSelected: true, selectedBlockCount: 0 });

      await page.locator(NOTE_SCROLL_ROOT_SELECTOR).evaluate((scrollRoot) => {
        scrollRoot.scrollTop = scrollRoot.scrollHeight;
      });
      await page.evaluate(() => new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

      const scrolledSelection = await page.evaluate(({ editorSelector, scrollRootSelector }) => {
        const editor = document.querySelector<HTMLElement>(editorSelector);
        const scrollRoot = document.querySelector<HTMLElement>(scrollRootSelector);
        const selection = (window as any).__vlainaE2E.getEditorSelectionSummary();
        if (!editor || !scrollRoot) throw new Error('Editor or note scroll root not found');
        const scrollRect = scrollRoot.getBoundingClientRect();
        const visibleOverlayCount = Array.from(
          editor.querySelectorAll<HTMLElement>('.editor-text-selection-overlay'),
        ).filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom > scrollRect.top && rect.top < scrollRect.bottom;
        }).length;
        return {
          allSelected: selection?.from === 0 && selection?.to === selection?.docTextLength,
          scrollTop: scrollRoot.scrollTop,
          visibleOverlayCount,
        };
      }, {
        editorSelector: EDITOR_SELECTOR,
        scrollRootSelector: NOTE_SCROLL_ROOT_SELECTOR,
      });
      expect(scrolledSelection.allSelected).toBe(true);
      expect(scrolledSelection.scrollTop).toBeGreaterThan(0);
      expect(scrolledSelection.visibleOverlayCount).toBeGreaterThan(0);

      await setSystemClipboard(app, 'stale select-all clipboard');
      await page.keyboard.press(COPY_SHORTCUT);
      expect(await readSystemClipboard(app)).toBe(content);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('copies Markdown from a full selection beyond the traversal node budget', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-over-budget-select-all-copy');
    const markedRuns = Array.from(
      { length: 10_050 },
      (_, index) => [
        `**Over-budget bold ${String(index + 1).padStart(5, '0')}**`,
        `plain-${String(index + 1).padStart(5, '0')}`,
      ].join(' '),
    );
    const content = [
      '**Over-budget first sentinel**',
      ...markedRuns,
      '[Over-budget last sentinel](https://example.test/last)',
    ].join(' ');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { notePath } = await page.evaluate((fixture) =>
        (window as any).__vlainaE2E.createNotesFixture(fixture),
        {
          filename: 'over-budget-select-all-copy.md',
          content,
        });
      await page.evaluate((pathToOpen) =>
        (window as any).__vlainaE2E.openAbsoluteNoteWithTiming(pathToOpen), notePath);
      await expect.poll(() => page.evaluate(() => {
        const state = (window as any).__vlainaE2E.getNotesState();
        return {
          currentNotePath: state.currentNote?.path ?? null,
          editorNotePath: (window as any).__vlainaE2E.getCurrentEditorNotePath(),
        };
      }), { timeout: 30_000 }).toEqual({
        currentNotePath: notePath,
        editorNotePath: notePath,
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Over-budget last sentinel', {
        timeout: 30_000,
      });
      await expect(page.locator(NOTE_SOURCE_FALLBACK_SELECTOR)).toHaveCount(0);
      await page.evaluate(() => new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

      await expect.poll(() => page.evaluate(() =>
        (window as any).__vlainaE2E.focusCurrentEditor())).toBe(true);
      await setSystemClipboard(app, 'stale over-budget clipboard');
      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      await expect.poll(() => page.evaluate(() => {
        const selection = (window as any).__vlainaE2E.getEditorSelectionSummary();
        return {
          allSelected: selection?.from === 0 && selection?.to === selection?.docTextLength,
          from: selection?.from ?? null,
          to: selection?.to ?? null,
          docTextLength: selection?.docTextLength ?? null,
        };
      })).toMatchObject({ allSelected: true });
      const copyStartedAt = Date.now();
      await page.keyboard.press(COPY_SHORTCUT);
      const copyWallMs = Date.now() - copyStartedAt;
      const copied = await readSystemClipboard(app);

      expect(copied.length).toBe(content.length);
      expect(copied).toBe(content);
      expect(copyWallMs).toBeLessThan(2_000);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
