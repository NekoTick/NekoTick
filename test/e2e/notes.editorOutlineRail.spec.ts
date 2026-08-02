import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  NOTE_SCROLL_ROOT_SELECTOR,
  cleanupIsolatedElectron,
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
        return {
          markerColors: rows.map((row) => getComputedStyle(row, '::before').backgroundColor),
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
      expect(geometry!.panelWidth).toBe(24);
      expect(geometry!.railHeight).toBe(geometry!.panelHeight);
      expect(geometry!.railHeight).toBeLessThan(100);
      expect(geometry!.markerWidths).toEqual([16, 14, 12, 10]);
      expect(new Set(geometry!.rowHeights)).toEqual(new Set([14]));
      expect(new Set(geometry!.rowTextOpacities)).toEqual(new Set(['0']));
      expect(geometry!.markerColors[0]).not.toBe(geometry!.markerColors[1]);

      await page.mouse.move(geometry!.panelRight - 2, geometry!.panelBottom + 32);
      await expect(rail).toHaveAttribute('data-expanded', 'false');

      await rail.hover();
      await expect(rail).toHaveAttribute('data-expanded', 'true');
      await expect(rail.locator('[data-editor-outline-panel="true"]')).toHaveCSS('width', '240px');

      const expandedGeometry = await getGeometry();
      expect(expandedGeometry).not.toBeNull();
      expect(expandedGeometry!.panelWidth).toBe(240);
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
      await expect.poll(async () => outlineViewport.evaluate((element) => (
        element.scrollHeight > element.clientHeight
      ))).toBe(true);
      await expect(rail.locator('[data-overlay-scrollbar-rail="true"]')).toHaveCSS('opacity', '1');
      await page.evaluate(() => {
        document.documentElement.style.removeProperty(
          '--vlaina-editor-outline-rail-max-height',
        );
      });

      await outline.getByRole('button', { name: 'Deep Dive' }).click();

      await expect.poll(async () => page.locator(NOTE_SCROLL_ROOT_SELECTOR).evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      await expect(outline.locator('.editor-outline-row-active')).toHaveText('Deep Dive');
      await expect(outline.locator('.editor-outline-row-active')).toHaveAttribute('data-level', '3');

      await scrollRoot.evaluate((element) => {
        element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
      });
      await expect.poll(async () => scrollRoot.evaluate((element) => (
        Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop)
      ))).toBeLessThanOrEqual(2);
      await expect(outline.locator('.editor-outline-row-active')).toHaveText('Conclusion');

      await page.setViewportSize({ width: 700, height: 860 });
      await expect(rail).toBeVisible();
      await rail.hover();
      await expect(rail.locator('[data-editor-outline-panel="true"]')).toHaveCSS('width', '240px');
      const narrowGeometry = await getGeometry();
      expect(narrowGeometry).not.toBeNull();
      expect(narrowGeometry!.panelRight).toBeLessThanOrEqual(narrowGeometry!.viewportWidth);
      expect(narrowGeometry!.panelWidth).toBe(240);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
