import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openAbsoluteNote,
  waitForEditorAnimationFrame,
} from './notesE2E';

const SOURCE_EDITOR_SELECTOR = '[data-note-source-editor="true"]';

async function appendToNote(page: Page, text: string): Promise<void> {
  const paragraph = page.locator(`${EDITOR_SELECTOR} > p`).last();
  await expect(paragraph).toBeVisible();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  await waitForEditorAnimationFrame(page);
  await expect(page.locator(EDITOR_SELECTOR)).toContainText(text.trim());
}

async function expectCurrentNoteContent(page: Page, expected: string): Promise<void> {
  await expect.poll(() => page.evaluate(() =>
    (window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''
  ), { timeout: 10_000 }).toBe(expected);
}

async function expectStoredNoteContent(
  page: Page,
  notePath: string,
  expected: string,
): Promise<void> {
  await expect.poll(() => page.evaluate(
    (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
    notePath,
  ), { timeout: 10_000 }).toBe(expected);
}

async function pressEditorShortcut(page: Page, shortcut: string): Promise<void> {
  await expect.poll(() => page.evaluate(() =>
    (window as any).__vlainaE2E.focusCurrentEditor()
  )).toBe(true);
  await page.keyboard.press(shortcut);
  await waitForEditorAnimationFrame(page);
}

async function expectHistoryDepth(
  page: Page,
  expected: { undo: number; redo: number },
): Promise<void> {
  await expect.poll(() => page.evaluate(() =>
    (window as any).__vlainaE2E.getEditorHistoryDepth()
  )).toEqual(expected);
}

async function clickEditorBlankArea(page: Page): Promise<void> {
  const editor = page.locator(EDITOR_SELECTOR);
  const box = await editor.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height - 12);
}

async function openSourceNote(page: Page, notePath: string): Promise<void> {
  await page.evaluate((pathToOpen) =>
    (window as any).__vlainaE2E.openAbsoluteNoteWithTiming(pathToOpen), notePath
  );
  await expect.poll(() => page.evaluate(() =>
    (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null
  )).toBe(notePath);
  await expect(page.locator(SOURCE_EDITOR_SELECTOR)).toBeVisible();
}

test.describe('notes undo history across file switches', () => {
  test.setTimeout(120_000);

  test('keeps undo and redo histories isolated for each note during the session', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-undo-history-switch');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const alphaInitial = 'Alpha initial body';
      const betaInitial = 'Beta initial body';
      const alphaEdit = ' alpha-session-edit';
      const betaEdit = ' beta-session-edit';
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'undo-history-switch',
        files: [
          { filename: 'alpha.md', content: alphaInitial },
          { filename: 'beta.md', content: betaInitial },
        ],
      });
      const [alphaPath, betaPath] = fixture.notePaths;

      await openAbsoluteNote(page, alphaPath!);
      await appendToNote(page, alphaEdit);
      await expectCurrentNoteContent(page, alphaInitial + alphaEdit);
      await expectHistoryDepth(page, { undo: 1, redo: 0 });

      await openAbsoluteNote(page, betaPath!);
      await appendToNote(page, betaEdit);
      await expectCurrentNoteContent(page, betaInitial + betaEdit);
      await expectHistoryDepth(page, { undo: 1, redo: 0 });

      await openAbsoluteNote(page, alphaPath!);
      await expectHistoryDepth(page, { undo: 1, redo: 0 });
      await pressEditorShortcut(page, 'Control+z');
      await expectHistoryDepth(page, { undo: 0, redo: 1 });
      await expectCurrentNoteContent(page, alphaInitial);
      await expect(page.locator(EDITOR_SELECTOR)).not.toContainText(alphaEdit.trim());

      await openAbsoluteNote(page, betaPath!);
      await expectCurrentNoteContent(page, betaInitial + betaEdit);
      await expectStoredNoteContent(page, alphaPath!, alphaInitial);
      await expectHistoryDepth(page, { undo: 1, redo: 0 });

      await openAbsoluteNote(page, alphaPath!);
      await expectHistoryDepth(page, { undo: 0, redo: 1 });
      await pressEditorShortcut(page, 'Control+Shift+z');
      await expectCurrentNoteContent(page, alphaInitial + alphaEdit);
      await expectHistoryDepth(page, { undo: 1, redo: 0 });

      await openAbsoluteNote(page, betaPath!);
      await pressEditorShortcut(page, 'Control+z');
      await expectCurrentNoteContent(page, betaInitial);
      await expectHistoryDepth(page, { undo: 0, redo: 1 });

      await openAbsoluteNote(page, alphaPath!);
      await expectCurrentNoteContent(page, alphaInitial + alphaEdit);
      await expectStoredNoteContent(page, betaPath!, betaInitial);

      await openAbsoluteNote(page, betaPath!);
      await expectHistoryDepth(page, { undo: 0, redo: 1 });
      await pressEditorShortcut(page, 'Control+Shift+z');
      await expectCurrentNoteContent(page, betaInitial + betaEdit);
      await expectHistoryDepth(page, { undo: 1, redo: 0 });

      await openAbsoluteNote(page, alphaPath!);
      await clickEditorBlankArea(page);
      await openAbsoluteNote(page, betaPath!);
      await openAbsoluteNote(page, alphaPath!);
      await pressEditorShortcut(page, 'Control+z');
      await expectCurrentNoteContent(page, alphaInitial);
      await pressEditorShortcut(page, 'Control+Shift+z');
      await expectCurrentNoteContent(page, alphaInitial + alphaEdit);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('drops cached undo history when an inactive note changes externally', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-undo-history-external-change');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const alphaInitial = 'Alpha external base';
      const alphaEdited = `${alphaInitial} local-edit`;
      const alphaExternal = ['Alpha external replacement', '', 'Second paragraph'].join('\n');
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'undo-history-external-change',
        files: [
          { filename: 'alpha-external.md', content: alphaInitial },
          { filename: 'beta-external.md', content: 'Beta external guard' },
        ],
      });
      const [alphaPath, betaPath] = fixture.notePaths;

      await openAbsoluteNote(page, alphaPath!);
      await appendToNote(page, ' local-edit');
      await expectCurrentNoteContent(page, alphaEdited);
      await openAbsoluteNote(page, betaPath!);
      await expectStoredNoteContent(page, alphaPath!, alphaEdited);

      await page.evaluate(
        ({ path, content }) => (window as any).__vlainaE2E.writeTextFile(path, content),
        { path: alphaPath!, content: alphaExternal },
      );
      await openAbsoluteNote(page, alphaPath!);
      await expectCurrentNoteContent(page, alphaExternal);
      await expectHistoryDepth(page, { undo: 0, redo: 0 });

      await pressEditorShortcut(page, 'Control+z');
      await expectCurrentNoteContent(page, alphaExternal);
      await openAbsoluteNote(page, betaPath!);
      await expectStoredNoteContent(page, alphaPath!, alphaExternal);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps source editor undo history isolated when switching notes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-source-undo-history-switch');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const alphaInitial = 'Alpha source initial';
      const betaInitial = 'Beta source initial';
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'source-undo-history-switch',
        files: [
          { filename: 'alpha-source.md', content: alphaInitial },
          { filename: 'beta-source.md', content: betaInitial },
        ],
      });
      const [alphaPath, betaPath] = fixture.notePaths;

      await openAbsoluteNote(page, alphaPath!);
      await page.evaluate(() => window.dispatchEvent(new Event('note-source-mode-toggle')));
      const sourceEditor = page.locator(SOURCE_EDITOR_SELECTOR);
      await expect(sourceEditor).toBeVisible();
      await sourceEditor.focus();
      await page.keyboard.press('End');
      await page.keyboard.type(' alpha-source-edit');
      await expectCurrentNoteContent(page, `${alphaInitial} alpha-source-edit`);

      await openSourceNote(page, betaPath!);
      await sourceEditor.focus();
      await page.keyboard.press('End');
      await page.keyboard.type(' beta-source-edit');
      await expectCurrentNoteContent(page, `${betaInitial} beta-source-edit`);

      await openSourceNote(page, alphaPath!);
      await sourceEditor.focus();
      await page.keyboard.press('Control+z');
      await expectCurrentNoteContent(page, alphaInitial);

      await openSourceNote(page, betaPath!);
      await expectCurrentNoteContent(page, `${betaInitial} beta-source-edit`);
      await expectStoredNoteContent(page, alphaPath!, alphaInitial);
      await openSourceNote(page, alphaPath!);
      await sourceEditor.focus();
      await page.keyboard.press('Control+Shift+z');
      await expectCurrentNoteContent(page, `${alphaInitial} alpha-source-edit`);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
