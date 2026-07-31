import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  FILE_TREE_FILE_SELECTOR,
  NOTE_SCROLL_ROOT_SELECTOR,
  NOTES_SIDEBAR_SCROLL_ROOT_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openNotesRootInNotes,
  waitForEditorAnimationFrame,
} from './notesE2E';

const TITLE_INPUT_SELECTOR = '[data-note-title-input="true"]';
const ACTIVE_TAB_SELECTOR = '[data-notes-tab-active="true"]';
const NEW_NOTE_BUTTON_SELECTOR = '.notes-tab-row-new-note-button';
const NOTE_CONTENT_ROOT_SELECTOR = '[data-note-content-root="true"]';
const ROOT_FOLDER_ROW_SELECTOR = '[data-notes-root-folder-row="true"]';
const SOURCE_EDITOR_SELECTOR = '[data-note-source-editor="true"]';
const SOURCE_MODE_TOGGLE_EVENT = 'note-source-mode-toggle';

async function expectTitleFocused(page: Page, label: string): Promise<void> {
  const diagnostics = await page.evaluate(() => {
    const titleInput = document.querySelector<HTMLTextAreaElement>('[data-note-title-input="true"]');
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    const active = document.activeElement;
    const state = (window as any).__vlainaE2E.getNotesState();
    return {
      label: active instanceof HTMLElement ? active.getAttribute('aria-label') : null,
      activeClassName: active instanceof HTMLElement ? active.className : null,
      activeDataNoteTitleInput: active instanceof HTMLElement
        ? active.getAttribute('data-note-title-input')
        : null,
      activeIsEditor: active === editor,
      activeIsTitle: active === titleInput,
      activeTagName: active?.tagName ?? null,
      currentContent: state.currentNote?.content ?? null,
      currentPath: state.currentNote?.path ?? null,
      editorSelection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
      editorText: editor?.textContent ?? '',
      titleSelectionEnd: titleInput?.selectionEnd ?? null,
      titleSelectionStart: titleInput?.selectionStart ?? null,
      titleValue: titleInput?.value ?? null,
    };
  });

  expect(diagnostics.activeIsTitle, `${label}\n${JSON.stringify(diagnostics, null, 2)}`).toBe(true);
  expect(diagnostics.titleSelectionStart).toBe(diagnostics.titleValue?.length ?? null);
  expect(diagnostics.titleSelectionEnd).toBe(diagnostics.titleValue?.length ?? null);
}

async function clickSidebarBlankArea(page: Page): Promise<void> {
  const sidebarBox = await page.locator(NOTES_SIDEBAR_SCROLL_ROOT_SELECTOR).first().boundingBox();
  expect(sidebarBox).not.toBeNull();
  await page.mouse.click(
    sidebarBox!.x + Math.min(24, sidebarBox!.width / 2),
    sidebarBox!.y + sidebarBox!.height - 24,
  );

  await expect.poll(async () => page.evaluate(() => {
    const titleInput = document.querySelector<HTMLTextAreaElement>('[data-note-title-input="true"]');
    const state = (window as any).__vlainaE2E.getNotesState();
    return {
      activeIsTitle: document.activeElement === titleInput,
      currentPath: state.currentNote?.path ?? null,
    };
  }), { timeout: 5_000 }).toMatchObject({
    currentPath: expect.stringMatching(/^draft:/),
  });
}

async function clickCurrentDraftSidebarRow(page: Page): Promise<void> {
  await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'Untitled' }).first().click();

  await expect.poll(async () => page.evaluate(() => {
    const titleInput = document.querySelector<HTMLTextAreaElement>('[data-note-title-input="true"]');
    const state = (window as any).__vlainaE2E.getNotesState();
    return {
      activeIsTitle: document.activeElement === titleInput,
      currentPath: state.currentNote?.path ?? null,
    };
  }), { timeout: 5_000 }).toMatchObject({
    currentPath: expect.stringMatching(/^draft:/),
  });
}

async function clickActiveDraftTab(page: Page): Promise<void> {
  await page.locator(ACTIVE_TAB_SELECTOR, { hasText: 'Untitled' }).first().click();

  await expect.poll(async () => page.evaluate(() => {
    const titleInput = document.querySelector<HTMLTextAreaElement>('[data-note-title-input="true"]');
    const state = (window as any).__vlainaE2E.getNotesState();
    return {
      activeIsTitle: document.activeElement === titleInput,
      currentPath: state.currentNote?.path ?? null,
    };
  }), { timeout: 5_000 }).toMatchObject({
    currentPath: expect.stringMatching(/^draft:/),
  });
}

async function clickRootFolderRow(page: Page): Promise<void> {
  await page.locator(ROOT_FOLDER_ROW_SELECTOR).first().click();

  await expect.poll(async () => page.evaluate(() => {
    const titleInput = document.querySelector<HTMLTextAreaElement>('[data-note-title-input="true"]');
    const state = (window as any).__vlainaE2E.getNotesState();
    return {
      activeIsTitle: document.activeElement === titleInput,
      currentPath: state.currentNote?.path ?? null,
    };
  }), { timeout: 5_000 }).toMatchObject({
    currentPath: expect.stringMatching(/^draft:/),
  });
}

async function clickEmptyBodyParagraph(page: Page): Promise<void> {
  const point = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    const block = editor?.querySelector<HTMLElement>('p, li, blockquote, h1, h2, h3, h4, h5, h6') ?? editor;
    if (!block) return null;
    const rect = block.getBoundingClientRect();
    return {
      x: Math.max(rect.left + 1, Math.min(rect.left + 24, rect.right - 1)),
      y: rect.top + rect.height / 2,
    };
  });
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

async function clickFirstBodyLineEnd(page: Page): Promise<void> {
  const point = await page.evaluate((contentRootSelector) => {
    const contentRoot = document.querySelector<HTMLElement>(contentRootSelector);
    const block = contentRoot?.querySelector<HTMLElement>('.ProseMirror p, .ProseMirror li, .ProseMirror blockquote, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6');
    if (!block) return null;
    const rect = block.getBoundingClientRect();
    return {
      x: Math.max(rect.left + 1, rect.right - 4),
      y: rect.top + rect.height / 2,
    };
  }, NOTE_CONTENT_ROOT_SELECTOR);
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

async function clickContentRootSurface(page: Page): Promise<void> {
  const point = await page.evaluate((contentRootSelector) => {
    const contentRoot = document.querySelector<HTMLElement>(contentRootSelector);
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    if (!contentRoot || !editor) return null;
    const contentRect = contentRoot.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    return {
      x: contentRect.left + contentRect.width / 2,
      y: Math.min(editorRect.bottom + 12, contentRect.bottom - 4),
    };
  }, NOTE_CONTENT_ROOT_SELECTOR);
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

async function clickEditorLowerBlankArea(page: Page): Promise<void> {
  const editorBox = await page.locator(EDITOR_SELECTOR).boundingBox();
  expect(editorBox).not.toBeNull();
  await page.mouse.click(editorBox!.x + editorBox!.width / 2, editorBox!.y + editorBox!.height - 20);
}

async function clickScrollRootBlankArea(page: Page): Promise<void> {
  const scrollRootBox = await page.locator(NOTE_SCROLL_ROOT_SELECTOR).boundingBox();
  expect(scrollRootBox).not.toBeNull();
  await page.mouse.click(
    scrollRootBox!.x + scrollRootBox!.width / 2,
    scrollRootBox!.y + scrollRootBox!.height - 24,
  );
}

test.describe('empty untitled draft title focus', () => {
  test('keeps or returns focus to the title across sidebar and right-side editor clicks', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-empty-untitled-title-focus');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'notes-empty-untitled-title-focus',
        files: [
          {
            filename: 'alpha.md',
            content: '# Alpha\n\nExisting note.\n',
          },
        ],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Notes Empty Untitled Title Focus',
        minFileCount: 1,
      });

      await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'alpha' }).first().click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Existing note', { timeout: 30_000 });

      const newNoteButton = page.locator(NEW_NOTE_BUTTON_SELECTOR);
      const newNoteButtonBox = await newNoteButton.boundingBox();
      expect(newNoteButtonBox).not.toBeNull();
      await page.mouse.move(
        newNoteButtonBox!.x + newNoteButtonBox!.width / 2,
        newNoteButtonBox!.y + newNoteButtonBox!.height / 2,
      );
      await expect(newNoteButton).toHaveCSS('pointer-events', 'auto');
      await newNoteButton.click();
      await expect.poll(async () => page.evaluate(() => {
        const state = (window as any).__vlainaE2E.getNotesState();
        return state.currentNote?.path?.startsWith('draft:') ?? false;
      }), { timeout: 10_000 }).toBe(true);
      await expect(page.locator(TITLE_INPUT_SELECTOR)).toBeVisible({ timeout: 10_000 });
      await waitForEditorAnimationFrame(page);
      await expectTitleFocused(page, 'initial empty draft focus');

      const leftSideClicks: Array<[string, () => Promise<void>]> = [
        ['sidebar blank area', () => clickSidebarBlankArea(page)],
        ['current draft sidebar row', () => clickCurrentDraftSidebarRow(page)],
        ['active draft tab', () => clickActiveDraftTab(page)],
        ['root folder row', () => clickRootFolderRow(page)],
      ];
      const rightSideClicks: Array<[string, () => Promise<void>]> = [
        ['empty body paragraph', () => clickEmptyBodyParagraph(page)],
        ['first body line end', () => clickFirstBodyLineEnd(page)],
        ['content root surface', () => clickContentRootSurface(page)],
        ['editor lower blank area', () => clickEditorLowerBlankArea(page)],
        ['note scroll root blank area', () => clickScrollRootBlankArea(page)],
      ];

      for (const [leftLabel, clickLeftSide] of leftSideClicks) {
        for (const [rightLabel, clickRightSide] of rightSideClicks) {
          await clickLeftSide();
          await clickRightSide();
          await waitForEditorAnimationFrame(page);
          await expectTitleFocused(page, `${leftLabel} -> ${rightLabel}`);
        }
      }

      await page.evaluate((eventName) => {
        window.dispatchEvent(new CustomEvent(eventName));
      }, SOURCE_MODE_TOGGLE_EVENT);
      await expect(page.locator(SOURCE_EDITOR_SELECTOR)).toBeVisible({ timeout: 10_000 });

      await clickCurrentDraftSidebarRow(page);
      await page.locator(SOURCE_EDITOR_SELECTOR).click();
      await waitForEditorAnimationFrame(page);
      await expectTitleFocused(page, 'current draft sidebar row -> source editor');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
