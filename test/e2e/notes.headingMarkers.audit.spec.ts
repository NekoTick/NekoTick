import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

const COPY_SHORTCUT = process.platform === 'darwin' ? 'Meta+C' : 'Control+C';
const CUT_SHORTCUT = process.platform === 'darwin' ? 'Meta+X' : 'Control+X';
const PASTE_SHORTCUT = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
const REDO_SHORTCUT = process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Shift+Z';
const SELECT_ALL_SHORTCUT = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
const UNDO_SHORTCUT = process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z';

async function readSystemClipboard(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ clipboard }) => clipboard.readText());
}

async function getTextBoundary(
  page: Page,
  text: string,
  edge: 'start' | 'end',
): Promise<{ x: number; y: number }> {
  return page.evaluate(({ boundaryEdge, editorSelector, targetText }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) throw new Error('Missing editor');
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let textNode: Text | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text && node.data === targetText) {
        textNode = node;
        break;
      }
    }
    if (!textNode) throw new Error(`Missing text node: ${targetText}`);
    const offset = boundaryEdge === 'start' ? 0 : textNode.data.length - 1;
    const range = document.createRange();
    range.setStart(textNode, offset);
    range.setEnd(textNode, offset + 1);
    const rect = range.getBoundingClientRect();
    range.detach();
    return {
      x: boundaryEdge === 'start' ? rect.left + 0.5 : rect.right - 0.5,
      y: rect.top + rect.height / 2,
    };
  }, {
    boundaryEdge: edge,
    editorSelector: EDITOR_SELECTOR,
    targetText: text,
  });
}

async function getHeadingPointerPoints(page: Page, text: string): Promise<{
  after: Array<{ x: number; y: number }>;
  before: Array<{ x: number; y: number }>;
  marker: { x: number; y: number };
}> {
  return page.evaluate(({ editorSelector, targetText }) => {
    const headings = document.querySelectorAll<HTMLElement>(
      `${editorSelector} h1, ${editorSelector} h2, ${editorSelector} h3, `
      + `${editorSelector} h4, ${editorSelector} h5, ${editorSelector} h6`,
    );
    const heading = Array.from(headings).find((candidate) => (
      candidate.textContent?.endsWith(targetText)
    ));
    const marker = heading?.querySelector<HTMLElement>('.heading-markdown-marker');
    if (!heading || !marker) throw new Error(`Missing heading marker: ${targetText}`);

    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest('.heading-markdown-marker')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text && node.data.length > 0) textNodes.push(node);
    }
    if (textNodes.map((node) => node.data).join('') !== targetText) {
      throw new Error(`Unexpected heading text nodes: ${targetText}`);
    }

    const characterRects: DOMRect[] = [];
    for (const node of textNodes) {
      for (let offset = 0; offset < node.data.length; offset += 1) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        characterRects.push(range.getBoundingClientRect());
        range.detach();
      }
    }
    const markerRect = marker.getBoundingClientRect();
    return {
      after: characterRects.map((rect) => ({
        x: rect.right - 0.5,
        y: rect.top + rect.height / 2,
      })),
      before: characterRects.map((rect) => ({
        x: rect.left + 0.5,
        y: rect.top + rect.height / 2,
      })),
      marker: {
        x: markerRect.left + markerRect.width / 2,
        y: markerRect.top + markerRect.height / 2,
      },
    };
  }, { editorSelector: EDITOR_SELECTOR, targetText: text });
}

async function getHeadingTextPointerPoints(page: Page, text: string): Promise<{
  after: Array<{ x: number; y: number }>;
  before: Array<{ x: number; y: number }>;
}> {
  return page.evaluate(({ editorSelector, targetText }) => {
    const heading = Array.from(document.querySelectorAll<HTMLElement>(
      `${editorSelector} h1, ${editorSelector} h2, ${editorSelector} h3, `
      + `${editorSelector} h4, ${editorSelector} h5, ${editorSelector} h6`,
    )).find((candidate) => candidate.textContent?.endsWith(targetText));
    if (!heading) throw new Error(`Missing heading: ${targetText}`);
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest('.heading-markdown-marker')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text && node.data.length > 0) textNodes.push(node);
    }
    if (textNodes.map((node) => node.data).join('') !== targetText) {
      throw new Error(`Unexpected heading text nodes: ${targetText}`);
    }

    const characterRects: DOMRect[] = [];
    for (const textNode of textNodes) {
      for (let offset = 0; offset < textNode.data.length; offset += 1) {
        const range = document.createRange();
        range.setStart(textNode, offset);
        range.setEnd(textNode, offset + 1);
        characterRects.push(range.getBoundingClientRect());
        range.detach();
      }
    }
    return {
      after: characterRects.map((rect) => ({
        x: rect.right - 0.5,
        y: rect.top + rect.height / 2,
      })),
      before: characterRects.map((rect) => ({
        x: rect.left + 0.5,
        y: rect.top + rect.height / 2,
      })),
    };
  }, { editorSelector: EDITOR_SELECTOR, targetText: text });
}

async function readHeadingPointerState(page: Page) {
  return page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
    hostRetained: editor.closest('.milkdown')?.classList.contains(
      'heading-markdown-marker-pointer-retained',
    ) ?? false,
    pointerNative: editor.classList.contains('editor-pointer-native-selection'),
    pointerSelectedMarkers: editor.querySelectorAll(
      '.heading-markdown-marker-pointer-selected',
    ).length,
    pointerSelecting: editor.getAttribute('data-editor-pointer-selecting'),
    retainedMarkers: editor.querySelectorAll('.heading-markdown-marker-retained').length,
    selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
  }));
}

test.describe('notes heading Markdown marker interaction audit', () => {
  test.setTimeout(90_000);

  test('keeps heading markers coherent when a text drag transitions to block selection', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-cross-drag');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-cross-drag.md',
        content: ['# First heading', '', 'Body between', '', '## Second heading'].join('\n'),
      });

      await page.locator(`${EDITOR_SELECTOR} h1`).click();
      const firstMarker = page.locator(`${EDITOR_SELECTOR} h1 .heading-markdown-marker`);
      const secondMarker = page.locator(`${EDITOR_SELECTOR} h2 .heading-markdown-marker`);
      await expect(firstMarker).toBeVisible();

      const start = await getTextBoundary(page, 'First heading', 'start');
      const end = await getTextBoundary(page, 'Second heading', 'end');
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 20 });

      await expect(firstMarker).toBeVisible();
      await expect(secondMarker).toBeAttached();
      const dragState = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        pointerSelecting: editor.getAttribute('data-editor-pointer-selecting'),
        markers: Array.from(editor.querySelectorAll<HTMLElement>('.heading-markdown-marker')).map(
          (marker) => ({
            className: marker.className,
            display: getComputedStyle(marker).display,
            heading: marker.parentElement?.tagName ?? null,
          }),
        ),
      }));
      expect(dragState, JSON.stringify(dragState)).toMatchObject({
        pointerSelecting: null,
        markers: [
          { display: 'inline', heading: 'H1' },
          { display: 'inline', heading: 'H2' },
        ],
      });
      expect(dragState.markers.every((marker) => (
        marker.className.includes('heading-markdown-marker-block-selected')
      ))).toBe(true);

      await page.mouse.up();
      await expect(firstMarker).toBeVisible();
      await expect(secondMarker).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} >> xpath=..`))
        .not.toHaveClass(/heading-markdown-marker-pointer-retained/);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps keyboard selection and clipboard behavior stable for a full heading', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-keyboard-copy');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-keyboard-copy.md',
        content: ['### Keyboard heading', '', 'Body'].join('\n'),
      });

      const heading = page.locator(`${EDITOR_SELECTOR} h3`);
      await heading.click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');

      const marker = heading.locator('.heading-markdown-marker');
      await expect(marker).toHaveClass(/editor-text-selection-overlay/);
      await app.evaluate(({ clipboard }) => clipboard.writeText('stale heading clipboard'));
      await page.keyboard.press(COPY_SHORTCUT);
      await expect.poll(() => readSystemClipboard(app)).toBe('Keyboard heading');

      await expect(heading).toContainText('Keyboard heading');
      await expect(marker).toBeVisible();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('turns a heading into plain text when deleting a pointer-selected marker', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-delete');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-delete.md',
        content: ['# 12345', '', '# abcde'].join('\n'),
      });

      for (const { headingText, key, remainingText } of [
        { headingText: '12345', key: 'Backspace', remainingText: '2345' },
        { headingText: 'abcde', key: 'Delete', remainingText: 'bcde' },
      ]) {
        const heading = page.locator(`${EDITOR_SELECTOR} h1`, { hasText: headingText });
        await heading.click();
        const points = await getHeadingPointerPoints(page, headingText);
        await page.mouse.move(points.before[1]!.x, points.before[1]!.y);
        await page.mouse.down();
        await page.mouse.move(points.marker.x, points.marker.y, { steps: 6 });
        await page.mouse.up();

        await expect(heading.locator('.heading-markdown-marker-pointer-selected')).toBeVisible();
        const beforeDelete = await readHeadingPointerState(page);
        expect(beforeDelete.selection.selectedText, JSON.stringify(beforeDelete))
          .toBe(headingText[0]);
        await page.keyboard.press(key);
        const afterDelete = await readHeadingPointerState(page);
        const deleteDetail = JSON.stringify({ afterDelete, beforeDelete });

        await expect(
          page.locator(`${EDITOR_SELECTOR} h1`, { hasText: remainingText }),
          deleteDetail,
        )
          .toHaveCount(0, { timeout: 10_000 });
        await expect(
          page.locator(`${EDITOR_SELECTOR} p`, { hasText: remainingText }),
          deleteDetail,
        )
          .toHaveText(remainingText, { timeout: 10_000 });
        expect(afterDelete.selection.empty, deleteDetail).toBe(true);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('deletes only the marker space before the first heading character', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-space-delete');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-space-delete.md',
        content: ['# 12345', '', 'Body'].join('\n'),
      });

      const heading = page.locator(`${EDITOR_SELECTOR} h1`, { hasText: '12345' });
      await heading.click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Backspace');

      await expect(page.locator(`${EDITOR_SELECTOR} h1`)).toHaveCount(0);
      await expect(page.locator(`${EDITOR_SELECTOR} p`).first()).toHaveText('#12345');
      const selection = await readHeadingPointerState(page);
      expect(selection.selection.empty).toBe(true);
      expect(selection.selection.from).toBe(2);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('treats a pointer-selected heading marker as source text for copy, cut, and replacement', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-edit-actions');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-edit-actions.md',
        content: [
          '# 12345',
          '',
          '## abcde',
          '',
          '### vwxyz',
          '',
          '#### klmno',
          '',
          '##### pqrst',
        ].join('\n'),
      });

      const selectMarkerAndFirstCharacter = async (headingText: string) => {
        const heading = page.locator(
          `${EDITOR_SELECTOR} h1, ${EDITOR_SELECTOR} h2, ${EDITOR_SELECTOR} h3, `
            + `${EDITOR_SELECTOR} h4, ${EDITOR_SELECTOR} h5`,
          { hasText: headingText },
        );
        await heading.click();
        const points = await getHeadingPointerPoints(page, headingText);
        await page.mouse.move(points.before[1]!.x, points.before[1]!.y);
        await page.mouse.down();
        await page.mouse.move(points.marker.x, points.marker.y, { steps: 6 });
        await page.mouse.up();
        await expect(heading.locator('.heading-markdown-marker-pointer-selected')).toBeVisible();
      };

      await selectMarkerAndFirstCharacter('12345');
      await app.evaluate(({ clipboard }) => clipboard.writeText('stale copy'));
      await page.keyboard.press(COPY_SHORTCUT);
      await expect.poll(() => readSystemClipboard(app)).toBe('# 1');
      await expect(page.locator(`${EDITOR_SELECTOR} h1`)).toContainText('12345');

      await selectMarkerAndFirstCharacter('abcde');
      await app.evaluate(({ clipboard }) => clipboard.writeText('stale cut'));
      await page.keyboard.press(CUT_SHORTCUT);
      await expect.poll(() => readSystemClipboard(app)).toBe('## a');
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'bcde' })).toHaveText('bcde');
      await page.keyboard.press(UNDO_SHORTCUT);
      const restoredHeading = page.locator(`${EDITOR_SELECTOR} h2`, { hasText: 'abcde' });
      await expect(restoredHeading).toContainText('abcde');
      await expect(restoredHeading.locator('.heading-markdown-marker')).toHaveText('## ');
      await page.keyboard.press(REDO_SHORTCUT);
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'bcde' })).toHaveText('bcde');

      await selectMarkerAndFirstCharacter('vwxyz');
      await page.keyboard.insertText('Q');
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Qwxyz' })).toHaveText('Qwxyz');

      await selectMarkerAndFirstCharacter('pqrst');
      await app.evaluate(({ clipboard }) => clipboard.writeText('P'));
      await page.keyboard.press(PASTE_SHORTCUT);
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Pqrst' })).toHaveText('Pqrst');

      await selectMarkerAndFirstCharacter('klmno');
      const composedText = '中文';
      await page.locator(EDITOR_SELECTOR).evaluate((editor, text) => {
        editor.dispatchEvent(new CompositionEvent('compositionstart', {
          bubbles: true,
          data: '',
        }));
        editor.dispatchEvent(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          data: text,
          inputType: 'insertCompositionText',
        }));
      }, composedText);
      await page.keyboard.insertText(composedText);
      await page.locator(EDITOR_SELECTOR).evaluate((editor, text) => {
        editor.dispatchEvent(new CompositionEvent('compositionend', {
          bubbles: true,
          data: text,
        }));
      }, composedText);
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: `${composedText}lmno` }))
        .toHaveText(`${composedText}lmno`);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('selects populated and empty heading markers once during editor select all', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-select-all');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-select-all.md',
        content: ['# Populated heading', '', 'Body'].join('\n'),
      });

      const body = page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body' });
      await body.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('## ');
      await expect(page.locator(`${EDITOR_SELECTOR} h2 .heading-markdown-marker-empty`))
        .toHaveText('##');

      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      const markers = page.locator(`${EDITOR_SELECTOR} .heading-markdown-marker`);
      await expect(markers).toHaveCount(2);
      await expect(markers.nth(0)).toHaveClass(/editor-text-selection-overlay/);
      await expect(markers.nth(1)).toHaveClass(/editor-text-selection-overlay/);
      await expect(page.locator(`${EDITOR_SELECTOR} h2 .heading-markdown-marker-empty`))
        .toHaveCount(1);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('supports composed text and full replacement after creating a heading marker', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-composition');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-composition.md',
        content: 'Body',
      });

      const body = page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body' });
      await body.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('#### ');
      const heading = page.locator(`${EDITOR_SELECTOR} h4`);
      await expect(heading.locator('.heading-markdown-marker-empty')).toHaveText('####');

      const composedText = '中文标题';
      await page.locator(EDITOR_SELECTOR).evaluate((editor, text) => {
        editor.dispatchEvent(new CompositionEvent('compositionstart', {
          bubbles: true,
          data: '',
        }));
        editor.dispatchEvent(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          data: text,
          inputType: 'insertCompositionText',
        }));
      }, composedText);
      await page.keyboard.insertText(composedText);
      await page.locator(EDITOR_SELECTOR).evaluate((editor, text) => {
        editor.dispatchEvent(new CompositionEvent('compositionend', {
          bubbles: true,
          data: text,
        }));
      }, composedText);

      await expect(heading).toContainText(composedText);
      await expect(heading.locator('.heading-markdown-marker')).toHaveText('#### ', {
        useInnerText: false,
      });
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
      await expect(heading.locator('.heading-markdown-marker')).toHaveClass(
        /editor-text-selection-overlay/,
      );
      await page.keyboard.press('Backspace');
      await expect(heading.locator('.heading-markdown-marker-empty')).toHaveText('####');
      await page.keyboard.insertText('替换标题');
      await expect(heading).toContainText('替换标题');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps cut, undo, redo, and Enter stable across an empty heading', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-history');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-history.md',
        content: ['## Editable heading', '', 'Body'].join('\n'),
      });

      const heading = page.locator(`${EDITOR_SELECTOR} h2`);
      await heading.click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
      await page.keyboard.press(CUT_SHORTCUT);

      await expect.poll(() => readSystemClipboard(app)).toBe('Editable heading');
      await expect(heading.locator('.heading-markdown-marker-empty')).toHaveText('##');
      await expect(page.locator('.editor-textblock-caret-overlay')).toHaveCount(1);

      await page.keyboard.press(UNDO_SHORTCUT);
      await expect(heading).toContainText('Editable heading');
      await expect(heading.locator('.heading-markdown-marker')).toHaveText('## ', {
        useInnerText: false,
      });

      await page.keyboard.press(REDO_SHORTCUT);
      await expect(heading.locator('.heading-markdown-marker-empty')).toHaveText('##');
      await page.keyboard.insertText('Replacement heading');
      await expect(heading).toContainText('Replacement heading');

      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      const followingParagraph = heading.locator('xpath=following-sibling::p[1]');
      await expect(followingParagraph).toBeVisible();
      await page.keyboard.insertText('Following paragraph');
      await expect(followingParagraph).toContainText('Following paragraph');
      await expect(heading.locator('.heading-markdown-marker')).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps marker-boundary zigzags, marker clicks, and outside release coherent', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-zigzag');
    const headingText = '12345';

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-zigzag.md',
        content: ['# 12345', '', 'Body paragraph'].join('\n'),
      });

      let points = await getHeadingPointerPoints(page, headingText);
      await page.mouse.click(points.before[2]!.x, points.before[2]!.y);
      points = await getHeadingPointerPoints(page, headingText);
      await page.mouse.move(points.before[2]!.x, points.before[2]!.y);
      await page.mouse.down();
      await page.mouse.move(points.marker.x, points.marker.y, { steps: 8 });

      let state = await readHeadingPointerState(page);
      expect(state.selection.selectedText, JSON.stringify(state)).toBe('12');
      expect(state.pointerSelectedMarkers, JSON.stringify(state)).toBe(1);
      expect(state.pointerNative, JSON.stringify(state)).toBe(false);

      for (let index = 0; index < 4; index += 1) {
        await page.mouse.move(points.after[0]!.x, points.after[0]!.y, { steps: 4 });
        state = await readHeadingPointerState(page);
        expect(state.selection.empty, JSON.stringify({ index, state })).toBe(false);
        expect(state.pointerSelectedMarkers, JSON.stringify({ index, state })).toBe(0);

        await page.mouse.move(points.marker.x, points.marker.y, { steps: 4 });
        state = await readHeadingPointerState(page);
        expect(state.selection.selectedText, JSON.stringify({ index, state })).toBe('12');
        expect(state.pointerSelectedMarkers, JSON.stringify({ index, state })).toBe(1);
      }

      await page.mouse.move(points.after[0]!.x, points.after[0]!.y, { steps: 4 });
      await page.mouse.up();
      state = await readHeadingPointerState(page);
      expect(state.selection.empty, JSON.stringify(state)).toBe(false);
      expect(state).toMatchObject({
        hostRetained: false,
        pointerSelectedMarkers: 0,
        pointerSelecting: null,
        retainedMarkers: 0,
      });

      points = await getHeadingPointerPoints(page, headingText);
      await page.mouse.click(points.marker.x, points.marker.y);
      state = await readHeadingPointerState(page);
      expect(state.selection.empty, JSON.stringify(state)).toBe(true);
      expect(state).toMatchObject({
        hostRetained: false,
        pointerSelectedMarkers: 0,
        pointerSelecting: null,
        retainedMarkers: 0,
      });

      points = await getHeadingPointerPoints(page, headingText);
      await page.mouse.move(points.before[2]!.x, points.before[2]!.y);
      await page.mouse.down();
      await page.mouse.move(points.after[0]!.x, points.after[0]!.y, { steps: 8 });
      await page.mouse.move(4, 4);
      await page.mouse.up();
      state = await readHeadingPointerState(page);
      expect(state).toMatchObject({
        hostRetained: false,
        pointerSelectedMarkers: 0,
        pointerSelecting: null,
        retainedMarkers: 0,
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('tracks a fast reverse drag from the heading end without lagging behind', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-fast-reverse');
    const headingText = '1234567';

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-fast-reverse.md',
        content: [`# ${headingText}`, '', 'Body paragraph'].join('\n'),
      });

      await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' }).click();
      await expect(page.locator(`${EDITOR_SELECTOR} .heading-markdown-marker`)).toHaveCount(0);
      const points = await getHeadingTextPointerPoints(page, headingText);
      await page.mouse.move(points.after[6]!.x, points.after[6]!.y);
      await page.mouse.down();
      for (let index = headingText.length - 2; index >= 0; index -= 1) {
        const point = points.before[index]!;
        await page.mouse.move(
          index === 0 ? point.x - 2 : point.x,
          point.y,
        );
        const state = await readHeadingPointerState(page);
        expect(state.selection.selectedText, JSON.stringify({ index, state }))
          .toBe(headingText.slice(index));
        expect(state.pointerNative, JSON.stringify({ index, state })).toBe(false);
      }

      for (let index = 0; index < headingText.length - 1; index += 1) {
        await page.mouse.move(points.after[index]!.x, points.after[index]!.y);
        const state = await readHeadingPointerState(page);
        expect(state.selection.selectedText, JSON.stringify({ index, state }))
          .toBe(headingText.slice(index + 1));
        expect(state.pointerNative, JSON.stringify({ index, state })).toBe(false);
      }

      for (let index = headingText.length - 2; index >= 0; index -= 1) {
        const point = points.before[index]!;
        await page.mouse.move(
          index === 0 ? point.x - 2 : point.x,
          point.y,
        );
        const state = await readHeadingPointerState(page);
        expect(state.selection.selectedText, JSON.stringify({ index, state }))
          .toBe(headingText.slice(index));
        expect(state.pointerNative, JSON.stringify({ index, state })).toBe(false);
      }

      await page.mouse.up();
      const afterMouseUp = await readHeadingPointerState(page);
      expect(afterMouseUp.selection.selectedText, JSON.stringify(afterMouseUp)).toBe(headingText);
      expect(afterMouseUp.pointerSelectedMarkers, JSON.stringify(afterMouseUp)).toBe(0);
      await expect(page.locator(`${EDITOR_SELECTOR} h1 .heading-markdown-marker`))
        .toHaveClass(/editor-text-selection-overlay/);

      await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' }).click();
      await expect(page.locator(`${EDITOR_SELECTOR} .heading-markdown-marker`)).toHaveCount(0);
      await page.mouse.move(points.before[0]!.x, points.before[0]!.y);
      await page.mouse.down();
      for (let index = 0; index < headingText.length; index += 1) {
        await page.mouse.move(points.after[index]!.x, points.after[index]!.y);
        const state = await readHeadingPointerState(page);
        expect(state.selection.selectedText, JSON.stringify({ index, state }))
          .toBe(headingText.slice(0, index + 1));
        expect(state.pointerNative, JSON.stringify({ index, state })).toBe(false);
      }
      await page.mouse.up();

      await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' }).click();
      await page.locator(`${EDITOR_SELECTOR} h1`, { hasText: headingText }).click();
      const diagonalPoints = await getHeadingPointerPoints(page, headingText);
      await page.mouse.move(diagonalPoints.after[6]!.x, diagonalPoints.after[6]!.y);
      await page.mouse.down();
      await page.mouse.move(
        diagonalPoints.marker.x - 40,
        diagonalPoints.marker.y - 30,
      );
      const afterSparseDiagonalMove = await readHeadingPointerState(page);
      expect(afterSparseDiagonalMove.selection.selectedText, JSON.stringify({
        afterSparseDiagonalMove,
        diagonalPoints,
      })).toBe(headingText);
      await page.mouse.up();
      const afterSparseDiagonalRelease = await readHeadingPointerState(page);
      const sparseDiagonalDiagnostic = await page.evaluate(() => (
        window.__vlainaDiagnosticsLog
          ?.filter((entry) => (
            entry.channel === 'notes-heading-selection'
            && entry.event === 'pointer-session'
          ))
          .at(-1)
      ));
      expect(afterSparseDiagonalRelease.pointerSelectedMarkers, JSON.stringify({
        afterSparseDiagonalMove,
        afterSparseDiagonalRelease,
        sparseDiagonalDiagnostic,
      })).toBe(1);

      for (let index = headingText.length - 2; index >= 0; index -= 1) {
        await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' }).click();
        await page.evaluate(() => new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }));
        const resetState = await readHeadingPointerState(page);
        expect(
          await page.locator(`${EDITOR_SELECTOR} .heading-markdown-marker`).count(),
          JSON.stringify({ index, resetState }),
        ).toBe(0);
        const releasePoints = await getHeadingTextPointerPoints(page, headingText);
        await page.mouse.move(releasePoints.after[6]!.x, releasePoints.after[6]!.y);
        await page.mouse.down();
        const point = releasePoints.before[index]!;
        await page.mouse.move(index === 0 ? point.x - 2 : point.x, point.y);
        const beforeMouseUp = await readHeadingPointerState(page);
        expect(beforeMouseUp.selection.selectedText, JSON.stringify({ index, beforeMouseUp }))
          .toBe(headingText.slice(index));

        await page.mouse.up();
        const afterMouseUpAtCharacter = await readHeadingPointerState(page);
        expect(afterMouseUpAtCharacter.selection, JSON.stringify({
          afterMouseUpAtCharacter,
          beforeMouseUp,
          index,
        })).toEqual(beforeMouseUp.selection);
        expect(afterMouseUpAtCharacter.pointerSelecting).toBeNull();
      }

      await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' }).click();
      await page.locator(`${EDITOR_SELECTOR} h1`, { hasText: headingText }).click();
      const coalescedPoints = await getHeadingPointerPoints(page, headingText);
      await page.mouse.move(coalescedPoints.after[6]!.x, coalescedPoints.after[6]!.y);
      await page.mouse.down();
      await page.mouse.move(coalescedPoints.before[6]!.x, coalescedPoints.before[6]!.y);
      const beforeCoalescedRelease = await readHeadingPointerState(page);
      expect(beforeCoalescedRelease.selection.selectedText).toBe('7');

      await page.evaluate(({ x, y }) => {
        document.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
          cancelable: true,
          clientX: x,
          clientY: y,
        }));
      }, coalescedPoints.marker);
      await page.mouse.up();

      const afterCoalescedRelease = await readHeadingPointerState(page);
      expect(afterCoalescedRelease.selection.selectedText, JSON.stringify({
        afterCoalescedRelease,
        beforeCoalescedRelease,
      })).toBe(headingText);
      expect(afterCoalescedRelease.pointerSelectedMarkers).toBe(1);

      const pointerDiagnostic = await page.evaluate(() => (
        window.__vlainaDiagnosticsLog
          ?.filter((entry) => (
            entry.channel === 'notes-heading-selection'
            && entry.event === 'pointer-session'
          ))
          .at(-1)
      ));
      expect(pointerDiagnostic?.details).toMatchObject({
        headingLevel: 1,
        postRelease: {
          selection: {
            empty: false,
          },
        },
      });
      expect(pointerDiagnostic?.details?.totalSamples).toBeGreaterThanOrEqual(3);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('tracks every reverse drag step when the heading starts with link text', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-link-drag');
    const headingText = '1234567';

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-link-drag.md',
        content: [`# [${headingText}](https://example.test)`, '', 'Body paragraph'].join('\n'),
      });

      await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' }).click();
      await expect(page.locator(`${EDITOR_SELECTOR} .heading-markdown-marker`)).toHaveCount(0);
      const points = await getHeadingTextPointerPoints(page, headingText);
      await page.mouse.move(points.after[6]!.x, points.after[6]!.y);
      await page.mouse.down();

      for (let index = headingText.length - 2; index >= 0; index -= 1) {
        const point = points.before[index]!;
        await page.mouse.move(index === 0 ? point.x - 2 : point.x, point.y);
        const state = await readHeadingPointerState(page);
        expect(state.selection.selectedText, JSON.stringify({ index, state }))
          .toBe(headingText.slice(index));
        expect(state.pointerNative, JSON.stringify({ index, state })).toBe(false);
        expect(state.pointerSelecting, JSON.stringify({ index, state })).toBe('true');
        const marker = page.locator(`${EDITOR_SELECTOR} h1 .heading-markdown-marker`);
        await expect(marker).toHaveCount(1);
        expect(await marker.evaluate((element) => getComputedStyle(element).display)).toBe('none');
      }

      await page.mouse.up();
      const afterMouseUp = await readHeadingPointerState(page);
      expect(afterMouseUp.selection.selectedText, JSON.stringify(afterMouseUp)).toBe(headingText);
      expect(afterMouseUp.pointerSelecting, JSON.stringify(afterMouseUp)).toBeNull();
      await expect(page.locator(`${EDITOR_SELECTOR} h1 .heading-markdown-marker`))
        .toHaveClass(/editor-text-selection-overlay/);

      const activePoints = await getHeadingTextPointerPoints(page, headingText);
      const activeMarker = page.locator(`${EDITOR_SELECTOR} h1 .heading-markdown-marker`);
      await page.mouse.move(activePoints.after[6]!.x, activePoints.after[6]!.y);
      await page.mouse.down();
      await expect(activeMarker).toBeVisible();
      for (let index = headingText.length - 2; index >= 0; index -= 1) {
        const point = activePoints.before[index]!;
        await page.mouse.move(index === 0 ? point.x - 2 : point.x, point.y);
        const state = await readHeadingPointerState(page);
        expect(state.selection.selectedText, JSON.stringify({ index, state }))
          .toBe(headingText.slice(index));
        expect(state.pointerNative, JSON.stringify({ index, state })).toBe(false);
        expect(state.pointerSelecting, JSON.stringify({ index, state })).toBe('true');
        expect(await activeMarker.evaluate((element) => getComputedStyle(element).display))
          .not.toBe('none');
      }

      const beforeActiveMouseUp = await readHeadingPointerState(page);
      await page.mouse.up();
      const afterActiveMouseUp = await readHeadingPointerState(page);
      expect(afterActiveMouseUp.selection, JSON.stringify({
        afterActiveMouseUp,
        beforeActiveMouseUp,
      })).toEqual(beforeActiveMouseUp.selection);
      expect(afterActiveMouseUp.pointerSelecting).toBeNull();
      await expect(activeMarker).toBeVisible();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('tracks every drag step across mixed inline heading marks', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-inline-drag');
    const headingText = '1234567';

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-inline-drag.md',
        content: ['# 1**2***3*~~4~~`5`67', '', 'Body paragraph'].join('\n'),
      });

      await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' }).click();
      await expect(page.locator(`${EDITOR_SELECTOR} .heading-markdown-marker`)).toHaveCount(0);
      const points = await getHeadingTextPointerPoints(page, headingText);
      await page.mouse.move(points.after[6]!.x, points.after[6]!.y);
      await page.mouse.down();

      for (let index = headingText.length - 2; index >= 0; index -= 1) {
        const point = points.before[index]!;
        await page.mouse.move(index === 0 ? point.x - 2 : point.x, point.y);
        const state = await readHeadingPointerState(page);
        expect(state.selection.selectedText, JSON.stringify({ index, state }))
          .toBe(headingText.slice(index));
        expect(state.pointerNative, JSON.stringify({ index, state })).toBe(false);
      }

      for (let index = 0; index < headingText.length - 1; index += 1) {
        await page.mouse.move(points.after[index]!.x, points.after[index]!.y);
        const state = await readHeadingPointerState(page);
        expect(state.selection.selectedText, JSON.stringify({ index, state }))
          .toBe(headingText.slice(index + 1));
        expect(state.pointerNative, JSON.stringify({ index, state })).toBe(false);
      }

      const beforeMouseUp = await readHeadingPointerState(page);
      await page.mouse.up();
      const afterMouseUp = await readHeadingPointerState(page);
      expect(afterMouseUp.selection, JSON.stringify({ afterMouseUp, beforeMouseUp }))
        .toEqual(beforeMouseUp.selection);
      expect(afterMouseUp.pointerSelecting).toBeNull();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('preserves heading word and line selection for repeated clicks', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-multi-click');
    const headingText = 'Alpha beta gamma';

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-multi-click.md',
        content: [`# ${headingText}`, '', 'Body paragraph'].join('\n'),
      });

      await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' }).click();
      const points = await getHeadingTextPointerPoints(page, headingText);
      await page.mouse.dblclick(points.before[8]!.x, points.before[8]!.y, { delay: 40 });
      let state = await readHeadingPointerState(page);
      expect(state.selection.selectedText, JSON.stringify(state)).toBe('beta');
      expect(state.pointerSelecting, JSON.stringify(state)).toBeNull();

      await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' }).click();
      const tripleClickPoints = await getHeadingTextPointerPoints(page, headingText);
      await page.mouse.click(tripleClickPoints.before[8]!.x, tripleClickPoints.before[8]!.y, {
        clickCount: 3,
        delay: 40,
      });
      state = await readHeadingPointerState(page);
      expect(state.selection.selectedText, JSON.stringify(state)).toBe(headingText);
      expect(state.pointerSelecting, JSON.stringify(state)).toBeNull();
      await expect(page.locator(`${EDITOR_SELECTOR} h1 .heading-markdown-marker`))
        .toHaveClass(/editor-text-selection-overlay/);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('refreshes marker hit testing after scroll and fully cancels a blurred drag', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-scroll-blur');
    const headingText = 'Scrollable heading';

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-scroll-blur.md',
        content: [
          ...Array.from({ length: 18 }, (_, index) => `Before paragraph ${index}`),
          `# ${headingText}`,
          ...Array.from({ length: 18 }, (_, index) => `After paragraph ${index}`),
        ].join('\n\n'),
      });

      const heading = page.locator(`${EDITOR_SELECTOR} h1`, { hasText: headingText });
      await heading.scrollIntoViewIfNeeded();
      await heading.click();
      let points = await getHeadingPointerPoints(page, headingText);
      await page.mouse.click(points.before[4]!.x, points.before[4]!.y);
      points = await getHeadingPointerPoints(page, headingText);
      await page.mouse.move(points.before[4]!.x, points.before[4]!.y);
      await page.mouse.down();
      await page.mouse.move(points.after[0]!.x, points.after[0]!.y, { steps: 6 });

      await page.locator(EDITOR_SELECTOR).evaluate((editor) => {
        const scrollRoot = editor.closest<HTMLElement>('[data-note-scroll-root="true"]');
        if (!scrollRoot) throw new Error('Missing note scroll root');
        scrollRoot.scrollTop += 64;
      });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      points = await getHeadingPointerPoints(page, headingText);
      await page.mouse.move(points.marker.x, points.marker.y, { steps: 8 });

      let state = await readHeadingPointerState(page);
      expect(state.selection.empty, JSON.stringify(state)).toBe(false);
      expect(state.pointerSelectedMarkers, JSON.stringify(state)).toBe(1);
      expect(state.pointerNative, JSON.stringify(state)).toBe(false);

      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      state = await readHeadingPointerState(page);
      expect(state).toMatchObject({
        hostRetained: false,
        pointerNative: false,
        pointerSelectedMarkers: 0,
        pointerSelecting: null,
        retainedMarkers: 0,
      });
      await page.mouse.up();

      points = await getHeadingPointerPoints(page, headingText);
      await page.mouse.click(points.before[4]!.x, points.before[4]!.y);
      await page.mouse.move(points.before[4]!.x, points.before[4]!.y);
      await page.mouse.down();
      await page.mouse.move(points.after[0]!.x, points.after[0]!.y, { steps: 8 });
      await page.mouse.up();
      state = await readHeadingPointerState(page);
      expect(state.selection.empty, JSON.stringify(state)).toBe(false);
      expect(state).toMatchObject({
        hostRetained: false,
        pointerSelectedMarkers: 0,
        pointerSelecting: null,
        retainedMarkers: 0,
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps pointer-selected marker and text geometry aligned for h1 through h6', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-level-audit');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const headingTexts = Array.from({ length: 6 }, (_, index) => `Level ${index + 1} heading`);
      await openMarkdownFixture(page, {
        filename: 'heading-marker-level-audit.md',
        content: headingTexts.map((text, index) => `${'#'.repeat(index + 1)} ${text}`).join('\n\n'),
      });

      for (const [index, headingText] of headingTexts.entries()) {
        const level = index + 1;
        await page.locator(`${EDITOR_SELECTOR} h${level}`).click();
        const points = await getHeadingPointerPoints(page, headingText);
        await page.mouse.move(points.before[2]!.x, points.before[2]!.y);
        await page.mouse.down();
        await page.mouse.move(points.before[0]!.x - 2, points.before[0]!.y, { steps: 6 });
        await page.mouse.move(points.marker.x, points.marker.y, { steps: 6 });

        const geometry = await page.locator(`${EDITOR_SELECTOR} h${level}`).evaluate((element) => {
          const marker = element.querySelector<HTMLElement>(
            '.heading-markdown-marker-pointer-selected',
          );
          const overlays = Array.from(
            element.querySelectorAll<HTMLElement>('.editor-text-selection-overlay'),
            (overlay) => {
              const rect = overlay.getBoundingClientRect();
              return {
                backgroundImage: getComputedStyle(overlay).backgroundImage,
                bottom: rect.bottom,
                top: rect.top,
              };
            },
          );
          return {
            markerSelected: Boolean(marker),
            overlays,
            selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
          };
        });
        expect(geometry.selection.selectedText, JSON.stringify({ level, geometry })).toBe('Le');
        expect(geometry.markerSelected, JSON.stringify({ level, geometry })).toBe(true);
        expect(geometry.overlays.length, JSON.stringify({ level, geometry })).toBeGreaterThan(1);
        const [firstOverlay] = geometry.overlays;
        for (const overlay of geometry.overlays) {
          expect(overlay.backgroundImage, JSON.stringify({ level, geometry })).not.toBe('none');
          expect(Math.abs(overlay.top - firstOverlay!.top), JSON.stringify({ level, geometry }))
            .toBeLessThanOrEqual(0.5);
          expect(Math.abs(overlay.bottom - firstOverlay!.bottom), JSON.stringify({ level, geometry }))
            .toBeLessThanOrEqual(0.5);
        }

        await page.mouse.up();
        const state = await readHeadingPointerState(page);
        expect(state).toMatchObject({
          hostRetained: false,
          pointerNative: false,
          pointerSelecting: null,
          retainedMarkers: 0,
        });
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
