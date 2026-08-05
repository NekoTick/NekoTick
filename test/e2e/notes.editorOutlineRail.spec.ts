import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  NOTE_SCROLL_ROOT_SELECTOR,
  cleanupIsolatedElectron,
  getBlankAreaDragTarget,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

const OUTLINE_RAIL_SELECTOR = '[data-editor-outline-rail="true"]';

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
