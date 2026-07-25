import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  BLOCK_CONTROLS_SELECTOR,
  EDITOR_SELECTOR,
  SELECTED_BLOCK_SELECTOR,
  cleanupIsolatedElectron,
  getBlankAreaDragTarget,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from "./notesE2E";
import { expectDragSourceSelectionSurface, measureSelectedSurfaceCoverage } from "./notesBlockSelectionDragHelpers";
import {
  openBlockSelectionFixture,
  expectSelectedParagraphs,
  selectNoteBlocksByMatchers,
  moveMouseToBlockHandleGutter,
  measureCollapseToggleClearance,
} from "./notesBlockSelectionShared";

async function installSyntheticTyporaLinkTheme(page: Page) {
  const themeDirectoryPath = await page.evaluate(() =>
    (window as any).__vlainaE2E.getImportedMarkdownThemesDirectoryPath()
  );
  const cssFilename = 'block-selection-link-color-typora.css';
  const css = [
    ':root { --a-c: #1167ff; --text-color: #242424; --bg-color: #ffffff; }',
    '#write { color: var(--text-color); background: var(--bg-color); }',
    '#write a {',
    '  color: var(--a-c) !important;',
    '  -webkit-text-fill-color: var(--a-c) !important;',
    '}',
  ].join('\n');

  await fs.mkdir(themeDirectoryPath, { recursive: true });
  await fs.writeFile(path.join(themeDirectoryPath, cssFilename), css, 'utf8');

  const syncResult = await page.evaluate(() =>
    (window as any).__vlainaE2E.syncImportedMarkdownThemesFromDirectory()
  );
  const theme = syncResult.themes.find((candidate: { sourcePath?: string | null; name: string }) =>
    candidate.sourcePath?.replace(/\\/g, '/').endsWith(`/${cssFilename}`) ||
    candidate.name === cssFilename.replace(/\.css$/i, '')
  );

  if (!theme) {
    throw new Error([
      `Could not sync synthetic Typora link theme ${cssFilename}`,
      `themeDirectoryPath=${themeDirectoryPath}`,
      `syncResult=${JSON.stringify(syncResult)}`,
    ].join('\n'));
  }

  await page.evaluate((themeId) =>
    (window as any).__vlainaE2E.setMarkdownImportedThemeId(themeId), theme.id);
  await expect.poll(() => page.evaluate((themeId) => {
    const root = document.querySelector<HTMLElement>('[data-markdown-theme-root="true"]');
    return {
      compatLayer: root?.dataset.markdownCompatLayer ?? null,
      importedTheme: root?.dataset.markdownImportedTheme ?? null,
      platform: root?.dataset.markdownThemePlatform ?? null,
      rootTheme: document.documentElement.getAttribute('data-vlaina-imported-app-theme'),
      markdownStyle: Boolean(document.head.querySelector(
        `style[data-vlaina-imported-markdown-theme="true"]#vlaina-imported-markdown-theme-${CSS.escape(themeId)}`
      )),
      postBridgeStyle: Boolean(document.head.querySelector(
        `style[data-vlaina-imported-markdown-theme-post-bridge="true"]#vlaina-imported-markdown-theme-post-bridge-${CSS.escape(themeId)}`
      )),
    };
  }, theme.id), { timeout: 30_000 }).toMatchObject({
    compatLayer: 'external',
    importedTheme: theme.id,
    markdownStyle: true,
    platform: 'typora',
    postBridgeStyle: true,
    rootTheme: theme.id,
  });
}

test.describe("notes block selection", () => {
  test.setTimeout(90_000);

  test('keeps selected markdown blank-line rows on the same visual rhythm as text rows', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-blank-line-rhythm');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'block-selection-blank-line-rhythm.md',
        content: ['1', '', '2'].join('\n'),
      });

      const selectableBlocks = await page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks());
      expect(selectableBlocks.map((block: { text: string }) => block.text)).toEqual(['1', '', '2']);

      const selectedCount = await page.evaluate(async () => {
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([0, 1, 2]);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      });
      expect(selectedCount).toBe(3);

      const geometry = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        if (!editor) return null;

        const parsePx = (value: string, fallback = 0) => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const resolvePaintRect = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const after = getComputedStyle(element, '::after');
          if (after.content !== 'none' && after.display !== 'none' && after.position === 'absolute') {
            return {
              top: rect.top + parsePx(after.top),
              bottom: rect.bottom - parsePx(after.bottom),
              height: rect.height - parsePx(after.top) - parsePx(after.bottom),
            };
          }

          return {
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
          };
        };

        const rows = Array.from(editor.children)
          .filter((element): element is HTMLElement =>
            element instanceof HTMLElement && element.classList.contains('editor-block-selected')
          )
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const paint = resolvePaintRect(element);
            const style = getComputedStyle(element);
            const after = getComputedStyle(element, '::after');
            return {
              tagName: element.tagName,
              text: element.textContent?.trim() ?? '',
              className: element.className,
              rectTop: Math.round(rect.top * 100) / 100,
              rectBottom: Math.round(rect.bottom * 100) / 100,
              rectHeight: Math.round(rect.height * 100) / 100,
              paintTop: Math.round(paint.top * 100) / 100,
              paintBottom: Math.round(paint.bottom * 100) / 100,
              paintHeight: Math.round(paint.height * 100) / 100,
              marginTop: style.marginTop,
              marginBottom: style.marginBottom,
              minHeight: style.minHeight,
              lineHeight: style.lineHeight,
              afterTop: after.top,
              afterBottom: after.bottom,
            };
          })
          .sort((left, right) => left.rectTop - right.rectTop);

        const rectTopDeltas = rows.slice(1).map((row, index) => (
          Math.round((row.rectTop - rows[index].rectTop) * 100) / 100
        ));
        const paintGaps = rows.slice(1).map((row, index) => (
          Math.round((row.paintTop - rows[index].paintBottom) * 100) / 100
        ));

        return { rows, rectTopDeltas, paintGaps };
      });

      expect(geometry).not.toBeNull();
      expect(geometry!.rows, JSON.stringify(geometry, null, 2)).toHaveLength(3);
      expect(Math.abs(geometry!.rectTopDeltas[0] - geometry!.rectTopDeltas[1]), JSON.stringify(geometry, null, 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry!.paintGaps[0] - geometry!.paintGaps[1]), JSON.stringify(geometry, null, 2)).toBeLessThanOrEqual(1);
      for (const gap of geometry!.paintGaps) {
        expect(gap, JSON.stringify(geometry, null, 2)).toBeGreaterThan(0.5);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps visible gaps between text rows after switching to large block selection rendering', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-large-text-row-gaps');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'block-selection-large-text-row-gaps.md',
        content: Array.from(
          { length: 132 },
          (_, index) => `Large text selection row ${index}`,
        ).join('\n\n'),
      });

      await expect.poll(
        async () => page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks().length),
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(132);

      const selectedCount = await page.evaluate(async () => {
        const indexes = Array.from({ length: 128 }, (_, index) => index);
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes(indexes);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      });
      expect(selectedCount).toBe(128);

      const geometry = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        if (!editor) return null;

        const parsePx = (value: string, fallback = 0) => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const rows = Array.from(editor.children)
          .filter((element): element is HTMLElement =>
            element instanceof HTMLElement && element.classList.contains('editor-block-selected')
          )
          .slice(0, 6)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const after = getComputedStyle(element, '::after');
            const afterTop = parsePx(after.top);
            const afterBottom = parsePx(after.bottom);
            return {
              text: element.textContent?.trim() ?? '',
              className: element.className,
              afterDisplay: after.display,
              rectTop: Math.round(rect.top * 100) / 100,
              rectBottom: Math.round(rect.bottom * 100) / 100,
              paintTop: Math.round((rect.top + afterTop) * 100) / 100,
              paintBottom: Math.round((rect.bottom - afterBottom) * 100) / 100,
              afterTop: after.top,
              afterBottom: after.bottom,
            };
          });

        const paintGaps = rows.slice(1).map((row, index) => (
          Math.round((row.paintTop - rows[index].paintBottom) * 100) / 100
        ));

        return {
          largeActive: editor.classList.contains('editor-block-selection-large'),
          selectedCount: editor.querySelectorAll('.editor-block-selected').length,
          rows,
          paintGaps,
        };
      });

      expect(geometry).not.toBeNull();
      expect(geometry!.largeActive, JSON.stringify(geometry, null, 2)).toBe(true);
      expect(geometry!.selectedCount, JSON.stringify(geometry, null, 2)).toBeGreaterThanOrEqual(128);
      expect(geometry!.rows, JSON.stringify(geometry, null, 2)).toHaveLength(6);
      expect(geometry!.rows.every((row) => row.className.includes('editor-block-selected-large-textlike')), JSON.stringify(geometry, null, 2)).toBe(true);
      expect(geometry!.rows.every((row) => row.afterDisplay !== 'none'), JSON.stringify(geometry, null, 2)).toBe(true);
      for (const gap of geometry!.paintGaps) {
        expect(gap, JSON.stringify(geometry, null, 2)).toBeGreaterThan(0.5);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps table text colors unchanged in single and large block selections', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-table-text-color');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const beforeTable = Array.from(
        { length: 72 },
        (_, index) => `Before table selection row ${index}`,
      ).join('\n\n');
      const afterTable = Array.from(
        { length: 72 },
        (_, index) => `After table selection row ${index}`,
      ).join('\n\n');
      await openMarkdownFixture(page, {
        filename: 'block-selection-table-text-color.md',
        content: [
          beforeTable,
          [
            '| 功能 | Windows |',
            '| --- | --- |',
            '| Table alpha | Ctrl+T |',
          ].join('\n'),
          afterTable,
        ].join('\n\n'),
      });

      await expect(page.locator(`${EDITOR_SELECTOR} .milkdown-table-block`, { hasText: 'Table alpha' })).toBeVisible();
      await expect.poll(
        async () => page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks().length),
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(128);

      const readTableTextColor = () => page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const table = document.querySelector<HTMLElement>('.milkdown-table-block');
        const cell = Array.from(document.querySelectorAll<HTMLElement>('.milkdown-table-block :is(th, td)'))
          .find((element) => element.textContent?.includes('Table alpha')) ?? null;
        if (!editor || !table || !cell) return null;
        const style = getComputedStyle(cell);
        const result = {
          color: style.color,
          largeActive: editor.classList.contains('editor-block-selection-large'),
          selectedCount: editor.querySelectorAll('.editor-block-selected').length,
          tableClassName: table.className,
          tableSelected: table.classList.contains('editor-block-selected'),
          textFillColor: style.getPropertyValue('-webkit-text-fill-color'),
        };
        return result;
      });

      const baseline = await readTableTextColor();
      expect(baseline).not.toBeNull();

      const tableIndex = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{ text: string }>;
        return blocks.findIndex((block) => block.text.includes('Table alpha'));
      });
      expect(tableIndex).toBeGreaterThanOrEqual(0);

      const singleSelectedCount = await page.evaluate(async (index) => {
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([index]);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      }, tableIndex);
      expect(singleSelectedCount).toBe(1);

      const singleSelection = await readTableTextColor();
      expect(singleSelection).not.toBeNull();
      expect(singleSelection!.tableSelected, JSON.stringify(singleSelection, null, 2)).toBe(true);
      expect(singleSelection!.largeActive, JSON.stringify(singleSelection, null, 2)).toBe(false);
      expect(singleSelection!.color, JSON.stringify({ baseline, singleSelection }, null, 2)).toBe(baseline!.color);
      expect(singleSelection!.textFillColor, JSON.stringify({ baseline, singleSelection }, null, 2)).toBe(baseline!.textFillColor);

      const largeSelectedCount = await page.evaluate(async (index) => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{ text: string }>;
        const startIndex = Math.min(Math.max(index - 64, 0), Math.max(blocks.length - 128, 0));
        const indexes = Array.from({ length: 128 }, (_, offset) => startIndex + offset)
          .filter((blockIndex) => blockIndex < blocks.length);
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes(indexes);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      }, tableIndex);
      expect(largeSelectedCount).toBeGreaterThanOrEqual(128);

      const largeSelection = await readTableTextColor();
      expect(largeSelection).not.toBeNull();
      expect(largeSelection!.tableSelected, JSON.stringify(largeSelection, null, 2)).toBe(true);
      expect(largeSelection!.largeActive, JSON.stringify(largeSelection, null, 2)).toBe(true);
      expect(largeSelection!.color, JSON.stringify({ baseline, largeSelection }, null, 2)).toBe(baseline!.color);
      expect(largeSelection!.textFillColor, JSON.stringify({ baseline, largeSelection }, null, 2)).toBe(baseline!.textFillColor);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps selected links at their original link color', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-link-color');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'block-selection-link-color.md',
        content: [
          'Before selected link color',
          '',
          '[Selected link target](https://example.com/selected-link-color) trailing text.',
          '',
          'Plain [Inline selected link](https://example.com/inline-selected-link-color) trailing text.\\',
          'continued inline selected line',
          '',
          'After selected link color',
        ].join('\n'),
      });
      await installSyntheticTyporaLinkTheme(page);

      const readLinkColors = () => page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const link = document.querySelector<HTMLElement>('a[href="https://example.com/selected-link-color"]');
        const paragraph = link?.closest('p') as HTMLElement | null;
        if (!editor || !link || !paragraph) return null;

        const linkStyle = getComputedStyle(link);
        const paragraphStyle = getComputedStyle(paragraph);
        const result = {
          editorClassName: editor.className,
          linkChildOverlayCount: link.querySelectorAll('.editor-text-selection-overlay').length,
          linkClassName: link.className,
          linkColor: linkStyle.color,
          linkTextFillColor: linkStyle.getPropertyValue('-webkit-text-fill-color'),
          overlayCount: editor.querySelectorAll('.editor-text-selection-overlay').length,
          paragraphClassName: paragraph.className,
          paragraphColor: paragraphStyle.color,
          paragraphTextFillColor: paragraphStyle.getPropertyValue('-webkit-text-fill-color'),
          selected: paragraph.classList.contains('editor-block-selected'),
        };
        return result;
      });
      const readMixedInlineLinkColors = () => page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const link = document.querySelector<HTMLElement>('a[href="https://example.com/inline-selected-link-color"]');
        const paragraph = link?.closest('p') as HTMLElement | null;
        if (!editor || !link || !paragraph) return null;

        const linkStyle = getComputedStyle(link);
        const paragraphStyle = getComputedStyle(paragraph);
        const selectedInlineRows = Array.from(paragraph.querySelectorAll<HTMLElement>('.editor-block-selected'))
          .map((element) => {
            const style = getComputedStyle(element);
            return {
              className: element.className,
              color: style.color,
              text: element.textContent ?? '',
              textFillColor: style.getPropertyValue('-webkit-text-fill-color'),
            };
          });
        const result = {
          linkColor: linkStyle.color,
          linkSelectedInline: selectedInlineRows.find((row) =>
            row.text.includes('Inline selected link')
          ) ?? null,
          linkTextFillColor: linkStyle.getPropertyValue('-webkit-text-fill-color'),
          paragraphColor: paragraphStyle.color,
          paragraphTextFillColor: paragraphStyle.getPropertyValue('-webkit-text-fill-color'),
          plainSelectedInline: selectedInlineRows.find((row) =>
            row.text.includes('Plain')
          ) ?? null,
          selectedInlineRows,
        };
        return result;
      });
      const expectSelectedMixedInlineLinkColors = (
        snapshot: NonNullable<Awaited<ReturnType<typeof readMixedInlineLinkColors>>>,
        expected: NonNullable<Awaited<ReturnType<typeof readMixedInlineLinkColors>>>,
      ) => {
        expect(snapshot.linkSelectedInline, JSON.stringify(snapshot, null, 2)).not.toBeNull();
        expect(snapshot.linkSelectedInline!.className, JSON.stringify(snapshot, null, 2))
          .toContain('editor-raw-markdown-link-text');
        expect(snapshot.linkSelectedInline!.color, JSON.stringify(snapshot, null, 2)).toBe(expected.linkColor);
        expect(snapshot.linkSelectedInline!.textFillColor, JSON.stringify(snapshot, null, 2))
          .toBe(expected.linkTextFillColor);
        expect(snapshot.plainSelectedInline, JSON.stringify(snapshot, null, 2)).not.toBeNull();
        expect(snapshot.plainSelectedInline!.className, JSON.stringify(snapshot, null, 2))
          .not.toContain('editor-raw-markdown-link-text');
        expect(snapshot.plainSelectedInline!.color, JSON.stringify(snapshot, null, 2)).toBe(expected.paragraphColor);
        expect(snapshot.plainSelectedInline!.textFillColor, JSON.stringify(snapshot, null, 2))
          .toBe(expected.paragraphTextFillColor);
      };

      const baseline = await readLinkColors();
      expect(baseline).not.toBeNull();
      expect(baseline!.linkTextFillColor, JSON.stringify(baseline, null, 2)).toBe(baseline!.linkColor);
      const mixedInlineBaseline = await readMixedInlineLinkColors();
      expect(mixedInlineBaseline).not.toBeNull();

      const linkBlockIndex = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{ text: string }>;
        return blocks.findIndex((block) => block.text.includes('Selected link target'));
      });
      expect(linkBlockIndex).toBeGreaterThanOrEqual(0);

      const textSelected = await page.evaluate(() =>
        (window as any).__vlainaE2E.selectEditorTextByText('Selected link target'));
      expect(textSelected.selected, JSON.stringify(textSelected, null, 2)).toBe(true);
      await expect.poll(() => page.evaluate(() => {
        const link = document.querySelector<HTMLElement>('a[href="https://example.com/selected-link-color"]');
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        return {
          linkChildOverlayCount: link?.querySelectorAll('.editor-text-selection-overlay').length ?? 0,
          overlayCount: editor?.querySelectorAll('.editor-text-selection-overlay').length ?? 0,
        };
      }), { timeout: 10_000 }).toMatchObject({
        linkChildOverlayCount: 1,
      });

      const bridgeSelectedCount = await page.evaluate(async (index) => {
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([index]);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      }, linkBlockIndex);
      expect(bridgeSelectedCount).toBe(1);

      await expect.poll(() => page.evaluate(() => {
        const link = document.querySelector<HTMLElement>('a[href="https://example.com/selected-link-color"]');
        const paragraph = link?.closest('p') as HTMLElement | null;
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        return {
          active: editor?.classList.contains('editor-block-selection-active') ?? false,
          linkChildOverlayCount: link?.querySelectorAll('.editor-text-selection-overlay').length ?? 0,
          overlayCount: editor?.querySelectorAll('.editor-text-selection-overlay').length ?? 0,
          selected: paragraph?.classList.contains('editor-block-selected') ?? false,
          selectedCount: editor?.querySelectorAll('.editor-block-selected').length ?? 0,
        };
      }), { timeout: 10_000 }).toMatchObject({
        active: true,
        linkChildOverlayCount: 0,
        overlayCount: 0,
        selected: true,
      });

      const bridgeSelected = await readLinkColors();
      expect(bridgeSelected).not.toBeNull();
      expect(bridgeSelected!.selected, JSON.stringify(bridgeSelected, null, 2)).toBe(true);
      expect(bridgeSelected!.linkChildOverlayCount, JSON.stringify(bridgeSelected, null, 2)).toBe(0);
      expect(bridgeSelected!.overlayCount, JSON.stringify(bridgeSelected, null, 2)).toBe(0);
      expect(bridgeSelected!.linkColor, JSON.stringify({ baseline, bridgeSelected }, null, 2)).toBe(baseline!.linkColor);
      expect(bridgeSelected!.linkTextFillColor, JSON.stringify({ baseline, bridgeSelected }, null, 2)).toBe(baseline!.linkTextFillColor);

      const linkCenter = await page.evaluate(() => {
        const link = document.querySelector<HTMLElement>('a[href="https://example.com/selected-link-color"]');
        if (!link) return null;
        const rect = link.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      });
      expect(linkCenter, 'selected link center').not.toBeNull();
      if (linkCenter) {
        await page.mouse.move(linkCenter.x, linkCenter.y);
        await page.waitForTimeout(180);
        const tooltipVisible = await page.evaluate(() => {
          const tooltip = document.querySelector<HTMLElement>('.link-tooltip-container');
          return Boolean(tooltip && !tooltip.classList.contains('hidden'));
        });
        expect(tooltipVisible).toBe(true);
        await expect.poll(() => page.evaluate(() => ({
          active: document.querySelector<HTMLElement>('.milkdown .ProseMirror')
            ?.classList.contains('editor-block-selection-active') ?? false,
          selected: document.querySelector<HTMLElement>('a[href="https://example.com/selected-link-color"]')
            ?.closest('p')?.classList.contains('editor-block-selected') ?? false,
        }))).toEqual({ active: true, selected: true });

        const tooltipBox = await page.locator('.link-tooltip-container:not(.hidden)').boundingBox();
        expect(tooltipBox, 'selected-link tooltip bounds').not.toBeNull();
        if (tooltipBox) {
          await page.mouse.move(
            tooltipBox.x + tooltipBox.width / 2,
            tooltipBox.y + tooltipBox.height / 2,
          );
          await page.waitForTimeout(250);
          await expect(page.locator('.link-tooltip-container:not(.hidden)')).toHaveCount(1);
          await expect.poll(() => page.evaluate(() => ({
            active: document.querySelector<HTMLElement>('.milkdown .ProseMirror')
              ?.classList.contains('editor-block-selection-active') ?? false,
            selected: document.querySelector<HTMLElement>('a[href="https://example.com/selected-link-color"]')
              ?.closest('p')?.classList.contains('editor-block-selected') ?? false,
          }))).toEqual({ active: true, selected: true });
        }
      }

      await page.evaluate(() => (window as any).__vlainaE2E.selectNoteBlocksByIndexes([]));

      const dragTarget = await getBlankAreaDragTarget(page, 'Selected link target');
      expect(dragTarget, 'blank-area drag target').not.toBeNull();
      if (!dragTarget) return;
      await page.mouse.move(dragTarget.startX, dragTarget.startY);
      await page.mouse.down();
      await page.mouse.move(dragTarget.endX, dragTarget.startY + 12, { steps: 8 });
      await page.mouse.move(dragTarget.endX, dragTarget.endY, { steps: 8 });
      await page.mouse.up();

      await expect.poll(() => page.evaluate(() => {
        const link = document.querySelector<HTMLElement>('a[href="https://example.com/selected-link-color"]');
        const paragraph = link?.closest('p') as HTMLElement | null;
        return {
          active: document.querySelector<HTMLElement>('.milkdown .ProseMirror')?.classList.contains('editor-block-selection-active') ?? false,
          selected: paragraph?.classList.contains('editor-block-selected') ?? false,
          selectedCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
        };
      }), { timeout: 10_000 }).toMatchObject({
        active: true,
        selected: true,
      });

      const selected = await readLinkColors();
      expect(selected).not.toBeNull();
      expect(selected!.selected, JSON.stringify(selected, null, 2)).toBe(true);
      expect(selected!.linkChildOverlayCount, JSON.stringify(selected, null, 2)).toBe(0);
      expect(selected!.overlayCount, JSON.stringify(selected, null, 2)).toBe(0);
      expect(selected!.paragraphColor, JSON.stringify({ baseline, selected }, null, 2)).toBe(baseline!.paragraphColor);
      expect(selected!.paragraphTextFillColor, JSON.stringify({ baseline, selected }, null, 2)).toBe(baseline!.paragraphTextFillColor);
      expect(selected!.linkColor, JSON.stringify({ baseline, selected }, null, 2)).toBe(baseline!.linkColor);
      expect(selected!.linkTextFillColor, JSON.stringify({ baseline, selected }, null, 2)).toBe(baseline!.linkTextFillColor);

      await page.evaluate(() => (window as any).__vlainaE2E.selectNoteBlocksByIndexes([]));
      const mixedInlineBlockIndex = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{ rangeText: string }>;
        return blocks.findIndex((block) => block.rangeText.includes('Inline selected link'));
      });
      expect(mixedInlineBlockIndex).toBeGreaterThanOrEqual(0);

      const mixedInlineSelectedCount = await page.evaluate(async (index) => {
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([index]);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      }, mixedInlineBlockIndex);
      expect(mixedInlineSelectedCount).toBe(1);
      await expect.poll(() => page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const link = document.querySelector<HTMLElement>('a[href="https://example.com/inline-selected-link-color"]');
        return {
          active: editor?.classList.contains('editor-block-selection-active') ?? false,
          linkSelected: Boolean(link?.querySelector('.editor-block-selected')),
        };
      }), { timeout: 10_000 }).toMatchObject({
        active: true,
        linkSelected: true,
      });

      const mixedInlineSelected = await readMixedInlineLinkColors();
      expect(mixedInlineSelected).not.toBeNull();
      expectSelectedMixedInlineLinkColors(mixedInlineSelected!, mixedInlineBaseline!);

      const focusedForRawLink = await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd());
      expect(focusedForRawLink).toBe(true);
      await page.keyboard.insertText('Raw [xs](ds)');
      await expect.poll(() => page.evaluate(() =>
        document.querySelector<HTMLElement>('a[href="ds"]')?.textContent ?? null
      ), { timeout: 10_000 }).toBe('xs');

      const rawLinkBlockIndex = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{ text: string }>;
        return blocks.findIndex((block) => block.text.includes('Raw xs'));
      });
      expect(rawLinkBlockIndex).toBeGreaterThanOrEqual(0);

      const rawBridgeSelectedCount = await page.evaluate(async (index) => {
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([index]);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      }, rawLinkBlockIndex);
      expect(rawBridgeSelectedCount).toBe(1);

      const rawSelected = await page.evaluate(() => {
        const rawLinkText = document.querySelector<HTMLElement>('a[href="ds"]');
        const rawParagraph = rawLinkText?.closest('p') as HTMLElement | null;
        if (!rawLinkText || !rawParagraph) return null;

        const rawLinkTextStyle = getComputedStyle(rawLinkText);
        const rawParagraphStyle = getComputedStyle(rawParagraph);
        const result = {
          rawLinkClassName: rawLinkText.className,
          rawLinkColor: rawLinkTextStyle.color,
          rawLinkText: rawLinkText.textContent,
          rawLinkTextFillColor: rawLinkTextStyle.getPropertyValue('-webkit-text-fill-color'),
          rawParagraphClassName: rawParagraph.className,
          rawParagraphColor: rawParagraphStyle.color,
          rawParagraphTextFillColor: rawParagraphStyle.getPropertyValue('-webkit-text-fill-color'),
          rawSelected: rawParagraph.classList.contains('editor-block-selected'),
        };
        return result;
      });
      expect(rawSelected).not.toBeNull();
      expect(rawSelected!.rawSelected, JSON.stringify(rawSelected, null, 2)).toBe(true);
      expect(rawSelected!.rawLinkText, JSON.stringify(rawSelected, null, 2)).toBe('xs');
      expect(rawSelected!.rawParagraphColor, JSON.stringify({ baseline, rawSelected }, null, 2)).toBe(baseline!.paragraphColor);
      expect(rawSelected!.rawParagraphTextFillColor, JSON.stringify({ baseline, rawSelected }, null, 2)).toBe(baseline!.paragraphTextFillColor);
      expect(rawSelected!.rawLinkColor, JSON.stringify({ baseline, rawSelected }, null, 2)).toBe(baseline!.linkColor);
      expect(rawSelected!.rawLinkTextFillColor, JSON.stringify({ baseline, rawSelected }, null, 2)).toBe(baseline!.linkTextFillColor);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps link colors stable across adjacent-line ordering', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-link-order-matrix');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await openMarkdownFixture(page, {
        filename: 'block-selection-link-order-matrix.md',
        content: [
          'https://first.example.test/path',
          'sk-test-first',
          '',
          'https://middle.example.test/path',
          '[Middle explicit](middle-target.md)',
          'sk-test-middle',
          '',
          '[Leading explicit](leading-target.md)',
          'https://last.example.test/path',
          'sk-test-last',
        ].join('\n'),
      });
      await installSyntheticTyporaLinkTheme(page);

      const linkHrefs = [
        'https://first.example.test/path',
        'https://middle.example.test/path',
        'middle-target.md',
        'leading-target.md',
        'https://last.example.test/path',
      ];
      const baseline = await page.evaluate((hrefs) => Object.fromEntries(hrefs.map((href) => {
        const link = document.querySelector<HTMLElement>(`a[href="${href}"]`);
        const style = link ? getComputedStyle(link) : null;
        return [href, style ? {
          color: style.color,
          textFillColor: style.getPropertyValue('-webkit-text-fill-color'),
        } : null];
      })), linkHrefs);
      expect(Object.values(baseline).every(Boolean), JSON.stringify(baseline, null, 2)).toBe(true);

      for (const sample of [
        {
          startText: 'https://first.example.test/path',
          endText: 'sk-test-first',
          hrefs: ['https://first.example.test/path'],
        },
        {
          startText: 'https://middle.example.test/path',
          endText: 'sk-test-middle',
          hrefs: ['https://middle.example.test/path', 'middle-target.md'],
        },
        {
          startText: 'Leading explicit',
          endText: 'sk-test-last',
          hrefs: ['leading-target.md', 'https://last.example.test/path'],
        },
      ]) {
        const selectedCount = await page.evaluate(async ({ startText, endText }) => {
          const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{ text: string }>;
          const start = blocks.findIndex((block) => block.text.includes(startText));
          const end = blocks.findIndex((block, index) => index >= start && block.text.includes(endText));
          if (start < 0 || end < start) return 0;
          const indexes = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
          const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes(indexes);
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return count;
        }, sample);
        expect(selectedCount, JSON.stringify(sample)).toBeGreaterThan(0);

        const selectedColors = await page.evaluate((hrefs) => Object.fromEntries(hrefs.map((href) => {
          const link = document.querySelector<HTMLElement>(`a[href="${href}"]`);
          const style = link ? getComputedStyle(link) : null;
          return [href, style ? {
            color: style.color,
            textFillColor: style.getPropertyValue('-webkit-text-fill-color'),
          } : null];
        })), sample.hrefs);

        for (const href of sample.hrefs) {
          expect(selectedColors[href], JSON.stringify({ sample, selectedColors }, null, 2)).toEqual(baseline[href]);
        }
      }

      await page.evaluate(() => (window as any).__vlainaE2E.selectNoteBlocksByIndexes([]));
      const dragTarget = await getBlankAreaDragTarget(page, 'https://first.example.test/path');
      expect(dragTarget, 'autolink pending drag target').not.toBeNull();
      if (dragTarget) {
        await page.mouse.move(dragTarget.startX, dragTarget.startY);
        await page.mouse.down();
        await page.mouse.move(dragTarget.endX, dragTarget.startY + 12, { steps: 8 });
        await page.mouse.move(dragTarget.endX, dragTarget.endY, { steps: 8 });
        await expect.poll(() => page.evaluate(() => ({
          pending: document.querySelector<HTMLElement>('.milkdown .ProseMirror')
            ?.classList.contains('editor-block-selection-pending') ?? false,
          selected: (() => {
            const link = document.querySelector<HTMLElement>('a[href="https://first.example.test/path"]');
            return Boolean(link?.closest('.editor-block-selected') || link?.querySelector('.editor-block-selected'));
          })(),
        }))).toEqual({ pending: true, selected: true });

        const pendingColor = await page.evaluate(() => {
          const link = document.querySelector<HTMLElement>('a[href="https://first.example.test/path"]');
          const style = link ? getComputedStyle(link) : null;
          return style ? {
            color: style.color,
            textFillColor: style.getPropertyValue('-webkit-text-fill-color'),
          } : null;
        });
        expect(pendingColor).toEqual(baseline['https://first.example.test/path']);
        await page.mouse.up();
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps tag colors stable across adjacent-line ordering', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-tag-order-matrix');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await openMarkdownFixture(page, {
        filename: 'block-selection-tag-order-matrix.md',
        content: [
          '#tag-first',
          'sk-test-tag-first',
          '',
          'https://tag-order.example.test/path',
          '#tag-middle',
          'sk-test-tag-middle',
        ].join('\n'),
      });
      await installSyntheticTyporaLinkTheme(page);

      const readTagColors = () => page.evaluate(() => Object.fromEntries(
        Array.from(document.querySelectorAll<HTMLElement>('.editor-tag-token')).map((tag) => {
          const style = getComputedStyle(tag);
          return [tag.textContent ?? '', {
            color: style.color,
            textFillColor: style.getPropertyValue('-webkit-text-fill-color'),
          }];
        })
      ));
      const baseline = await readTagColors();
      expect(baseline['#tag-first'], JSON.stringify(baseline, null, 2)).toBeDefined();
      expect(baseline['#tag-middle'], JSON.stringify(baseline, null, 2)).toBeDefined();

      for (const sample of [
        { startText: '#tag-first', endText: 'sk-test-tag-first', tag: '#tag-first' },
        { startText: 'https://tag-order.example.test/path', endText: 'sk-test-tag-middle', tag: '#tag-middle' },
      ]) {
        const selectedCount = await page.evaluate(async ({ startText, endText }) => {
          const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{ text: string }>;
          const start = blocks.findIndex((block) => block.text.includes(startText));
          const end = blocks.findIndex((block, index) => index >= start && block.text.includes(endText));
          if (start < 0 || end < start) return 0;
          const indexes = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
          const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes(indexes);
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return count;
        }, sample);
        expect(selectedCount, JSON.stringify(sample)).toBeGreaterThan(0);

        const selected = await readTagColors();
        expect(selected[sample.tag], JSON.stringify({ sample, selected }, null, 2)).toEqual(baseline[sample.tag]);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps link and tag colors in large block selections', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-large-block-selection-semantic-colors');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const paragraphs = Array.from({ length: 132 }, (_, index) => {
        if (index === 12) return 'https://large-selection.example.test/path';
        if (index === 84) return '#large-selection-tag';
        return `Large semantic color row ${index}`;
      });
      await openMarkdownFixture(page, {
        filename: 'large-block-selection-semantic-colors.md',
        content: paragraphs.join('\n\n'),
      });
      await installSyntheticTyporaLinkTheme(page);

      const readSemanticColors = () => page.evaluate(() => {
        const link = document.querySelector<HTMLElement>('a[href="https://large-selection.example.test/path"]');
        const tag = Array.from(document.querySelectorAll<HTMLElement>('.editor-tag-token'))
          .find((element) => element.textContent === '#large-selection-tag') ?? null;
        const read = (element: HTMLElement | null) => {
          if (!element) return null;
          const style = getComputedStyle(element);
          return {
            color: style.color,
            textFillColor: style.getPropertyValue('-webkit-text-fill-color'),
          };
        };
        return { link: read(link), tag: read(tag) };
      });
      const baseline = await readSemanticColors();
      expect(baseline.link, JSON.stringify(baseline, null, 2)).not.toBeNull();
      expect(baseline.tag, JSON.stringify(baseline, null, 2)).not.toBeNull();

      const selectedCount = await page.evaluate(async () => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<unknown>;
        const indexes = Array.from({ length: blocks.length }, (_, index) => index);
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes(indexes);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return count;
      });
      expect(selectedCount).toBeGreaterThanOrEqual(128);
      await expect.poll(() => page.evaluate(() =>
        document.querySelector<HTMLElement>('.milkdown .ProseMirror')
          ?.classList.contains('editor-block-selection-large') ?? false
      )).toBe(true);

      expect(await readSemanticColors()).toEqual(baseline);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps a visible gap between a hard-break paragraph line and the following blank-line block', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-hard-break-blank-gap');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'block-selection-hard-break-blank-gap.md',
        content: [
          '18\\. 在两个公式或图标中怎么插入空行\\',
          '1\\. 然后箭头的移动应该选中',
          '',
          'after gap sentinel',
        ].join('\n'),
      });

      const selectableBlocks = await page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks());
      expect(selectableBlocks.length, JSON.stringify(selectableBlocks, null, 2)).toBeGreaterThanOrEqual(4);

      const selectedCount = await page.evaluate(async () => {
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([0, 1, 2]);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      });
      expect(selectedCount).toBe(3);

      const geometry = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        if (!editor) return null;

        const parsePx = (value: string, fallback = 0) => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const resolvePaintRect = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const after = getComputedStyle(element, '::after');
          if (after.content !== 'none' && after.display !== 'none' && after.position === 'absolute') {
            return {
              top: rect.top + parsePx(after.top),
              bottom: rect.bottom - parsePx(after.bottom),
            };
          }

          return {
            top: rect.top,
            bottom: rect.bottom,
          };
        };

        const lineFills = Array.from(document.querySelectorAll<HTMLElement>('.editor-block-selection-line-fill'))
          .map((fill) => {
            const rect = fill.getBoundingClientRect();
            return {
              top: rect.top,
              bottom: rect.bottom,
              centerY: rect.top + rect.height / 2,
            };
          })
          .filter((rect) => rect.bottom > rect.top);

        const rawRows = Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selected'))
          .filter((element) => !element.classList.contains('editor-block-selected-parent-marker'))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const paint = resolvePaintRect(element);
            const matchingFills = lineFills.filter((fill) => (
              fill.centerY >= rect.top - 2 &&
              fill.centerY <= rect.bottom + 2
            ));
            return {
              tagName: element.tagName,
              text: element.textContent?.trim() ?? '',
              className: element.className,
              rectTop: Math.round(rect.top * 100) / 100,
              rectBottom: Math.round(rect.bottom * 100) / 100,
              visualTop: Math.round(Math.min(paint.top, ...matchingFills.map((fill) => fill.top)) * 100) / 100,
              visualBottom: Math.round(Math.max(paint.bottom, ...matchingFills.map((fill) => fill.bottom)) * 100) / 100,
              matchingFillCount: matchingFills.length,
            };
          })
          .sort((left, right) => left.rectTop - right.rectTop);

        const rows = rawRows.reduce<typeof rawRows>((merged, row) => {
          const previous = merged[merged.length - 1];
          if (
            previous &&
            Math.abs(previous.rectTop - row.rectTop) <= 0.5 &&
            Math.abs(previous.rectBottom - row.rectBottom) <= 0.5
          ) {
            previous.text = previous.text.includes(row.text)
              ? previous.text
              : `${previous.text} ${row.text}`.trim();
            previous.visualTop = Math.min(previous.visualTop, row.visualTop);
            previous.visualBottom = Math.max(previous.visualBottom, row.visualBottom);
            previous.matchingFillCount = Math.max(previous.matchingFillCount, row.matchingFillCount);
            return merged;
          }

          merged.push({ ...row });
          return merged;
        }, []);

        const visualGaps = rows.slice(1).map((row, index) => (
          Math.round((row.visualTop - rows[index].visualBottom) * 100) / 100
        ));
        const penultimateToLastGap = visualGaps.length >= 2 ? visualGaps[1] : null;

        return { rows, rawRows, lineFills, penultimateToLastGap, visualGaps };
      });

      expect(geometry).not.toBeNull();
      expect(geometry!.rows, JSON.stringify(geometry, null, 2)).toHaveLength(3);
      expect(geometry!.rows[1].text, JSON.stringify(geometry, null, 2)).toContain('箭头的移动应该选中');
      expect(geometry!.visualGaps, JSON.stringify(geometry, null, 2)).toHaveLength(2);
      for (const gap of geometry!.visualGaps) {
        expect(gap, JSON.stringify(geometry, null, 2)).toBeGreaterThan(0.5);
      }
      expect(geometry!.penultimateToLastGap, JSON.stringify(geometry, null, 2)).toBeGreaterThan(0.5);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('copies hard-break block lines as newlines and keeps a gap from the preceding blank line', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-hard-break-copy-gap');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'block-selection-hard-break-copy-gap.md',
        content: [
          'before hard-break copy gap',
          '',
          '我[xs](ds)<br />',
          'i<br />',
          '我',
          '',
          'after hard-break copy gap',
        ].join('\n'),
      });

      const indexes = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          rangeText: string;
          text: string;
        }>;
        const blankBefore = blocks.findIndex((block, index) => (
          block.text === '' && blocks[index + 1]?.text.includes('我xs')
        ));
        return {
          blankBefore,
          firstLine: blankBefore >= 0 ? blankBefore + 1 : -1,
          secondLine: blankBefore >= 0 ? blankBefore + 2 : -1,
          thirdLine: blankBefore >= 0 ? blankBefore + 3 : -1,
          blocks,
        };
      });
      expect(indexes.blankBefore, JSON.stringify(indexes, null, 2)).toBeGreaterThanOrEqual(0);
      expect(indexes.firstLine, JSON.stringify(indexes, null, 2)).toBe(indexes.blankBefore + 1);
      expect(indexes.secondLine, JSON.stringify(indexes, null, 2)).toBe(indexes.firstLine + 1);
      expect(indexes.thirdLine, JSON.stringify(indexes, null, 2)).toBe(indexes.secondLine + 1);

      await app.evaluate(({ clipboard }) => clipboard.clear());
      const copiedSelectionCount = await page.evaluate(async (selectedIndexes) => {
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes(selectedIndexes);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      }, [indexes.firstLine, indexes.secondLine, indexes.thirdLine]);
      expect(copiedSelectionCount).toBe(3);

      await page.keyboard.press('Control+C');
      await expect.poll(async () => app.evaluate(({ clipboard }) => clipboard.readText()), {
        timeout: 10_000,
      }).toBe('我[xs](ds)\ni\n我');

      const gapSelectionCount = await page.evaluate(async (selectedIndexes) => {
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes(selectedIndexes);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      }, [indexes.blankBefore, indexes.firstLine]);
      expect(gapSelectionCount).toBe(2);

      const geometry = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        if (!editor) return null;

        const parsePx = (value: string, fallback = 0) => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const resolvePaintRect = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const after = getComputedStyle(element, '::after');
          if (after.content !== 'none' && after.display !== 'none' && after.position === 'absolute') {
            return {
              top: rect.top + parsePx(after.top),
              bottom: rect.bottom - parsePx(after.bottom),
            };
          }

          return {
            top: rect.top,
            bottom: rect.bottom,
          };
        };

        const lineFills = Array.from(document.querySelectorAll<HTMLElement>('.editor-block-selection-line-fill'))
          .map((fill) => {
            const rect = fill.getBoundingClientRect();
            return {
              top: rect.top,
              bottom: rect.bottom,
              centerY: rect.top + rect.height / 2,
            };
          })
          .filter((rect) => rect.bottom > rect.top);

        const rawRows = Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selected'))
          .filter((element) => !element.classList.contains('editor-block-selected-parent-marker'))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const paint = resolvePaintRect(element);
            const matchingFills = lineFills.filter((fill) => (
              fill.centerY >= rect.top - 2 &&
              fill.centerY <= rect.bottom + 2
            ));
            return {
              text: element.textContent?.trim() ?? '',
              className: element.className,
              rectTop: Math.round(rect.top * 100) / 100,
              rectBottom: Math.round(rect.bottom * 100) / 100,
              visualTop: Math.round(Math.min(paint.top, ...matchingFills.map((fill) => fill.top)) * 100) / 100,
              visualBottom: Math.round(Math.max(paint.bottom, ...matchingFills.map((fill) => fill.bottom)) * 100) / 100,
            };
          })
          .sort((left, right) => left.rectTop - right.rectTop);

        const rows = rawRows.reduce<typeof rawRows>((merged, row) => {
          const previous = merged[merged.length - 1];
          if (
            previous &&
            Math.abs(previous.rectTop - row.rectTop) <= 0.5 &&
            Math.abs(previous.rectBottom - row.rectBottom) <= 0.5
          ) {
            previous.text = previous.text.includes(row.text)
              ? previous.text
              : `${previous.text}${row.text}`;
            previous.visualTop = Math.min(previous.visualTop, row.visualTop);
            previous.visualBottom = Math.max(previous.visualBottom, row.visualBottom);
            return merged;
          }

          merged.push({ ...row });
          return merged;
        }, []);

        const blank = rows.find((row) => row.text === '') ?? null;
        const firstLine = rows.find((row) => row.text.includes('我') && row.text.includes('xs')) ?? null;
        return {
          rows,
          rawRows,
          lineFills,
          blank,
          firstLine,
          gap: blank && firstLine
            ? Math.round((firstLine.visualTop - blank.visualBottom) * 100) / 100
            : null,
        };
      });

      expect(geometry).not.toBeNull();
      expect(geometry!.blank, JSON.stringify(geometry, null, 2)).not.toBeNull();
      expect(geometry!.firstLine, JSON.stringify(geometry, null, 2)).not.toBeNull();
      expect(geometry!.gap, JSON.stringify(geometry, null, 2)).toBeGreaterThan(0.5);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps long hard-break paragraph row geometry stable while blank-area dragging over and away from it', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-hard-break-drag-stability');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 960, height: 760 });
      await openMarkdownFixture(page, {
        filename: 'block-selection-hard-break-drag-stability.md',
        content: [
          ...Array.from({ length: 70 }, (_, index) => `Intro paragraph before long hard-break audit ${index}.`),
          [
            '据 GitHub Flavored Markdown（GFM）官方文档介绍，Markdown是由约翰·格鲁伯（John Gruber）在亚伦·斯沃茨（Aaron Swartz）的帮助下开发，并在2004年发布的标记语言。\\',
            '其`设计灵感主要来源于纯文本电子邮件的格式，目标是让人们能够使用易读、易写的纯文本格式编写文档，而且这些文档可以转换为HTML（Hyper Text Markup Language，超文本标记语言）文档。\\',
            '简单点说，Markdown就是由一些简单的符号（如*/-> [] （）#）组成的用于排版的标记语言，其最重要的特点就是可读性强。',
          ].join('\n'),
          ...Array.from({ length: 70 }, (_, index) => `After long hard-break audit sentinel ${index}.`),
        ].join('\n\n'),
      });

      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'GitHub Flavored Markdown' })).toBeVisible();

      const readHardBreakReport = () => page.evaluate(() => {
        const round = (value: number) => Math.round(value * 100) / 100;
        const rectPayload = (rect: DOMRect) => ({
          bottom: round(rect.bottom),
          height: round(rect.height),
          left: round(rect.left),
          right: round(rect.right),
          top: round(rect.top),
          width: round(rect.width),
        });
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const paragraph = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror p'))
          .find((element) => element.textContent?.includes('GitHub Flavored Markdown')) ?? null;
        if (!editor || !paragraph) return null;

        const paragraphRect = paragraph.getBoundingClientRect();
        const textRange = document.createRange();
        textRange.selectNodeContents(paragraph);
        const lineRows = Array.from(textRange.getClientRects())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .reduce<Array<{ bottom: number; height: number; left: number; right: number; top: number; width: number }>>((rows, rect) => {
            const centerY = rect.top + rect.height / 2;
            const existing = rows.find((row) => centerY >= row.top - 2 && centerY <= row.bottom + 2);
            if (existing) {
              existing.bottom = round(Math.max(existing.bottom, rect.bottom));
              existing.height = round(existing.bottom - existing.top);
              existing.left = round(Math.min(existing.left, rect.left));
              existing.right = round(Math.max(existing.right, rect.right));
              existing.width = round(existing.right - existing.left);
              return rows;
            }
            rows.push(rectPayload(rect));
            return rows;
          }, []);
        textRange.detach();

        const selectableTargets = ((window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          className: string;
          from: number;
          rangeText: string;
          rect: { height: number; left: number; top: number; width: number };
          tagName: string;
          text: string;
          to: number;
        }>)
          .filter((block) => block.text.includes('GitHub Flavored Markdown'))
          .map((block) => ({
            className: block.className,
            from: block.from,
            key: `${block.from}:${block.to}`,
            rect: {
              height: round(block.rect.height),
              left: round(block.rect.left),
              top: round(block.rect.top),
              width: round(block.rect.width),
            },
            rangeText: block.rangeText.replace(/\s+/g, ' ').trim(),
            tagName: block.tagName,
            text: block.text.replace(/\s+/g, ' ').trim(),
            to: block.to,
          }));

        const selected = Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selected'))
          .filter((element) => element.textContent?.includes('GitHub Flavored Markdown'))
          .map((element) => ({
            className: element.className,
            rect: rectPayload(element.getBoundingClientRect()),
            tagName: element.tagName,
            text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          }));

        const fills = Array.from(document.querySelectorAll<HTMLElement>('.editor-block-selection-line-fill'))
          .map((element) => rectPayload(element.getBoundingClientRect()))
          .filter((rect) => rect.bottom >= paragraphRect.top - 2 && rect.top <= paragraphRect.bottom + 2);

        return {
          active: editor.classList.contains('editor-block-selection-active'),
          lineRows,
          paragraphClassName: paragraph.className,
          paragraphRect: rectPayload(paragraphRect),
          pending: editor.classList.contains('editor-block-selection-pending'),
          selectableTargets,
          selected,
          selectedCount: editor.querySelectorAll('.editor-block-selected').length,
          selectedInlineLineCount: editor.querySelectorAll('.editor-block-selected-inline-line').length,
          fills,
        };
      });

      const initial = await readHardBreakReport();
      expect(initial, 'initial hard-break paragraph report').not.toBeNull();
      expect(initial!.selectableTargets, JSON.stringify(initial, null, 2)).toHaveLength(3);
      expect(new Set(initial!.selectableTargets.map((target) => target.key)).size, JSON.stringify(initial, null, 2)).toBe(3);
      expect(initial!.selectableTargets.map((target) => target.rangeText), JSON.stringify(initial, null, 2)).toEqual([
        expect.stringContaining('GitHub Flavored Markdown'),
        expect.stringContaining('设计灵感主要来源于纯文本电子邮件'),
        expect.stringContaining('简单点说'),
      ]);
      expect(initial!.lineRows.length, JSON.stringify(initial, null, 2)).toBeGreaterThanOrEqual(3);

      const largeMiddleLineSelection = await page.evaluate(async () => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          rangeText: string;
        }>;
        const middleIndex = blocks.findIndex((block) => block.rangeText.includes('设计灵感主要来源于纯文本电子邮件'));
        if (middleIndex < 0) return { count: 0, expected: 0, largeActive: false };
        const expected = 128;
        const startIndex = Math.min(
          Math.max(middleIndex - Math.floor(expected / 2), 0),
          Math.max(blocks.length - expected, 0),
        );
        const indexes = Array.from(
          { length: Math.min(expected, blocks.length - startIndex) },
          (_, offset) => startIndex + offset,
        );
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes(indexes);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        return {
          count,
          expected: indexes.length,
          largeActive: editor?.classList.contains('editor-block-selection-large') ?? false,
        };
      });
      expect(largeMiddleLineSelection.count).toBe(largeMiddleLineSelection.expected);
      expect(largeMiddleLineSelection.largeActive, JSON.stringify(largeMiddleLineSelection, null, 2)).toBe(true);

      const trailingSelectionGeometry = await page.evaluate(async () => {
        const round = (value: number) => Math.round(value * 100) / 100;
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const selected = Array.from(document.querySelectorAll<HTMLElement>('.editor-block-selected-inline-line'))
          .find((element) => element.textContent?.includes('设计灵感主要来源于纯文本电子邮件')) ?? null;
        if (!editor || !selected) return null;
        selected.scrollIntoView({ block: 'center', inline: 'nearest' });
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

        const probe = document.createElement('span');
        probe.style.position = 'absolute';
        probe.style.pointerEvents = 'none';
        probe.style.backgroundColor = 'var(--vlaina-block-selection-color)';
        document.body.append(probe);
        const selectionColor = getComputedStyle(probe).backgroundColor;
        probe.remove();

        const editorRect = editor.getBoundingClientRect();
        const rowRects = Array.from(selected.getClientRects())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => ({
            bottom: round(rect.bottom),
            left: round(rect.left),
            right: round(rect.right),
            top: round(rect.top),
          }));
        const lineFills = Array.from(document.querySelectorAll<HTMLElement>('.editor-block-selection-line-fill'))
          .map((fill) => fill.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0);
        const rowSamplePoints = rowRects.flatMap((row, index) => {
          const rowCenterY = (row.top + row.bottom) / 2;
          const matchingFill = lineFills.find((fill) => rowCenterY >= fill.top - 2 && rowCenterY <= fill.bottom + 2);
          const sampleRight = Math.min(
            matchingFill?.right ?? editorRect.right,
            editorRect.right + 48,
            window.innerWidth - 2,
          );
          const sampleLeft = Math.max(row.right + 10, row.left + 10);
          if (sampleRight - sampleLeft < 12) return [];
          return [{
            index,
            kind: 'row-trailing',
            x: round((sampleLeft + sampleRight) / 2),
            y: round(rowCenterY),
            fillRight: matchingFill ? round(matchingFill.right) : null,
            rowRight: row.right,
          }];
        });
        const rowGapSamplePoints = rowRects.slice(1).flatMap((row, offset) => {
          const previous = rowRects[offset];
          if (!previous || row.top - previous.bottom < 1) return [];
          const gapCenterY = (previous.bottom + row.top) / 2;
          const matchingFill = lineFills.find((fill) => gapCenterY >= fill.top - 2 && gapCenterY <= fill.bottom + 2);
          const sampleRight = Math.min(
            matchingFill?.right ?? editorRect.right,
            editorRect.right + 48,
            window.innerWidth - 2,
          );
          const sampleLeft = Math.max(editorRect.left + 24, Math.min(previous.right, row.right) + 10);
          if (sampleRight - sampleLeft < 12) return [];
          return [{
            index: offset,
            kind: 'row-gap-trailing',
            x: round((sampleLeft + sampleRight) / 2),
            y: round(gapCenterY),
            fillRight: matchingFill ? round(matchingFill.right) : null,
            rowRight: round(Math.min(previous.right, row.right)),
          }];
        });
        const samplePoints = [...rowSamplePoints, ...rowGapSamplePoints];
        if (samplePoints.length === 0) {
          return {
            clip: null,
            editorRight: round(editorRect.right),
            lineFillCount: lineFills.length,
            rowRects,
            samplePoints,
            selectedText: selected.textContent ?? '',
            selectionColor,
          };
        }

        const minX = Math.max(0, Math.floor(Math.min(...samplePoints.map((point) => point.x)) - 4));
        const minY = Math.max(0, Math.floor(Math.min(...samplePoints.map((point) => point.y)) - 4));
        const maxX = Math.min(window.innerWidth, Math.ceil(Math.max(...samplePoints.map((point) => point.x)) + 4));
        const maxY = Math.min(window.innerHeight, Math.ceil(Math.max(...samplePoints.map((point) => point.y)) + 4));
        return {
          clip: {
            x: minX,
            y: minY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
          },
          editorRight: round(editorRect.right),
          largeActive: editor.classList.contains('editor-block-selection-large'),
          lineFillCount: lineFills.length,
          rowRects,
          samplePoints,
          selectedText: selected.textContent ?? '',
          selectionColor,
        };
      });
      expect(trailingSelectionGeometry, 'middle hard-break line trailing selection geometry').not.toBeNull();
      expect(trailingSelectionGeometry!.largeActive, JSON.stringify(trailingSelectionGeometry, null, 2)).toBe(true);
      expect(trailingSelectionGeometry!.clip, JSON.stringify(trailingSelectionGeometry, null, 2)).not.toBeNull();
      expect(trailingSelectionGeometry!.samplePoints.length, JSON.stringify(trailingSelectionGeometry, null, 2)).toBeGreaterThan(0);
      expect(trailingSelectionGeometry!.lineFillCount, JSON.stringify(trailingSelectionGeometry, null, 2)).toBeGreaterThan(0);

      const trailingScreenshot = await page.screenshot({ clip: trailingSelectionGeometry!.clip! });
      const trailingPixelSamples = await page.evaluate(async ({ imageUrl, geometry }) => {
        const colorMatch = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(geometry.selectionColor);
        if (!colorMatch) throw new Error(`Could not parse selection color: ${geometry.selectionColor}`);
        const expected = {
          red: Number.parseInt(colorMatch[1] ?? '0', 10),
          green: Number.parseInt(colorMatch[2] ?? '0', 10),
          blue: Number.parseInt(colorMatch[3] ?? '0', 10),
        };
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('Failed to load hard-break trailing screenshot'));
          image.src = imageUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Could not create hard-break trailing canvas context');
        context.drawImage(image, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const scaleX = image.naturalWidth / geometry.clip.width;
        const scaleY = image.naturalHeight / geometry.clip.height;

        return geometry.samplePoints.map((point: { fillRight: number | null; index: number; kind: string; rowRight: number; x: number; y: number }) => {
          const sampleX = Math.max(0, Math.min(image.naturalWidth - 1, Math.round((point.x - geometry.clip.x) * scaleX)));
          const sampleY = Math.max(0, Math.min(image.naturalHeight - 1, Math.round((point.y - geometry.clip.y) * scaleY)));
          let red = 0;
          let green = 0;
          let blue = 0;
          let count = 0;
          for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
            for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
              const x = Math.max(0, Math.min(image.naturalWidth - 1, sampleX + xOffset));
              const y = Math.max(0, Math.min(image.naturalHeight - 1, sampleY + yOffset));
              const offset = (y * imageData.width + x) * 4;
              red += imageData.data[offset] ?? 0;
              green += imageData.data[offset + 1] ?? 0;
              blue += imageData.data[offset + 2] ?? 0;
              count += 1;
            }
          }
          const average = {
            red: Math.round(red / count),
            green: Math.round(green / count),
            blue: Math.round(blue / count),
          };
          return {
            ...point,
            average,
            distance: Math.abs(average.red - expected.red) +
              Math.abs(average.green - expected.green) +
              Math.abs(average.blue - expected.blue),
            expected,
          };
        });
      }, {
        imageUrl: `data:image/png;base64,${trailingScreenshot.toString('base64')}`,
        geometry: trailingSelectionGeometry,
      });
      expect(
        trailingPixelSamples.every((sample: { distance: number }) => sample.distance <= 42),
        JSON.stringify({ trailingSelectionGeometry, trailingPixelSamples }, null, 2),
      ).toBe(true);

      const dragPoints = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        const paragraph = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror p'))
          .find((element) => element.textContent?.includes('GitHub Flavored Markdown')) ?? null;
        if (!editor || !scrollRoot || !paragraph) return null;

        paragraph.scrollIntoView({ block: 'center', inline: 'nearest' });
        const editorRect = editor.getBoundingClientRect();
        const scrollRootRect = scrollRoot.getBoundingClientRect();
        const rect = paragraph.getBoundingClientRect();
        const startY = rect.top + Math.min(rect.height - 4, Math.max(8, rect.height * 0.35));
        return {
          awayX: Math.max(editorRect.left + 24, rect.left + 24),
          awayY: Math.min(scrollRootRect.bottom - 24, rect.bottom + 28),
          overX: Math.max(editorRect.left + 24, rect.left + 24),
          overY: rect.top + Math.min(rect.height - 4, Math.max(8, rect.height * 0.45)),
          startX: Math.min(scrollRootRect.right - 24, editorRect.right + 72),
          startY,
        };
      });
      expect(dragPoints, 'hard-break paragraph drag points').not.toBeNull();

      await page.mouse.move(dragPoints!.startX, dragPoints!.startY);
      await page.mouse.down();
      await page.mouse.move(dragPoints!.overX, dragPoints!.overY, { steps: 8 });
      await page.waitForTimeout(80);
      const overParagraph = await readHardBreakReport();
      expect(overParagraph, 'dragging over hard-break paragraph report').not.toBeNull();
      expect(overParagraph!.pending, JSON.stringify({ dragPoints, overParagraph }, null, 2)).toBe(true);

      await page.mouse.move(dragPoints!.awayX, dragPoints!.awayY, { steps: 8 });
      await page.waitForTimeout(80);
      const awayFromParagraph = await readHardBreakReport();
      expect(awayFromParagraph, 'dragging away from hard-break paragraph report').not.toBeNull();
      expect(awayFromParagraph!.pending, JSON.stringify({ dragPoints, awayFromParagraph }, null, 2)).toBe(true);
      await page.mouse.up();

      const assertStableReport = (report: NonNullable<typeof initial>, label: string) => {
        const diagnostics = JSON.stringify({ dragPoints, initial, [label]: report }, null, 2);
        expect(report.selectableTargets, diagnostics).toHaveLength(3);
        expect(report.lineRows.length, diagnostics).toBe(initial!.lineRows.length);
        expect(Math.abs(report.paragraphRect.height - initial!.paragraphRect.height), diagnostics).toBeLessThanOrEqual(1);

        const initialTargetsByKey = new Map(initial!.selectableTargets.map((target) => [target.key, target]));
        for (const target of report.selectableTargets) {
          const before = initialTargetsByKey.get(target.key);
          expect(before, diagnostics).toBeTruthy();
          expect(
            Math.abs(
              (target.rect.top - report.paragraphRect.top) -
                (before!.rect.top - initial!.paragraphRect.top),
            ),
            diagnostics,
          ).toBeLessThanOrEqual(1);
          expect(Math.abs(target.rect.height - before!.rect.height), diagnostics).toBeLessThanOrEqual(1);
        }
      };

      assertStableReport(overParagraph!, 'overParagraph');
      assertStableReport(awayFromParagraph!, 'awayFromParagraph');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps bold labels visible inside selected hard-break credential lines', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-bold-label-visibility');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'block-selection-bold-label-visibility.md',
        content: [
          '**网址：** [https ://nerdvm.racknerd.com/](https://nerdvm.racknerd.com/)\\',
          '**用户名：** vmuser262577\\',
          '',
          'after credential sentinel',
        ].join('\n'),
      });
      await page.addStyleTag({
        content: `
          .milkdown .ProseMirror strong * {
            color: #b42318 !important;
            -webkit-text-fill-color: #b42318 !important;
          }
        `,
      });

      const selectedCount = await page.evaluate(async () => {
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([0, 1]);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      });
      expect(selectedCount).toBe(2);

      const report = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const selected = editor ? Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selected')) : [];
        const labels = selected
          .filter((element) => /网址|用户名/.test(element.textContent ?? ''))
          .map((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return {
              text: element.textContent ?? '',
              className: element.className,
              color: style.color,
              display: style.display,
              fontSize: style.fontSize,
              opacity: style.opacity,
              textFillColor: style.getPropertyValue('-webkit-text-fill-color'),
              visibility: style.visibility,
              width: Math.round(rect.width * 100) / 100,
              height: Math.round(rect.height * 100) / 100,
            };
          });
        return {
          labels,
          selectedCount: selected.length,
          selectedText: selected.map((element) => element.textContent ?? ''),
        };
      });

      expect(report.labels, JSON.stringify(report, null, 2)).toHaveLength(2);
      for (const label of report.labels) {
        expect(label.width, JSON.stringify(report, null, 2)).toBeGreaterThan(1);
        expect(label.height, JSON.stringify(report, null, 2)).toBeGreaterThan(1);
        expect(label.display, JSON.stringify(report, null, 2)).not.toBe('none');
        expect(label.visibility, JSON.stringify(report, null, 2)).not.toBe('hidden');
        expect(label.opacity, JSON.stringify(report, null, 2)).not.toBe('0');
        expect(label.textFillColor || label.color, JSON.stringify(report, null, 2)).toBe('rgb(180, 35, 24)');
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('does not stack top margins onto generated top-level blocks after markdown blank-line placeholders', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-blank-line-margin-audit');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'block-selection-blank-line-margin-audit.md',
        content: [
          'Paragraph before paragraph blank audit',
          '<!--vlaina-markdown-blank-line-->',
          'Paragraph after blank audit',
          '<!--vlaina-markdown-blank-line-->',
          '# Heading after blank audit',
          '<!--vlaina-markdown-blank-line-->',
          'Final paragraph after heading audit',
        ].join('\n'),
      });

      const report = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        if (!editor) return null;
        const blankLines = Array.from(editor.querySelectorAll<HTMLElement>(
          '[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]'
        ));
        return blankLines.map((blankLine) => {
          const next = blankLine.nextElementSibling instanceof HTMLElement
            ? blankLine.nextElementSibling
            : null;
          const blankRect = blankLine.getBoundingClientRect();
          const nextRect = next?.getBoundingClientRect();
          const nextStyle = next ? getComputedStyle(next) : null;
          return {
            blankClassName: blankLine.className,
            blankText: blankLine.textContent?.trim() ?? '',
            nextClassName: next?.className ?? null,
            nextMarginBlockStart: nextStyle?.marginBlockStart ?? null,
            nextMarginTop: nextStyle?.marginTop ?? null,
            nextTagName: next?.tagName ?? null,
            nextText: next?.textContent?.trim().slice(0, 80) ?? null,
            topGap: nextRect ? Math.round((nextRect.top - blankRect.bottom) * 100) / 100 : null,
          };
        });
      });

      expect(report).not.toBeNull();
      expect(report, JSON.stringify(report, null, 2)).toHaveLength(3);
      expect(report!.map((row) => row.nextTagName), JSON.stringify(report, null, 2)).toEqual([
        'P',
        'H1',
        'P',
      ]);
      for (const row of report!) {
        expect(Number.parseFloat(row.nextMarginBlockStart ?? row.nextMarginTop ?? '0'), JSON.stringify(report, null, 2)).toBeLessThanOrEqual(0.5);
        expect(row.topGap, JSON.stringify(report, null, 2)).toBeLessThanOrEqual(0.5);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('deletes selected blocks with Delete across representative block types', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-delete-key');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await openMarkdownFixture(page, {
        filename: 'block-selection-delete-key.md',
        content: [
          '# Delete Key Block Selection',
          '',
          'Delete paragraph sentinel',
          '',
          '## Delete heading sentinel',
          '',
          '- Delete bullet sentinel',
          '- Keep bullet sentinel',
          '',
          '1. Delete ordered sentinel',
          '2. Keep ordered sentinel',
          '',
          '- [ ] Delete task sentinel',
          '- [ ] Keep task sentinel',
          '',
          '> Delete quote sentinel',
          '',
          '```ts',
          'const deleteCodeSentinel = true;',
          '```',
          '',
          'Keep final sentinel',
          '',
        ].join('\n'),
      });

      for (const target of [
        'Delete paragraph sentinel',
        'Delete heading sentinel',
        'Delete bullet sentinel',
        'Delete ordered sentinel',
        'Delete task sentinel',
        'Delete quote sentinel',
        'deleteCodeSentinel',
      ]) {
        await expect(page.locator(EDITOR_SELECTOR)).toContainText(target);

        const selectedCount = await page.evaluate(async (targetText) => {
          const count = await (window as any).__vlainaE2E.selectNoteBlocksByText([targetText]);
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          return count;
        }, target);
        expect(selectedCount, `Expected selectable block for ${target}`).toBe(1);

        await page.evaluate(() => {
          const active = document.activeElement;
          if (active instanceof HTMLElement) active.blur();
        });
        await page.keyboard.press('Delete');

        await expect.poll(async () => page.evaluate((targetText) => {
          const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
          const state = (window as any).__vlainaE2E.getNotesState();
          return {
            editorHasText: editor?.textContent?.includes(targetText) ?? false,
            markdownHasText: state.currentNote?.content?.includes(targetText) ?? false,
            selectedCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
          };
        }, target), {
          message: `Expected Delete to remove selected block "${target}"`,
        }).toEqual({
          editorHasText: false,
          markdownHasText: false,
          selectedCount: 0,
        });
      }

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Keep bullet sentinel');
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Keep ordered sentinel');
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Keep task sentinel');
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Keep final sentinel');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('deletes a list block selected by real blank-area drag with Delete', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-drag-delete-list');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await openMarkdownFixture(page, {
        filename: 'block-selection-drag-delete-list.md',
        content: [
          '# Drag Delete List',
          '',
          'Intro paragraph stays after drag delete.',
          '',
          '- Drag delete list sentinel',
          '',
        ].join('\n'),
      });

      const target = await getBlankAreaDragTarget(page, 'Drag delete list sentinel');
      expect(target).not.toBeNull();
      expect(target!.hitInsideEditor).toBe(false);

      await page.mouse.move(target!.startX, target!.startY);
      await page.mouse.down();
      await page.mouse.move(target!.endX, target!.endY, { steps: 16 });
      await page.mouse.up();

      await expect.poll(async () => page.evaluate(() => {
        const selected = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror .editor-block-selected'));
        return {
          count: selected.length,
          hasTarget: selected.some((element) => element.textContent?.includes('Drag delete list sentinel')),
          activeTagName: document.activeElement instanceof HTMLElement ? document.activeElement.tagName : null,
          activeClassName: document.activeElement instanceof HTMLElement ? document.activeElement.className : null,
        };
      })).toMatchObject({
        count: expect.any(Number),
        hasTarget: true,
      });

      await page.keyboard.press('Delete');

      await expect.poll(async () => page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const state = (window as any).__vlainaE2E.getNotesState();
        return {
          editorHasTarget: editor?.textContent?.includes('Drag delete list sentinel') ?? false,
          markdownHasTarget: state.currentNote?.content?.includes('Drag delete list sentinel') ?? false,
          editorHasIntro: editor?.textContent?.includes('Intro paragraph stays after drag delete.') ?? false,
          selectedCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
        };
      }), {
        message: 'Expected Delete to remove the drag-selected list block',
      }).toEqual({
        editorHasTarget: false,
        markdownHasTarget: false,
        editorHasIntro: true,
        selectedCount: 0,
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('selects blocks from wide viewport side whitespace outside the editor content root', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-wide-side-whitespace');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1920, height: 1000 });
      await openMarkdownFixture(page, {
        filename: 'block-selection-wide-side-whitespace.md',
        content: [
          '# Wide Side Whitespace',
          '',
          ...Array.from({ length: 12 }, (_, index) => `- Wide whitespace row ${index}`),
        ].join('\n'),
      });

      const dragTarget = await page.evaluate(async () => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const contentRoot = editor?.closest('[data-note-content-root="true"]') as HTMLElement | null;
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        if (!editor || !contentRoot || !scrollRoot) return null;

        const items = Array.from(editor.querySelectorAll<HTMLElement>('li'))
          .filter((element) => element.textContent?.includes('Wide whitespace row'));
        const startItem = items.find((element) => element.textContent?.includes('Wide whitespace row 1')) ?? null;
        const endItem = items.find((element) => element.textContent?.includes('Wide whitespace row 5')) ?? null;
        if (!startItem || !endItem) return null;

        startItem.scrollIntoView({ block: 'center', inline: 'nearest' });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const startRect = startItem.getBoundingClientRect();
        const endRect = endItem.getBoundingClientRect();
        const contentRootRect = contentRoot.getBoundingClientRect();
        const scrollRootRect = scrollRoot.getBoundingClientRect();
        const startY = startRect.top + startRect.height / 2;
        const startCandidates = [
          contentRootRect.left - 120,
          contentRootRect.left - 80,
          contentRootRect.left - 40,
          contentRootRect.right + 120,
          contentRootRect.right + 80,
          contentRootRect.right + 40,
        ]
          .map((x) => Math.min(scrollRootRect.right - 32, Math.max(scrollRootRect.left + 32, x)))
          .filter((x, index, values) => values.findIndex((value) => Math.abs(value - x) < 0.5) === index)
          .filter((x) => x < contentRootRect.left - 8 || x > contentRootRect.right + 8);
        const startX = startCandidates.find((x) => {
          const candidateHit = document.elementFromPoint(x, startY);
          return candidateHit instanceof Node &&
            !editor.contains(candidateHit) &&
            !contentRoot.contains(candidateHit) &&
            scrollRoot.contains(candidateHit);
        }) ?? null;
        if (startX === null) return null;

        const endX = endRect.left + Math.min(
          Math.max(120, endRect.width * 0.35),
          Math.max(24, endRect.width - 24),
        );
        const hit = document.elementFromPoint(startX, startY);

        return {
          startX,
          startY,
          endX,
          endY: endRect.top + endRect.height / 2,
          hitInsideEditor: hit instanceof Node && editor.contains(hit),
          hitInsideContentRoot: hit instanceof Node && contentRoot.contains(hit),
          hitInsideScrollRoot: hit instanceof Node && scrollRoot.contains(hit),
          hitTagName: hit instanceof HTMLElement ? hit.tagName : null,
          hitClassName: hit instanceof HTMLElement ? hit.className : null,
        };
      });

      expect(dragTarget, 'wide viewport side whitespace drag target').not.toBeNull();
      expect(dragTarget!.hitInsideEditor, JSON.stringify(dragTarget, null, 2)).toBe(false);
      expect(dragTarget!.hitInsideContentRoot, JSON.stringify(dragTarget, null, 2)).toBe(false);
      expect(dragTarget!.hitInsideScrollRoot, JSON.stringify(dragTarget, null, 2)).toBe(true);

      await page.mouse.move(dragTarget!.startX, dragTarget!.startY);
      await page.mouse.down();
      await page.mouse.move(dragTarget!.endX, dragTarget!.endY, { steps: 16 });
      await page.mouse.up();

      await expect.poll(async () => page.evaluate(() => {
        const selected = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror .editor-block-selected'))
          .map((element) => element.textContent?.trim() ?? '');
        return {
          selected,
          selectedCount: selected.length,
          hasStart: selected.some((text) => text.includes('Wide whitespace row 1')),
          hasEnd: selected.some((text) => text.includes('Wide whitespace row 5')),
        };
      })).toMatchObject({
        selectedCount: expect.any(Number),
        hasStart: true,
        hasEnd: true,
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('updates blank-area drag selection in the same pointer move on long documents', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-long-drag-sync');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 1000 });
      await openMarkdownFixture(page, {
        filename: 'block-selection-long-drag-sync.md',
        content: [
          '# Long Blank Area Drag Sync',
          '',
          ...Array.from({ length: 80 }, (_, index) => `- Lag selection row ${index}`),
        ].join('\n'),
      });

      await expect.poll(
        async () => page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks().length),
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(80);

      const dragPoints = await page.evaluate(async () => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        if (!editor || !scrollRoot) return null;

        const items = Array.from(editor.querySelectorAll<HTMLElement>('li'))
          .filter((element) => element.textContent?.includes('Lag selection row'));
        const startItem = items.find((element) => element.textContent?.includes('Lag selection row 4')) ?? null;
        if (!startItem) return null;

        startItem.scrollIntoView({ block: 'center', inline: 'nearest' });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const scrollRootRect = scrollRoot.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();
        const visibleItems = items
          .map((element, index) => ({ element, index, rect: element.getBoundingClientRect() }))
          .filter(({ index, rect }) => (
            index > 4 &&
            rect.top >= scrollRootRect.top + 24 &&
            rect.bottom <= scrollRootRect.bottom - 24
          ));
        const endCandidate = visibleItems[Math.min(visibleItems.length - 1, 18)];
        if (!endCandidate || endCandidate.index < 12) return null;

        const startRect = startItem.getBoundingClientRect();
        const startY = startRect.top + startRect.height / 2;
        const startCandidates = [
          editorRect.right + 72,
          editorRect.right + 48,
          editorRect.right + 24,
          editorRect.right + 8,
          scrollRootRect.right - 24,
        ]
          .map((x) => Math.min(scrollRootRect.right - 24, Math.max(scrollRootRect.left + 24, x)))
          .filter((x, index, values) => values.findIndex((value) => Math.abs(value - x) < 0.5) === index);
        const startX = startCandidates.find((x) => {
          const hit = document.elementFromPoint(x, startY);
          return hit instanceof Node && !editor.contains(hit);
        }) ?? startCandidates[0] ?? scrollRootRect.right - 24;
        const endRect = endCandidate.rect;
        const endX = Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, endRect.left + 160));
        const hit = document.elementFromPoint(startX, startY);

        return {
          startX,
          startY,
          endX,
          endY: endRect.top + endRect.height / 2,
          endIndex: endCandidate.index,
          endText: endCandidate.element.textContent?.trim() ?? '',
          hitInsideEditor: hit instanceof Node && editor.contains(hit),
        };
      });

      expect(dragPoints, 'long blank-area drag points').not.toBeNull();
      expect(dragPoints!.hitInsideEditor, JSON.stringify(dragPoints, null, 2)).toBe(false);

      await page.evaluate(() => {
        const win = window as typeof window & {
          __vlainaRestoreHeldRaf?: () => void;
          __vlainaHeldRafCount?: () => number;
        };
        win.__vlainaRestoreHeldRaf?.();

        const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
        const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
        const callbacks = new Map<number, FrameRequestCallback>();
        let nextId = 1;

        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
          const id = nextId;
          nextId += 1;
          callbacks.set(id, callback);
          return id;
        };
        window.cancelAnimationFrame = (id: number) => {
          callbacks.delete(id);
        };
        win.__vlainaHeldRafCount = () => callbacks.size;
        win.__vlainaRestoreHeldRaf = () => {
          window.requestAnimationFrame = originalRequestAnimationFrame;
          window.cancelAnimationFrame = originalCancelAnimationFrame;
          callbacks.clear();
          delete win.__vlainaHeldRafCount;
          delete win.__vlainaRestoreHeldRaf;
        };
      });

      let mouseDown = false;
      try {
        await page.mouse.move(dragPoints!.startX, dragPoints!.startY);
        await page.mouse.down();
        mouseDown = true;
        await page.mouse.move(dragPoints!.endX, dragPoints!.endY, { steps: 1 });

        const immediateSelection = await page.evaluate((expectedEndText) => {
          const selected = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror .editor-block-selected'))
            .map((element) => element.textContent?.trim() ?? '');
          return {
            heldRafCount: (window as any).__vlainaHeldRafCount?.() ?? 0,
            selected,
            selectedCount: selected.length,
            hasEndBlock: selected.some((text) => text.includes(expectedEndText)),
          };
        }, dragPoints!.endText);

        expect(immediateSelection.heldRafCount, JSON.stringify({ dragPoints, immediateSelection }, null, 2)).toBeGreaterThan(0);
        expect(immediateSelection.selectedCount, JSON.stringify({ dragPoints, immediateSelection }, null, 2)).toBeGreaterThanOrEqual(8);
        expect(immediateSelection.hasEndBlock, JSON.stringify({ dragPoints, immediateSelection }, null, 2)).toBe(true);
      } finally {
        if (mouseDown) {
          await page.mouse.up().catch(() => {});
        }
        await page.evaluate(() => {
          (window as any).__vlainaRestoreHeldRaf?.();
        });
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps blank-area drag selection live while auto-scrolling into large selections', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-large-autoscroll-live-hit-testing');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 900 });
      await openMarkdownFixture(page, {
        filename: 'block-selection-large-autoscroll-live-hit-testing.md',
        content: [
          '# Large Auto-scroll Live Hit Testing',
          '',
          ...Array.from({ length: 230 }, (_, index) => `- Live drag row ${index}`),
        ].join('\n'),
      });

      await expect.poll(
        async () => page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks().length),
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(230);

      const dragTarget = await getBlankAreaDragTarget(page, 'Live drag row 0');
      expect(dragTarget, 'large auto-scroll blank-area drag target').not.toBeNull();
      expect(dragTarget!.hitInsideEditor, JSON.stringify(dragTarget, null, 2)).toBe(false);

      const edgeTarget = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        if (!editor || !scrollRoot) return null;
        const editorRect = editor.getBoundingClientRect();
        const scrollRootRect = scrollRoot.getBoundingClientRect();
        return {
          x: Math.max(editorRect.left + 80, Math.min(editorRect.right - 80, editorRect.left + editorRect.width * 0.42)),
          y: scrollRootRect.bottom - 6,
        };
      });
      expect(edgeTarget, 'large auto-scroll edge target').not.toBeNull();

      let mouseDown = false;
      try {
        await page.mouse.move(dragTarget!.startX, dragTarget!.startY);
        await page.mouse.down();
        mouseDown = true;
        await page.mouse.move(dragTarget!.endX, dragTarget!.endY, { steps: 8 });
        await page.mouse.move(edgeTarget!.x, edgeTarget!.y, { steps: 8 });

        await expect.poll(async () => page.evaluate(() => {
          const selectedItems = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror li.editor-block-selected'));
          const indexes = selectedItems
            .map((element) => /Live drag row (\d+)/.exec(element.textContent ?? '')?.[1] ?? null)
            .filter((value): value is string => value !== null)
            .map((value) => Number.parseInt(value, 10))
            .filter(Number.isFinite);
          return indexes.length > 0 ? Math.max(...indexes) : -1;
        }), { timeout: 30_000 }).toBeGreaterThanOrEqual(150);

        const metrics = await page.evaluate(() => {
          const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
          const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
          const selectedItems = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror li.editor-block-selected'));
          const indexes = selectedItems
            .map((element) => /Live drag row (\d+)/.exec(element.textContent ?? '')?.[1] ?? null)
            .filter((value): value is string => value !== null)
            .map((value) => Number.parseInt(value, 10))
            .filter(Number.isFinite);
          return {
            largeActive: editor?.classList.contains('editor-block-selection-large') ?? false,
            maxIndex: indexes.length > 0 ? Math.max(...indexes) : -1,
            pending: editor?.classList.contains('editor-block-selection-pending') ?? false,
            scrollTop: Math.round(scrollRoot?.scrollTop ?? 0),
            selectedCount: selectedItems.length,
          };
        });

        expect(metrics.pending, JSON.stringify(metrics, null, 2)).toBe(true);
        expect(metrics.largeActive, JSON.stringify(metrics, null, 2)).toBe(true);
        expect(metrics.selectedCount, JSON.stringify(metrics, null, 2)).toBeGreaterThanOrEqual(128);
        expect(metrics.maxIndex, JSON.stringify(metrics, null, 2)).toBeGreaterThanOrEqual(150);
        expect(metrics.scrollTop, JSON.stringify(metrics, null, 2)).toBeGreaterThan(300);
      } finally {
        if (mouseDown) {
          await page.mouse.up().catch(() => {});
        }
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('moves a dragged block when hovering the target row left gutter', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-drag-left-gutter-drop');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await openBlockSelectionFixture(page);

      await selectNoteBlocksByMatchers(page, [{ include: 'First selectable paragraph' }]);
      const source = page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'First selectable paragraph' });
      const target = page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Second selectable paragraph' });
      await moveMouseToBlockHandleGutter(page, source, { assertCentered: false });

      const handleBox = await page.locator('.editor-block-control-handle').boundingBox();
      const targetBox = await target.boundingBox();
      if (!handleBox || !targetBox) {
        throw new Error('Could not resolve drag handle or target paragraph geometry');
      }

      const dragStartX = handleBox.x + handleBox.width / 2;
      const dragStartY = handleBox.y + handleBox.height / 2;
      const leftGutterX = Math.max(8, targetBox.x - 96);
      const targetLowerHalfY = targetBox.y + targetBox.height * 0.75;

      await page.mouse.move(dragStartX, dragStartY);
      await page.mouse.down();
      await page.mouse.move(leftGutterX, targetLowerHalfY, { steps: 12 });

      const indicator = page.locator('.editor-block-drop-indicator.visible');
      await expect(indicator).toBeVisible();
      const indicatorBox = await indicator.boundingBox();
      expect(indicatorBox).not.toBeNull();
      expect(indicatorBox!.x).toBeGreaterThan(leftGutterX);
      expect(indicatorBox!.x + indicatorBox!.width).toBeGreaterThanOrEqual(leftGutterX);
      expect(Math.round(indicatorBox!.height)).toBe(3);

      await page.mouse.up();

      await expect.poll(async () => page.evaluate(() => {
        const content = String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '');
        const indexes = [
          content.indexOf('Second selectable paragraph'),
          content.indexOf('First selectable paragraph'),
          content.indexOf('Parent item'),
        ];
        return indexes.every((index) => index >= 0)
          && indexes[0] < indexes[1]
          && indexes[1] < indexes[2];
      }), {
        message: 'Expected dropping from the left gutter to move First after Second',
      }).toBe(true);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('selects blocks from the text gutter and centers the drag handle on the selected block', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await openBlockSelectionFixture(page);

      await expect.poll(async () => page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks()))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ tagName: 'P', text: 'First selectable paragraph' }),
          expect.objectContaining({ tagName: 'P', text: 'Second selectable paragraph' }),
        ]));

      await expect(
        page.evaluate(() => (window as any).__vlainaE2E.selectNoteBlocksByText([
          'First selectable paragraph',
          'Second selectable paragraph',
        ]))
      ).resolves.toBe(2);
      await expectSelectedParagraphs(page, ['First selectable paragraph', 'Second selectable paragraph']);

      const firstSelected = page.locator(SELECTED_BLOCK_SELECTOR).first();
      await moveMouseToBlockHandleGutter(page, firstSelected, { maxCenterDelta: 8 });
      await expect(page.locator(BLOCK_CONTROLS_SELECTOR)).toBeVisible();

      const geometry = await page.evaluate(() => {
        const controls = document.querySelector<HTMLElement>('.editor-block-controls.visible');
        const selected = document.querySelector<HTMLElement>('.milkdown .ProseMirror .editor-block-selected');
        if (!controls || !selected) return null;
        const controlsRect = controls.getBoundingClientRect();
        const selectedRect = selected.getBoundingClientRect();
        return {
          controlsCenterY: controlsRect.top + controlsRect.height / 2,
          selectedCenterY: selectedRect.top + selectedRect.height / 2,
          controlsLeft: controlsRect.left,
          selectedLeft: selectedRect.left,
        };
      });

      expect(geometry).not.toBeNull();
      expect(Math.abs(geometry!.controlsCenterY - geometry!.selectedCenterY)).toBeLessThanOrEqual(8);
      expect(geometry!.controlsLeft).toBeLessThan(geometry!.selectedLeft);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps long block drag previews anchored near the pointer', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-long-block-drag-preview-anchor');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'long-block-drag-preview-anchor.md',
        content: Array.from(
          { length: 170 },
          (_, index) => `Long drag preview row ${index}`,
        ).join('\n\n'),
      });

      await expect.poll(
        async () => page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks().length),
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(300);

      const selectedCount = await page.evaluate(() => {
        const indexes = Array.from({ length: 260 }, (_, index) => index);
        return (window as any).__vlainaE2E.selectNoteBlocksByIndexes(indexes);
      });
      expect(selectedCount).toBe(260);

      const anchor = page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Long drag preview row 120' });
      await anchor.scrollIntoViewIfNeeded();
      await expect(anchor).toBeVisible();
      await moveMouseToBlockHandleGutter(page, anchor, { assertCentered: false });
      await expect(page.locator(BLOCK_CONTROLS_SELECTOR)).toBeVisible();

      const handleBox = await page.locator('.editor-block-control-handle').boundingBox();
      if (!handleBox) {
        throw new Error('Could not resolve block drag handle geometry');
      }

      const dragStartX = handleBox.x + handleBox.width / 2;
      const dragStartY = handleBox.y + handleBox.height / 2;
      const dragMoveX = dragStartX + 36;
      const dragMoveY = dragStartY + 18;
      await page.mouse.move(dragStartX, dragStartY);
      await page.mouse.down();
      await page.mouse.move(dragMoveX, dragMoveY, { steps: 6 });

      await expect.poll(async () => page.evaluate(() =>
        document.body.classList.contains('editor-block-drag-active')
      )).toBe(true);

      const geometry = await page.evaluate(({ pointerY }) => {
        const preview = document.querySelector<HTMLElement>('.editor-block-drag-preview');
        const layer = preview?.querySelector<HTMLElement>('.editor-block-drag-preview-layer') ?? null;
        if (!preview || !layer) return null;
        const rect = preview.getBoundingClientRect();
        return {
          previewTop: rect.top,
          previewBottom: rect.bottom,
          previewHeight: rect.height,
          pointerOffsetY: pointerY - rect.top,
          pointerInsidePreviewY: pointerY >= rect.top && pointerY <= rect.bottom,
        };
      }, { pointerY: dragMoveY });

      expect(geometry, 'long drag preview geometry').not.toBeNull();
      expect(geometry!.previewHeight, JSON.stringify(geometry, null, 2)).toBeGreaterThan(1000);
      expect(geometry!.pointerInsidePreviewY, JSON.stringify(geometry, null, 2)).toBe(true);
      expect(geometry!.pointerOffsetY, JSON.stringify(geometry, null, 2)).toBeGreaterThanOrEqual(8);
      expect(geometry!.pointerOffsetY, JSON.stringify(geometry, null, 2)).toBeLessThanOrEqual(120);

      await page.mouse.up();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps block handles clear of collapse toggles while dragging', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-handle-collapse-clearance');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { notePath } = await page.evaluate(() =>
        (window as any).__vlainaE2E.createNotesFixture({
          filename: 'block-handle-collapse-clearance.md',
          content: [
            '# Collapsible Heading Clearance',
            '',
            'Heading body paragraph',
            '',
            '# List Collapse Section',
            '',
            '- Parent collapse row',
            '  - Child collapse row',
            '',
          ].join('\n'),
        })
      );

      await page.evaluate((pathToOpen) => (window as any).__vlainaE2E.openAbsoluteNote(pathToOpen), notePath);
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .heading-toggle-btn`).first()).toBeAttached();
      await expect(page.locator(`${EDITOR_SELECTOR} .editor-collapse-btn[data-has-content="true"]`).first()).toBeAttached();

      await selectNoteBlocksByMatchers(page, [{ exact: 'Collapsible Heading Clearance' }]);
      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} h1`, { hasText: 'Collapsible Heading Clearance' }),
        { assertCentered: false },
      );
      const headingClearance = await measureCollapseToggleClearance(page, {
        targetSelector: '.milkdown .ProseMirror h1',
        targetText: 'Collapsible Heading Clearance',
        toggleSelector: ':scope > .heading-toggle-btn',
      });
      expect(headingClearance.handleGapX).toBeGreaterThanOrEqual(10);
      const headingSurface = await measureSelectedSurfaceCoverage(page, {
        targetSelector: '.milkdown .ProseMirror h1',
        targetText: 'Collapsible Heading Clearance',
      });
      expect(headingSurface.bleedStart).toBeGreaterThanOrEqual(72);
      expect(headingSurface.visualLeft).toBeLessThanOrEqual(headingSurface.controlsLeft + 1);
      expect(headingSurface.visualRight).toBeGreaterThanOrEqual(headingSurface.controlsRight - 1);

      await page.locator(`${EDITOR_SELECTOR} .editor-collapse-btn[data-has-content="true"]`).first().click();
      await expect(page.locator(`${EDITOR_SELECTOR} .editor-collapse-btn[data-collapsed="true"]`).first()).toBeAttached();

      await selectNoteBlocksByMatchers(page, [{ include: 'Parent collapse row' }]);
      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} > ul > li`, { hasText: 'Parent collapse row' }),
        { assertCentered: false },
      );
      const listClearance = await measureCollapseToggleClearance(page, {
        targetSelector: '.milkdown .ProseMirror > ul > li',
        targetText: 'Parent collapse row',
        toggleSelector: ':scope > .editor-collapse-btn',
      });
      expect(listClearance.handleGapX).toBeGreaterThanOrEqual(10);
      const listSurface = await measureSelectedSurfaceCoverage(page, {
        targetSelector: '.milkdown .ProseMirror > ul > li',
        targetText: 'Parent collapse row',
      });
      expect(listSurface.bleedStart).toBeGreaterThanOrEqual(96);
      expect(listSurface.visualLeft).toBeLessThanOrEqual(listSurface.controlsLeft + 1);
      expect(listSurface.visualRight).toBeGreaterThanOrEqual(listSurface.controlsRight - 1);

      const handleBox = await page.locator('.editor-block-control-handle').boundingBox();
      if (!handleBox) {
        throw new Error('Could not resolve block drag handle geometry');
      }
      const dragStartX = handleBox.x + handleBox.width / 2;
      const dragStartY = handleBox.y + handleBox.height / 2;
      await page.mouse.move(dragStartX, dragStartY);
      await page.mouse.down();
      await page.mouse.move(dragStartX + 20, dragStartY + 16, { steps: 4 });

      const draggingClearance = await measureCollapseToggleClearance(page, {
        targetSelector: '.milkdown .ProseMirror > ul > li',
        targetText: 'Parent collapse row',
        toggleSelector: ':scope > .editor-collapse-btn',
      });
      expect(draggingClearance.handleGapX).toBeGreaterThanOrEqual(10);
      const draggingSurface = await measureSelectedSurfaceCoverage(page, {
        targetSelector: '.milkdown .ProseMirror > ul > li',
        targetText: 'Parent collapse row',
      });
      expect(draggingSurface.bleedStart).toBeGreaterThanOrEqual(96);
      expect(draggingSurface.visualLeft).toBeLessThanOrEqual(draggingSurface.controlsLeft + 1);
      expect(draggingSurface.visualRight).toBeGreaterThanOrEqual(draggingSurface.controlsRight - 1);
      expect(draggingSurface.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(draggingSurface.boxShadow).toBe('none');
      expect(draggingSurface.afterBackgroundColor).toBe(draggingSurface.expectedBackground);
      expect(draggingSurface.afterLeft).not.toBeNull();
      expect(draggingSurface.afterRight).not.toBeNull();
      expect(draggingSurface.afterLeft!).toBeCloseTo(-draggingSurface.bleedStart, 0);
      expect(draggingSurface.afterRight!).toBeCloseTo(-draggingSurface.bleedEnd, 0);

      await page.mouse.up();

      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({ fontSize: 120 }));
      await expect.poll(async () =>
        page.evaluate(() => {
          const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
          return editor ? Number.parseFloat(window.getComputedStyle(editor).fontSize || '0') : 0;
        })
      ).toBeGreaterThan(100);

      const largeHeading = page.locator(`${EDITOR_SELECTOR} h1`, { hasText: 'Collapsible Heading Clearance' });
      await largeHeading.scrollIntoViewIfNeeded();
      await selectNoteBlocksByMatchers(page, [{ exact: 'Collapsible Heading Clearance' }]);
      await moveMouseToBlockHandleGutter(page, largeHeading, { assertCentered: false });
      const largeHeadingClearance = await measureCollapseToggleClearance(page, {
        targetSelector: '.milkdown .ProseMirror h1',
        targetText: 'Collapsible Heading Clearance',
        toggleSelector: ':scope > .heading-toggle-btn',
      });
      expect(largeHeadingClearance.handleGapX).toBeGreaterThanOrEqual(10);

      const largeListItem = page.locator(`${EDITOR_SELECTOR} > ul > li`, { hasText: 'Parent collapse row' });
      await largeListItem.scrollIntoViewIfNeeded();
      await selectNoteBlocksByMatchers(page, [{ include: 'Parent collapse row' }]);
      await moveMouseToBlockHandleGutter(page, largeListItem, { assertCentered: false });
      const largeListClearance = await measureCollapseToggleClearance(page, {
        targetSelector: '.milkdown .ProseMirror > ul > li',
        targetText: 'Parent collapse row',
        toggleSelector: ':scope > .editor-collapse-btn',
      });
      expect(largeListClearance.handleGapX).toBeGreaterThanOrEqual(10);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps block drag handles aligned and paints dragged sources for nested selections', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-nested-block-drag-handle');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { notePath } = await page.evaluate(() =>
        (window as any).__vlainaE2E.createNotesFixture({
          filename: 'nested-block-drag-handle.md',
          content: [
            '# Nested Block Drag',
            '',
            '- Parent item',
            '  - Nested child drag source',
            '',
            'Standalone following paragraph',
            '',
          ].join('\n'),
        })
      );

      await page.evaluate((pathToOpen) => (window as any).__vlainaE2E.openAbsoluteNote(pathToOpen), notePath);
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Standalone following paragraph' })).toBeVisible();

      const selectedCount = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks();
        const nestedIndex = blocks.findIndex((block: { text: string }) => block.text === 'Nested child drag source');
        const standaloneIndex = blocks.findIndex((block: { text: string }) => block.text === 'Standalone following paragraph');
        if (nestedIndex < 0 || standaloneIndex < 0) return 0;
        return (window as any).__vlainaE2E.selectNoteBlocksByIndexes([nestedIndex, standaloneIndex]);
      });
      expect(selectedCount).toBe(2);

      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Standalone following paragraph' }),
        { maxCenterDelta: 12 },
      );
      await expect(page.locator(BLOCK_CONTROLS_SELECTOR)).toBeVisible();

      const alignedGeometry = await page.evaluate(() => {
        const controls = document.querySelector<HTMLElement>('.editor-block-controls.visible');
        const standalone = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror p'))
          .find((element) => element.textContent?.includes('Standalone following paragraph'));
        if (!controls || !standalone) return null;
        const controlsRect = controls.getBoundingClientRect();
        const standaloneRect = standalone.getBoundingClientRect();
        return {
          controlsCenterY: controlsRect.top + controlsRect.height / 2,
          standaloneCenterY: standaloneRect.top + standaloneRect.height / 2,
          handleGapX: standaloneRect.left - controlsRect.left,
        };
      });
      expect(alignedGeometry).not.toBeNull();
      expect(Math.abs(alignedGeometry!.controlsCenterY - alignedGeometry!.standaloneCenterY)).toBeLessThanOrEqual(12);
      expect(alignedGeometry!.handleGapX).toBeGreaterThan(24);
      expect(alignedGeometry!.handleGapX).toBeLessThan(72);

      const handleBox = await page.locator('.editor-block-control-handle').boundingBox();
      if (!handleBox) {
        throw new Error('Could not resolve block drag handle geometry');
      }
      await page.locator('.editor-block-control-handle').hover();

      const handleColor = await page.evaluate(() => {
        const handle = document.querySelector<HTMLElement>('.editor-block-control-handle');
        const path = handle?.querySelector<SVGPathElement>('path');
        if (!handle || !path) return null;
        const probe = document.createElement('span');
        probe.style.color = 'var(--vlaina-color-accent)';
        document.body.appendChild(probe);
        const accentColor = getComputedStyle(probe).color;
        probe.remove();
        return {
          iconFill: getComputedStyle(path).fill,
          accentColor,
          isHovered: handle.matches(':hover'),
        };
      });
      expect(handleColor).not.toBeNull();
      expect(handleColor!.isHovered).toBe(true);
      expect(handleColor!.iconFill).toBe(handleColor!.accentColor);

      const dragStartBox = await page.locator('.editor-block-control-handle').boundingBox();
      if (!dragStartBox) {
        throw new Error('Could not resolve block drag handle geometry after hover');
      }
      const dragStartX = dragStartBox.x + dragStartBox.width / 2;
      const dragStartY = dragStartBox.y + dragStartBox.height / 2;
      await page.mouse.move(dragStartX, dragStartY);
      await page.mouse.down();
      await page.mouse.move(dragStartX + 24, dragStartY + 24, { steps: 4 });

      const dragVisual = await page.evaluate(() => {
        const source = document.querySelector<HTMLElement>(
          '.milkdown .ProseMirror .editor-block-selected, .milkdown .ProseMirror .editor-block-drag-source'
        );
        if (!source) return null;
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--vlaina-block-selection-color-default)';
        document.body.appendChild(probe);
        const expectedBackground = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const style = getComputedStyle(source);
        const afterStyle = getComputedStyle(source, '::after');
        const afterLeft = Number.parseFloat(afterStyle.left);
        const afterRight = Number.parseFloat(afterStyle.right);
        const bleedStart = Number.parseFloat(style.getPropertyValue('--vlaina-block-selection-bleed-x-start'));
        const bleedEnd = Number.parseFloat(style.getPropertyValue('--vlaina-block-selection-bleed-x-end'));
        const previewLayer = document.querySelector<HTMLElement>('.editor-block-drag-preview-layer');
        const previewLayerStyle = previewLayer ? getComputedStyle(previewLayer) : null;
        return {
          dragActive: document.body.classList.contains('editor-block-drag-active'),
          backgroundColor: style.backgroundColor,
          boxShadow: style.boxShadow,
          sourceOpacity: style.opacity,
          afterBackgroundColor: afterStyle.backgroundColor,
          afterLeft: Number.isFinite(afterLeft) ? afterLeft : null,
          afterRight: Number.isFinite(afterRight) ? afterRight : null,
          bleedStart: Number.isFinite(bleedStart) ? bleedStart : null,
          bleedEnd: Number.isFinite(bleedEnd) ? bleedEnd : null,
          expectedBackground,
          previewLayerBackgroundColor: previewLayerStyle?.backgroundColor ?? null,
          previewLayerOpacity: previewLayerStyle?.opacity ?? null,
          previewLayerBoxShadow: previewLayerStyle?.boxShadow ?? null,
          selectedCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
          sourceCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-drag-source').length,
        };
      });
      expect(dragVisual).not.toBeNull();
      expect(dragVisual!.dragActive).toBe(true);
      expect(dragVisual!.selectedCount + dragVisual!.sourceCount).toBeGreaterThan(0);
      expectDragSourceSelectionSurface('nested-selection-source', {
        sourceBackgroundColor: dragVisual!.backgroundColor,
        sourceBoxShadow: dragVisual!.boxShadow,
        sourceAfterBackgroundColor: dragVisual!.afterBackgroundColor,
        sourceAfterLeft: dragVisual!.afterLeft,
        sourceAfterRight: dragVisual!.afterRight,
        sourceBleedStart: dragVisual!.bleedStart,
        sourceBleedEnd: dragVisual!.bleedEnd,
        expectedBackground: dragVisual!.expectedBackground,
      });
      expect(dragVisual!.sourceOpacity).toBe('1');
      expect(dragVisual!.previewLayerBackgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(dragVisual!.previewLayerOpacity).toBe('1');
      expect(dragVisual!.previewLayerBoxShadow).toBe('none');

      await page.mouse.up();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
