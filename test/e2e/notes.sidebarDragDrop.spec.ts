import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  FILE_TREE_FILE_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openAbsoluteNote,
  openNotesRootInNotes,
} from './notesE2E';

const FILE_TREE_PATH_SELECTOR = (path: string) => `[data-file-tree-path="${path}"]`;
const FILE_TREE_FOLDER_SELECTOR = (path: string) => `[data-file-tree-kind="folder"][data-file-tree-path="${path}"]`;
const FILE_TREE_IMAGE_NAME_SELECTOR = (path: string) => `[data-file-tree-image-name="${path}"]`;
const NOTES_SIDEBAR_BLANK_DRAG_ROOT_SELECTOR = '[data-notes-sidebar-blank-drag-root="true"]';

async function dragTreeItemToTarget(page: Page, sourceSelector: string, targetSelector: string) {
  const points = await page.evaluate(({ sourceSelector, targetSelector }) => {
    const sourceWrapper = document.querySelector<HTMLElement>(sourceSelector);
    const sourceRow = sourceWrapper?.firstElementChild instanceof HTMLElement
      ? sourceWrapper.firstElementChild
      : sourceWrapper;
    const target = document.querySelector<HTMLElement>(targetSelector);
    if (!sourceWrapper || !sourceRow || !target) {
      return {
        ok: false,
        reason: 'missing-element',
        hasSource: Boolean(sourceWrapper),
        hasSourceRow: Boolean(sourceRow),
        hasTarget: Boolean(target),
      };
    }

    const sourceBox = sourceRow.getBoundingClientRect();
    const start = {
      x: sourceBox.left + Math.min(sourceBox.width / 2, 120),
      y: sourceBox.top + sourceBox.height / 2,
    };
    return { ok: true, start };
  }, { sourceSelector, targetSelector });

  expect(points).toMatchObject({ ok: true });
  if (!points.ok || !('start' in points)) {
    return;
  }

  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.start.x + 32, points.start.y + 18, { steps: 4 });
  await expect.poll(async () => page.evaluate(() => document.body.style.cursor)).toBe('grabbing');
  const end = await page.evaluate((selector) => {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + Math.min(rect.width / 2, 120),
      y: rect.top + rect.height / 2,
    };
  }, targetSelector);
  expect(end).not.toBeNull();
  if (!end) {
    await page.mouse.up();
    return;
  }
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
}

async function expectPathVisible(page: Page, path: string) {
  await expect(page.locator(FILE_TREE_PATH_SELECTOR(path)).first()).toBeVisible({ timeout: 10_000 });
}

async function expectPathGone(page: Page, path: string) {
  await expect(page.locator(FILE_TREE_PATH_SELECTOR(path))).toHaveCount(0, { timeout: 10_000 });
}

async function ensureFolderExpanded(page: Page, folderPath: string, childPath: string) {
  const child = page.locator(FILE_TREE_PATH_SELECTOR(childPath)).first();
  if (await child.isVisible().catch(() => false)) {
    return;
  }

  await page.locator(FILE_TREE_FOLDER_SELECTOR(folderPath)).first().click();
  await expect(child).toBeVisible({ timeout: 10_000 });
}

test.describe('notes sidebar drag and drop', () => {
  test('starts dragging on the first gesture after the editor was focused', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-sidebar-drag-after-editor-focus');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 960 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'notes-sidebar-drag-after-editor-focus',
        files: [
          { filename: 'active.md', content: '# Active\n\nEditor body\n' },
          { filename: 'move-me.md', content: '# Move Me\n' },
          { filename: 'target/inside.md', content: '# Inside\n' },
        ],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Sidebar Drag After Editor Focus',
        minFileCount: 1,
      });
      await openAbsoluteNote(page, fixture.notePaths[0]!);
      await page.locator(EDITOR_SELECTOR).click();

      await dragTreeItemToTarget(
        page,
        `${FILE_TREE_FILE_SELECTOR}${FILE_TREE_PATH_SELECTOR('move-me.md')}`,
        FILE_TREE_FOLDER_SELECTOR('target'),
      );

      await expectPathVisible(page, 'target/move-me.md');
      await expectPathGone(page, 'move-me.md');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('resolves a virtualized child file row to its parent folder', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-sidebar-drag-virtualized-target');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 960 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'notes-sidebar-drag-virtualized-target',
        files: [
          { filename: '000-source.md', content: '# Source\n' },
          { filename: 'docs/inside.md', content: '# Inside\n' },
          ...Array.from({ length: 180 }, (_, index) => ({
            filename: `filler-${String(index).padStart(3, '0')}.md`,
            content: `# Filler ${index}\n`,
          })),
        ],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Sidebar Drag Virtualized Target',
        minFileCount: 1,
      });
      await expectPathVisible(page, '000-source.md');
      expect(await page.locator(FILE_TREE_FILE_SELECTOR).count()).toBeLessThan(180);
      await ensureFolderExpanded(page, 'docs', 'docs/inside.md');

      await dragTreeItemToTarget(
        page,
        `${FILE_TREE_FILE_SELECTOR}${FILE_TREE_PATH_SELECTOR('000-source.md')}`,
        `${FILE_TREE_FILE_SELECTOR}${FILE_TREE_PATH_SELECTOR('docs/inside.md')}`,
      );

      await expectPathVisible(page, 'docs/000-source.md');
      await expectPathGone(page, '000-source.md');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('moves image files and rewrites open note references', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-sidebar-drag-image');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 960 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'notes-sidebar-drag-image',
        files: [
          { filename: 'anchor.md', content: '# Anchor\n' },
          {
            filename: 'docs/reference.md',
            content: [
              '---',
              'vlaina_cover: "../assets/cover image.svg"',
              '---',
              '',
              '# Reference',
              '',
              '![cover](../assets/cover%20image.svg)',
              '<img src="../assets/cover%20image.svg">',
              '',
            ].join('\n'),
          },
          { filename: 'other.md', content: '# Other\n\n![cover](assets/cover%20image.svg)\n' },
          {
            filename: 'assets/cover image.svg',
            content: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>',
          },
          { filename: 'target/inside.md', content: '# Inside\n' },
        ],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Sidebar Drag Image',
        minFileCount: 2,
      });
      await openAbsoluteNote(page, fixture.notePaths[1]!);
      await ensureFolderExpanded(page, 'assets', 'assets/cover image.svg');

      const imageName = page.locator(FILE_TREE_IMAGE_NAME_SELECTOR('assets/cover image.svg'));
      await imageName.hover();
      await expect(page.locator('[data-image-file-hover-preview="true"]')).toBeVisible();

      await dragTreeItemToTarget(
        page,
        FILE_TREE_IMAGE_NAME_SELECTOR('assets/cover image.svg'),
        FILE_TREE_FOLDER_SELECTOR('target'),
      );

      await expect.poll(async () => page.evaluate(({ sourcePath, targetPath }) => {
        const state = (window as any).__vlainaE2E.getNotesState();
        return {
          hasSource: Boolean(document.querySelector(`[data-file-tree-path="${sourcePath}"]`)),
          hasTarget: Boolean(document.querySelector(`[data-file-tree-path="${targetPath}"]`)),
          error: state.error ?? null,
        };
      }, {
        sourcePath: 'assets/cover image.svg',
        targetPath: 'target/cover image.svg',
      }), { timeout: 10_000 }).toEqual({
        hasSource: false,
        hasTarget: true,
        error: null,
      });
      const currentContent = await page.evaluate(() => (
        (window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''
      ));
      expect(currentContent).toContain('vlaina_cover: "../target/cover image.svg"');
      expect(currentContent).toContain('<img src="../target/cover%20image.svg"');
      expect(currentContent).not.toContain('../assets/cover');

      await expect.poll(async () => page.evaluate((path) => (
        (window as any).__vlainaE2E.readTextFile(path)
      ), fixture.notePaths[2]!)).toContain('![cover](target/cover%20image.svg)');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('moves file tree items between nested folders and the root drop target', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-sidebar-drag-drop-root');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 960 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'notes-sidebar-drag-drop-root',
        files: [
          { filename: 'root-anchor.md', content: '# Root Anchor\n' },
          { filename: 'docs/nested-to-root.md', content: '# Nested To Root\n' },
          { filename: 'docs/sub/deep.md', content: '# Deep\n' },
        ],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Sidebar Drag Drop NotesRoot',
        minFileCount: 1,
      });

      await ensureFolderExpanded(page, 'docs', 'docs/nested-to-root.md');

      await dragTreeItemToTarget(
        page,
        `${FILE_TREE_FILE_SELECTOR}${FILE_TREE_PATH_SELECTOR('docs/nested-to-root.md')}`,
        NOTES_SIDEBAR_BLANK_DRAG_ROOT_SELECTOR,
      );
      await expectPathVisible(page, 'nested-to-root.md');
      await expectPathGone(page, 'docs/nested-to-root.md');

      await dragTreeItemToTarget(
        page,
        `${FILE_TREE_FILE_SELECTOR}${FILE_TREE_PATH_SELECTOR('root-anchor.md')}`,
        FILE_TREE_FOLDER_SELECTOR('docs'),
      );
      await expectPathVisible(page, 'docs/root-anchor.md');
      await expectPathGone(page, 'root-anchor.md');

      await dragTreeItemToTarget(
        page,
        `${FILE_TREE_FILE_SELECTOR}${FILE_TREE_PATH_SELECTOR('docs/root-anchor.md')}`,
        `${FILE_TREE_FILE_SELECTOR}${FILE_TREE_PATH_SELECTOR('nested-to-root.md')}`,
      );
      await expectPathVisible(page, 'root-anchor.md');
      await expectPathGone(page, 'docs/root-anchor.md');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
