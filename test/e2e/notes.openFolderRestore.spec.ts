import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  closeElectron,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  EDITOR_SELECTOR,
  FILE_TREE_FILE_SELECTOR,
  getOpenBridgePages,
  launchIsolatedElectron,
  NOTE_SCROLL_ROOT_SELECTOR,
  openNotesRootInNotes,
  setAppViewMode,
} from './notesE2E';

function getNotesRootStorageKey(notesRootPath: string): string {
  const normalized = notesRootPath.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '') || notesRootPath;
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `notes-root-${(hash >>> 0).toString(36)}`;
}

function getNotesRootWorkspacePath(userDataDir: string, notesRootPath: string): string {
  return path.join(userDataDir, '.vlaina', 'notes', 'notes-roots', getNotesRootStorageKey(notesRootPath), 'workspace.json');
}

const FILE_TREE_FOLDER_SELECTOR = (folderPath: string) =>
  `[data-file-tree-kind="folder"][data-file-tree-path="${folderPath}"]`;

const FILE_TREE_FOLDER_ROW_SELECTOR = (folderPath: string) =>
  `${FILE_TREE_FOLDER_SELECTOR(folderPath)} > div`;

async function writeNotesRootWorkspace(
  userDataDir: string,
  notesRootPath: string,
  currentNotePath: string,
): Promise<void> {
  const workspaceDir = path.dirname(getNotesRootWorkspacePath(userDataDir, notesRootPath));
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(
    getNotesRootWorkspacePath(userDataDir, notesRootPath),
    JSON.stringify({
      currentNotePath,
      expandedFolders: [],
      fileTreeSortMode: 'name-asc',
    }, null, 2),
    'utf8',
  );
}

async function readNotesRootWorkspace(userDataDir: string, notesRootPath: string): Promise<{
  currentNotePath: string | null;
  expandedFolders: string[];
}> {
  return JSON.parse(await fs.readFile(getNotesRootWorkspacePath(userDataDir, notesRootPath), 'utf8'));
}

async function waitForExpandedFolders(page: Page, expandedFolders: string[]) {
  await expect.poll(async () => page.evaluate(() => {
    const metrics = (window as any).__vlainaE2E.getNotesTreeMetrics();
    return [...metrics.expandedFolders].sort();
  }), { timeout: 30_000 }).toEqual([...expandedFolders].sort());
}

function createLongRestoreMarkdown(): string {
  return [
    '---',
    '',
    'Startup restore first editable line.',
    '',
    ...Array.from({ length: 90 }, (_, index) => (
      `Restore paragraph ${index + 1}: enough content to make the saved scroll position meaningful after relaunch.`
    )),
    '',
    'Restored workspace scroll sentinel.',
  ].join('\n\n');
}

test.describe('notes open folder restore', () => {
  test('does not keep the startup blank draft when opening a populated notes root without a saved workspace note', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-open-folder-populated-no-restore');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await expect.poll(async () => page.evaluate(() => {
        const state = (window as any).__vlainaE2E.getNotesState();
        return {
          currentNotePath: state.currentNote?.path ?? null,
          openTabPaths: state.openTabs.map((tab: { path: string }) => tab.path),
        };
      }), { timeout: 30_000 }).toMatchObject({
        currentNotePath: expect.stringMatching(/^draft:/),
        openTabPaths: [expect.stringMatching(/^draft:/)],
      });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'populated-no-restore',
        files: [
          {
            filename: 'alpha.md',
            content: '# Alpha\n\nExisting note sentinel.\n',
          },
        ],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Populated No Restore',
        minFileCount: 1,
      });

      await expect.poll(async () => page.evaluate(() => {
        const notesState = (window as any).__vlainaE2E.getNotesState();
        const notesRootState = (window as any).__vlainaE2E.getNotesRootState();
        return {
          currentNotesRootPath: notesRootState.currentNotesRoot?.path ?? null,
          currentNotePath: notesState.currentNote?.path ?? null,
          openTabPaths: notesState.openTabs.map((tab: { path: string }) => tab.path),
          fileRows: document.querySelectorAll('[data-file-tree-kind="file"]').length,
        };
      }), { timeout: 30_000 }).toMatchObject({
        currentNotesRootPath: fixture.notesRootPath,
        currentNotePath: null,
        openTabPaths: [],
        fileRows: 1,
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('restores the saved current note when reopening a populated notes root', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-open-folder-restore-last-note');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const firstNotesRoot = await createNotesRootFilesFixture(page, {
        name: 'restore-last-note-a',
        files: [
          {
            filename: 'alpha.md',
            content: '# Alpha\n\nLast opened alpha sentinel.\n',
          },
        ],
      });
      const secondNotesRoot = await createNotesRootFilesFixture(page, {
        name: 'restore-last-note-b',
        files: [
          {
            filename: 'beta.md',
            content: '# Beta\n\nSecond notes root sentinel.\n',
          },
        ],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: firstNotesRoot.notesRootPath,
        name: 'Restore Last Note A',
        minFileCount: 1,
      });
      await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'alpha' }).first().click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Last opened alpha sentinel', {
        timeout: 30_000,
      });

      await openNotesRootInNotes(page, {
        notesRootPath: secondNotesRoot.notesRootPath,
        name: 'Restore Last Note B',
        minFileCount: 1,
      });
      await expect.poll(async () => page.evaluate(() => {
        const notesState = (window as any).__vlainaE2E.getNotesState();
        const notesRootState = (window as any).__vlainaE2E.getNotesRootState();
        return {
          currentNotesRootPath: notesRootState.currentNotesRoot?.path ?? null,
          currentNotePath: notesState.currentNote?.path ?? null,
          openTabPaths: notesState.openTabs.map((tab: { path: string }) => tab.path),
        };
      }), { timeout: 30_000 }).toMatchObject({
        currentNotesRootPath: secondNotesRoot.notesRootPath,
        currentNotePath: null,
        openTabPaths: [],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: firstNotesRoot.notesRootPath,
        name: 'Restore Last Note A',
        minFileCount: 1,
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Last opened alpha sentinel', {
        timeout: 30_000,
      });
      await expect.poll(async () => page.evaluate(() => {
        const notesState = (window as any).__vlainaE2E.getNotesState();
        const notesRootState = (window as any).__vlainaE2E.getNotesRootState();
        return {
          currentNotesRootPath: notesRootState.currentNotesRoot?.path ?? null,
          currentNotePath: notesState.currentNote?.path ?? null,
          openTabPaths: notesState.openTabs.map((tab: { path: string }) => tab.path),
        };
      }), { timeout: 30_000 }).toMatchObject({
        currentNotesRootPath: firstNotesRoot.notesRootPath,
        currentNotePath: 'alpha.md',
        openTabPaths: ['alpha.md'],
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('restores expanded and collapsed folder state from the recent folder entry', async () => {
    const { app, userDataRoot, userDataDir } = await launchIsolatedElectron('notes-open-folder-restore-tree-state');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'restore-tree-state',
        files: [
          {
            filename: 'docs/alpha.md',
            content: '# Alpha\n\nExpanded parent sentinel.\n',
          },
          {
            filename: 'docs/drafts/beta.md',
            content: '# Beta\n\nCollapsed child sentinel.\n',
          },
          {
            filename: 'archive/old.md',
            content: '# Old\n\nSibling sentinel.\n',
          },
        ],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Tree State Restore',
        minFileCount: 0,
      });

      await page.locator(FILE_TREE_FOLDER_ROW_SELECTOR('docs')).first().click();
      await waitForExpandedFolders(page, ['docs']);
      await expect(page.locator(FILE_TREE_FOLDER_SELECTOR('docs/drafts'))).toHaveCount(1, { timeout: 30_000 });

      await page.locator(FILE_TREE_FOLDER_ROW_SELECTOR('docs/drafts')).first().click();
      await waitForExpandedFolders(page, ['docs', 'docs/drafts']);
      await expect(page.locator('[data-file-tree-kind="file"][data-file-tree-path="docs/drafts/beta.md"]')).toHaveCount(1);

      await page.locator(FILE_TREE_FOLDER_ROW_SELECTOR('docs/drafts')).first().click();
      await waitForExpandedFolders(page, ['docs']);
      await expect.poll(async () => {
        const workspace = await readNotesRootWorkspace(userDataDir, fixture.notesRootPath).catch(() => null);
        return workspace?.expandedFolders ?? null;
      }, { timeout: 30_000 }).toEqual(['docs']);

      await page.evaluate(() => (window as any).__vlainaE2E.closeNotesRoot());
      await expect.poll(async () => page.evaluate(() => {
        const notesRootState = (window as any).__vlainaE2E.getNotesRootState();
        return {
          currentNotesRootPath: notesRootState.currentNotesRoot?.path ?? null,
          hasEmptyWorkspacePanel: Boolean(document.querySelector('[data-testid="empty-workspace-panel"]')),
        };
      }), { timeout: 30_000 }).toMatchObject({
        currentNotesRootPath: null,
        hasEmptyWorkspacePanel: true,
      });

      await page
        .locator('[data-testid="empty-workspace-panel"]')
        .getByRole('button', { name: 'Tree State Restore' })
        .first()
        .click();
      await expect.poll(async () => page.evaluate(() => {
        const notesRootState = (window as any).__vlainaE2E.getNotesRootState();
        return notesRootState.currentNotesRoot?.path ?? null;
      }), { timeout: 30_000 }).toBe(fixture.notesRootPath);
      await waitForExpandedFolders(page, ['docs']);
      await expect(page.locator('[data-file-tree-kind="file"][data-file-tree-path="docs/alpha.md"]')).toHaveCount(1);
      await expect(page.locator(FILE_TREE_FOLDER_SELECTOR('docs/drafts'))).toHaveCount(1);
      await expect(page.locator('[data-file-tree-kind="file"][data-file-tree-path="docs/drafts/beta.md"]')).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('focuses the workspace-restored note at the first editable line end on app relaunch', async () => {
    const first = await launchIsolatedElectron('notes-open-folder-restore-scroll-a');
    let second: Awaited<ReturnType<typeof launchIsolatedElectron>> | null = null;
    const notePath = 'startup-restore-scroll.md';

    try {
      await first.app.firstWindow();
      const [page] = await getOpenBridgePages(first.app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'restore-scroll-focus',
        files: [
          {
            filename: notePath,
            content: createLongRestoreMarkdown(),
          },
        ],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Restore Scroll Focus',
        minFileCount: 1,
      });
      await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'startup-restore-scroll' }).first().click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Restored workspace scroll sentinel', {
        timeout: 30_000,
      });

      const savedScroll = await page.evaluate(({ scrollSelector, storageKey, notesRootPath, notePath }) => {
        const scrollRoot = document.querySelector<HTMLElement>(scrollSelector);
        if (!scrollRoot) {
          throw new Error('Missing note scroll root');
        }

        const maxScrollTop = scrollRoot.scrollHeight - scrollRoot.clientHeight;
        const scrollTop = Math.min(maxScrollTop, Math.max(480, Math.round(maxScrollTop * 0.55)));
        scrollRoot.scrollTop = scrollTop;
        scrollRoot.dispatchEvent(new Event('scroll', { bubbles: true }));

        const identity = JSON.stringify([notesRootPath, notePath]);
        const positions = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
        positions[identity] = { scrollTop, updatedAt: Date.now() };
        window.localStorage.setItem(storageKey, JSON.stringify(positions));

        return { maxScrollTop, scrollTop };
      }, {
        notePath,
        scrollSelector: NOTE_SCROLL_ROOT_SELECTOR,
        storageKey: 'vlaina-note-scroll-positions',
        notesRootPath: fixture.notesRootPath,
      });
      expect(savedScroll.maxScrollTop).toBeGreaterThan(700);
      expect(savedScroll.scrollTop).toBeGreaterThan(400);

      await writeNotesRootWorkspace(first.userDataDir, fixture.notesRootPath, notePath);
      await closeElectron(first.app);

      second = await launchIsolatedElectron('notes-open-folder-restore-scroll-b', {
        envOverrides: {
          VLAINA_USER_DATA_DIR: first.userDataDir,
        },
      });
      await second.app.firstWindow();
      const [restoredPage] = await getOpenBridgePages(second.app, 1);
      await restoredPage.setViewportSize({ width: 1280, height: 860 });
      await setAppViewMode(restoredPage, 'notes');

      await expect(restoredPage.locator(EDITOR_SELECTOR)).toContainText('Restored workspace scroll sentinel', {
        timeout: 30_000,
      });
      await expect.poll(async () => restoredPage.evaluate(() => (
        window as any
      ).__vlainaE2E.getEditorTextRange('Startup restore first editable line.')), {
        timeout: 30_000,
      }).not.toBeNull();
      const firstLineRange = await restoredPage.evaluate(() => (
        window as any
      ).__vlainaE2E.getEditorTextRange('Startup restore first editable line.'));
      if (!firstLineRange) {
        throw new Error('Missing first editable startup line range');
      }

      await expect.poll(async () => restoredPage.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const activeElement = document.activeElement;
        const notesState = (window as any).__vlainaE2E.getNotesState();
        const notesRootState = (window as any).__vlainaE2E.getNotesRootState();
        return {
          currentNotesRootPath: notesRootState.currentNotesRoot?.path ?? null,
          currentNotePath: notesState.currentNote?.path ?? null,
          editorContainsFocus: Boolean(
            editor && activeElement instanceof Node && editor.contains(activeElement)
          ),
          selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
        };
      }), { timeout: 30_000 }).toMatchObject({
        currentNotesRootPath: fixture.notesRootPath,
        currentNotePath: notePath,
        editorContainsFocus: true,
        selection: {
          empty: true,
          from: firstLineRange.to,
          to: firstLineRange.to,
        },
      });

      await expect.poll(async () => restoredPage.evaluate(({
        notePath,
        notesRootPath,
        scrollSelector,
        storageKey,
      }) => {
        const scrollRoot = document.querySelector<HTMLElement>(scrollSelector);
        const identity = JSON.stringify([notesRootPath, notePath]);
        const positions = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
        const persistedScrollTop = positions[identity]?.scrollTop;
        if (typeof persistedScrollTop !== 'number') {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.round(scrollRoot?.scrollTop ?? 0),
          Math.round(persistedScrollTop),
        );
      }, {
        notePath,
        notesRootPath: fixture.notesRootPath,
        scrollSelector: NOTE_SCROLL_ROOT_SELECTOR,
        storageKey: 'vlaina-note-scroll-positions',
      })).toBeLessThanOrEqual(180);
    } finally {
      if (second) {
        await cleanupIsolatedElectron(second.app, second.userDataRoot);
      }
      await cleanupIsolatedElectron(first.app, first.userDataRoot);
    }
  });
});
