import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  installReferenceTyporaTheme,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

const POPUP_SIZING_MARKDOWN = [
  '# Popup sizing',
  '',
  'Text before the formula.',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  'Text before the diagram.',
  '',
  '```mermaid',
  'flowchart TD',
  '  A[Start] --> B[End]',
  '```',
  '',
  'Final paragraph.',
].join('\n');

type PopupMetrics = {
  body: RectMetrics | null;
  card: RectMetrics | null;
  contentRoot: RectMetrics | null;
  cssWidth: string;
  editor: RectMetrics | null;
  popup: RectMetrics | null;
  write: RectMetrics | null;
};

type RectMetrics = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

function expectWorkspacePopupToMatchSearchStyle(
  viewport: { width: number; height: number },
  metrics: PopupMetrics,
  label: string,
) {
  expect(metrics.card, `${label} popup card metrics`).not.toBeNull();

  const card = metrics.card!;
  expect(card.width).toBe(1080);
  expect(card.height).toBe(760);
  expect(card.left).toBe(Math.round((viewport.width - card.width) / 2));
  expect(card.top).toBe(Math.round((viewport.height - card.height) / 2));
  expect(metrics.popup?.left).toBe(0);
  expect(metrics.popup?.right).toBe(viewport.width);
  expect(metrics.popup?.top).toBe(0);
  expect(metrics.popup?.bottom).toBe(viewport.height);
}

async function collectPopupMetrics(page: Page, popupSelector: string): Promise<PopupMetrics> {
  return page.evaluate(({ editorSelector, selector }) => {
    const toRect = (element: Element | null): RectMetrics | null => {
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return {
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      };
    };
    const readableRect = (element: Element | null): RectMetrics | null => {
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const paddingLeft = Number.parseFloat(style.paddingLeft || '0') || 0;
      const paddingRight = Number.parseFloat(style.paddingRight || '0') || 0;
      return {
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
        left: Math.round(rect.left + paddingLeft),
        right: Math.round(rect.right - paddingRight),
        top: Math.round(rect.top),
        width: Math.round(Math.max(0, rect.width - paddingLeft - paddingRight)),
      };
    };

    const card = document.querySelector(`${selector} .text-editor-card`);
    const editor = document.querySelector(editorSelector);
    const write = document.querySelector('#write');
    const contentRoot = document.querySelector('[data-note-content-root="true"]');
    const cardStyle = card instanceof HTMLElement ? getComputedStyle(card) : null;

    return {
      body: readableRect(editor),
      card: toRect(card),
      contentRoot: toRect(contentRoot),
      cssWidth: cardStyle?.width ?? '',
      editor: toRect(editor),
      popup: toRect(document.querySelector(selector)),
      write: toRect(write),
    };
  }, { editorSelector: EDITOR_SELECTOR, selector: popupSelector });
}

async function openAndMeasurePopup(page: Page, blockSelector: string, popupSelector: string): Promise<PopupMetrics> {
  const block = page.locator(blockSelector).first();
  await block.scrollIntoViewIfNeeded();
  await page.evaluate((selector) => {
    const target = document.querySelector(selector);
    if (!(target instanceof HTMLElement)) {
      throw new Error(`Could not find popup target: ${selector}`);
    }
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + Math.min(Math.max(rect.width / 2, 1), 40);
    const clientY = rect.top + Math.min(Math.max(rect.height / 2, 1), 24);
    const eventInit: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX,
      clientY,
      view: window,
    };
    target.dispatchEvent(new MouseEvent('mousedown', eventInit));
    target.dispatchEvent(new MouseEvent('mouseup', { ...eventInit, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('click', { ...eventInit, buttons: 0 }));
  }, blockSelector);
  await expect(page.locator(`${popupSelector} textarea.text-editor-textarea`).first()).toBeVisible({ timeout: 10_000 });
  return collectPopupMetrics(page, popupSelector);
}

async function expectPreviewSubmenuReachable(page: Page, groupIndex: number, itemCount: number) {
  const group = page.locator('.editor-preview-context-menu-group').nth(groupIndex);
  await group.locator(':scope > .editor-preview-context-menu-parent').hover();
  const submenu = group.locator(':scope > .editor-preview-context-submenu');
  await expect(submenu).toBeVisible();
  await expect(submenu.locator(':scope > .slash-menu-item')).toHaveCount(itemCount);

  const isReachable = await submenu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit instanceof Element && element.contains(hit);
  });
  expect(isReachable).toBe(true);
}

test.describe('notes math and Mermaid popup sizing', () => {
  test('uses the search-style workspace for formula and Mermaid editors', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-text-editor-popup-sizing');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const installedTheme = await installReferenceTyporaTheme(page, 'phycat-sky.css');
      console.info('[notes-popup-sizing-theme]', installedTheme);

      await openMarkdownFixture(page, {
        filename: 'popup-sizing.md',
        content: POPUP_SIZING_MARKDOWN,
      });

      const mathMetrics = await openAndMeasurePopup(
        page,
        `${EDITOR_SELECTOR} div[data-type="math-block"]`,
        '.math-editor-popup',
      );
      console.info('[notes-popup-sizing-math]', mathMetrics);
      expectWorkspacePopupToMatchSearchStyle({ width: 1280, height: 860 }, mathMetrics, 'math');
      const mathBackdropFilter = await page.locator('.math-formula-editor-popup').evaluate(
        (popup) => getComputedStyle(popup).backdropFilter,
      );
      expect(mathBackdropFilter).toBe('none');

      const categoryContentIsClipped = await page.locator('.math-formula-picker-category').evaluateAll(
        (categories) => categories.some((category) => {
          const formula = category.querySelector<HTMLElement>('.math-formula-picker-category-formula');
          const name = category.querySelector<HTMLElement>('.math-formula-picker-category-name');
          return category.scrollWidth > category.clientWidth
            || category.scrollHeight > category.clientHeight
            || Boolean(formula && formula.scrollHeight > formula.clientHeight)
            || Boolean(name && (name.scrollWidth > name.clientWidth || name.scrollHeight > name.clientHeight));
        }),
      );
      expect(categoryContentIsClipped).toBe(false);

      const categoryLayoutShifted = await page.locator('.math-formula-picker-category').first().evaluate(
        async (category) => {
          category.dispatchEvent(new MouseEvent('mouseenter'));
          const results = document.querySelector('.math-formula-picker-results');
          if (!(results instanceof HTMLElement)) return true;
          const readItemRects = () => Array.from(
            results.querySelectorAll('.math-formula-picker-item'),
            (item) => {
              const rect = item.getBoundingClientRect();
              return [rect.x, rect.y, rect.width, rect.height];
            },
          );
          const initialRects = readItemRects();
          for (let frame = 0; frame < 6; frame += 1) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            const currentRects = readItemRects();
            if (currentRects.length !== initialRects.length) return true;
            if (currentRects.some((rect, index) => rect.some(
              (value, part) => Math.abs(value - initialRects[index][part]) > 0.5,
            ))) return true;
          }
          return false;
        },
      );
      expect(categoryLayoutShifted).toBe(false);

      await page.keyboard.press('Escape');
      await expect(page.locator('.math-editor-popup')).toHaveCount(0);

      const mermaidMetrics = await openAndMeasurePopup(
        page,
        `${EDITOR_SELECTOR} div[data-type="mermaid"]`,
        '.mermaid-editor-popup',
      );
      console.info('[notes-popup-sizing-mermaid]', mermaidMetrics);
      expectWorkspacePopupToMatchSearchStyle({ width: 1280, height: 860 }, mermaidMetrics, 'mermaid');
      await expect(page.locator('.mermaid-editor-workspace-template')).toHaveCount(28);
      await expect(page.locator('.mermaid-editor-workspace-shortcuts-label')).toHaveCount(0);
      const templateListLayout = await page.locator('.mermaid-editor-workspace-template-list').evaluate(
        (list) => ({
          clientWidth: list.clientWidth,
          rows: getComputedStyle(list).gridTemplateRows.split(' ').filter(Boolean),
          scrollWidth: list.scrollWidth,
        }),
      );
      expect(templateListLayout.rows).toHaveLength(3);
      expect(templateListLayout.scrollWidth).toBeLessThanOrEqual(templateListLayout.clientWidth);
      await expect(page.locator('.mermaid-editor-workspace-pane').first()).toContainText('Input');
      await expect(page.locator('.mermaid-editor-workspace-preview .mermaid-block svg'))
        .toBeVisible({ timeout: 10_000 });
      await page.keyboard.press('Escape');
      await expect(page.locator('.mermaid-editor-popup')).toHaveCount(0);

      const mathBlock = page.locator(`${EDITOR_SELECTOR} div[data-type="math-block"]`).first();
      await mathBlock.click({ button: 'right' });
      const contextMenu = page.locator('.editor-preview-context-menu');
      await expect(contextMenu).toBeVisible();
      await expect(contextMenu.locator(':scope > .editor-preview-context-menu-group')).toHaveCount(2);
      expect(await contextMenu.evaluate((menu) => getComputedStyle(menu).contain)).toBe('none');
      await expectPreviewSubmenuReachable(page, 0, 3);
      await expectPreviewSubmenuReachable(page, 1, 2);
      await page.keyboard.press('Escape');
      await expect(contextMenu).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
