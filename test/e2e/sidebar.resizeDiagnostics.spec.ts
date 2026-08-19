import { expect, test } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  EDITOR_SELECTOR,
  FILE_TREE_FILE_SELECTOR,
  getOpenBridgePages,
  launchIsolatedElectron,
  openNotesRootInNotes,
} from './notesE2E';

test('resizes and records a deferred Notes sidebar layout', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('sidebar-resize-diagnostics');

  try {
    await app.firstWindow();
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 945, height: 1036 });

    const fixture = await createNotesRootFilesFixture(page, {
      name: 'sidebar-resize-diagnostics',
      files: [
        {
          filename: 'diagnostic.md',
          content: [
            ...Array.from(
              { length: 455 },
              (_, index) => index === 0
                ? '# Sidebar resize diagnostic heading'
                : `Sidebar resize diagnostic block ${index + 1}.`,
            ),
            'SIDEBAR_RESIZE_DIAGNOSTIC_FINAL_BLOCK',
          ].join('\n\n'),
        },
        ...Array.from({ length: 119 }, (_, index) => ({
          filename: `sidebar-fixture-${String(index + 1).padStart(3, '0')}.md`,
          content: `Sidebar fixture ${index + 1}`,
        })),
      ],
    });
    await openNotesRootInNotes(page, {
      notesRootPath: fixture.notesRootPath,
      name: 'Sidebar Resize Diagnostics NotesRoot',
      minFileCount: 1,
    });
    await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'diagnostic' }).first().click();
    await expect(page.locator(EDITOR_SELECTOR)).toContainText(
      'SIDEBAR_RESIZE_DIAGNOSTIC_FINAL_BLOCK',
      { timeout: 30_000 },
    );
    await expect.poll(() => page.locator('.ProseMirror').first().locator(':scope > *').count())
      .toBeGreaterThanOrEqual(456);
    await page.evaluate(() => {
      window.__vlainaDiagnosticsLog = [];
    });

    const resizeHandle = page.locator('[data-resize-handle="shell-sidebar"]').first();
    const sidebar = page.locator('[data-shell-sidebar-width-scope="true"] aside').first();
    const startSidebarWidth = await sidebar.evaluate((element) => (
      element.getBoundingClientRect().width
    ));
    const editor = page.locator(EDITOR_SELECTOR).first();
    const topToolbar = page.locator('[data-note-top-toolbar="true"]').first();
    const outlineRail = page.locator('[data-editor-outline-rail="true"]').first();
    await expect(topToolbar).toBeVisible();
    await expect(outlineRail).toBeVisible();
    const startToolbarRight = await topToolbar.evaluate((element) => (
      element.getBoundingClientRect().right
    ));
    const startEditorLeft = await editor.evaluate((element) => (
      element.getBoundingClientRect().left
    ));
    const startOutlineRight = await outlineRail.evaluate((element) => (
      element.getBoundingClientRect().right
    ));
    const dragDeltas = Array.from({ length: 18 }, (_, index) => (index + 1) * 12);
    const dragDistance = dragDeltas.at(-1)!;
    const readLiveMetrics = () => page.evaluate(() => {
      const sidebarElement = document.querySelector<HTMLElement>(
        '[data-shell-sidebar-width-scope="true"] aside',
      );
      const toolbarElement = document.querySelector<HTMLElement>('[data-note-top-toolbar="true"]');
      const outlineElement = document.querySelector<HTMLElement>('[data-editor-outline-rail="true"]');
      if (!sidebarElement || !toolbarElement || !outlineElement) return null;
      const toolbarRect = toolbarElement.getBoundingClientRect();
      const toolbarPointElements = document.elementsFromPoint(
        toolbarRect.right - 4,
        toolbarRect.top + toolbarRect.height / 2,
      );
      const outlineRect = outlineElement.getBoundingClientRect();
      const outlinePointElements = document.elementsFromPoint(
        outlineRect.right - 4,
        outlineRect.top + outlineRect.height / 2,
      );

      return {
        editorLeft: document.querySelector<HTMLElement>(
          '.milkdown .ProseMirror[contenteditable="true"]',
        )?.getBoundingClientRect().left ?? null,
        hasPreview: document.querySelector('[data-sidebar-resize-preview="true"]') !== null,
        outlinePainted: outlinePointElements.some((candidate) => (
          candidate === outlineElement || outlineElement.contains(candidate)
        )),
        outlineRight: outlineRect.right,
        sidebarWidth: sidebarElement.getBoundingClientRect().width,
        toolbarPainted: toolbarPointElements.some((candidate) => (
          candidate === toolbarElement || toolbarElement.contains(candidate)
        )),
        toolbarPosition: getComputedStyle(toolbarElement).position,
        toolbarRight: toolbarRect.right,
      };
    });

    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (const deltaX of dragDeltas) {
      await page.mouse.move(startX + deltaX, startY);
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }));
    }
    const liveMetrics = await readLiveMetrics();
    expect(liveMetrics).not.toBeNull();
    expect(liveMetrics!.editorLeft).toBeCloseTo(startEditorLeft + dragDistance, 0);
    expect(liveMetrics!.hasPreview).toBe(false);
    expect(liveMetrics!.outlinePainted).toBe(true);
    expect(liveMetrics!.outlineRight).toBeCloseTo(startOutlineRight, 0);
    expect(liveMetrics!.sidebarWidth).toBeCloseTo(startSidebarWidth + dragDistance, 0);
    expect(liveMetrics!.toolbarPainted).toBe(true);
    expect(liveMetrics!.toolbarPosition).toBe('fixed');
    expect(liveMetrics!.toolbarRight).toBeCloseTo(startToolbarRight, 0);
    await page.mouse.up();
    await expect.poll(() => sidebar.evaluate((element) => (
      element.getBoundingClientRect().width
    ))).toBeCloseTo(startSidebarWidth + dragDistance, 0);
    await expect.poll(() => page.evaluate(() => window.__vlainaDiagnosticsLog?.filter((entry) => (
      entry.channel === 'layout' && entry.event === 'sidebar-resize-summary'
    )).length ?? 0)).toBe(1);

    const expandedEditorLeft = await editor.evaluate((element) => (
      element.getBoundingClientRect().left
    ));

    const reverseHandleBox = await resizeHandle.boundingBox();
    expect(reverseHandleBox).not.toBeNull();
    const reverseStartX = reverseHandleBox!.x + reverseHandleBox!.width / 2;
    const reverseStartY = reverseHandleBox!.y + reverseHandleBox!.height / 2;
    await page.mouse.move(reverseStartX, reverseStartY);
    await page.mouse.down();
    for (const deltaX of dragDeltas) {
      await page.mouse.move(reverseStartX - deltaX, reverseStartY);
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }));
    }
    const reverseMetrics = await readLiveMetrics();
    expect(reverseMetrics).not.toBeNull();
    expect(reverseMetrics!.editorLeft).toBeCloseTo(expandedEditorLeft - dragDistance, 0);
    expect(reverseMetrics!.hasPreview).toBe(false);
    expect(reverseMetrics!.outlinePainted).toBe(true);
    expect(reverseMetrics!.outlineRight).toBeCloseTo(startOutlineRight, 0);
    expect(reverseMetrics!.sidebarWidth).toBeCloseTo(startSidebarWidth, 0);
    expect(reverseMetrics!.toolbarPainted).toBe(true);
    expect(reverseMetrics!.toolbarPosition).toBe('fixed');
    expect(reverseMetrics!.toolbarRight).toBeCloseTo(startToolbarRight, 0);
    await page.mouse.up();
    await expect.poll(() => sidebar.evaluate((element) => (
      element.getBoundingClientRect().width
    ))).toBeCloseTo(startSidebarWidth, 0);
    await expect.poll(() => editor.evaluate((element) => (
      element.getBoundingClientRect().left
    ))).toBeCloseTo(startEditorLeft, 0);
    await expect.poll(() => page.evaluate(() => window.__vlainaDiagnosticsLog?.filter((entry) => (
      entry.channel === 'layout' && entry.event === 'sidebar-resize-summary'
    )).length ?? 0)).toBe(2);

    const summaries = await page.evaluate(() => window.__vlainaDiagnosticsLog
      ?.filter((entry) => (
        entry.channel === 'layout' && entry.event === 'sidebar-resize-summary'
      ))
      .map((entry) => entry.details) ?? []);
    expect(summaries).toHaveLength(2);
    for (const [index, summary] of summaries.entries()) {
      const diagnosticContext = JSON.stringify({
        direction: index === 0 ? 'right' : 'left',
        dragFrames: summary?.dragFrames,
        longTasks: summary?.longTasks,
        releaseFrames: summary?.releaseFrames,
        work: summary?.work,
      });
      expect(Number((summary?.dragFrames as { count?: unknown })?.count)).toBeGreaterThan(0);
      expect(
        Number((summary?.dragFrames as { p95Ms?: unknown })?.p95Ms),
        diagnosticContext,
      ).toBeLessThan(25);
      expect(Number((summary?.dragFrames as { over50Ms?: unknown })?.over50Ms)).toBe(0);
      expect(Number((summary?.dragFrames as { over100Ms?: unknown })?.over100Ms)).toBe(0);
      expect(
        Number((summary?.releaseFrames as { over100Ms?: unknown })?.over100Ms),
        JSON.stringify({
          longTasks: summary?.longTasks,
          releaseFrames: summary?.releaseFrames,
          work: summary?.work,
        }),
      ).toBe(0);
      expect(Number((summary?.widthUpdates as { count?: unknown })?.count)).toBeGreaterThan(0);
      expect(Number((summary?.widthUpdates as { p95Ms?: unknown })?.p95Ms)).toBeLessThan(2);
      expect(Number((summary?.dom as { renderedFileTreeRowCount?: unknown })?.renderedFileTreeRowCount))
        .toBeGreaterThan(30);
    }
    expect(Number(summaries[0]?.endSidebarWidth)).toBeGreaterThan(
      Number(summaries[0]?.startSidebarWidth),
    );
    expect(Number(summaries[1]?.endSidebarWidth)).toBeLessThan(
      Number(summaries[1]?.startSidebarWidth),
    );
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});
