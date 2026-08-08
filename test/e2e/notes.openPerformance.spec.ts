import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  EDITOR_SELECTOR,
  SELECTED_BLOCK_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  setAppViewMode,
} from './notesE2E';

function createLongParagraph(index: number): string {
  const sentence = [
    `Paragraph ${index}: this is a long rendered paragraph used for note open performance measurement.`,
    'It intentionally contains enough plain text to wrap across many visual lines in the editor.',
    'The goal is to exercise markdown parsing, Milkdown document creation, DOM rendering, line layout, and block selection readiness with realistic large-note content.',
    'Repeated prose also catches regressions where text measurement, decoration building, or block hit testing scales with total character count instead of visible blocks.',
  ].join(' ');
  return Array.from({ length: 12 }, () => sentence).join(' ');
}

function createLongMarkdown(blockCount: number): string {
  const blocks: string[] = ['# Long Open Performance', ''];
  for (let index = 0; index < blockCount; index += 1) {
    blocks.push(createLongParagraph(index), '');
  }
  blocks.push('Final performance sentinel paragraph.');
  return blocks.join('\n');
}

function getNotesRootStorageKey(notesRootPath: string): string {
  const normalized = notesRootPath.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '') || notesRootPath;
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `notes-root-${(hash >>> 0).toString(36)}`;
}

async function writeNotesRootWorkspace(
  userDataDir: string,
  notesRootPath: string,
  workspace: { currentNotePath: string | null; expandedFolders?: string[] },
): Promise<void> {
  const workspaceDir = path.join(userDataDir, '.vlaina', 'notes', 'notes-roots', getNotesRootStorageKey(notesRootPath));
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(
    path.join(workspaceDir, 'workspace.json'),
    JSON.stringify({
      currentNotePath: workspace.currentNotePath,
      expandedFolders: workspace.expandedFolders ?? [],
      fileTreeSortMode: 'name-asc',
    }, null, 2),
    'utf8',
  );
}

async function createManyFileNotesRootFixture(
  rootPath: string,
  fileCount: number,
): Promise<{ notesRootPath: string; restoreRelativePath: string; restoreAbsolutePath: string }> {
  const notesRootPath = path.join(rootPath, `large-notes-root-${Date.now().toString(36)}`);
  const directoryCount = 60;
  const restoreRelativePath = 'section-00/note-00000.md';
  await fs.mkdir(notesRootPath, { recursive: true });

  for (let directoryIndex = 0; directoryIndex < directoryCount; directoryIndex += 1) {
    await fs.mkdir(path.join(notesRootPath, `section-${String(directoryIndex).padStart(2, '0')}`), { recursive: true });
  }
  await fs.mkdir(path.join(notesRootPath, 'section-00', 'nested-expanded'), { recursive: true });

  const writes: Promise<void>[] = [];
  for (let index = 0; index < fileCount; index += 1) {
    const directory = `section-${String(index % directoryCount).padStart(2, '0')}`;
    const filename = `note-${String(index).padStart(5, '0')}.md`;
    const content = [
      '---',
      `createdAt: ${1_700_000_000_000 + index}`,
      `updatedAt: ${1_700_100_000_000 + index}`,
      '---',
      '',
      `# Large Notes Root Note ${index}`,
      '',
      'Startup should not wait for every note metadata read before showing the file tree.',
      '',
    ].join('\n');
    writes.push(fs.writeFile(path.join(notesRootPath, directory, filename), content, 'utf8'));

    if (writes.length >= 128) {
      await Promise.all(writes.splice(0));
    }
  }
  await Promise.all(writes);

  return {
    notesRootPath,
    restoreRelativePath,
    restoreAbsolutePath: path.join(notesRootPath, restoreRelativePath),
  };
}

async function measureLongNoteOpenAndDrag(page: Page, notePath: string, contentCharCount: number, label: string) {
  const openTiming = await page.evaluate((pathToOpen) =>
    (window as any).__vlainaE2E.openAbsoluteNoteWithTiming(pathToOpen), notePath);
  const storeOpenMs = Math.round(openTiming.totalMs);

  const firstPaintStartedAt = Date.now();
  let previewFirstPaintMs: number | null = null;
  let editorFirstPaintMs: number | null = null;
  await expect.poll(async () => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    const firstParagraph = Array.from(editor?.children ?? [])
      .find((element): element is HTMLElement => (
        element instanceof HTMLElement &&
        element.tagName === 'P' &&
        element.textContent?.startsWith('Paragraph 0:') === true
      ));
    const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
    const rect = firstParagraph?.getBoundingClientRect();
    const scrollRootRect = scrollRoot?.getBoundingClientRect();
    const preview = document.querySelector<HTMLElement>('[data-note-first-paint-preview="true"]');
    const previewSource = preview?.querySelector<HTMLTextAreaElement>('[data-note-first-paint-preview-source="true"]');
    const previewRect = previewSource?.getBoundingClientRect();
    const previewScrollRoot = preview?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
    const previewScrollRootRect = previewScrollRoot?.getBoundingClientRect();
    const previewViewportRect = previewScrollRootRect ?? {
      top: 0,
      bottom: window.innerHeight,
    };
    const previewVisible = Boolean(
      previewRect &&
      previewRect.width > 0 &&
      previewRect.height > 0 &&
      previewRect.bottom > previewViewportRect.top &&
      previewRect.top < previewViewportRect.bottom &&
      previewSource?.value.includes('Paragraph 0:') === true
    );
    const firstParagraphVisible = Boolean(
      rect &&
      scrollRootRect &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > scrollRootRect.top &&
      rect.top < scrollRootRect.bottom
    );
    return {
      hasEditor: Boolean(editor),
      hasFirstParagraph: Boolean(firstParagraph),
      previewVisible,
      firstParagraphVisible,
    };
  }).then((state) => {
    const elapsedMs = Date.now() - firstPaintStartedAt;
    if (state.previewVisible && previewFirstPaintMs === null) {
      previewFirstPaintMs = elapsedMs;
    }
    if (state.firstParagraphVisible && editorFirstPaintMs === null) {
      editorFirstPaintMs = elapsedMs;
    }
    return state;
  }), { timeout: 30_000 }).toMatchObject({
    hasEditor: true,
    hasFirstParagraph: true,
    firstParagraphVisible: true,
  });
  const firstParagraphVisibleMs = editorFirstPaintMs ?? Date.now() - firstPaintStartedAt;

  const selectableStartedAt = Date.now();
  await expect.poll(async () => page.evaluate(() => {
    const editor = document.querySelector('.milkdown .ProseMirror');
    const sourceFallback = document.querySelector('[data-note-source-fallback="true"]');
    const selectableBlocks = (window as any).__vlainaE2E.getNoteSelectableBlocks();
    return {
      hasEditor: Boolean(editor),
      hasSourceFallback: Boolean(sourceFallback),
      selectableCount: selectableBlocks.length,
      firstText: selectableBlocks[0]?.text ?? '',
    };
  }), { timeout: 30_000 }).toMatchObject({
    hasEditor: true,
    hasSourceFallback: false,
    selectableCount: expect.any(Number),
    firstText: expect.stringContaining('Long Open Performance'),
  });
  const selectableReadyMs = Date.now() - selectableStartedAt;
  console.info(`[notes-open-performance-open:${label}]`, {
    contentCharCount,
    storeOpenMs,
    previewFirstPaintMs,
    firstParagraphVisibleMs,
    selectableReadyMs,
  });

  const dragMetrics = await page.evaluate(async () => {
    const paragraph = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror p'))
      .find((element) => element.textContent?.includes('Paragraph 0:'));
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    if (!paragraph) {
      return null;
    }
    paragraph.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const rect = paragraph.getBoundingClientRect();
    const editorRect = editor?.getBoundingClientRect() ?? rect;
    const scrollRootRect = editor?.closest('[data-note-scroll-root="true"]')?.getBoundingClientRect() ?? editorRect;
    const startX = Math.min(scrollRootRect.right - 24, editorRect.right + 72);
    const visibleTop = Math.max(rect.top, scrollRootRect.top + 24);
    const visibleBottom = Math.min(rect.bottom, scrollRootRect.bottom - 24);
    const startY = visibleTop + Math.max(16, (visibleBottom - visibleTop) * 0.35);
    const hit = document.elementFromPoint(startX, startY);
    return {
      startX,
      startY,
      endX: Math.max(editorRect.left + 24, rect.left + 24),
      endY: Math.min(scrollRootRect.bottom - 24, startY + 160),
      paragraphLeft: rect.left,
      paragraphRight: rect.right,
      editorLeft: editorRect.left,
      editorRight: editorRect.right,
      scrollRootLeft: scrollRootRect.left,
      scrollRootRight: scrollRootRect.right,
      hitTagName: hit instanceof HTMLElement ? hit.tagName : null,
      hitClassName: hit instanceof HTMLElement ? hit.className : null,
      hitInsideEditor: hit instanceof Node && Boolean(editor?.contains(hit)),
    };
  });
  expect(dragMetrics).not.toBeNull();

  const dragStartedAt = Date.now();
  await page.mouse.move(dragMetrics!.startX, dragMetrics!.startY);
  await page.mouse.down();
  await page.mouse.move(dragMetrics!.endX, dragMetrics!.endY, { steps: 6 });
  await page.mouse.up();
  const mouseGestureMs = Date.now() - dragStartedAt;
  const dragDiagnostics = await page.evaluate(() => ({
    selectedCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
    dragBoxCount: document.querySelectorAll('[data-editor-drag-box="true"]').length,
    pending: document.querySelector('.milkdown .ProseMirror')?.classList.contains('editor-block-selection-pending') ?? false,
    active: document.querySelector('.milkdown .ProseMirror')?.classList.contains('editor-block-selection-active') ?? false,
  }));
  console.info(`[notes-open-performance-drag:${label}]`, {
    dragMetrics,
    dragDiagnostics,
  });
  const selectionVisibleStartedAt = Date.now();
  await expect(page.locator(SELECTED_BLOCK_SELECTOR).first()).toBeVisible({ timeout: 10_000 });
  const selectionVisibleMs = Date.now() - selectionVisibleStartedAt;
  const dragSelectMs = Date.now() - dragStartedAt;

  const finalMetrics = await page.evaluate(() => ({
    selectedCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
    blockCount: (window as any).__vlainaE2E.getNoteSelectableBlocks().length,
    sourceFallbackCount: document.querySelectorAll('[data-note-source-fallback="true"]').length,
  }));

  console.info(`[notes-open-performance:${label}]`, {
    contentCharCount,
    storeOpenMs,
    previewFirstPaintMs,
    firstParagraphVisibleMs,
    selectableReadyMs,
    mouseGestureMs,
    selectionVisibleMs,
    dragSelectMs,
    ...finalMetrics,
  });

  expect(finalMetrics.sourceFallbackCount).toBe(0);
  expect(contentCharCount).toBeGreaterThan(2_000_000);
  expect(finalMetrics.blockCount).toBeGreaterThan(1000);
  expect(finalMetrics.selectedCount).toBeGreaterThan(0);
}

test.describe('notes long markdown open performance', () => {
  test.setTimeout(120_000);

  test('shows a large notes root file tree before full metadata indexing finishes', async () => {
    const { app, userDataRoot, userDataDir } = await launchIsolatedElectron('notes-large-notes-root-open');

    try {
      const fixture = await createManyFileNotesRootFixture(userDataDir, 1800);
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      await setAppViewMode(page, 'notes');
      const openStartedAt = Date.now();
      await page.evaluate(
        ({ path: notesRootToOpen, name }) => (window as any).__vlainaE2E.openNotesRoot(notesRootToOpen, name),
        { path: fixture.notesRootPath, name: 'Large Notes Root Performance' },
      );
      const openActionMs = Date.now() - openStartedAt;

      await expect.poll(async () => page.evaluate((expectedNotesRootPath) => {
        const notesRootState = (window as any).__vlainaE2E.getNotesRootState();
        const treeMetrics = (window as any).__vlainaE2E.getNotesTreeMetrics();
        return {
          currentNotesRootPath: notesRootState.currentNotesRoot?.path ?? null,
          rootVisible: Boolean(document.querySelector('[data-file-tree-primary="true"]')),
          visibleFolderCount: document.querySelectorAll('[data-file-tree-kind="folder"]').length,
          isLoading: treeMetrics.isLoading,
          expectedNotesRootPath,
        };
      }, fixture.notesRootPath), { timeout: 30_000 }).toMatchObject({
        currentNotesRootPath: fixture.notesRootPath,
        rootVisible: true,
        visibleFolderCount: expect.any(Number),
      });

      await expect.poll(async () => page.locator('[data-file-tree-kind="folder"]').count(), { timeout: 30_000 })
        .toBeGreaterThan(0);
      const firstTreeVisibleMs = Date.now() - openStartedAt;

      await expect.poll(async () => page.evaluate(() => (
        (window as any).__vlainaE2E.getNotesTreeMetrics().files
      )), { timeout: 30_000 }).toBe(1800);
      const treeMetrics = await page.evaluate(() => (window as any).__vlainaE2E.getNotesTreeMetrics());
      console.info('[notes-large-notes-root-open-performance]', {
        openActionMs,
        treeVisibleAfterOpenActionMs: firstTreeVisibleMs - openActionMs,
        firstTreeVisibleMs,
        ...treeMetrics,
      });

      expect(treeMetrics.files).toBe(1800);
      expect(firstTreeVisibleMs).toBeLessThan(5_000);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('shows a large notes root file tree quickly after switching from another notes root', async () => {
    const { app, userDataRoot, userDataDir } = await launchIsolatedElectron('notes-large-notes-root-switch');

    try {
      const previousNotesRootPath = path.join(userDataDir, `previous-notes-root-${Date.now().toString(36)}`);
      await fs.mkdir(previousNotesRootPath, { recursive: true });
      await fs.writeFile(path.join(previousNotesRootPath, 'previous.md'), '# Previous notes root\n', 'utf8');
      const fixture = await createManyFileNotesRootFixture(userDataDir, 1800);
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      await setAppViewMode(page, 'notes');
      await page.evaluate(
        ({ path: notesRootToOpen, name }) => (window as any).__vlainaE2E.openNotesRoot(notesRootToOpen, name),
        { path: previousNotesRootPath, name: 'Previous Notes Root' },
      );
      await expect.poll(async () => page.evaluate((expectedNotesRootPath) => (
        (window as any).__vlainaE2E.getNotesTreeMetrics().rootFolderPath === expectedNotesRootPath
      ), previousNotesRootPath), { timeout: 30_000 }).toBe(true);

      const openStartedAt = Date.now();
      await page.evaluate(
        ({ path: notesRootToOpen, name }) => (window as any).__vlainaE2E.openNotesRoot(notesRootToOpen, name),
        { path: fixture.notesRootPath, name: 'Large Notes Root Switch Performance' },
      );

      await expect.poll(async () => page.evaluate((expectedNotesRootPath) => {
        const treeMetrics = (window as any).__vlainaE2E.getNotesTreeMetrics();
        return {
          rootFolderPath: treeMetrics.rootFolderPath,
          rootVisible: Boolean(document.querySelector('[data-file-tree-primary="true"]')),
          visibleFolderCount: document.querySelectorAll('[data-file-tree-kind="folder"]').length,
        };
      }, fixture.notesRootPath), { timeout: 30_000 }).toMatchObject({
        rootFolderPath: fixture.notesRootPath,
        rootVisible: true,
        visibleFolderCount: expect.any(Number),
      });

      await expect.poll(async () => page.locator('[data-file-tree-kind="folder"]').count(), { timeout: 30_000 })
        .toBeGreaterThan(0);
      const firstTreeVisibleMs = Date.now() - openStartedAt;

      await expect.poll(async () => page.evaluate(() => (
        (window as any).__vlainaE2E.getNotesTreeMetrics().files
      )), { timeout: 30_000 }).toBe(1800);
      const treeMetrics = await page.evaluate(() => (window as any).__vlainaE2E.getNotesTreeMetrics());
      console.info('[notes-large-notes-root-switch-performance]', {
        firstTreeVisibleMs,
        ...treeMetrics,
      });

      expect(treeMetrics.files).toBe(1800);
      expect(firstTreeVisibleMs).toBeLessThan(5_000);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('restores note content in a large notes root before full metadata indexing finishes', async () => {
    const { app, userDataRoot, userDataDir } = await launchIsolatedElectron('notes-large-notes-root-restore-note');

    try {
      const fixture = await createManyFileNotesRootFixture(userDataDir, 1800);
      await writeNotesRootWorkspace(userDataDir, fixture.notesRootPath, {
        currentNotePath: fixture.restoreRelativePath,
        expandedFolders: ['section-00', 'section-00/nested-expanded'],
      });
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      await setAppViewMode(page, 'notes');
      const openStartedAt = Date.now();
      await page.evaluate(
        ({ path: notesRootToOpen, name }) => (window as any).__vlainaE2E.openNotesRoot(notesRootToOpen, name),
        { path: fixture.notesRootPath, name: 'Large Notes Root Restore Note Performance' },
      );

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Large Notes Root Note 0', {
        timeout: 30_000,
      });
      const editorVisibleMs = Date.now() - openStartedAt;
      const state = await page.evaluate(() => ({
        notes: (window as any).__vlainaE2E.getNotesState(),
        tree: (window as any).__vlainaE2E.getNotesTreeMetrics(),
      }));
      console.info('[notes-large-notes-root-restore-note-performance]', {
        editorVisibleMs,
        currentNotePath: state.notes.currentNote?.path ?? null,
        ...state.tree,
      });

      expect(state.notes.currentNote?.path).toBe(fixture.restoreRelativePath);
      expect(editorVisibleMs).toBeLessThan(5_000);
      await expect.poll(async () => page.evaluate(() => (
        (window as any).__vlainaE2E.getNotesTreeMetrics().expandedFolders
      )), { timeout: 30_000 }).toEqual(expect.arrayContaining([
        'section-00',
        'section-00/nested-expanded',
      ]));
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('cold-opens a long markdown note as rendered Milkdown', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-open-performance-cold');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      page.on('console', (message) => {
        const text = message.text();
        if (text.includes('[notes-milkdown-timing:')) {
          console.info(text);
        }
      });

      const content = createLongMarkdown(650);
      const contentCharCount = content.length;
      const { notePath } = await page.evaluate((markdown) =>
        (window as any).__vlainaE2E.createNotesFixture({
          filename: 'cold-long-open-performance.md',
          content: markdown,
        }), content);

      await measureLongNoteOpenAndDrag(page, notePath, contentCharCount, 'cold');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('opens a long markdown note as rendered Milkdown and supports immediate block drag selection', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-open-performance-switch');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      page.on('console', (message) => {
        const text = message.text();
        if (text.includes('[notes-milkdown-timing:')) {
          console.info(text);
        }
      });
      const { notePath: warmupNotePath } = await page.evaluate(() =>
        (window as any).__vlainaE2E.createNotesFixture({
          filename: 'warmup.md',
          content: '# Warmup\n\nSmall note before the long markdown measurement.',
        }));
      await page.evaluate((pathToOpen) => (window as any).__vlainaE2E.openAbsoluteNote(pathToOpen), warmupNotePath);
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Small note before' })).toBeVisible({ timeout: 30_000 });

      const content = createLongMarkdown(650);
      const contentCharCount = content.length;
      const { notePath } = await page.evaluate((markdown) =>
        (window as any).__vlainaE2E.createNotesFixture({
          filename: 'long-open-performance.md',
          content: markdown,
        }), content);

      await measureLongNoteOpenAndDrag(page, notePath, contentCharCount, 'switch');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
