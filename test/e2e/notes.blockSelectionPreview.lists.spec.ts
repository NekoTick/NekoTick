import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
} from './notesE2E';

test.describe('notes block selection list previews', () => {
  test.setTimeout(90_000);

  test('uses the full parent-list geometry for a committed header-only preview', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-committed-parent-list-header-preview');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const { notePath } = await page.evaluate(() =>
        (window as any).__vlainaE2E.createNotesFixture({
          filename: 'committed-parent-list-header-preview.md',
          content: [
            '# Committed Parent List Header Preview',
            '',
            '1. Parent header-only preview sentinel',
            '   1. Nested child geometry sentinel',
            '2. Following preview sentinel',
            '',
            ...Array.from({ length: 36 }, (_, index) => `Committed threshold filler ${index + 1}`),
            '',
          ].join('\n'),
        })
      );

      await page.evaluate((pathToOpen) => (window as any).__vlainaE2E.openAbsoluteNote(pathToOpen), notePath);
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li li`, { hasText: 'Nested child geometry sentinel' }))
        .toBeVisible();

      const blocks = await page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks());
      const parentIndex = blocks.findIndex((block: { rangeText: string }) => (
        block.rangeText === 'Parent header-only preview sentinel'
      ));
      expect(parentIndex, JSON.stringify(blocks, null, 2)).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate((index) => (
        (window as any).__vlainaE2E.selectNoteBlocksByIndexes([
          index,
          ...Array.from({ length: 31 }, (_value, offset) => index + offset + 2),
        ])
      ), parentIndex)).toBe(32);

      const committedPreview = page.locator('[data-editor-block-selection-committed-preview="true"]');
      await expect(committedPreview).toHaveAttribute('data-selection-count', '32');
      const geometry = await page.evaluate(() => {
        const parent = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror > ol > li'))
          .find((element) => element.textContent?.includes('Parent header-only preview sentinel')) ?? null;
        const child = parent?.querySelector<HTMLElement>('li') ?? null;
        const host = document.querySelector<HTMLElement>('.milkdown') ?? null;
        const path = document.querySelector<SVGPathElement>(
          '[data-editor-block-selection-committed-preview="true"] path',
        );
        if (!parent || !child || !host || !path) return null;
        const pathData = path.getAttribute('d') ?? '';
        const firstSubpath = pathData.slice(0, pathData.indexOf('Z') + 1);
        const probeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const probePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        probePath.setAttribute('d', firstSubpath);
        probeSvg.appendChild(probePath);
        host.appendChild(probeSvg);
        const firstSubpathBounds = probePath.getBBox();
        probeSvg.remove();
        return {
          childBottom: child.getBoundingClientRect().bottom - host.getBoundingClientRect().top,
          firstSubpathBottom: firstSubpathBounds.y + firstSubpathBounds.height,
          firstSubpathCount: pathData.match(/M/g)?.length ?? 0,
        };
      });
      expect(geometry).not.toBeNull();
      expect(geometry?.firstSubpathCount).toBe(32);
      expect(
        geometry?.firstSubpathBottom,
        JSON.stringify({
          geometry,
          parentBlock: blocks[parentIndex],
          childBlock: blocks.find((block: { rangeText: string }) => (
            block.rangeText === 'Nested child geometry sentinel'
          )),
        }, null, 2),
      ).toBeGreaterThanOrEqual((geometry?.childBottom ?? Number.POSITIVE_INFINITY) - 1);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps deferred nested-list previews grouped like the committed selection', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-deferred-nested-list-selection-preview');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const { notePath } = await page.evaluate(() =>
        (window as any).__vlainaE2E.createNotesFixture({
          filename: 'deferred-nested-list-selection-preview.md',
          content: [
            '# Deferred Nested List Selection Preview',
            '',
            '1. Parent preview sentinel',
            '   1. Nested child preview sentinel',
            '2. Following preview sentinel',
            '',
            ...Array.from({ length: 36 }, (_, index) => `Preview threshold filler ${index + 1}`),
            '',
          ].join('\n'),
        })
      );

      await page.evaluate((pathToOpen) => (window as any).__vlainaE2E.openAbsoluteNote(pathToOpen), notePath);
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li li`, { hasText: 'Nested child preview sentinel' }))
        .toBeVisible();
      expect(await page.evaluate(() => (
        (window as any).__vlainaE2E.getNoteSelectableBlocks().length
      ))).toBeGreaterThanOrEqual(32);

      const drag = await page.evaluate(async () => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror[contenteditable="true"]');
        const scrollRoot = editor?.closest<HTMLElement>('[data-note-scroll-root="true"]') ?? null;
        const parent = Array.from(editor?.querySelectorAll<HTMLElement>(':scope > ol > li') ?? [])
          .find((element) => element.textContent?.includes('Parent preview sentinel')) ?? null;
        const child = parent?.querySelector<HTMLElement>('li') ?? null;
        const header = parent?.firstElementChild instanceof HTMLElement
          ? parent.firstElementChild
          : null;
        if (!editor || !scrollRoot || !parent || !child || !header) return null;

        parent.scrollIntoView({ block: 'center', inline: 'nearest' });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const editorRect = editor.getBoundingClientRect();
        const scrollRootRect = scrollRoot.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const childRect = child.getBoundingClientRect();
        const startY = headerRect.top + Math.min(4, headerRect.height / 2);
        const startCandidates = [
          editorRect.right + 72,
          editorRect.right + 48,
          editorRect.right + 24,
          scrollRootRect.right - 24,
        ].map((x) => Math.min(scrollRootRect.right - 24, Math.max(scrollRootRect.left + 24, x)));
        const startX = startCandidates.find((x) => {
          const hit = document.elementFromPoint(x, startY);
          return hit instanceof Node && !editor.contains(hit) && scrollRoot.contains(hit);
        }) ?? startCandidates[0];
        return {
          startX,
          startY,
          endX: Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, headerRect.left + 160)),
          endY: childRect.bottom - Math.min(12, childRect.height / 3),
        };
      });
      expect(drag, 'nested-list blank-area drag geometry').not.toBeNull();
      if (!drag) return;

      await page.mouse.move(drag.startX, drag.startY);
      await page.mouse.down();
      await page.mouse.move(drag.endX, drag.endY, { steps: 10 });

      const preview = page.locator('[data-editor-block-selection-preview="true"]');
      await expect(preview).toHaveAttribute('data-selection-count', '1');
      const previewGeometry = await preview.locator('path').evaluate((path) => {
        const parent = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror > ol > li'))
          .find((element) => element.textContent?.includes('Parent preview sentinel')) ?? null;
        const child = parent?.querySelector<HTMLElement>('li') ?? null;
        return {
          childBottom: child?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
          pathBottom: path.getBoundingClientRect().bottom,
          subpathCount: path.getAttribute('d')?.match(/M/g)?.length ?? 0,
        };
      });
      expect(previewGeometry.subpathCount).toBe(1);
      expect(previewGeometry.pathBottom).toBeGreaterThanOrEqual(previewGeometry.childBottom - 1);

      await page.mouse.up();
      await expect(preview).toHaveCount(0);
      await expect.poll(async () => page.evaluate(() => {
        const parent = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror > ol > li'))
          .find((element) => element.textContent?.includes('Parent preview sentinel')) ?? null;
        const child = parent?.querySelector<HTMLElement>('li') ?? null;
        const selected = Array.from(document.querySelectorAll<HTMLElement>(
          '.milkdown .ProseMirror .editor-block-selected',
        ));
        const visualRoots = selected.filter((element) => (
          !element.parentElement?.closest('.editor-block-selected')
        ));
        return {
          childSelected: child?.classList.contains('editor-block-selected') ?? false,
          parentSelected: parent?.classList.contains('editor-block-selected') ?? false,
          visualRootCount: visualRoots.length,
        };
      })).toEqual({
        childSelected: true,
        parentSelected: true,
        visualRootCount: 1,
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
