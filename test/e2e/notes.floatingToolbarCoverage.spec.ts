import { expect, test, type Locator, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import {
  CHAT_COMPOSER_TEXTAREA_SELECTOR,
  EDITOR_SELECTOR,
  NOTE_IMAGE_BLOCK_SELECTOR,
  NOTE_SCROLL_ROOT_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openAbsoluteNote,
  openMarkdownFixture,
  waitForEditorAnimationFrame,
} from './notesE2E';

const TOOLBAR_SELECTOR = '.floating-toolbar.visible';
const LIVE_EDITOR_SELECTOR = `${EDITOR_SELECTOR}:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"])`;
const PREVIEW_OVERLAY_SELECTOR = '.toolbar-applied-preview-overlay';
const VISIBLE_LINK_TOOLTIP_SELECTOR = '.link-tooltip-container:not(.hidden)';
const LARGE_PREVIEW_DOC_MIN_LENGTH = 300_000;

let pngCrcTable: number[] | null = null;

function getPngCrcTable(): number[] {
  if (pngCrcTable) {
    return pngCrcTable;
  }

  pngCrcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
  return pngCrcTable;
}

function calculatePngCrc32(bytes: Buffer): number {
  const table = getPngCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const lengthBytes = Buffer.alloc(4);
  lengthBytes.writeUInt32BE(data.length, 0);

  const crcBytes = Buffer.alloc(4);
  crcBytes.writeUInt32BE(calculatePngCrc32(Buffer.concat([typeBytes, data])), 0);

  return Buffer.concat([lengthBytes, typeBytes, data, crcBytes]);
}

function createSolidPngDataUrl(width: number, height: number): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const rowLength = 1 + width * 4;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowLength;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 4;
      raw[pixelOffset] = 136;
      raw[pixelOffset + 1] = 192;
      raw[pixelOffset + 2] = 208;
      raw[pixelOffset + 3] = 255;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    signature,
    createPngChunk('IHDR', ihdr),
    createPngChunk('IDAT', deflateSync(raw)),
    createPngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const IMAGE_ANCHORED_TOOLBAR_PREVIEW_DATA_URL = createSolidPngDataUrl(900, 560);
const CATALOG_IMAGE_PREVIEW_SPACING_SRC = 'catalog.svg#w=66.38%25';
const CATALOG_IMAGE_PREVIEW_SPACING_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="180" viewBox="0 0 420 180">',
  '<rect width="420" height="180" fill="#88c0d0"/>',
  '<rect x="36" y="42" width="348" height="96" rx="10" fill="#ffffff"/>',
  '<rect x="70" y="72" width="196" height="16" fill="#3b4252"/>',
  '<rect x="70" y="100" width="280" height="12" fill="#5e81ac"/>',
  '</svg>',
].join('');

type ToolbarMarkCase = {
  action: string;
  markName: string;
  selector: string;
  target: string;
};

type BlockCase = {
  blockType: string;
  selector: string;
  target: string;
};

type ScreenshotClip = {
  height: number;
  width: number;
  x: number;
  y: number;
};

async function hideToolbar(page: Page) {
  await page.keyboard.press('Escape');
  await waitForEditorAnimationFrame(page);
}

async function selectEditorText(page: Page, text: string) {
  const selected = await page.evaluate(
    (targetText) => (window as any).__vlainaE2E.selectEditorTextByText(targetText, targetText),
    text,
  );

  if (!selected.selected) {
    const debugState = await page.evaluate((targetText) => {
      const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
      return {
        targetText,
        editorHasText: editor?.textContent?.includes(targetText) ?? false,
        selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
        toolbar: (window as any).__vlainaE2E.getEditorToolbarDebugState(),
      };
    }, text);
    console.info('[notes-floating-toolbar-selection-debug]', debugState);
  }

  expect(selected.selected, `Expected to select ${text}`).toBe(true);
  await expect(page.locator(TOOLBAR_SELECTOR)).toBeVisible({ timeout: 5_000 });
}

async function dragSelectEditorText(page: Page, text: string) {
  const rect = await page.evaluate((targetText) => {
    const editor = document.querySelector<HTMLElement>(
      '.milkdown .ProseMirror:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"])'
    );
    if (!editor) return null;

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const content = node.textContent ?? '';
      const index = content.indexOf(targetText);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + targetText.length);
        const targetRect = Array.from(range.getClientRects()).find((item) => item.width > 1 && item.height > 1);
        range.detach();
        if (!targetRect) return null;
        return {
          left: targetRect.left,
          right: targetRect.right,
          y: targetRect.top + targetRect.height / 2,
        };
      }
      node = walker.nextNode();
    }

    return null;
  }, text);

  expect(rect, `Expected text rect for ${text}`).not.toBeNull();
  const resetX = rect!.left > 20 ? rect!.left - 12 : rect!.right + 12;
  await page.mouse.click(resetX, rect!.y);
  await waitForEditorAnimationFrame(page);
  await page.mouse.move(rect!.left + 1, rect!.y);
  await page.mouse.down();
  await page.mouse.move(rect!.right - 1, rect!.y, { steps: 12 });
  await page.mouse.up();
  await waitForEditorAnimationFrame(page);
  await expect(page.locator(TOOLBAR_SELECTOR)).toBeVisible({ timeout: 5_000 });
  await expect.poll(() => page.evaluate(() => {
    const summary = (window as any).__vlainaE2E.getEditorSelectionSummary();
    return summary?.selectedText ?? '';
  }), {
    message: `Expected native mouse selection for ${text}`,
  }).toBe(text);
}

async function clickToolbarAction(page: Page, action: string) {
  const button = page.locator(`${TOOLBAR_SELECTOR} [data-action="${action}"]`).first();
  await expect(button, `Expected toolbar action ${action}`).toBeVisible({ timeout: 5_000 });
  try {
    await button.click({ timeout: 5_000 });
    await waitForEditorAnimationFrame(page);
    return;
  } catch {
    // The toolbar can rerender between Playwright's visibility check and click.
    // Fall back to dispatching the same DOM events to the currently visible button.
  }

  const clicked = await page.evaluate((targetAction) => {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(`.floating-toolbar.visible [data-action="${targetAction}"]`)
    );
    const buttonToClick = candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.pointerEvents !== 'none'
      );
    });
    if (!buttonToClick) {
      return false;
    }

    const eventInit: MouseEventInit = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: buttonToClick.getBoundingClientRect().left + buttonToClick.getBoundingClientRect().width / 2,
      clientY: buttonToClick.getBoundingClientRect().top + buttonToClick.getBoundingClientRect().height / 2,
    };
    buttonToClick.dispatchEvent(new PointerEvent('pointerdown', {
      ...eventInit,
      pointerType: 'mouse',
    } as PointerEventInit));
    buttonToClick.dispatchEvent(new MouseEvent('mousedown', eventInit));
    buttonToClick.dispatchEvent(new PointerEvent('pointerup', {
      ...eventInit,
      pointerType: 'mouse',
    } as PointerEventInit));
    buttonToClick.dispatchEvent(new MouseEvent('mouseup', eventInit));
    buttonToClick.dispatchEvent(new MouseEvent('click', eventInit));
    return true;
  }, action);
  if (!clicked && action === 'link') {
    await page.keyboard.press('Control+K');
    await waitForEditorAnimationFrame(page);
    return;
  }
  expect(clicked, `Expected to dispatch toolbar action ${action}`).toBe(true);
  await waitForEditorAnimationFrame(page);
}

async function logToolbarActionRetryDebug(page: Page, action: string, description: string) {
  const debugState = await page.evaluate((targetAction) => {
    const visibleToolbar = document.querySelector<HTMLElement>('.floating-toolbar.visible');
    return {
      action: targetAction,
      toolbarText: visibleToolbar?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      toolbarActions: Array.from(
        visibleToolbar?.querySelectorAll<HTMLElement>('[data-action]') ?? []
      ).map((button) => button.dataset.action ?? ''),
      selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
      toolbar: (window as any).__vlainaE2E.getEditorToolbarDebugState(),
    };
  }, action);
  console.info('[notes-floating-toolbar-action-retry]', { description, debugState });
}

async function clickToolbarActionAndWaitForVisible(
  page: Page,
  action: string,
  selector: string,
  description: string,
  retrySelectionText?: string,
) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0 && retrySelectionText) {
      await selectEditorText(page, retrySelectionText);
    }

    if (await page.locator(selector).first().isVisible().catch(() => false)) {
      return;
    }

    await clickToolbarAction(page, action);

    try {
      await expect(page.locator(selector).first(), `Expected ${description}`).toBeVisible({
        timeout: attempt === 0 ? 2_000 : 5_000,
      });
      return;
    } catch (error) {
      lastError = error;
      await logToolbarActionRetryDebug(page, action, description);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Expected ${description}`);
}

async function clickVisibleElement(page: Page, selector: string, description: string) {
  const element = page.locator(selector).first();
  await expect(element, `Expected ${description}`).toBeVisible({ timeout: 5_000 });
  try {
    await element.click({ timeout: 5_000 });
    await waitForEditorAnimationFrame(page);
    return;
  } catch {
    // Floating toolbar submenus can rerender between visibility and click.
    // Dispatch against the currently visible matching item if Playwright's
    // actionability wait observed the previous node disappear.
  }

  const clicked = await page.evaluate((targetSelector) => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(targetSelector));
    const target = candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.pointerEvents !== 'none'
      );
    });
    if (!target) {
      return false;
    }

    const rect = target.getBoundingClientRect();
    const eventInit: MouseEventInit = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    target.dispatchEvent(new PointerEvent('pointerdown', {
      ...eventInit,
      pointerType: 'mouse',
    } as PointerEventInit));
    target.dispatchEvent(new MouseEvent('mousedown', eventInit));
    target.dispatchEvent(new PointerEvent('pointerup', {
      ...eventInit,
      pointerType: 'mouse',
    } as PointerEventInit));
    target.dispatchEvent(new MouseEvent('mouseup', eventInit));
    target.dispatchEvent(new MouseEvent('click', eventInit));
    return true;
  }, selector);
  expect(clicked, `Expected to click ${description}`).toBe(true);
  await waitForEditorAnimationFrame(page);
}

async function editorTextHasMark(page: Page, text: string, markName: string) {
  return page.evaluate(
    ({ targetText, targetMark }) => (
      window as any
    ).__vlainaE2E.editorTextHasMark(targetText, targetMark, targetText),
    { targetText: text, targetMark: markName },
  );
}

async function expectEditorTextMark(page: Page, testCase: ToolbarMarkCase) {
  await expect
    .poll(() => editorTextHasMark(page, testCase.target, testCase.markName), {
      message: `Expected ${testCase.target} to have ${testCase.markName}`,
    })
    .toBe(true);
  await expect(page.locator(testCase.selector, { hasText: testCase.target }))
    .toBeVisible({ timeout: 5_000 });
}

async function countEditorTextOccurrences(page: Page, text: string) {
  return page.evaluate((targetText) => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    const content = editor?.textContent ?? '';
    let count = 0;
    let index = content.indexOf(targetText);
    while (index >= 0) {
      count += 1;
      index = content.indexOf(targetText, index + targetText.length);
    }
    return count;
  }, text);
}

async function focusEditorAtEnd(page: Page) {
  const focused = await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd());
  expect(focused).toBe(true);
  await waitForEditorAnimationFrame(page);
}

async function clickBlockDropdownItem(page: Page, blockType: string, retrySelectionText?: string) {
  await clickToolbarActionAndWaitForVisible(
    page,
    'block',
    `.block-dropdown [data-block-type="${blockType}"]`,
    `${blockType} block dropdown item`,
    retrySelectionText,
  );
  await clickVisibleElement(
    page,
    `.block-dropdown [data-block-type="${blockType}"]`,
    `${blockType} block dropdown item`,
  );
}

async function clickAlignmentDropdownItem(page: Page, alignment: string, retrySelectionText?: string) {
  await clickToolbarActionAndWaitForVisible(
    page,
    'alignment',
    `.alignment-dropdown [data-alignment="${alignment}"]`,
    `${alignment} alignment item`,
    retrySelectionText,
  );
  await clickVisibleElement(
    page,
    `.alignment-dropdown [data-alignment="${alignment}"]`,
    `${alignment} alignment item`,
  );
}

async function clickColorSwatch(
  page: Page,
  type: 'text' | 'bg',
  swatchSelector: string,
  description: string,
  retrySelectionText?: string,
) {
  await clickToolbarActionAndWaitForVisible(
    page,
    'color',
    `.color-picker [data-type="${type}"] ${swatchSelector}`,
    description,
    retrySelectionText,
  );
  await clickVisibleElement(
    page,
    `.color-picker [data-type="${type}"] ${swatchSelector}`,
    description,
  );
}

async function hoverColorSwatch(page: Page, type: 'text' | 'bg', swatchSelector: string, description: string) {
  const swatch = page.locator(`.color-picker [data-type="${type}"] ${swatchSelector}`).first();
  await expect(swatch, `Expected ${description}`).toBeVisible({ timeout: 5_000 });
  const box = await swatch.boundingBox();
  expect(box, `Expected bounds for ${description}`).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await waitForEditorAnimationFrame(page);
  return box!;
}

async function clickEditorBlankArea(page: Page) {
  const editor = page.locator(LIVE_EDITOR_SELECTOR).first();
  await expect(editor).toBeVisible({ timeout: 5_000 });
  const box = await editor.boundingBox();
  expect(box, 'Expected editor bounding box').not.toBeNull();
  await page.mouse.click(box!.x + Math.max(8, box!.width - 16), box!.y + 24);
  await waitForEditorAnimationFrame(page);
}

async function expectSelectionOverlay(page: Page, text: string) {
  await expect.poll(() => page.evaluate((targetText) => {
    const editor = document.querySelector<HTMLElement>(
      '.milkdown .ProseMirror:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"])'
    );
    const summary = (window as any).__vlainaE2E.getEditorSelectionSummary();
    const overlayCount = editor?.querySelectorAll('.editor-text-selection-overlay').length ?? 0;
    const overlayActive = editor?.classList.contains('editor-text-selection-overlay-active') ?? false;
    const nativeSelectionActive = editor?.classList.contains('editor-pointer-native-selection') ?? false;
    return (
      summary?.selectedText === targetText &&
      (overlayCount > 0 || (overlayActive && !nativeSelectionActive))
    );
  }, text), {
    message: `Expected visible selection overlay for ${text}`,
  }).toBe(true);
}

async function getPreviewTargetClip(page: Page, selector: string, targetText: string, padding = 2): Promise<ScreenshotClip> {
  return page.evaluate(({ padding, selector, targetText }) => {
    const target = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .find((candidate) => candidate.textContent?.includes(targetText));
    if (!target) {
      throw new Error(`Missing preview target ${selector} containing ${targetText}`);
    }

    const rect = target.getBoundingClientRect();
    const x = Math.max(0, Math.floor(rect.left - padding));
    const y = Math.max(0, Math.floor(rect.top - padding));
    const right = Math.min(window.innerWidth, Math.ceil(rect.right + padding));
    const bottom = Math.min(window.innerHeight, Math.ceil(rect.bottom + padding));

    return {
      height: Math.max(1, bottom - y),
      width: Math.max(1, right - x),
      x,
      y,
    };
  }, { padding, selector, targetText });
}

async function countSelectionBluePixelsInClip(page: Page, clip: ScreenshotClip): Promise<number> {
  const screenshot = await page.screenshot({ clip });
  const dataUrl = `data:image/png;base64,${screenshot.toString('base64')}`;

  return page.evaluate(async (imageUrl) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load color preview screenshot'));
      image.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Could not create canvas context for color preview screenshot');
    }

    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let bluePixelCount = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 0;
      const isSelectionBlue =
        alpha > 220 &&
        red < 100 &&
        green >= 70 &&
        green <= 180 &&
        blue >= 140 &&
        blue - red > 70 &&
        blue - green > 25;
      if (isSelectionBlue) {
        bluePixelCount += 1;
      }
    }
    return bluePixelCount;
  }, dataUrl);
}

async function countPixelsNearColorInClip(
  page: Page,
  clip: ScreenshotClip,
  expected: { blue: number; green: number; red: number },
  tolerance: number,
): Promise<number> {
  const screenshot = await page.screenshot({ clip });
  const dataUrl = `data:image/png;base64,${screenshot.toString('base64')}`;

  return page.evaluate(async ({ expected, imageUrl, tolerance }) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load color preview screenshot'));
      image.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Could not create canvas context for color preview screenshot');
    }

    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let matchingPixelCount = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 0;
      if (
        alpha > 220 &&
        Math.abs(red - expected.red) <= tolerance &&
        Math.abs(green - expected.green) <= tolerance &&
        Math.abs(blue - expected.blue) <= tolerance
      ) {
        matchingPixelCount += 1;
      }
    }
    return matchingPixelCount;
  }, { expected, imageUrl: dataUrl, tolerance });
}

function visibleLinkTooltip(page: Page): Locator {
  return page.locator(VISIBLE_LINK_TOOLTIP_SELECTOR).first();
}

async function clickLinkToolbarAndWaitForEditor(page: Page, retrySelectionText?: string): Promise<{
  tooltip: Locator;
  input: Locator;
}> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0 && retrySelectionText) {
      await selectEditorText(page, retrySelectionText);
    }

    await clickToolbarAction(page, 'link');
    const tooltip = visibleLinkTooltip(page);
    try {
      await expect(tooltip).toBeVisible({ timeout: attempt === 0 ? 2_000 : 10_000 });
      const input = tooltip.locator('textarea').first();
      await expect(input).toBeVisible({ timeout: 5_000 });
      await expect(input).toBeFocused({ timeout: 5_000 });
      return { tooltip, input };
    } catch (error) {
      lastError = error;
      await logToolbarActionRetryDebug(page, 'link', 'link tooltip');
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Expected link tooltip');
}

async function clickVisibleLinkTooltipAction(page: Page, index = 0): Promise<void> {
  const action = visibleLinkTooltip(page).locator('.link-tooltip-action-btn').nth(index);
  await expect(action).toBeVisible({ timeout: 5_000 });
  await action.click();
  await waitForEditorAnimationFrame(page);
}

function createToolbarCoverageMarkdown() {
  const targets = [
    'AI toolbar menu target',
    'Bold toolbar target',
    'Italic toolbar target',
    'Underline toolbar target',
    'Strike toolbar target',
    'Code toolbar target',
    'Highlight toolbar target',
    'Mouse link focus target',
    'Link outside close target',
    'Link toolbar target',
    'Link check button target',
    'Link plain href target',
    'Text color toolbar target',
    'Background color toolbar target',
    'Heading one toolbar target',
    'Heading two toolbar target',
    'Heading three toolbar target',
    'Heading four toolbar target',
    'Heading five toolbar target',
    'Heading six toolbar target',
    'Bullet list toolbar target',
    'Ordered list toolbar target',
    'Task list toolbar target',
    'Blockquote toolbar target',
    'Code block toolbar target',
    'Paragraph toolbar target',
    'Align center toolbar target',
    'Align right toolbar target',
    'Align left toolbar target',
    'Copy toolbar target',
    'Delete toolbar target',
  ];

  return [
    '# Floating Toolbar E2E Coverage',
    '',
    ...targets.flatMap((target) => [`${target} baseline text.`, '']),
    '[Existing link edit target](https://example.com/notes-floating-toolbar-existing-old)! trailing sentinel.',
    '',
  ].join('\n');
}

function createLargeToolbarPreviewMarkdown(): { content: string; linkTarget: string; target: string } {
  const target = 'Large toolbar preview target sentinel';
  const linkTarget = 'Large toolbar unlink preview sentinel';
  const lines = [
    '# Large Toolbar Preview Coverage',
    '',
    `${target} should stay selectable in a long note.`,
    '',
    `[${linkTarget}](https://example.com/large-toolbar-preview) should preview unlinking.`,
    '',
  ];

  for (let index = 0; index < 900; index += 1) {
    lines.push(
      [
        `Large toolbar preview paragraph ${index}.`,
        'This repeated prose is intentionally plain so toolbar hover preview performance is dominated by the editor document size.',
        'It includes markdown-looking tokens like **bold**, ==highlight==, [link](https://example.com), and `code`.',
        'The paragraph is long enough to make a realistic note without relying on external assets.',
      ].join(' '),
    );
    lines.push('');
  }

  return { content: lines.join('\n'), linkTarget, target };
}

function createImageAnchoredToolbarScrollMarkdown(): { content: string; target: string } {
  const target = '：支持多品牌 3D 打印机的开源切片软件。这是一款开源的 3D 打印切片工具，内置流速调节、温度塔、回抽测试等校准套件，支持 Bambu Lab、Prusa、Creality 等主流打印机品牌，适用于 Windows、macOS 和 Linux 平台。';
  const filler = Array.from({ length: 12 }, (_, index) =>
    `Intro filler ${index + 1} keeps the image block below the first viewport so the test can exercise scroll anchoring.`
  ).join('\n\n');

  return {
    target,
    content: [
      '# Floating Toolbar Scroll Regression',
      '',
      filler,
      '',
      `5、[OrcaSlicer](https://example.com/orca)${target}`,
      '',
      `<img src="${IMAGE_ANCHORED_TOOLBAR_PREVIEW_DATA_URL}" alt="preview image" width="72%" />`,
      '',
      '### Go 项目',
      '',
      '6、[glow](https://example.com/glow)：直接在命令行浏览 Markdown 的工具。该项目是基于 Go 开发的命令行 Markdown 阅读器。',
      '',
      Array.from({ length: 10 }, (_, index) =>
        `Trailing filler ${index + 1} gives the scroll root room below the image.`
      ).join('\n\n'),
    ].join('\n'),
  };
}

function createCatalogImagePreviewSpacingMarkdown(): { content: string; target: string } {
  const target = '获得更好的阅读体验';
  return {
    target,
    content: [
      `<img src="${CATALOG_IMAGE_PREVIEW_SPACING_SRC}" alt="catalog" width="72%" />`,
      '',
      `点击右上角的 **「目录」** 图标打开目录，${target}。`,
    ].join('\n'),
  };
}

async function collectPreviewFrameMetrics(page: Page, durationMs: number) {
  return page.evaluate(({ durationMs, previewSelector, editorSelector }) => new Promise<{
    frameCount: number;
    formatPreview: string | null;
    formatPreviewMode: string | null;
    maxFrameMs: number;
    previewOverlayCount: number;
    selectedFontWeight: string | null;
    hiddenEditorCount: number;
  }>((resolve) => {
    let frameCount = 0;
    let maxFrameMs = 0;
    const startedAt = performance.now();
    let lastFrameAt = startedAt;

    const collect = () => {
      const now = performance.now();
      frameCount += 1;
      maxFrameMs = Math.max(maxFrameMs, now - lastFrameAt);
      lastFrameAt = now;

      if (now - startedAt >= durationMs) {
        const editor = document.querySelector<HTMLElement>(editorSelector);
        const selectionOverlay = editor?.querySelector<HTMLElement>('.editor-text-selection-overlay') ?? null;
        resolve({
          frameCount,
          formatPreview: editor?.getAttribute('data-toolbar-format-preview') ?? null,
          formatPreviewMode: editor?.getAttribute('data-toolbar-format-preview-mode') ?? null,
          maxFrameMs: Math.round(maxFrameMs * 10) / 10,
          previewOverlayCount: document.querySelectorAll(previewSelector).length,
          selectedFontWeight: selectionOverlay ? getComputedStyle(selectionOverlay).fontWeight : null,
          hiddenEditorCount: document.querySelectorAll(`${editorSelector}[data-toolbar-preview-hidden="true"]`).length,
        });
        return;
      }

      requestAnimationFrame(collect);
    };

    requestAnimationFrame(collect);
  }), {
    durationMs,
    previewSelector: PREVIEW_OVERLAY_SELECTOR,
    editorSelector: EDITOR_SELECTOR,
  });
}

test.describe('notes floating toolbar coverage', () => {
  test.setTimeout(240_000);

  test('covers selection toolbar actions, dropdowns, copy, and delete', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-floating-toolbar-coverage');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      const opened = await openMarkdownFixture(page, {
        filename: 'floating-toolbar-coverage.md',
        content: createToolbarCoverageMarkdown(),
      });

      const submenuTarget = 'Paragraph toolbar target';
      await selectEditorText(page, submenuTarget);
      await clickToolbarAction(page, 'block');
      await expect(page.locator('.block-dropdown')).toBeVisible({ timeout: 5_000 });
      await clickToolbarAction(page, 'alignment');
      await expect(page.locator('.block-dropdown')).toHaveCount(0);
      await expect(page.locator('.alignment-dropdown')).toBeVisible({ timeout: 5_000 });
      await clickToolbarAction(page, 'color');
      await expect(page.locator('.alignment-dropdown')).toHaveCount(0);
      await expect(page.locator('.color-picker')).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press('Escape');
      await expect(page.locator('.color-picker')).not.toBeVisible({ timeout: 5_000 });
      await expect(page.locator(TOOLBAR_SELECTOR)).not.toBeVisible({ timeout: 5_000 });

      await selectEditorText(page, 'AI toolbar menu target');
      await clickToolbarAction(page, 'ai');
      await expect(page.locator('.ai-dropdown')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('.ai-dropdown [data-ai-prompt], .ai-dropdown [data-ai-category]').first())
        .toBeVisible({ timeout: 5_000 });
      await expect(page.locator('.ai-dropdown [data-ai-command-id="fix-typos"]')).toBeVisible({ timeout: 5_000 });
      const quoteToChatAction = page.locator('.ai-dropdown .ai-dropdown-category-action[data-ai-command-id="discuss-in-sidebar"]').first();
      await expect(quoteToChatAction).toBeVisible({ timeout: 5_000 });
      await expect(quoteToChatAction.locator('.ai-dropdown-item-icon')).toHaveCount(0);
      await quoteToChatAction.click();
      await expect(page.locator('[data-notes-chat-floating="true"]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-notes-chat-panel="true"]')).toHaveCount(0);
      await expect(page.locator(`[data-notes-chat-floating="true"] ${CHAT_COMPOSER_TEXTAREA_SELECTOR}`).first())
        .toHaveValue('AI toolbar menu target', { timeout: 10_000 });
      await page.locator('[data-notes-chat-floating="true"] [data-chat-view-mode="embedded"] > div').first()
        .locator('button[aria-label]')
        .last()
        .click();
      await expect(page.locator('[data-notes-chat-floating="true"]')).toHaveCount(0);
      await hideToolbar(page);

      const markCases: ToolbarMarkCase[] = [
        {
          action: 'bold',
          markName: 'strong',
          selector: `${LIVE_EDITOR_SELECTOR} strong`,
          target: 'Bold toolbar target',
        },
        {
          action: 'italic',
          markName: 'emphasis',
          selector: `${LIVE_EDITOR_SELECTOR} em`,
          target: 'Italic toolbar target',
        },
        {
          action: 'underline',
          markName: 'underline',
          selector: `${LIVE_EDITOR_SELECTOR} u`,
          target: 'Underline toolbar target',
        },
        {
          action: 'strike',
          markName: 'strike_through',
          selector: `${LIVE_EDITOR_SELECTOR} s, ${LIVE_EDITOR_SELECTOR} del, ${LIVE_EDITOR_SELECTOR} strike`,
          target: 'Strike toolbar target',
        },
        {
          action: 'code',
          markName: 'inlineCode',
          selector: `${LIVE_EDITOR_SELECTOR} code`,
          target: 'Code toolbar target',
        },
        {
          action: 'highlight',
          markName: 'highlight',
          selector: `${LIVE_EDITOR_SELECTOR} mark`,
          target: 'Highlight toolbar target',
        },
      ];

      for (const markCase of markCases) {
        await selectEditorText(page, markCase.target);
        await clickToolbarAction(page, markCase.action);
        await expectEditorTextMark(page, markCase);
        if (markCase.action === 'bold') {
          await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditor());
          await page.keyboard.press('Control+Z');
          await expect.poll(() => editorTextHasMark(page, markCase.target, markCase.markName)).toBe(false);
          await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditor());
          await page.keyboard.press('Control+Y');
          await expectEditorTextMark(page, markCase);
        }
      }

      const mouseLinkTarget = 'Mouse link focus target';
      const mouseLinkHref = 'mouse-link-focus';
      await dragSelectEditorText(page, mouseLinkTarget);
      const { input: mouseLinkInput } = await clickLinkToolbarAndWaitForEditor(page, mouseLinkTarget);
      await expectSelectionOverlay(page, mouseLinkTarget);
      await page.keyboard.type(mouseLinkHref);
      await expect(mouseLinkInput).toHaveValue(mouseLinkHref);
      await mouseLinkInput.press('Enter');
      await waitForEditorAnimationFrame(page);
      await expect(page.locator(VISIBLE_LINK_TOOLTIP_SELECTOR)).toHaveCount(0, { timeout: 5_000 });
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} a[href="${mouseLinkHref}"]`, { hasText: mouseLinkTarget }))
        .toBeVisible({ timeout: 5_000 });
      await expect.poll(() => editorTextHasMark(page, mouseLinkTarget, 'link')).toBe(true);

      const linkOutsideTarget = 'Link outside close target';
      await selectEditorText(page, linkOutsideTarget);
      const { input: blankCloseLinkInput } = await clickLinkToolbarAndWaitForEditor(page, linkOutsideTarget);
      await expect(blankCloseLinkInput).toHaveAttribute('placeholder', 'URL...');
      await clickEditorBlankArea(page);
      await expect(page.locator(VISIBLE_LINK_TOOLTIP_SELECTOR)).toHaveCount(0, { timeout: 5_000 });
      await expect(page.locator(TOOLBAR_SELECTOR)).not.toBeVisible({ timeout: 5_000 });
      await expect.poll(() => page.evaluate(() => {
        const summary = (window as any).__vlainaE2E.getEditorSelectionSummary();
        return summary?.selectedText ?? null;
      })).toBe('');
      await expect.poll(() => editorTextHasMark(page, linkOutsideTarget, 'link')).toBe(false);

      const linkTarget = 'Link toolbar target';
      const linkUrl = 'https://example.com/notes-floating-toolbar-link';
      await selectEditorText(page, linkTarget);
      const { input: linkInput } = await clickLinkToolbarAndWaitForEditor(page, linkTarget);
      await page.keyboard.type(linkUrl);
      await expect(linkInput).toHaveValue(linkUrl);
      await linkInput.press('Enter');
      await waitForEditorAnimationFrame(page);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} a[href="${linkUrl}"]`, { hasText: linkTarget }))
        .toBeVisible({ timeout: 5_000 });
      await expect.poll(() => editorTextHasMark(page, linkTarget, 'link')).toBe(true);

      const linkCheckTarget = 'Link check button target';
      const linkCheckUrl = 'https://example.com/notes-floating-toolbar-check';
      await selectEditorText(page, linkCheckTarget);
      const { input: linkCheckInput } = await clickLinkToolbarAndWaitForEditor(page, linkCheckTarget);
      await page.keyboard.type(linkCheckUrl);
      await expect(linkCheckInput).toHaveValue(linkCheckUrl);
      await linkCheckInput.press('Enter');
      await waitForEditorAnimationFrame(page);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} a[href="${linkCheckUrl}"]`, { hasText: linkCheckTarget }))
        .toBeVisible({ timeout: 5_000 });
      await expect.poll(() => editorTextHasMark(page, linkCheckTarget, 'link')).toBe(true);

      const linkPlainTarget = 'Link plain href target';
      const linkPlainHref = 'workspace-note';
      await selectEditorText(page, linkPlainTarget);
      const { input: linkPlainInput } = await clickLinkToolbarAndWaitForEditor(page, linkPlainTarget);
      await page.keyboard.type(linkPlainHref);
      await expect(linkPlainInput).toHaveValue(linkPlainHref);
      await linkPlainInput.press('Enter');
      await waitForEditorAnimationFrame(page);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} a[href="${linkPlainHref}"]`, { hasText: linkPlainTarget }))
        .toBeVisible({ timeout: 5_000 });
      await expect.poll(() => editorTextHasMark(page, linkPlainTarget, 'link')).toBe(true);

      const existingLinkTarget = 'Existing link edit target';
      const existingLinkUpdatedHref = 'workspace-existing-link';
      const existingLink = page.locator(
        `${LIVE_EDITOR_SELECTOR} a[href="https://example.com/notes-floating-toolbar-existing-old"]`,
        { hasText: existingLinkTarget },
      ).first();
      await expect(existingLink).toBeVisible({ timeout: 5_000 });
      await existingLink.hover();
      await expect(visibleLinkTooltip(page).locator('.link-tooltip-viewer')).toBeVisible({ timeout: 5_000 });
      await clickVisibleLinkTooltipAction(page, 1);
      const existingLinkInput = visibleLinkTooltip(page).locator('textarea').first();
      await expect(existingLinkInput).toBeVisible({ timeout: 5_000 });
      await existingLinkInput.press('Control+A');
      await page.keyboard.type(existingLinkUpdatedHref);
      await expect(existingLinkInput).toHaveValue(existingLinkUpdatedHref);
      await existingLinkInput.press('Enter');
      await waitForEditorAnimationFrame(page);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} a[href="${existingLinkUpdatedHref}"]`, { hasText: existingLinkTarget }))
        .toBeVisible({ timeout: 5_000 });
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} p`, { hasText: `${existingLinkTarget}! trailing sentinel.` }))
        .toBeVisible({ timeout: 5_000 });

      const textColorTarget = 'Text color toolbar target';
      await selectEditorText(page, textColorTarget);
      await clickColorSwatch(
        page,
        'text',
        '.color-picker-grid .color-picker-item:not(.color-picker-item-default)',
        'text color swatch',
        textColorTarget,
      );
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} span[data-text-color]`, { hasText: textColorTarget }))
        .toBeVisible({ timeout: 5_000 });
      await expect.poll(() => editorTextHasMark(page, textColorTarget, 'textColor')).toBe(true);
      await selectEditorText(page, textColorTarget);
      await clickColorSwatch(page, 'text', '.color-picker-item-default', 'default text color swatch', textColorTarget);
      await expect.poll(() => editorTextHasMark(page, textColorTarget, 'textColor')).toBe(false);

      const bgColorTarget = 'Background color toolbar target';
      await selectEditorText(page, bgColorTarget);
      await clickColorSwatch(
        page,
        'bg',
        '.color-picker-grid .color-picker-item:not(.color-picker-item-default)',
        'background color swatch',
        bgColorTarget,
      );
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} mark[data-bg-color]`, { hasText: bgColorTarget }))
        .toBeVisible({ timeout: 5_000 });
      await expect.poll(() => editorTextHasMark(page, bgColorTarget, 'bgColor')).toBe(true);
      await selectEditorText(page, bgColorTarget);
      await clickColorSwatch(page, 'bg', '.color-picker-item-default', 'default background color swatch', bgColorTarget);
      await expect.poll(() => editorTextHasMark(page, bgColorTarget, 'bgColor')).toBe(false);

      const blockCases: BlockCase[] = [
        { blockType: 'heading1', selector: `${LIVE_EDITOR_SELECTOR} h1`, target: 'Heading one toolbar target' },
        { blockType: 'heading2', selector: `${LIVE_EDITOR_SELECTOR} h2`, target: 'Heading two toolbar target' },
        { blockType: 'heading3', selector: `${LIVE_EDITOR_SELECTOR} h3`, target: 'Heading three toolbar target' },
        { blockType: 'heading4', selector: `${LIVE_EDITOR_SELECTOR} h4`, target: 'Heading four toolbar target' },
        { blockType: 'heading5', selector: `${LIVE_EDITOR_SELECTOR} h5`, target: 'Heading five toolbar target' },
        { blockType: 'heading6', selector: `${LIVE_EDITOR_SELECTOR} h6`, target: 'Heading six toolbar target' },
        { blockType: 'bulletList', selector: `${LIVE_EDITOR_SELECTOR} ul li`, target: 'Bullet list toolbar target' },
        { blockType: 'orderedList', selector: `${LIVE_EDITOR_SELECTOR} ol li`, target: 'Ordered list toolbar target' },
        {
          blockType: 'taskList',
          selector: `${LIVE_EDITOR_SELECTOR} li[data-item-type="task"], ${LIVE_EDITOR_SELECTOR} li[data-task-list-item], ${LIVE_EDITOR_SELECTOR} li.task-list-item`,
          target: 'Task list toolbar target',
        },
        { blockType: 'blockquote', selector: `${LIVE_EDITOR_SELECTOR} blockquote`, target: 'Blockquote toolbar target' },
        {
          blockType: 'codeBlock',
          selector: `${LIVE_EDITOR_SELECTOR} .code-block-container, ${LIVE_EDITOR_SELECTOR} pre`,
          target: 'Code block toolbar target',
        },
      ];

      for (const blockCase of blockCases) {
        await selectEditorText(page, blockCase.target);
        await clickBlockDropdownItem(page, blockCase.blockType, blockCase.target);
        await expect(page.locator(blockCase.selector, { hasText: blockCase.target }))
          .toBeVisible({ timeout: 5_000 });
      }

      const paragraphTarget = 'Paragraph toolbar target';
      await selectEditorText(page, paragraphTarget);
      await clickBlockDropdownItem(page, 'heading2', paragraphTarget);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} h2`, { hasText: paragraphTarget }))
        .toBeVisible({ timeout: 5_000 });
      await selectEditorText(page, paragraphTarget);
      await clickBlockDropdownItem(page, 'paragraph', paragraphTarget);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} p`, { hasText: paragraphTarget }))
        .toBeVisible({ timeout: 5_000 });

      const alignCenterTarget = 'Align center toolbar target';
      await selectEditorText(page, alignCenterTarget);
      await clickAlignmentDropdownItem(page, 'center', alignCenterTarget);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} [data-text-align="center"]`, { hasText: alignCenterTarget }))
        .toBeVisible({ timeout: 5_000 });
      await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditor());
      await page.keyboard.press('Control+Z');
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} [data-text-align="center"]`, { hasText: alignCenterTarget }))
        .toHaveCount(0);
      await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditor());
      await page.keyboard.press('Control+Y');
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} [data-text-align="center"]`, { hasText: alignCenterTarget }))
        .toBeVisible({ timeout: 5_000 });

      const alignRightTarget = 'Align right toolbar target';
      await selectEditorText(page, alignRightTarget);
      await clickAlignmentDropdownItem(page, 'right', alignRightTarget);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} [data-text-align="right"]`, { hasText: alignRightTarget }))
        .toBeVisible({ timeout: 5_000 });

      const alignLeftTarget = 'Align left toolbar target';
      await selectEditorText(page, alignLeftTarget);
      await clickAlignmentDropdownItem(page, 'center', alignLeftTarget);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} [data-text-align="center"]`, { hasText: alignLeftTarget }))
        .toBeVisible({ timeout: 5_000 });
      await selectEditorText(page, alignLeftTarget);
      await clickAlignmentDropdownItem(page, 'left', alignLeftTarget);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} [data-text-align="center"]`, { hasText: alignLeftTarget }))
        .toHaveCount(0);

      const copyTarget = 'Copy toolbar target';
      const beforeCopyCount = await countEditorTextOccurrences(page, copyTarget);
      await selectEditorText(page, copyTarget);
      await clickToolbarAction(page, 'copy');
      await focusEditorAtEnd(page);
      await page.keyboard.press('Control+V');
      await waitForEditorAnimationFrame(page);
      await expect.poll(() => countEditorTextOccurrences(page, copyTarget)).toBeGreaterThan(beforeCopyCount);

      const deleteTarget = 'Delete toolbar target';
      const beforeDeleteCount = await countEditorTextOccurrences(page, deleteTarget);
      await selectEditorText(page, deleteTarget);
      await clickToolbarAction(page, 'delete');
      await expect.poll(() => countEditorTextOccurrences(page, deleteTarget)).toBeLessThan(beforeDeleteCount);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const currentContent = await page.evaluate(() =>
        String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '')
      );
      const savedContent = await page.evaluate((notePath) =>
        (window as any).__vlainaE2E.readTextFile(notePath), opened.notePath
      );
      expect(savedContent).toBe(currentContent);

      await openAbsoluteNote(page, opened.notePath);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} strong`, { hasText: 'Bold toolbar target' }))
        .toBeVisible({ timeout: 10_000 });
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} a[href="${linkUrl}"]`, { hasText: linkTarget }))
        .toBeVisible({ timeout: 10_000 });
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} h1`, { hasText: 'Heading one toolbar target' }))
        .toBeVisible({ timeout: 10_000 });
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} [data-text-align="center"]`, { hasText: alignCenterTarget }))
        .toBeVisible({ timeout: 10_000 });
      await expect.poll(() => countEditorTextOccurrences(page, deleteTarget)).toBeLessThan(beforeDeleteCount);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('previews color swatches without selected text paint covering the result', async () => {
    const textColorTarget = 'Text color preview target';
    const bgColorTarget = 'Background color preview target';
    const { app, userDataRoot } = await launchIsolatedElectron('notes-floating-toolbar-color-preview');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      await openMarkdownFixture(page, {
        filename: 'floating-toolbar-color-preview.md',
        content: [
          '# Floating Toolbar Color Preview',
          '',
          `${textColorTarget} baseline text.`,
          '',
          `${bgColorTarget} baseline text.`,
        ].join('\n'),
      });
      await page.addStyleTag({
        content: [
          '.milkdown .ProseMirror span[data-text-color] {',
          '  color: rgb(0, 0, 0) !important;',
          '  -webkit-text-fill-color: rgb(0, 0, 0) !important;',
          '}',
        ].join('\n'),
      });

      await dragSelectEditorText(page, textColorTarget);
      await clickToolbarAction(page, 'color');
      await hoverColorSwatch(
        page,
        'text',
        '.color-picker-grid .color-picker-item[data-color="#866ec6"]',
        'purple text color preview swatch',
      );

      const textPreviewState = await page.evaluate((targetText) => {
        const overlay = document.querySelector<HTMLElement>('.toolbar-applied-preview-overlay');
        const liveEditor = document.querySelector<HTMLElement>(
          '.milkdown .ProseMirror:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"])'
        );
        const previewMark = Array.from(overlay?.querySelectorAll<HTMLElement>('span[data-text-color]') ?? [])
          .find((candidate) => candidate.textContent?.includes(targetText)) ?? null;

        return {
          hasOverlay: Boolean(overlay),
          hasHiddenSelectionClass: overlay?.classList.contains('toolbar-selection-hidden-preview') ?? false,
          liveEditorDisplay: liveEditor?.style.display ?? null,
          liveEditorHiddenAttr: liveEditor?.getAttribute('data-toolbar-preview-hidden') ?? null,
          nativeSelectionText: window.getSelection()?.toString() ?? '',
          overlaySelectionCount: overlay?.querySelectorAll('.editor-text-selection-overlay').length ?? 0,
          previewColor: previewMark ? getComputedStyle(previewMark).color : null,
          previewTextFillColor: previewMark ? getComputedStyle(previewMark).webkitTextFillColor : null,
          previewTextColorAttr: previewMark?.getAttribute('data-text-color') ?? null,
        };
      }, textColorTarget);

      expect(textPreviewState).toMatchObject({
        hasHiddenSelectionClass: true,
        hasOverlay: true,
        liveEditorDisplay: 'none',
        liveEditorHiddenAttr: 'true',
        overlaySelectionCount: 0,
      });
      expect(textPreviewState.previewTextColorAttr).toBeTruthy();
      expect(textPreviewState.previewColor).toBe('rgb(134, 110, 198)');
      expect(textPreviewState.previewTextFillColor).toBe('rgb(134, 110, 198)');

      const textPreviewClip = await getPreviewTargetClip(
        page,
        '.toolbar-applied-preview-overlay span[data-text-color]',
        textColorTarget,
      );
      const textColorPixelCount = await countPixelsNearColorInClip(
        page,
        textPreviewClip,
        { red: 134, green: 110, blue: 198 },
        60,
      );
      expect(textColorPixelCount).toBeGreaterThan(8);

      await hoverColorSwatch(
        page,
        'bg',
        '.color-picker-grid .color-picker-item[data-color="#fca9bd"]',
        'pink background color preview swatch',
      );

      const bgPreviewState = await page.evaluate((targetText) => {
        const overlay = document.querySelector<HTMLElement>('.toolbar-applied-preview-overlay');
        const previewMark = Array.from(overlay?.querySelectorAll<HTMLElement>('mark[data-bg-color]') ?? [])
          .find((candidate) => candidate.textContent?.includes(targetText)) ?? null;

        return {
          hasHiddenSelectionClass: overlay?.classList.contains('toolbar-selection-hidden-preview') ?? false,
          overlaySelectionCount: overlay?.querySelectorAll('.editor-text-selection-overlay').length ?? 0,
          previewBgColor: previewMark ? getComputedStyle(previewMark).backgroundColor : null,
          previewBgColorAttr: previewMark?.getAttribute('data-bg-color') ?? null,
        };
      }, textColorTarget);

      expect(bgPreviewState).toMatchObject({
        hasHiddenSelectionClass: true,
        overlaySelectionCount: 0,
      });
      expect(bgPreviewState.previewBgColorAttr).toBeTruthy();
      expect(bgPreviewState.previewBgColor).toBe('rgb(252, 169, 189)');

      const previewClip = await getPreviewTargetClip(
        page,
        '.toolbar-applied-preview-overlay mark[data-bg-color]',
        textColorTarget,
      );
      const bluePixelCount = await countSelectionBluePixelsInClip(page, previewClip);
      expect(bluePixelCount).toBe(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps hover preview from scrolling selections above images', async () => {
    const { content, target } = createImageAnchoredToolbarScrollMarkdown();
    const { app, userDataRoot } = await launchIsolatedElectron('notes-floating-toolbar-image-scroll');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      await openMarkdownFixture(page, {
        filename: 'floating-toolbar-image-scroll.md',
        content,
      });

      const imageBlock = page.locator(NOTE_IMAGE_BLOCK_SELECTOR).first();
      await expect(imageBlock).toBeVisible({ timeout: 10_000 });
      await imageBlock.scrollIntoViewIfNeeded();
      await waitForEditorAnimationFrame(page);
      const previewImage = page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR} img[alt="preview image"]`).first();
      await expect(previewImage).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => page.evaluate(() => {
        const image = document.querySelector<HTMLImageElement>(
          '.image-block-container img[alt="preview image"]'
        );
        return {
          complete: image?.complete ?? false,
          naturalHeight: image?.naturalHeight ?? 0,
          naturalWidth: image?.naturalWidth ?? 0,
        };
      })).toMatchObject({
        complete: true,
        naturalHeight: 560,
        naturalWidth: 900,
      });

      await page.evaluate(({ scrollSelector, targetText }) => {
        const scrollRoot = document.querySelector<HTMLElement>(scrollSelector);
        const editor = document.querySelector<HTMLElement>(
          '.milkdown .ProseMirror:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"])'
        );
        if (!scrollRoot || !editor) {
          return;
        }

        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? '';
          const index = text.indexOf(targetText);
          if (index < 0) {
            continue;
          }

          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + targetText.length);
          const rect = range.getBoundingClientRect();
          const rootRect = scrollRoot.getBoundingClientRect();
          scrollRoot.scrollTop += rect.top - rootRect.top - 96;
          range.detach();
          break;
        }
      }, {
        scrollSelector: NOTE_SCROLL_ROOT_SELECTOR,
        targetText: target,
      });

      await selectEditorText(page, target);
      const boldButton = page.locator(`${TOOLBAR_SELECTOR} [data-action="bold"]`).first();
      await expect(boldButton).toBeVisible({ timeout: 5_000 });

      const liveImageLayout = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>(
          '.milkdown .ProseMirror:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"])'
        );
        const imageBlock = editor?.querySelector<HTMLElement>('.image-block-container') ?? null;
        const image = imageBlock?.querySelector<HTMLImageElement>('img[alt="preview image"]') ?? null;
        const paragraph = imageBlock?.closest('p') ?? null;
        const alignmentWrapper = Array.from(imageBlock?.children ?? []).find(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child.classList.contains('group/image')
        ) ?? null;
        const frame = alignmentWrapper?.firstElementChild instanceof HTMLElement
          ? alignmentWrapper.firstElementChild
          : null;
        const blockRect = imageBlock?.getBoundingClientRect();
        const frameRect = frame?.getBoundingClientRect();
        const centerOffset = blockRect && frameRect
          ? (frameRect.left - blockRect.left) - ((blockRect.width - frameRect.width) / 2)
          : null;

        return {
          centerOffset,
          imageBlockFound: !!imageBlock,
          imageSrc: image?.getAttribute('src') ?? null,
          paragraphHasImageClass: paragraph?.classList.contains('editor-paragraph-has-image-block') ?? false,
          paragraphLineHeight: paragraph ? getComputedStyle(paragraph).lineHeight : null,
          wrapperJustifyCenter: alignmentWrapper?.classList.contains('justify-center') ?? false,
        };
      });
      expect(liveImageLayout.imageBlockFound).toBe(true);
      expect(liveImageLayout.imageSrc).toBeTruthy();
      expect(liveImageLayout.paragraphHasImageClass).toBe(true);
      expect(liveImageLayout.wrapperJustifyCenter).toBe(true);

      const scrollTracePromise = page.evaluate(({ durationMs, scrollSelector }) => new Promise<{
        after: number;
        before: number;
        hiddenEditorCount: number;
        max: number;
        min: number;
        overlayCount: number;
        scrollEvents: number[];
        samples: number[];
      }>((resolve) => {
        const scrollRoot = document.querySelector<HTMLElement>(scrollSelector);
        if (!scrollRoot) {
          resolve({
            after: 0,
            before: 0,
            hiddenEditorCount: 0,
            max: 0,
            min: 0,
            overlayCount: 0,
            scrollEvents: [],
            samples: [],
          });
          return;
        }

        const before = scrollRoot.scrollTop;
        const scrollEvents: number[] = [];
        const samples: number[] = [before];
        const handleScroll = () => {
          scrollEvents.push(scrollRoot.scrollTop);
        };
        scrollRoot.addEventListener('scroll', handleScroll);
        const startedAt = performance.now();
        const sample = () => {
          samples.push(scrollRoot.scrollTop);
          if (performance.now() - startedAt < durationMs) {
            requestAnimationFrame(sample);
            return;
          }

          scrollRoot.removeEventListener('scroll', handleScroll);
          resolve({
            after: scrollRoot.scrollTop,
            before,
            hiddenEditorCount: document.querySelectorAll('[data-toolbar-preview-hidden="true"]').length,
            max: Math.max(...samples, ...scrollEvents),
            min: Math.min(...samples, ...scrollEvents),
            overlayCount: document.querySelectorAll('.toolbar-applied-preview-overlay').length,
            scrollEvents,
            samples,
          });
        };
        requestAnimationFrame(sample);
      }), {
        durationMs: 450,
        scrollSelector: NOTE_SCROLL_ROOT_SELECTOR,
      });

      await boldButton.hover();
      const scrollTrace = await scrollTracePromise;
      const overlayImageLayout = await page.evaluate(() => {
        const overlay = document.querySelector<HTMLElement>('.toolbar-applied-preview-overlay');
        const imageBlock = overlay?.querySelector<HTMLElement>('.image-block-container') ?? null;
        const image = imageBlock?.querySelector<HTMLImageElement>('img[alt="preview image"]') ?? null;
        const paragraph = imageBlock?.closest('p') ?? null;
        const alignmentWrapper = Array.from(imageBlock?.children ?? []).find(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child.classList.contains('group/image')
        ) ?? null;
        const frame = alignmentWrapper?.firstElementChild instanceof HTMLElement
          ? alignmentWrapper.firstElementChild
          : null;
        const blockRect = imageBlock?.getBoundingClientRect();
        const frameRect = frame?.getBoundingClientRect();
        const centerOffset = blockRect && frameRect
          ? (frameRect.left - blockRect.left) - ((blockRect.width - frameRect.width) / 2)
          : null;

        return {
          bareSerializedImage: !!overlay?.querySelector('p > img[alt="preview image"]'),
          centerOffset,
          imageBlockFound: !!imageBlock,
          imageSrc: image?.getAttribute('src') ?? null,
          paragraphHasImageClass: paragraph?.classList.contains('editor-paragraph-has-image-block') ?? false,
          paragraphLineHeight: paragraph ? getComputedStyle(paragraph).lineHeight : null,
          wrapperJustifyCenter: alignmentWrapper?.classList.contains('justify-center') ?? false,
        };
      });

      expect(scrollTrace.overlayCount).toBeGreaterThan(0);
      expect(scrollTrace.hiddenEditorCount).toBeGreaterThan(0);
      expect(Math.max(
        Math.abs(scrollTrace.max - scrollTrace.before),
        Math.abs(scrollTrace.min - scrollTrace.before),
        Math.abs(scrollTrace.after - scrollTrace.before),
      )).toBeLessThanOrEqual(1);
      expect(overlayImageLayout.bareSerializedImage).toBe(false);
      expect(overlayImageLayout.imageBlockFound).toBe(true);
      expect(overlayImageLayout.imageSrc).toBe(liveImageLayout.imageSrc);
      expect(overlayImageLayout.paragraphHasImageClass).toBe(true);
      expect(overlayImageLayout.paragraphLineHeight).toBe(liveImageLayout.paragraphLineHeight);
      expect(overlayImageLayout.wrapperJustifyCenter).toBe(true);
      expect(Math.abs((overlayImageLayout.centerOffset ?? 0) - (liveImageLayout.centerOffset ?? 0)))
        .toBeLessThanOrEqual(1);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps hover preview spacing between catalog images and following paragraphs', async () => {
    const { content, target } = createCatalogImagePreviewSpacingMarkdown();
    const { app, userDataRoot } = await launchIsolatedElectron('notes-floating-toolbar-catalog-image-spacing');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'notes-floating-toolbar-catalog-image-spacing',
        files: [
          {
            filename: 'floating-toolbar-catalog-image-spacing.md',
            content,
          },
          {
            filename: 'catalog.svg',
            content: CATALOG_IMAGE_PREVIEW_SPACING_SVG,
          },
        ],
      });
      const [notePath] = fixture.notePaths;
      if (!notePath) {
        throw new Error('Expected catalog spacing note fixture');
      }
      await openAbsoluteNote(page, notePath);

      const catalogImage = page.locator(`${LIVE_EDITOR_SELECTOR} img[alt="catalog"]`).first();
      await expect(catalogImage).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => page.evaluate(() => {
        const image = document.querySelector<HTMLImageElement>(
          '.milkdown .ProseMirror:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"]) img[alt="catalog"]'
        );
        return {
          complete: image?.complete ?? false,
          loaded: Boolean(image?.complete && image.naturalHeight > 0 && image.naturalWidth > 0),
          naturalHeight: image?.naturalHeight ?? 0,
          naturalWidth: image?.naturalWidth ?? 0,
        };
      }), { timeout: 30_000 }).toMatchObject({
        complete: true,
        loaded: true,
      });
      const catalogImageSize = await page.evaluate(() => {
        const image = document.querySelector<HTMLImageElement>(
          '.milkdown .ProseMirror:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"]) img[alt="catalog"]'
        );
        return {
          naturalHeight: image?.naturalHeight ?? 0,
          naturalWidth: image?.naturalWidth ?? 0,
        };
      });
      expect(catalogImageSize.naturalHeight).toBeGreaterThan(0);
      expect(catalogImageSize.naturalWidth).toBeGreaterThan(0);

      const collectSpacingMetrics = async (rootSelector: string) => page.evaluate(({ rootSelector, targetText }) => {
        const root = document.querySelector<HTMLElement>(rootSelector);
        const image = root?.querySelector<HTMLImageElement>('img[alt="catalog"]') ?? null;
        const imageBlock = image?.closest<HTMLElement>('.image-block-container') ?? null;
        const mediaBlock = imageBlock?.closest<HTMLElement>('p')
          ?? image?.closest<HTMLElement>('[data-type="html-block"]')
          ?? image?.parentElement;
        const textParagraph = Array.from(root?.querySelectorAll<HTMLElement>('p') ?? [])
          .find((paragraph) => paragraph.textContent?.includes(targetText)) ?? null;
        const mediaRect = mediaBlock?.getBoundingClientRect();
        const textRect = textParagraph?.getBoundingClientRect();
        const mediaStyle = mediaBlock ? getComputedStyle(mediaBlock) : null;
        const textStyle = textParagraph ? getComputedStyle(textParagraph) : null;

        return {
          gap: mediaRect && textRect ? Math.round((textRect.top - mediaRect.bottom) * 10) / 10 : null,
          hasImageBlock: Boolean(imageBlock),
          hasMediaBlock: Boolean(mediaBlock),
          hasOverlay: root?.classList.contains('toolbar-applied-preview-overlay') ?? false,
          hasTextParagraph: Boolean(textParagraph),
          mediaClasses: mediaBlock?.className ?? null,
          mediaDisplay: mediaStyle?.display ?? null,
          mediaLineHeight: mediaStyle?.lineHeight ?? null,
          mediaMarginBottom: mediaStyle?.marginBottom ?? null,
          mediaStyleAttr: mediaBlock?.getAttribute('style') ?? null,
          mediaTag: mediaBlock?.tagName ?? null,
          textClasses: textParagraph?.className ?? null,
          textLineHeight: textStyle?.lineHeight ?? null,
          textMarginTop: textStyle?.marginTop ?? null,
          textStyleAttr: textParagraph?.getAttribute('style') ?? null,
        };
      }, { rootSelector, targetText: target });

      const liveSpacingBeforeHover = await collectSpacingMetrics(LIVE_EDITOR_SELECTOR);
      expect(liveSpacingBeforeHover.hasMediaBlock).toBe(true);
      expect(liveSpacingBeforeHover.hasTextParagraph).toBe(true);
      expect(liveSpacingBeforeHover.mediaClasses).toContain('editor-paragraph-has-image-block');
      expect(liveSpacingBeforeHover.gap).not.toBeNull();
      expect(liveSpacingBeforeHover.gap ?? 0).toBeGreaterThan(4);

      const expectGapSamples = async (
        rootSelector: string,
        expectedOverlay: boolean,
      ) => {
        for (let index = 0; index < 3; index += 1) {
          await waitForEditorAnimationFrame(page);
          const spacing = await collectSpacingMetrics(rootSelector);

          expect(spacing.hasOverlay).toBe(expectedOverlay);
          expect(spacing.hasMediaBlock).toBe(true);
          expect(spacing.hasTextParagraph).toBe(true);
          expect(spacing.mediaClasses).toContain('editor-paragraph-has-image-block');
          expect(spacing.gap).not.toBeNull();
          expect(Math.abs((spacing.gap ?? 0) - (liveSpacingBeforeHover.gap ?? 0))).toBeLessThanOrEqual(2);
        }
      };

      const expectPreviewCleared = async () => {
        await expect(page.locator(PREVIEW_OVERLAY_SELECTOR)).toHaveCount(0);
        await expect(page.locator(`${LIVE_EDITOR_SELECTOR}[data-toolbar-preview-hidden="true"]`)).toHaveCount(0);
        const restoredSpacing = await collectSpacingMetrics(LIVE_EDITOR_SELECTOR);
        expect(restoredSpacing.mediaClasses).toContain('editor-paragraph-has-image-block');
        expect(Math.abs((restoredSpacing.gap ?? 0) - (liveSpacingBeforeHover.gap ?? 0))).toBeLessThanOrEqual(2);
        expect(restoredSpacing.mediaLineHeight).toBe(liveSpacingBeforeHover.mediaLineHeight);
        expect(restoredSpacing.textLineHeight).toBe(liveSpacingBeforeHover.textLineHeight);
      };

      const expectAppliedPreviewGap = async (action: string) => {
        await dragSelectEditorText(page, target);
        const button = page.locator(`${TOOLBAR_SELECTOR} [data-action="${action}"]`).first();
        await expect(button).toBeVisible({ timeout: 5_000 });
        await button.hover();
        await expect(page.locator(PREVIEW_OVERLAY_SELECTOR)).toBeVisible({ timeout: 5_000 });
        await expectGapSamples(PREVIEW_OVERLAY_SELECTOR, true);
        await hideToolbar(page);
        await expectPreviewCleared();
      };

      await expectAppliedPreviewGap('bold');
      await expectAppliedPreviewGap('highlight');

      await dragSelectEditorText(page, target);
      await clickToolbarActionAndWaitForVisible(
        page,
        'color',
        '.color-picker [data-type="text"] .color-picker-grid .color-picker-item[data-color="#866ec6"]',
        'catalog text color preview swatch',
        target,
      );
      await hoverColorSwatch(
        page,
        'text',
        '.color-picker-grid .color-picker-item[data-color="#866ec6"]',
        'catalog text color preview swatch',
      );
      await expect(page.locator(PREVIEW_OVERLAY_SELECTOR)).toBeVisible({ timeout: 5_000 });
      await expectGapSamples(PREVIEW_OVERLAY_SELECTOR, true);
      await hideToolbar(page);
      await expectPreviewCleared();

      await dragSelectEditorText(page, target);
      await clickToolbarActionAndWaitForVisible(
        page,
        'color',
        '.color-picker [data-type="bg"] .color-picker-grid .color-picker-item[data-color="#fca9bd"]',
        'catalog background color preview swatch',
        target,
      );
      await hoverColorSwatch(
        page,
        'bg',
        '.color-picker-grid .color-picker-item[data-color="#fca9bd"]',
        'catalog background color preview swatch',
      );
      await expect(page.locator(PREVIEW_OVERLAY_SELECTOR)).toBeVisible({ timeout: 5_000 });
      await expectGapSamples(PREVIEW_OVERLAY_SELECTOR, true);
      await hideToolbar(page);
      await expectPreviewCleared();

      await dragSelectEditorText(page, target);
      await clickToolbarActionAndWaitForVisible(
        page,
        'alignment',
        '.alignment-dropdown [data-alignment="center"]',
        'catalog center alignment preview item',
        target,
      );
      await page.locator('.alignment-dropdown [data-alignment="center"]').first().hover();
      await expect(page.locator(PREVIEW_OVERLAY_SELECTOR)).toBeVisible({ timeout: 5_000 });
      await expectGapSamples(PREVIEW_OVERLAY_SELECTOR, true);
      await hideToolbar(page);
      await expectPreviewCleared();

      await dragSelectEditorText(page, target);
      const boldButton = page.locator(`${TOOLBAR_SELECTOR} [data-action="bold"]`).first();
      await expect(boldButton).toBeVisible({ timeout: 5_000 });
      await boldButton.hover();
      await expect(page.locator(PREVIEW_OVERLAY_SELECTOR)).toBeVisible({ timeout: 5_000 });
      await boldButton.click();
      await waitForEditorAnimationFrame(page);
      await expect(page.locator(PREVIEW_OVERLAY_SELECTOR)).toHaveCount(0);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} strong`, { hasText: target }).first()).toBeVisible({ timeout: 5_000 });

      const spacingAfterBoldApply = await collectSpacingMetrics(LIVE_EDITOR_SELECTOR);
      expect(spacingAfterBoldApply.mediaClasses).toContain('editor-paragraph-has-image-block');
      expect(Math.abs((spacingAfterBoldApply.gap ?? 0) - (liveSpacingBeforeHover.gap ?? 0))).toBeLessThanOrEqual(2);
      expect(spacingAfterBoldApply.mediaLineHeight).toBe(liveSpacingBeforeHover.mediaLineHeight);
      expect(spacingAfterBoldApply.textLineHeight).toBe(liveSpacingBeforeHover.textLineHeight);
      expect(spacingAfterBoldApply.mediaStyleAttr).toBe(liveSpacingBeforeHover.mediaStyleAttr);
      expect(spacingAfterBoldApply.textStyleAttr).toBe(liveSpacingBeforeHover.textStyleAttr);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps toolbar hover preview responsive in a large note', async () => {
    const { content, linkTarget, target } = createLargeToolbarPreviewMarkdown();
    expect(content.length).toBeGreaterThan(LARGE_PREVIEW_DOC_MIN_LENGTH);

    const { app, userDataRoot } = await launchIsolatedElectron('notes-floating-toolbar-large-preview');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      const opened = await openMarkdownFixture(page, {
        filename: 'floating-toolbar-large-preview.md',
        content,
      });

      await selectEditorText(page, target);
      const boldButton = page.locator(`${TOOLBAR_SELECTOR} [data-action="bold"]`).first();
      await expect(boldButton).toBeVisible({ timeout: 5_000 });
      const formatPreviewScrollLeft = await page.locator(NOTE_SCROLL_ROOT_SELECTOR).evaluate(
        (scrollRoot) => scrollRoot.scrollLeft
      );
      const formatPreviewEditorBox = await page.locator(LIVE_EDITOR_SELECTOR).boundingBox();
      expect(formatPreviewEditorBox, 'Expected large-note editor bounds').not.toBeNull();

      const framesPromise = collectPreviewFrameMetrics(page, 900);
      const hoverStartedAt = Date.now();
      await boldButton.hover();
      const hoverGestureMs = Date.now() - hoverStartedAt;
      const frameMetrics = await framesPromise;

      console.info('[notes-floating-toolbar-large-preview]', {
        contentLength: content.length,
        opened,
        hoverGestureMs,
        frameMetrics,
      });

      expect(hoverGestureMs).toBeLessThan(1_200);
      expect(frameMetrics.frameCount).toBeGreaterThan(5);
      expect(frameMetrics.maxFrameMs).toBeLessThan(350);
      expect(frameMetrics.previewOverlayCount).toBe(0);
      expect(frameMetrics.hiddenEditorCount).toBe(0);
      expect(frameMetrics.formatPreview).toBe('bold');
      expect(frameMetrics.formatPreviewMode).toBe('apply');
      expect(Number.parseInt(frameMetrics.selectedFontWeight ?? '', 10)).toBeGreaterThanOrEqual(600);

      for (const formatCase of [
        { action: 'italic', property: 'fontStyle', expected: 'italic' },
        { action: 'underline', property: 'textDecorationLine', expected: 'underline' },
        { action: 'strike', property: 'textDecorationLine', expected: 'line-through' },
        { action: 'code', property: 'fontFamily', expected: 'mono' },
        { action: 'highlight', property: 'backgroundColor', expected: 'visible-color' },
      ] as const) {
        await page.locator(`${TOOLBAR_SELECTOR} [data-action="${formatCase.action}"]`).first().hover();
        await expect.poll(() => page.evaluate(({ action, property, expected }) => {
          const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror[contenteditable="true"]');
          const overlay = editor?.querySelector<HTMLElement>('.editor-text-selection-overlay');
          if (editor?.getAttribute('data-toolbar-format-preview') !== action || !overlay) {
            return false;
          }
          const value = getComputedStyle(overlay)[property];
          if (expected === 'mono') {
            return /mono|consolas|menlo|courier/i.test(value);
          }
          if (expected === 'visible-color') {
            return value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent';
          }
          return value.includes(expected);
        }, formatCase), {
          message: `Expected visible ${formatCase.action} preview in a large note`,
        }).toBe(true);
      }
      await hideToolbar(page);
      await selectEditorText(page, linkTarget);
      await page.locator(`${TOOLBAR_SELECTOR} [data-action="link"]`).first().hover();
      await expect.poll(() => page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror[contenteditable="true"]');
        const overlay = editor?.querySelector<HTMLElement>('.editor-text-selection-overlay');
        if (
          editor?.getAttribute('data-toolbar-format-preview') !== 'link' ||
          editor.getAttribute('data-toolbar-format-preview-mode') !== 'remove' ||
          !overlay
        ) {
          return false;
        }
        const overlayStyle = getComputedStyle(overlay);
        return (
          overlayStyle.color === getComputedStyle(editor).color &&
          !overlayStyle.textDecorationLine.includes('underline')
        );
      }), {
        message: 'Expected visible unlink preview in a large note',
      }).toBe(true);
      await hideToolbar(page);
      await selectEditorText(page, target);
      await expect.poll(() => page.locator(NOTE_SCROLL_ROOT_SELECTOR).evaluate(
        (scrollRoot) => scrollRoot.scrollLeft
      )).toBe(formatPreviewScrollLeft);

      await clickToolbarActionAndWaitForVisible(
        page,
        'block',
        '.block-dropdown [data-block-type="heading2"]',
        'large-note heading preview item',
        target,
      );
      for (const blockCase of [
        { blockType: 'paragraph', selector: null },
        { blockType: 'heading1', selector: 'h1' },
        { blockType: 'heading2', selector: 'h2' },
        { blockType: 'heading3', selector: 'h3' },
        { blockType: 'heading4', selector: 'h4' },
        { blockType: 'heading5', selector: 'h5' },
        { blockType: 'heading6', selector: 'h6' },
        { blockType: 'blockquote', selector: 'blockquote' },
        { blockType: 'bulletList', selector: 'ul' },
        { blockType: 'orderedList', selector: 'ol' },
        { blockType: 'taskList', selector: 'li[data-item-type="task"]' },
        { blockType: 'codeBlock', selector: '.code-block-container' },
      ]) {
        await page.locator(`.block-dropdown [data-block-type="${blockCase.blockType}"]`).first().hover();
        await expect.poll(() => page.evaluate(({ editorSelector, previewSelector, targetText }) => {
          const editor = document.querySelector<HTMLElement>(editorSelector);
          const previewNodes = Array.from(
            editor?.querySelectorAll<HTMLElement>('[data-toolbar-block-preview-node="true"]') ?? []
          );
          return {
            hasAppliedOverlay: Boolean(document.querySelector('.toolbar-applied-preview-overlay')),
            hasExpectedStructure: previewSelector === null
              ? previewNodes.length === 0 && Array.from(editor?.querySelectorAll('p') ?? [])
                .some((node) => node.textContent?.includes(targetText))
              : previewNodes.some(
                (node) => node.matches(previewSelector) || Boolean(node.querySelector(previewSelector))
            ),
            previewBlockType: editor?.getAttribute('data-toolbar-block-preview') ?? null,
            previewContainsTarget: previewSelector === null
              ? Array.from(editor?.querySelectorAll('p') ?? [])
                .some((node) => node.textContent?.includes(targetText))
              : previewNodes
                .map((node) => node.textContent ?? '')
                .join('')
                .includes(targetText),
          };
        }, {
          editorSelector: LIVE_EDITOR_SELECTOR,
          previewSelector: blockCase.selector,
          targetText: target,
        }), {
          message: `Expected visible ${blockCase.blockType} preview in a large note`,
        }).toMatchObject({
          hasAppliedOverlay: false,
          hasExpectedStructure: true,
          previewBlockType: blockCase.blockType,
          previewContainsTarget: true,
        });
      }
      await expect.poll(() => page.locator(NOTE_SCROLL_ROOT_SELECTOR).evaluate(
        (scrollRoot) => scrollRoot.scrollLeft
      )).toBe(formatPreviewScrollLeft);
      await expect.poll(async () => (await page.locator(LIVE_EDITOR_SELECTOR).boundingBox())?.x ?? null, {
        message: 'Expected block hover previews to preserve the editor position',
      }).toBe(formatPreviewEditorBox!.x);
      await hideToolbar(page);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} [data-toolbar-block-preview-node="true"]`)).toHaveCount(0);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR}[data-toolbar-block-preview]`)).toHaveCount(0);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} p`, { hasText: target }).first()).toBeVisible({ timeout: 5_000 });
      await selectEditorText(page, target);

      await clickToolbarActionAndWaitForVisible(
        page,
        'alignment',
        '.alignment-dropdown [data-alignment="center"]',
        'large-note center alignment preview item',
        target,
      );
      const getLargeAlignmentPreviewState = () => page.evaluate(({ editorSelector, targetText }) => {
        const editor = document.querySelector<HTMLElement>(editorSelector);
        const block = Array.from(
          editor?.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6') ?? []
        ).find((candidate) => candidate.textContent?.includes(targetText)) ?? null;
        return {
          alignment: block ? getComputedStyle(block).textAlign : null,
          blockAlignment: block?.getAttribute('data-text-align') ?? null,
          hasAppliedOverlay: Boolean(document.querySelector('.toolbar-applied-preview-overlay')),
          hiddenClass: editor?.classList.contains('toolbar-selection-hidden-preview') ?? false,
          previewAlignment: editor?.getAttribute('data-toolbar-alignment-preview') ?? null,
        };
      }, { editorSelector: LIVE_EDITOR_SELECTOR, targetText: target });

      await page.locator('.alignment-dropdown [data-alignment="center"]').first().hover();
      await expect.poll(async () => (await getLargeAlignmentPreviewState()).alignment, {
        message: 'Expected visible center alignment preview in a large note',
      }).toBe('center');
      expect(await getLargeAlignmentPreviewState()).toMatchObject({
        alignment: 'center',
        blockAlignment: 'center',
        hasAppliedOverlay: false,
        hiddenClass: true,
        previewAlignment: 'center',
      });

      await page.locator('.alignment-dropdown [data-alignment="right"]').first().hover();
      await expect.poll(async () => (await getLargeAlignmentPreviewState()).alignment, {
        message: 'Expected visible right alignment preview in a large note',
      }).toBe('right');
      expect(await getLargeAlignmentPreviewState()).toMatchObject({
        alignment: 'right',
        blockAlignment: 'right',
        hasAppliedOverlay: false,
        hiddenClass: true,
        previewAlignment: 'right',
      });

      await page.locator('.alignment-dropdown [data-alignment="left"]').first().hover();
      await expect.poll(async () => {
        const alignment = (await getLargeAlignmentPreviewState()).alignment;
        return alignment === 'left' || alignment === 'start';
      }, {
        message: 'Expected visible left alignment preview in a large note',
      }).toBe(true);
      expect(await getLargeAlignmentPreviewState()).toMatchObject({
        blockAlignment: null,
        hasAppliedOverlay: false,
        hiddenClass: true,
        previewAlignment: 'left',
      });
      await expect.poll(() => page.locator(NOTE_SCROLL_ROOT_SELECTOR).evaluate(
        (scrollRoot) => scrollRoot.scrollLeft
      )).toBe(formatPreviewScrollLeft);
      await expect.poll(async () => (await page.locator(LIVE_EDITOR_SELECTOR).boundingBox())?.x ?? null, {
        message: 'Expected alignment hover preview to preserve the editor position',
      }).toBe(formatPreviewEditorBox!.x);

      await hideToolbar(page);
      await expect.poll(async () => await getLargeAlignmentPreviewState(), {
        message: 'Expected large-note alignment preview to restore the live paragraph',
      }).toMatchObject({
        blockAlignment: null,
        hasAppliedOverlay: false,
        hiddenClass: false,
        previewAlignment: null,
      });
      expect(['left', 'start']).toContain((await getLargeAlignmentPreviewState()).alignment);

      await selectEditorText(page, target);

      const largeBgSwatchSelector = '.color-picker-grid .color-picker-item[data-color="#fca9bd"]';
      await clickToolbarAction(page, 'color');
      const colorFramesPromise = collectPreviewFrameMetrics(page, 600);
      const bgHoverStartedAt = Date.now();
      const largeBgSwatchBox = await hoverColorSwatch(
        page,
        'bg',
        largeBgSwatchSelector,
        'large-note background color preview swatch',
      );
      const bgHoverGestureMs = Date.now() - bgHoverStartedAt;
      const colorFrameMetrics = await colorFramesPromise;
      const largeBgPreviewMetrics = await page.evaluate(({ editorSelector, targetText }) => {
        const editor = document.querySelector<HTMLElement>(editorSelector);
        const selectionOverlay = Array.from(
          editor?.querySelectorAll<HTMLElement>('.editor-text-selection-overlay') ?? []
        ).find((candidate) => candidate.textContent?.includes(targetText)) ?? null;
        const rect = selectionOverlay?.getBoundingClientRect();
        const style = selectionOverlay ? getComputedStyle(selectionOverlay) : null;

        return {
          colorPreviewMode: editor?.getAttribute('data-toolbar-color-preview') ?? null,
          hiddenClass: editor?.classList.contains('toolbar-selection-hidden-preview') ?? false,
          height: rect ? Math.round(rect.height * 10) / 10 : null,
          paddingBottom: style?.paddingBottom ?? null,
          paddingLeft: style?.paddingLeft ?? null,
          paddingRight: style?.paddingRight ?? null,
          paddingTop: style?.paddingTop ?? null,
          previewBgColor: style?.backgroundColor ?? null,
        };
      }, { editorSelector: LIVE_EDITOR_SELECTOR, targetText: target });

      console.info('[notes-floating-toolbar-large-bg-preview]', {
        bgHoverGestureMs,
        colorFrameMetrics,
        largeBgPreviewMetrics,
      });

      expect(bgHoverGestureMs).toBeLessThan(1_200);
      expect(colorFrameMetrics.frameCount).toBeGreaterThan(3);
      expect(colorFrameMetrics.maxFrameMs).toBeLessThan(650);
      expect(colorFrameMetrics.previewOverlayCount).toBe(0);
      expect(colorFrameMetrics.hiddenEditorCount).toBe(0);
      expect(largeBgPreviewMetrics).toMatchObject({
        colorPreviewMode: 'bg',
        hiddenClass: true,
        previewBgColor: 'rgb(252, 169, 189)',
      });
      expect(largeBgPreviewMetrics.height).not.toBeNull();
      await expect.poll(async () => (await page.locator(LIVE_EDITOR_SELECTOR).boundingBox())?.x ?? null, {
        message: 'Expected background hover preview to preserve the editor position',
      }).toBe(formatPreviewEditorBox!.x);

      await page.mouse.click(
        largeBgSwatchBox.x + largeBgSwatchBox.width / 2,
        largeBgSwatchBox.y + largeBgSwatchBox.height / 2,
      );
      await waitForEditorAnimationFrame(page);
      await expect(page.locator(`${LIVE_EDITOR_SELECTOR} mark[data-bg-color]`, { hasText: target }))
        .toBeVisible({ timeout: 5_000 });
      const largeAppliedBgMetrics = await page.evaluate(({ editorSelector, targetText }) => {
        const mark = Array.from(
          document.querySelectorAll<HTMLElement>(`${editorSelector} mark[data-bg-color]`)
        ).find((candidate) => candidate.textContent?.includes(targetText)) ?? null;
        const rect = mark?.getBoundingClientRect();
        const style = mark ? getComputedStyle(mark) : null;

        return {
          height: rect ? Math.round(rect.height * 10) / 10 : null,
          paddingBottom: style?.paddingBottom ?? null,
          paddingLeft: style?.paddingLeft ?? null,
          paddingRight: style?.paddingRight ?? null,
          paddingTop: style?.paddingTop ?? null,
          previewBgColor: style?.backgroundColor ?? null,
        };
      }, { editorSelector: LIVE_EDITOR_SELECTOR, targetText: target });
      expect(largeAppliedBgMetrics).toMatchObject({
        previewBgColor: 'rgb(252, 169, 189)',
      });
      expect(largeAppliedBgMetrics.height).not.toBeNull();
      const parseCssPx = (value: string | null): number | null => {
        if (!value) return null;
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const previewPaddingTop = parseCssPx(largeBgPreviewMetrics.paddingTop);
      const previewPaddingBottom = parseCssPx(largeBgPreviewMetrics.paddingBottom);
      const previewPaddingLeft = parseCssPx(largeBgPreviewMetrics.paddingLeft);
      const previewPaddingRight = parseCssPx(largeBgPreviewMetrics.paddingRight);
      const appliedPaddingTop = parseCssPx(largeAppliedBgMetrics.paddingTop);
      const appliedPaddingBottom = parseCssPx(largeAppliedBgMetrics.paddingBottom);
      const appliedPaddingLeft = parseCssPx(largeAppliedBgMetrics.paddingLeft);
      const appliedPaddingRight = parseCssPx(largeAppliedBgMetrics.paddingRight);
      expect(previewPaddingTop).not.toBeNull();
      expect(previewPaddingBottom).not.toBeNull();
      expect(previewPaddingLeft).not.toBeNull();
      expect(previewPaddingRight).not.toBeNull();
      expect(appliedPaddingTop).not.toBeNull();
      expect(appliedPaddingBottom).not.toBeNull();
      expect(appliedPaddingLeft).not.toBeNull();
      expect(appliedPaddingRight).not.toBeNull();
      expect(Math.abs((previewPaddingTop ?? 0) - (appliedPaddingTop ?? 0))).toBeLessThanOrEqual(0.25);
      expect(Math.abs((previewPaddingBottom ?? 0) - (appliedPaddingBottom ?? 0))).toBeLessThanOrEqual(0.25);
      expect(previewPaddingLeft).toBe(0);
      expect(previewPaddingRight).toBe(0);
      expect(appliedPaddingLeft).toBe(0);
      expect(appliedPaddingRight).toBe(0);
      expect(Math.abs((largeBgPreviewMetrics.height ?? 0) - (largeAppliedBgMetrics.height ?? 0)))
        .toBeLessThanOrEqual(2);
      const largeExistingBgClip = await getPreviewTargetClip(
        page,
        `${LIVE_EDITOR_SELECTOR} mark[data-bg-color]`,
        target,
      );
      const largeExistingBgPixelCount = await countPixelsNearColorInClip(
        page,
        largeExistingBgClip,
        { red: 252, green: 169, blue: 189 },
        20,
      );
      expect(largeExistingBgPixelCount).toBeGreaterThan(20);

      await dragSelectEditorText(page, target);
      await clickToolbarAction(page, 'color');
      const pointerNativeStateBeforeColorHover = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>(
          '.milkdown .ProseMirror:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"])'
        );
        return {
          pointerNative: editor?.classList.contains('editor-pointer-native-selection') ?? false,
          selectionOverlayCount: editor?.querySelectorAll('.editor-text-selection-overlay').length ?? 0,
        };
      });
      expect(pointerNativeStateBeforeColorHover).toMatchObject({
        pointerNative: true,
        selectionOverlayCount: 0,
      });
      await hoverColorSwatch(
        page,
        'text',
        '.color-picker-grid .color-picker-item[data-color="#866ec6"]',
        'large-note text color preview swatch',
      );
      await expect.poll(() => page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>(
          '.milkdown .ProseMirror:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"])'
        );
        return editor?.querySelectorAll('.editor-text-selection-overlay').length ?? 0;
      }), {
        message: 'Expected lightweight text color preview selection overlay',
      }).toBeGreaterThan(0);
      const largeColorPreviewState = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>(
          '.milkdown .ProseMirror:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"])'
        );
        const overlay = document.querySelector<HTMLElement>('.toolbar-applied-preview-overlay');
        const selectionOverlay = editor?.querySelector<HTMLElement>('.editor-text-selection-overlay');
        const selectedBgMark = selectionOverlay?.closest<HTMLElement>('mark[data-bg-color], span[data-bg-color]') ?? null;

        return {
          hasAppliedOverlay: Boolean(overlay),
          colorPreviewMode: editor?.getAttribute('data-toolbar-color-preview') ?? null,
          hiddenClass: editor?.classList.contains('toolbar-selection-hidden-preview') ?? false,
          removesCounterpart: editor?.getAttribute('data-toolbar-color-preview-removes-counterpart') ?? null,
          previewTextColor: editor?.style.getPropertyValue('--vlaina-toolbar-preview-text-color') ?? null,
          selectedBgMarkBgColor: selectedBgMark ? getComputedStyle(selectedBgMark).backgroundColor : null,
          selectedBgMarkBoxShadow: selectedBgMark ? getComputedStyle(selectedBgMark).boxShadow : null,
          selectionOverlayBgColor: selectionOverlay ? getComputedStyle(selectionOverlay).backgroundColor : null,
          selectionOverlayBoxShadow: selectionOverlay ? getComputedStyle(selectionOverlay).boxShadow : null,
          selectionOverlayColor: selectionOverlay ? getComputedStyle(selectionOverlay).color : null,
          selectionOverlayTextFillColor: selectionOverlay ? getComputedStyle(selectionOverlay).webkitTextFillColor : null,
        };
      });
      expect(largeColorPreviewState).toMatchObject({
        colorPreviewMode: 'text',
        hasAppliedOverlay: false,
        hiddenClass: true,
        previewTextColor: '#866ec6',
        removesCounterpart: 'true',
        selectedBgMarkBgColor: 'rgb(252, 169, 189)',
        selectionOverlayColor: 'rgb(134, 110, 198)',
        selectionOverlayTextFillColor: 'rgb(134, 110, 198)',
      });
      expect(largeColorPreviewState.selectedBgMarkBoxShadow).toBe('none');
      expect(largeColorPreviewState.selectionOverlayBoxShadow).toBe('none');
      expect(largeColorPreviewState.selectionOverlayBgColor).not.toBe('rgb(252, 169, 189)');
      expect(largeColorPreviewState.selectionOverlayBgColor).not.toBe('rgba(0, 0, 0, 0)');
      await waitForEditorAnimationFrame(page);
      const largeColorClip = await getPreviewTargetClip(
        page,
        `${LIVE_EDITOR_SELECTOR} .editor-text-selection-overlay`,
        target,
        0,
      );
      const largeBgPixelCountDuringTextPreview = await countPixelsNearColorInClip(
        page,
        largeColorClip,
        { red: 252, green: 169, blue: 189 },
        20,
      );
      expect(largeBgPixelCountDuringTextPreview).toBeLessThan(30);
      const largeTextColorPixelCount = await countPixelsNearColorInClip(
        page,
        largeColorClip,
        { red: 134, green: 110, blue: 198 },
        60,
      );
      expect(largeTextColorPixelCount).toBeGreaterThan(8);

      await hideToolbar(page);
      const previewStateAfterHide = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>(
          '.milkdown .ProseMirror:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"])'
        );
        return {
          colorPreviewMode: editor?.getAttribute('data-toolbar-color-preview') ?? null,
          hiddenClass: editor?.classList.contains('toolbar-selection-hidden-preview') ?? false,
          removesCounterpart: editor?.getAttribute('data-toolbar-color-preview-removes-counterpart') ?? null,
          previewTextColor: editor?.style.getPropertyValue('--vlaina-toolbar-preview-text-color') ?? null,
        };
      });
      expect(previewStateAfterHide).toMatchObject({
        colorPreviewMode: null,
        hiddenClass: false,
        removesCounterpart: null,
        previewTextColor: '',
      });
      await clickEditorBlankArea(page);
      await selectEditorText(page, target);
      await clickToolbarAction(page, 'bold');
      await expect.poll(() => editorTextHasMark(page, target, 'strong')).toBe(true);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
