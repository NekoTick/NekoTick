import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  NOTE_SCROLL_ROOT_SELECTOR,
  cleanupIsolatedElectron,
  collectEditorDomMetrics,
  getBlankAreaDragTarget,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

const OUTLINE_RAIL_SELECTOR = '[data-editor-outline-rail="true"]';

async function expandOutlineRail(page: Page): Promise<void> {
  const rail = page.locator(OUTLINE_RAIL_SELECTOR);
  const box = await rail.boundingBox();
  if (!box) throw new Error('Outline rail is not visible');
  await page.mouse.move(box.x + box.width - 2, box.y + Math.min(10, box.height / 2));
  await expect(rail).toHaveAttribute('data-expanded', 'true');
}

test.describe('notes editor outline rail', () => {
  test('expands from the right-edge markers and tracks the active heading', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-editor-outline-rail');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'editor-outline-rail.md',
        content: [
          '# Introduction',
          '',
          ...Array.from({ length: 12 }, (_, index) => `Opening paragraph ${index + 1}. ${'Context '.repeat(18)}`),
          '',
          '## Overview',
          '',
          ...Array.from({ length: 12 }, (_, index) => `Overview paragraph ${index + 1}. ${'Details '.repeat(18)}`),
          '',
          '### Deep Dive',
          '',
          ...Array.from({ length: 12 }, (_, index) => `Deep paragraph ${index + 1}. ${'Evidence '.repeat(18)}`),
          '',
          '#### Conclusion',
          '',
          'Closing paragraph.',
        ].join('\n'),
      });

      const rail = page.locator(OUTLINE_RAIL_SELECTOR);
      const outline = rail.getByRole('navigation', { name: 'Outline' });
      const getGeometry = () => page.evaluate((selector) => {
        const railElement = document.querySelector<HTMLElement>(selector);
        const panelElement = railElement?.querySelector<HTMLElement>('[data-editor-outline-panel="true"]');
        const toolbarElement = railElement?.parentElement?.closest<HTMLElement>('[data-no-editor-drag-box="true"]');
        const rows = Array.from(
          railElement?.querySelectorAll<HTMLElement>('.editor-outline-row') ?? [],
        );
        if (!railElement || !panelElement || !toolbarElement || rows.length === 0) return null;
        const panelRect = panelElement.getBoundingClientRect();
        const railRect = railElement.getBoundingClientRect();
        const toolbarRect = toolbarElement.getBoundingClientRect();
        const accentProbe = document.createElement('span');
        accentProbe.style.color = 'var(--vlaina-color-accent)';
        document.body.appendChild(accentProbe);
        const accentColor = getComputedStyle(accentProbe).color;
        accentProbe.remove();
        return {
          accentColor,
          markerColors: rows.map((row) => getComputedStyle(row, '::before').backgroundColor),
          markerOpacities: rows.map((row) => getComputedStyle(row, '::before').opacity),
          markerWidths: rows.map((row) => Math.round(
            Number.parseFloat(getComputedStyle(row, '::before').width),
          )),
          panelBottom: panelRect.bottom,
          panelHeight: Math.round(panelRect.height),
          panelRight: panelRect.right,
          panelTop: panelRect.top,
          panelWidth: Math.round(panelRect.width),
          railHeight: Math.round(railRect.height),
          rowHeights: rows.map((row) => Math.round(row.getBoundingClientRect().height)),
          rowTextOpacities: rows.map((row) => getComputedStyle(
            row.querySelector<HTMLElement>('.editor-outline-row-text')!,
          ).opacity),
          rowTextLefts: rows.map((row) => Math.round(
            row.querySelector<HTMLElement>('.editor-outline-row-text')?.getBoundingClientRect().left ?? 0,
          )),
          toolbarBottom: toolbarRect.bottom,
          viewportWidth: window.innerWidth,
        };
      }, OUTLINE_RAIL_SELECTOR);
      const hoverOutlineMarkers = async () => {
        const box = await rail.boundingBox();
        if (!box) throw new Error('Outline rail is not visible');
        await page.mouse.move(
          box.x + box.width - 2,
          box.y + Math.min(10, box.height / 2),
        );
      };
      const pointHitsOutline = (x: number, y: number) => page.evaluate(
        ({ selector, pointX, pointY }) => {
          const railElement = document.querySelector(selector);
          const hitElement = document.elementFromPoint(pointX, pointY);
          return Boolean(railElement && hitElement && railElement.contains(hitElement));
        },
        {
          selector: OUTLINE_RAIL_SELECTOR,
          pointX: x,
          pointY: y,
        },
      );

      await expect(rail).toBeVisible({ timeout: 10_000 });
      await expect(outline).toBeVisible();
      await expect(rail).toHaveAttribute('data-expanded', 'false');
      await expect(outline.getByRole('button')).toHaveText([
        'Introduction',
        'Overview',
        'Deep Dive',
        'Conclusion',
      ]);
      await expect(outline.locator('[aria-current="location"]')).toHaveText('Introduction');

      const scrollRoot = page.locator(NOTE_SCROLL_ROOT_SELECTOR);
      const overviewDocumentTop = await page.locator(`${EDITOR_SELECTOR} h2`, { hasText: 'Overview' })
        .evaluate((heading) => {
          const scrollElement = heading.closest<HTMLElement>('[data-note-scroll-root="true"]');
          if (!scrollElement) return 0;
          return heading.getBoundingClientRect().top
            - scrollElement.getBoundingClientRect().top
            + scrollElement.scrollTop;
        });
      await scrollRoot.evaluate((element, top) => {
        element.scrollTo({ top, behavior: 'auto' });
      }, overviewDocumentTop - 100);
      await expect(outline.locator('.editor-outline-row-active')).toHaveText('Introduction');
      await scrollRoot.evaluate((element, top) => {
        element.scrollTo({ top, behavior: 'auto' });
      }, overviewDocumentTop - 60);
      await expect(outline.locator('.editor-outline-row-active')).toHaveText('Overview');
      await scrollRoot.evaluate((element) => {
        element.scrollTo({ top: 0, behavior: 'auto' });
      });
      await expect(outline.locator('.editor-outline-row-active')).toHaveText('Introduction');

      const geometry = await getGeometry();

      expect(geometry).not.toBeNull();
      expect(geometry!.panelTop).toBeGreaterThan(geometry!.toolbarBottom);
      expect(geometry!.panelRight).toBeLessThanOrEqual(geometry!.viewportWidth);
      expect(geometry!.panelWidth).toBe(240);
      expect(geometry!.railHeight).toBe(geometry!.panelHeight);
      expect(geometry!.railHeight).toBeLessThan(100);
      expect(geometry!.markerWidths).toEqual([16, 14, 12, 10]);
      expect(new Set(geometry!.markerOpacities)).toEqual(new Set(['1']));
      expect(new Set(geometry!.rowHeights)).toEqual(new Set([14]));
      expect(new Set(geometry!.rowTextOpacities)).toEqual(new Set(['0']));
      expect(geometry!.markerColors[0]).not.toBe(geometry!.markerColors[1]);
      await expect.poll(async () => {
        const currentGeometry = await getGeometry();
        return currentGeometry?.markerColors[0] === currentGeometry?.accentColor;
      }).toBe(true);

      const clippedPointX = geometry!.panelRight - 40;
      const outlinePointY = geometry!.panelTop + 10;
      await page.mouse.move(clippedPointX, outlinePointY);
      await expect(rail).toHaveAttribute('data-expanded', 'false');
      expect(await pointHitsOutline(clippedPointX, outlinePointY)).toBe(false);

      await page.mouse.move(geometry!.panelRight - 2, geometry!.panelBottom + 32);
      await expect(rail).toHaveAttribute('data-expanded', 'false');

      const panel = rail.locator('[data-editor-outline-panel="true"]');
      await hoverOutlineMarkers();
      await expect(rail).toHaveAttribute('data-expanded', 'true');
      await expect(panel).toHaveCSS('width', '240px');
      await expect(rail.locator('.editor-outline-row-text').first()).toHaveCSS('opacity', '1');

      const expandedGeometry = await getGeometry();
      expect(expandedGeometry).not.toBeNull();
      expect(expandedGeometry!.panelWidth).toBe(240);
      expect(new Set(expandedGeometry!.markerOpacities)).toEqual(new Set(['0']));
      expect(new Set(expandedGeometry!.rowHeights)).toEqual(new Set([28]));
      expect(new Set(expandedGeometry!.rowTextOpacities)).toEqual(new Set(['1']));
      expect(expandedGeometry!.rowTextLefts[0]).toBeLessThan(expandedGeometry!.rowTextLefts[1]);
      expect(expandedGeometry!.rowTextLefts[1]).toBeLessThan(expandedGeometry!.rowTextLefts[2]);
      expect(expandedGeometry!.rowTextLefts[2]).toBeLessThan(expandedGeometry!.rowTextLefts[3]);

      await page.evaluate(() => {
        document.documentElement.style.setProperty(
          '--vlaina-editor-outline-rail-max-height',
          '96px',
        );
      });
      const outlineViewport = rail.locator('.editor-outline-list');
      const getActiveOutlineCenterOffset = () => outlineViewport.evaluate((element) => {
        const activeRow = element.querySelector<HTMLElement>('.editor-outline-row-active');
        if (!activeRow) return Number.POSITIVE_INFINITY;
        const viewportRect = element.getBoundingClientRect();
        const activeRect = activeRow.getBoundingClientRect();
        return Math.abs(
          activeRect.top + activeRect.height / 2
          - (viewportRect.top + element.clientHeight / 2),
        );
      });
      await expect.poll(async () => outlineViewport.evaluate((element) => (
        element.scrollHeight > element.clientHeight
      ))).toBe(true);
      await expect(rail.locator('[data-overlay-scrollbar-rail="true"]')).toHaveCSS('opacity', '1');

      await outline.getByRole('button', { name: 'Deep Dive' }).click();

      await expect.poll(async () => page.locator(NOTE_SCROLL_ROOT_SELECTOR).evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      await expect(outline.locator('.editor-outline-row-active')).toHaveText('Deep Dive');
      await expect(outline.locator('.editor-outline-row-active')).toHaveAttribute('data-level', '3');

      await page.mouse.move(0, 0);
      await expect(rail).toHaveAttribute('data-expanded', 'false');
      await expect.poll(() => pointHitsOutline(clippedPointX, outlinePointY)).toBe(false);
      await expect(panel).toHaveCSS('width', '240px');
      const collapsedAgainGeometry = await getGeometry();
      expect(collapsedAgainGeometry).not.toBeNull();
      expect(new Set(collapsedAgainGeometry!.markerOpacities)).toEqual(new Set(['1']));
      expect(new Set(collapsedAgainGeometry!.rowTextOpacities)).toEqual(new Set(['0']));

      await hoverOutlineMarkers();
      await expect(rail).toHaveAttribute('data-expanded', 'true');
      await expect(panel).toHaveCSS('width', '240px');
      const openingScrollTop = await outlineViewport.evaluate((element) => element.scrollTop);
      expect(await getActiveOutlineCenterOffset()).toBeLessThanOrEqual(2);
      await expect(rail.locator('.editor-outline-row-text').first()).toHaveCSS('opacity', '1');
      expect(await getActiveOutlineCenterOffset()).toBeLessThanOrEqual(2);
      expect(Math.abs(
        await outlineViewport.evaluate((element) => element.scrollTop)
        - openingScrollTop,
      )).toBeLessThanOrEqual(1);

      await page.evaluate(() => {
        document.documentElement.style.removeProperty(
          '--vlaina-editor-outline-rail-max-height',
        );
      });

      await scrollRoot.evaluate((element) => {
        element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
      });
      await expect.poll(async () => scrollRoot.evaluate((element) => (
        Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop)
      ))).toBeLessThanOrEqual(2);
      await expect(outline.locator('.editor-outline-row-active')).toHaveText('Conclusion');

      await page.setViewportSize({ width: 700, height: 860 });
      await expect(rail).toBeVisible();
      await hoverOutlineMarkers();
      await expect(rail.locator('[data-editor-outline-panel="true"]')).toHaveCSS('width', '240px');
      const narrowGeometry = await getGeometry();
      expect(narrowGeometry).not.toBeNull();
      expect(narrowGeometry!.panelRight).toBeLessThanOrEqual(narrowGeometry!.viewportWidth);
      expect(narrowGeometry!.panelWidth).toBe(240);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('includes headings nested after raw HTML in lists, quotes, and footnotes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-editor-outline-nested-headings');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'editor-outline-nested-headings.md',
        content: [
          '# Root heading',
          '',
          '- <textarea>',
          '  List raw HTML',
          '  </textarea>',
          '  ## List heading',
          '7. > <textarea>',
          '   > Quoted raw HTML',
          '   > </textarea>',
          '   > ## Quoted heading',
          'Footnote reference[^nested-heading].',
          '[^nested-heading]: <textarea>',
          '    Footnote raw HTML',
          '    </textarea>',
          '    ## Footnote heading',
          '',
          '## Ending heading',
        ].join('\n'),
      });

      const editorHeadings = page.locator(`${EDITOR_SELECTOR} h1, ${EDITOR_SELECTOR} h2`);
      await expect(editorHeadings).toHaveCount(5);

      const outlineRows = page.locator(`${OUTLINE_RAIL_SELECTOR} .editor-outline-row`);
      await expect(outlineRows).toHaveText([
        'Root heading',
        'List heading',
        'Quoted heading',
        'Footnote heading',
        'Ending heading',
      ]);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps nested Markdown headings complete in source mode', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-source-outline-structure');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'source-outline-structure.md',
        content: [
          '---',
          'title: Metadata',
          '---',
          '# Root',
          '- example',
          '  ```markdown',
          '  # Fenced code',
          '  ```',
          '  ## List heading',
          '> ## Quote heading',
          'Reference[^outline].',
          '[^outline]: Footnote',
          '    ### Footnote heading',
          '## Ending heading',
          '#',
        ].join('\n'),
      });

      await page.keyboard.press('Control+/');
      await expect(page.locator('[data-note-source-editor="true"]')).toBeVisible();
      const outline = page.locator(OUTLINE_RAIL_SELECTOR).getByRole('navigation', { name: 'Outline' });
      await expect(outline.getByRole('button')).toHaveText([
        'Root',
        'List heading',
        'Quote heading',
        'Footnote heading',
        'Ending heading',
        'Untitled',
      ]);

      await expandOutlineRail(page);
      await outline.getByRole('button', { name: 'Footnote heading' }).click();
      expect(await page.locator('[data-note-source-editor="true"]').evaluate((textarea) => {
        const source = textarea as HTMLTextAreaElement;
        return source.value.slice(source.selectionStart, source.selectionEnd);
      })).toContain('### Footnote heading');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('lists and jumps to headings that are still virtualized', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-virtualized-outline');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const sectionCount = 260;
      const content = Array.from({ length: sectionCount }, (_, index) => [
        `## Virtual section ${index + 1}`,
        `${'Deferred body text. '.repeat(55)} ${index + 1}`,
      ]).flat().join('\n\n');
      expect(content.length).toBeGreaterThan(250_000);
      await openMarkdownFixture(page, {
        filename: 'virtualized-outline.md',
        content,
      });

      await expect.poll(() => page.locator(`${EDITOR_SELECTOR} .editor-virtual-block-placeholder`).count())
        .toBeGreaterThan(0);
      const outline = page.locator(OUTLINE_RAIL_SELECTOR).getByRole('navigation', { name: 'Outline' });
      await expect(outline.getByRole('button')).toHaveCount(sectionCount);
      await expect(outline.getByRole('button').last()).toHaveText(`Virtual section ${sectionCount}`);

      await expandOutlineRail(page);
      await outline.getByRole('button').last().click();
      await expect(page.locator(`${EDITOR_SELECTOR} h2`, { hasText: `Virtual section ${sectionCount}` }))
        .toBeVisible();
      await expect(outline.locator('.editor-outline-row-active'))
        .toHaveText(`Virtual section ${sectionCount}`);
      await expect.poll(() => page.locator(NOTE_SCROLL_ROOT_SELECTOR).evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps collapsed child headings listed and expands them on jump', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-collapsed-outline');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'collapsed-outline.md',
        content: [
          '# Parent heading',
          'Parent body.',
          '## Collapsed child',
          'Child body.',
          '# Ending heading',
        ].join('\n\n'),
      });

      const parentToggle = page.locator(`${EDITOR_SELECTOR} .heading-toggle-btn`).first();
      await parentToggle.click();
      await expect(parentToggle).toHaveAttribute('data-collapsed', 'true');
      await expect(page.locator(`${EDITOR_SELECTOR} h2`, { hasText: 'Collapsed child' })).toBeHidden();
      const outline = page.locator(OUTLINE_RAIL_SELECTOR).getByRole('navigation', { name: 'Outline' });
      await expect(outline.getByRole('button')).toHaveText([
        'Parent heading',
        'Collapsed child',
        'Ending heading',
      ]);

      await expandOutlineRail(page);
      await outline.getByRole('button', { name: 'Collapsed child' }).click();
      await expect(page.locator(`${EDITOR_SELECTOR} h2`, { hasText: 'Collapsed child' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .heading-toggle-btn`).first())
        .toHaveAttribute('data-collapsed', 'false');
      await expect(outline.locator('.editor-outline-row-active')).toHaveText('Collapsed child');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('aligns a deferred block selection preview with a transformed editor host', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-preview-alignment');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'block-selection-preview-alignment.md',
        content: Array.from(
          { length: 280 },
          (_, index) => `Large document paragraph ${index + 1}.`,
        ).join('\n\n'),
      });
      await page.locator('.milkdown').evaluate((host) => {
        host.style.transform = 'translateX(0px)';
      });

      const dragTarget = await getBlankAreaDragTarget(page, 'Large document paragraph 1.');
      expect(dragTarget, 'blank-area drag target').not.toBeNull();
      if (!dragTarget) return;

      await page.mouse.move(dragTarget.startX, dragTarget.startY);
      await page.mouse.down();
      await page.mouse.move(dragTarget.endX, dragTarget.endY, { steps: 8 });

      const selectionPreviewPath = page.locator(
        '[data-editor-block-selection-preview="true"] path',
      );
      await expect(selectionPreviewPath).toHaveAttribute('d', /M/);
      const stacking = await selectionPreviewPath.evaluate((path) => {
        const layer = path.closest<SVGSVGElement>('[data-editor-block-selection-preview="true"]');
        const editor = layer?.parentElement?.querySelector<HTMLElement>('.ProseMirror');
        return {
          sameHost: Boolean(layer && editor && layer.parentElement === editor.parentElement),
          layerZIndex: Number.parseInt(layer ? getComputedStyle(layer).zIndex : '', 10),
          editorZIndex: Number.parseInt(editor ? getComputedStyle(editor).zIndex : '', 10),
        };
      });
      expect(stacking.sameHost).toBe(true);
      expect(stacking.editorZIndex).toBeGreaterThan(stacking.layerZIndex);
      const dragBox = page.locator('[data-editor-drag-box="true"]');
      expect(await dragBox.evaluate((element) => (
        getComputedStyle(element).backgroundColor
      ))).not.toBe('rgba(0, 0, 0, 0)');
      const [editorBox, selectionPreviewBox, dragBoxBounds] = await Promise.all([
        page.locator('.milkdown .ProseMirror').boundingBox(),
        selectionPreviewPath.boundingBox(),
        dragBox.boundingBox(),
      ]);
      expect(editorBox).not.toBeNull();
      expect(selectionPreviewBox).not.toBeNull();
      expect(dragBoxBounds?.width).toBeGreaterThan(0);
      expect(dragBoxBounds?.height).toBeGreaterThan(0);
      expect(Math.abs(
        (selectionPreviewBox!.x + selectionPreviewBox!.width / 2)
        - (editorBox!.x + editorBox!.width / 2),
      )).toBeLessThanOrEqual(2);

      await page.mouse.up();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('renders medium block-rich notes without deferred placeholders while scrolling', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-medium-block-rendering');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const finalSentinel = 'Medium section 520 final sentinel';
      const content = [
        '# Medium block-rich note',
        '',
        ...Array.from(
          { length: 520 },
          (_, index) => `## Medium section ${index + 1} with **mixed syntax**${index === 519 ? ` ${finalSentinel}` : ''}`,
        ),
      ].join('\n\n');
      expect(content.length).toBeGreaterThan(12_000);
      expect(content.length).toBeLessThan(60_000);

      await openMarkdownFixture(page, {
        filename: 'medium-block-rich-note.md',
        content,
      });

      const metrics = await collectEditorDomMetrics(page);
      expect(metrics.virtualizedPlaceholderCount).toBe(0);
      expect(metrics.countsBySelector.headings).toBe(521);

      const bottomState = await page.locator(NOTE_SCROLL_ROOT_SELECTOR).evaluate(
        (scrollRoot, expectedText) => {
          scrollRoot.scrollTop = scrollRoot.scrollHeight;
          const target = Array.from(scrollRoot.querySelectorAll<HTMLElement>('h2'))
            .find((heading) => heading.textContent?.includes(expectedText));
          const scrollRect = scrollRoot.getBoundingClientRect();
          const targetRect = target?.getBoundingClientRect();
          return {
            hasTarget: Boolean(target),
            targetVisible: Boolean(
              targetRect
              && targetRect.bottom > scrollRect.top
              && targetRect.top < scrollRect.bottom
            ),
            virtualizedPlaceholderCount: scrollRoot.querySelectorAll(
              '.editor-virtual-block-placeholder',
            ).length,
          };
        },
        finalSentinel,
      );
      expect(bottomState).toEqual({
        hasTarget: true,
        targetVisible: true,
        virtualizedPlaceholderCount: 0,
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('tracks edge auto-scroll while a large block selection is still active', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-editor-outline-block-selection');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const sections = Array.from({ length: 8 }, (_, sectionIndex) => [
        `## Selection section ${sectionIndex + 1}`,
        '',
        ...Array.from(
          { length: 36 },
          (_, paragraphIndex) => [
            `Selection section ${sectionIndex + 1} paragraph ${paragraphIndex + 1}. ${'Context '.repeat(12)}`,
            '',
          ],
        ).flat(),
      ]).flat();
      await openMarkdownFixture(page, {
        filename: 'editor-outline-block-selection.md',
        content: sections.join('\n'),
      });

      const rail = page.locator(OUTLINE_RAIL_SELECTOR);
      const activeRow = rail.locator('.editor-outline-row-active');
      await expect(rail).toBeVisible();

      const dragTarget = await getBlankAreaDragTarget(
        page,
        'Selection section 1 paragraph 1',
      );
      expect(dragTarget, 'blank-area drag target').not.toBeNull();
      if (!dragTarget) return;
      await expect(activeRow).toHaveText('Selection section 1');

      const edgeTarget = await page.locator(NOTE_SCROLL_ROOT_SELECTOR).evaluate((scrollRoot) => {
        const editor = scrollRoot.querySelector<HTMLElement>('.milkdown .ProseMirror');
        if (!editor) return null;
        const editorRect = editor.getBoundingClientRect();
        const scrollRootRect = scrollRoot.getBoundingClientRect();
        return {
          x: Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, editorRect.left + 320)),
          y: scrollRootRect.bottom - 4,
        };
      });
      expect(edgeTarget, 'edge auto-scroll target').not.toBeNull();
      if (!edgeTarget) return;

      await page.mouse.move(dragTarget.startX, dragTarget.startY);
      await page.mouse.down();
      await page.mouse.move(dragTarget.endX, dragTarget.endY, { steps: 8 });
      await page.mouse.move(edgeTarget.x, edgeTarget.y, { steps: 12 });

      await expect(page.locator('[data-editor-block-selection-preview="true"]')).toBeAttached();
      await expect(page.locator('.editor-block-selection-interaction-shield')).toBeAttached();
      await expect.poll(async () => activeRow.textContent()).not.toBe('Selection section 1');
      const activeHeadingDuringDrag = await activeRow.textContent();
      expect(activeHeadingDuringDrag).toMatch(/^Selection section [2-8]$/);
      await expect(page.locator('.editor-block-selection-interaction-shield')).toBeAttached();

      await page.mouse.up();
      await expect(activeRow).toHaveText(activeHeadingDuringDrag ?? '');
      await expect(page.locator('.editor-block-selection-interaction-shield')).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
