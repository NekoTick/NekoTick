import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  BLOCK_CONTROLS_SELECTOR,
  EDITOR_SELECTOR,
  NOTE_IMAGE_BLOCK_SELECTOR,
  NOTE_IMAGE_CROPPER_TOOLBAR_SELECTOR,
  NOTE_IMAGE_TOOLBAR_SELECTOR,
  SELECTED_BLOCK_SELECTOR,
  cleanupIsolatedElectron,
  clearSelectedNoteBlocks,
  collectEditorDomMetrics,
  createNotesRootFilesFixture,
  getBlankAreaDragTarget,
  getOpenBridgePages,
  launchIsolatedElectron,
  measureRepeatedBlockScan,
  openAbsoluteNote,
  openMarkdownFixture,
  selectNoteBlocksByText,
} from './notesE2E';
import { moveMouseToBlockHandleGutter } from './notesBlockSelectionShared';

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const GITHUB_RAW_COVER_IMAGE_SRC =
  'https://raw.githubusercontent.com/521xueweihan/img_logo/master/logo/cover.jpg#w=72%25';

function createImageBlockMarkdown(): string {
  return [
    '# E2E Notes Image Block',
    '',
    'Paragraph before image sentinel for block selection.',
    '',
    `![Notes image block alt sentinel](${TINY_PNG_DATA_URL} "Notes image block title")`,
    '',
    'Paragraph after image sentinel for drag selection.',
    '',
    '- Image block list item alpha',
    '- Image block list item beta',
    '',
    'Final image block sentinel.',
    '',
  ].join('\n');
}

function createHtmlImageBlockMarkdown(): string {
  return [
    '# E2E Notes HTML Image Block',
    '',
    'Paragraph before image sentinel for block selection.',
    '',
    `<img src="${TINY_PNG_DATA_URL}" alt="Notes html image block alt sentinel" width="72%" />`,
    '',
    'Paragraph after image sentinel for drag selection.',
    '',
    'Final image block sentinel.',
    '',
  ].join('\n');
}

function createRemoteCoverImageMarkdown(): string {
  return [
    '# E2E Remote Cover Image Copy',
    '',
    'Paragraph before remote cover image.',
    '',
    `<img src="${GITHUB_RAW_COVER_IMAGE_SRC}" alt="cover" width="72%" data-vlaina-crop="37.891280,36.646501,35.700407,35.697249,2.349414" />`,
    '',
    'Paragraph after remote cover image.',
    '',
  ].join('\n');
}

function createStackedLocalImagesMarkdown(): string {
  return [
    '# E2E Stacked Local Images',
    '',
    'Before local images sentinel.',
    '',
    '![Upper local image](./assets/upper.svg)',
    '![Lower local image](./assets/lower.svg)',
    '',
    'After local images sentinel.',
    '',
  ].join('\n');
}

function createLocalSvg(fill: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">',
    `<rect width="160" height="90" rx="8" fill="${fill}" />`,
    '<circle cx="120" cy="28" r="18" fill="rgba(255,255,255,0.72)" />',
    '</svg>',
  ].join('');
}

function createSizedLocalSvg(fill: string, width: number, height: number): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" rx="18" fill="${fill}" />`,
    `<circle cx="${Math.round(width * 0.74)}" cy="${Math.round(height * 0.32)}" r="${Math.round(height * 0.16)}" fill="rgba(255,255,255,0.72)" />`,
    '</svg>',
  ].join('');
}

const IMAGE_AUDIT_IMAGES = [
  { src: './assets/audit-0.svg', alt: 'Audit adjacent upper' },
  { src: './assets/audit-1.svg', alt: 'Audit adjacent lower' },
  { src: './assets/shared.svg', alt: 'Audit duplicate first' },
  { src: './assets/shared.svg', alt: 'Audit duplicate second' },
  { src: './assets/audit-2.svg', alt: 'Audit html width' },
  { src: './assets/audit-3.svg', alt: 'Audit markdown title' },
  { src: './assets/audit-4.svg', alt: 'Audit standalone four' },
  { src: './assets/audit-5.svg', alt: 'Audit standalone five' },
  { src: './assets/audit-6.svg', alt: 'Audit standalone six' },
  { src: './assets/audit-7.svg', alt: 'Audit standalone seven' },
] as const;

function createImageInteractionAuditMarkdown(): string {
  return [
    '# E2E Image Interaction Audit',
    '',
    'Before image audit sentinel.',
    '',
    '![Audit adjacent upper](./assets/audit-0.svg)',
    '![Audit adjacent lower](./assets/audit-1.svg)',
    '',
    'Paragraph between adjacent and duplicate images.',
    '',
    '![Audit duplicate first](./assets/shared.svg)',
    '![Audit duplicate second](./assets/shared.svg)',
    '',
    '<img src="./assets/audit-2.svg" alt="Audit html width" width="58%" align="right" />',
    '',
    '![Audit markdown title](./assets/audit-3.svg "Audit title")',
    '',
    '![Audit standalone four](./assets/audit-4.svg)',
    '',
    '![Audit standalone five](./assets/audit-5.svg)',
    '',
    '![Audit standalone six](./assets/audit-6.svg)',
    '',
    '![Audit standalone seven](./assets/audit-7.svg)',
    '',
    'After image audit sentinel.',
    '',
  ].join('\n');
}

async function getImageBlockDiagnostics(page: Page) {
  return page.evaluate(() => {
    const block = document.querySelector<HTMLElement>('.milkdown .ProseMirror .image-block-container');
    const image = block?.querySelector<HTMLImageElement>('img');
    const toolbar = block?.querySelector<HTMLElement>('.image-toolbar');
    const cropperToolbar = block?.querySelector<HTMLElement>('.image-cropper-toolbar');
    const blockRect = block?.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    const toolbarStyle = toolbar ? window.getComputedStyle(toolbar) : null;
    const cropperToolbarStyle = cropperToolbar ? window.getComputedStyle(cropperToolbar) : null;

    return {
      hasBlock: Boolean(block),
      blockWidth: Math.round(blockRect?.width ?? 0),
      blockHeight: Math.round(blockRect?.height ?? 0),
      hasImage: Boolean(image),
      imageComplete: image?.complete ?? false,
      imageWidth: Math.round(imageRect?.width ?? 0),
      imageHeight: Math.round(imageRect?.height ?? 0),
      imageSrc: image?.getAttribute('src') ?? '',
      toolbarButtonCount: toolbar?.querySelectorAll('button').length ?? 0,
      toolbarOpacity: toolbarStyle?.opacity ?? null,
      toolbarPointerEvents: toolbarStyle?.pointerEvents ?? null,
      cropperToolbarButtonCount: cropperToolbar?.querySelectorAll('button').length ?? 0,
      cropperToolbarOpacity: cropperToolbarStyle?.opacity ?? null,
      cropperToolbarPointerEvents: cropperToolbarStyle?.pointerEvents ?? null,
      cropperImageCount: block?.querySelectorAll('.reactEasyCrop_Image').length ?? 0,
      sourceFallbackCount: document.querySelectorAll('[data-note-source-fallback="true"]').length,
      selectedCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
    };
  });
}

async function getAllImageBlockDiagnostics(page: Page) {
  return page.evaluate(() => Array.from(
    document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror .image-block-container')
  ).map((block) => {
    const image = block.querySelector<HTMLImageElement>('img');
    const blockRect = block.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    const blockStyle = window.getComputedStyle(block);
    const imageStyle = image ? window.getComputedStyle(image) : null;

    return {
      dataSrc: block.dataset.src ?? block.getAttribute('src') ?? '',
      dataAlt: block.dataset.alt ?? '',
      dataAlign: block.dataset.align ?? block.getAttribute('align') ?? '',
      dataWidth: block.dataset.width ?? block.getAttribute('width') ?? '',
      hasImage: Boolean(image),
      imageComplete: image?.complete ?? false,
      blockWidth: Math.round(blockRect.width),
      blockHeight: Math.round(blockRect.height),
      imageWidth: Math.round(imageRect?.width ?? 0),
      imageHeight: Math.round(imageRect?.height ?? 0),
      blockDisplay: blockStyle.display,
      blockVisibility: blockStyle.visibility,
      imageDisplay: imageStyle?.display ?? null,
      imageVisibility: imageStyle?.visibility ?? null,
      imageOpacity: imageStyle?.opacity ?? null,
    };
  }));
}

async function getEditorBlankPoint(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    if (!editor) return null;

    const editorRect = editor.getBoundingClientRect();
    const visibleMinY = Math.max(Math.ceil(editorRect.top + 12), 12);
    const visibleMaxY = Math.min(Math.floor(editorRect.bottom - 12), window.innerHeight - 12);
    const visibleMinX = Math.max(Math.ceil(editorRect.left + 24), 12);
    const visibleMaxX = Math.min(Math.floor(editorRect.right - 24), window.innerWidth - 12);

    for (let y = visibleMinY; y <= visibleMaxY; y += 16) {
      for (let x = visibleMinX; x <= visibleMaxX; x += 32) {
        if (document.elementFromPoint(x, y) === editor) {
          return { x, y };
        }
      }
    }

    const lastChild = Array.from(editor.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .at(-1);
    const lastRect = lastChild?.getBoundingClientRect();
    const minY = Math.ceil((lastRect?.bottom ?? editorRect.top) + 12);
    const maxY = Math.floor(editorRect.bottom - 12);
    const minX = Math.ceil(editorRect.left + 24);
    const maxX = Math.floor(editorRect.right - 24);

    for (let y = minY; y <= maxY; y += 12) {
      for (let x = minX; x <= maxX; x += 24) {
        if (document.elementFromPoint(x, y) === editor) {
          return { x, y };
        }
      }
    }

    return null;
  });
}

async function expectImageBlocksStable(page: Page, expectedSources: readonly string[]) {
  const diagnostics = await getAllImageBlockDiagnostics(page);
  expect(diagnostics.map((item) => item.dataSrc)).toEqual(expectedSources);
  expect(diagnostics).toHaveLength(expectedSources.length);
  for (const item of diagnostics) {
    expect(item.blockDisplay, JSON.stringify(item)).toBe('block');
    expect(item.blockVisibility, JSON.stringify(item)).toBe('visible');
    expect(item.blockWidth, JSON.stringify(item)).toBeGreaterThan(0);
    expect(item.blockHeight, JSON.stringify(item)).toBeGreaterThan(0);
    if (item.hasImage) {
      expect(item.imageVisibility, JSON.stringify(item)).toBe('visible');
      expect(item.imageOpacity, JSON.stringify(item)).not.toBe('0');
    }
  }
  await expect(page.locator('[data-note-source-fallback="true"]')).toHaveCount(0);
}

async function waitForImageBlockReady(imageBlock: Locator, label = 'image block') {
  await expect.poll(async () => {
    const diagnostics = await imageBlock.evaluate((block) => {
      const image = block.querySelector<HTMLImageElement>('img');
      const blockRect = block.getBoundingClientRect();
      const imageRect = image?.getBoundingClientRect();
      const parent = block.parentElement;
      const parentRect = parent?.getBoundingClientRect();
      const parentStyle = parent ? window.getComputedStyle(parent) : null;
      const selectionWrapper = block.querySelector<HTMLElement>('[data-image-selection-wrapper="true"]');
      const selectionWrapperRect = selectionWrapper?.getBoundingClientRect();
      const imageContainer = selectionWrapper?.querySelector<HTMLElement>(':scope > div');
      const imageContainerRect = imageContainer?.getBoundingClientRect();
      const imageContainerStyle = imageContainer ? window.getComputedStyle(imageContainer) : null;
      const blockStyle = window.getComputedStyle(block);
      const imageStyle = image ? window.getComputedStyle(image) : null;

      return {
        dataSrc: block.dataset.src ?? block.getAttribute('src') ?? '',
        dataAlt: block.dataset.alt ?? '',
        dataAlign: block.dataset.align ?? block.getAttribute('align') ?? '',
        dataWidth: block.dataset.width ?? block.getAttribute('width') ?? '',
        hasImage: Boolean(image),
        imageComplete: image?.complete ?? false,
        blockWidth: Math.round(blockRect.width),
        blockHeight: Math.round(blockRect.height),
        blockTop: Math.round(blockRect.top),
        blockBottom: Math.round(blockRect.bottom),
        parentTag: parent?.tagName ?? null,
        parentClassName: parent?.className ?? null,
        parentWidth: Math.round(parentRect?.width ?? 0),
        parentHeight: Math.round(parentRect?.height ?? 0),
        parentTop: Math.round(parentRect?.top ?? 0),
        parentBottom: Math.round(parentRect?.bottom ?? 0),
        parentDisplay: parentStyle?.display ?? null,
        parentVisibility: parentStyle?.visibility ?? null,
        parentContentVisibility: parentStyle?.contentVisibility ?? null,
        selectionWrapperWidth: Math.round(selectionWrapperRect?.width ?? 0),
        selectionWrapperHeight: Math.round(selectionWrapperRect?.height ?? 0),
        imageContainerWidth: Math.round(imageContainerRect?.width ?? 0),
        imageContainerHeight: Math.round(imageContainerRect?.height ?? 0),
        imageContainerStyleWidth: imageContainerStyle?.width ?? null,
        imageContainerStyleMinHeight: imageContainerStyle?.minHeight ?? null,
        imageContainerStyleAspectRatio: imageContainerStyle?.aspectRatio ?? null,
        imageWidth: Math.round(imageRect?.width ?? 0),
        imageHeight: Math.round(imageRect?.height ?? 0),
        imageTop: Math.round(imageRect?.top ?? 0),
        imageBottom: Math.round(imageRect?.bottom ?? 0),
        blockDisplay: blockStyle.display,
        blockVisibility: blockStyle.visibility,
        blockContentVisibility: blockStyle.contentVisibility,
        imageVisibility: imageStyle?.visibility ?? null,
        imageOpacity: imageStyle?.opacity ?? null,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY),
        ready: Boolean(image) &&
          Boolean(image?.complete) &&
          blockStyle.display === 'block' &&
          blockStyle.visibility === 'visible' &&
          imageStyle?.visibility === 'visible' &&
          imageStyle?.opacity !== '0' &&
          Math.round(blockRect.width) > 0 &&
          Math.round(blockRect.height) > 0 &&
          Math.round(imageRect?.width ?? 0) > 0 &&
          Math.round(imageRect?.height ?? 0) > 0,
      };
    });

    return JSON.stringify(diagnostics, null, 2);
  }, {
    timeout: 30_000,
    message: `Expected ${label} to render a complete visible image with non-zero layout`,
  }).toContain('"ready": true');
}

async function scrollImageBlockIntoView(imageBlock: Locator) {
  await imageBlock.evaluate(async (block) => {
    block.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function hoverImageBlockContent(imageBlock: Locator) {
  const imageContent = imageBlock.locator('[data-image-selection-wrapper="true"] > div').first();
  await expect(imageContent).toBeVisible({ timeout: 10_000 });
  await imageContent.hover();
}

async function clickImageBlockContent(imageBlock: Locator) {
  const imageContent = imageBlock.locator('[data-image-selection-wrapper="true"] > div').first();
  await expect(imageContent).toBeVisible({ timeout: 10_000 });
  await imageContent.click();
}

async function getImageBlockLayoutMetrics(imageBlock: Locator) {
  return imageBlock.evaluate((block) => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    const imageContainer = block
      .querySelector<HTMLElement>('[data-image-selection-wrapper="true"] > div');
    const image = block.querySelector<HTMLImageElement>('img');
    const editorRect = editor?.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const imageContainerRect = imageContainer?.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();

    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      editorWidth: Math.round(editorRect?.width ?? 0),
      blockWidth: Math.round(blockRect.width),
      imageContainerWidth: Math.round(imageContainerRect?.width ?? 0),
      imageWidth: Math.round(imageRect?.width ?? 0),
    };
  });
}

async function waitForToolbarInteractive(page: Page) {
  await expect.poll(async () => {
    const diagnostics = await getImageBlockDiagnostics(page);
    return {
      buttonCount: diagnostics.toolbarButtonCount,
      pointerEvents: diagnostics.toolbarPointerEvents,
      opacity: Number(diagnostics.toolbarOpacity ?? 0),
    };
  }, { timeout: 10_000 }).toMatchObject({
    buttonCount: expect.any(Number),
    pointerEvents: 'auto',
    opacity: 1,
  });
}

async function waitForImageToolbarInteractive(imageBlock: Locator) {
  await expect.poll(async () => imageBlock.locator('.image-toolbar').evaluate((toolbar) => {
    const style = window.getComputedStyle(toolbar);
    return {
      buttonCount: toolbar.querySelectorAll('button').length,
      opacity: Number(style.opacity),
      pointerEvents: style.pointerEvents,
    };
  }), { timeout: 10_000 }).toMatchObject({
    buttonCount: expect.any(Number),
    opacity: 1,
    pointerEvents: 'auto',
  });
}

async function waitForImageCropperToolbarInteractive(imageBlock: Locator) {
  await expect.poll(async () => imageBlock.locator('.image-cropper-toolbar').evaluate((toolbar) => {
    const style = window.getComputedStyle(toolbar);
    return {
      buttonCount: toolbar.querySelectorAll('button').length,
      opacity: Number(style.opacity),
      pointerEvents: style.pointerEvents,
    };
  }), { timeout: 10_000 }).toMatchObject({
    buttonCount: expect.any(Number),
    opacity: 1,
    pointerEvents: 'auto',
  });
}

async function waitForCropperToolbarInteractive(page: Page) {
  await expect.poll(async () => {
    const diagnostics = await getImageBlockDiagnostics(page);
    return {
      buttonCount: diagnostics.cropperToolbarButtonCount,
      pointerEvents: diagnostics.cropperToolbarPointerEvents,
      opacity: Number(diagnostics.cropperToolbarOpacity ?? 0),
    };
  }, { timeout: 10_000 }).toMatchObject({
    buttonCount: expect.any(Number),
    pointerEvents: 'auto',
    opacity: 1,
  });
}

test.describe('notes image block interaction', () => {
  test.setTimeout(120_000);

  test('preloads an offscreen image in a lazy-layout note before scrolling to it', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-lazy-layout-image-preload');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 720 });
      const imageAlt = 'Lazy layout offscreen image sentinel';
      const content = [
        '# Lazy layout image preload',
        '',
        ...Array.from(
          { length: 120 },
          (_, index) => `Offscreen spacing paragraph ${index + 1}. ${'Context '.repeat(12)}`,
        ),
        '',
        `![${imageAlt}](${TINY_PNG_DATA_URL})`,
        '',
        ...Array.from({ length: 4 }, (_, index) => [
          '```mermaid',
          'flowchart TD',
          `  A${index} --> B${index}`,
          '```',
        ].join('\n')),
      ].join('\n\n');

      await openMarkdownFixture(page, {
        filename: 'lazy-layout-image-preload.md',
        content,
      });

      const editorShell = page.locator('.milkdown-editor');
      await expect(editorShell).toHaveAttribute('data-note-lazy-block-visibility', 'true');
      const imageBlock = page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-alt="${imageAlt}"]`);
      await expect(imageBlock).toHaveCount(1);
      const initialGeometry = await imageBlock.evaluate((element) => {
        const scrollRoot = element.closest<HTMLElement>('[data-note-scroll-root="true"]');
        const elementRect = element.getBoundingClientRect();
        const scrollRect = scrollRoot?.getBoundingClientRect();
        return {
          distanceBelowViewport: scrollRect ? elementRect.top - scrollRect.bottom : 0,
          scrollTop: scrollRoot?.scrollTop ?? -1,
        };
      });
      expect(initialGeometry.scrollTop).toBe(0);
      expect(initialGeometry.distanceBelowViewport).toBeGreaterThan(900);

      await expect(imageBlock.locator('[data-testid="deferred-image-placeholder"]')).toHaveCount(0);
      await expect(imageBlock.locator('img')).toHaveAttribute('src', TINY_PNG_DATA_URL);
      expect(await page.locator('[data-note-scroll-root="true"]').evaluate((element) => element.scrollTop))
        .toBe(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('copies a remote HTML image with presentation fragment as an image', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-remote-image-copy');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      await openMarkdownFixture(page, {
        filename: 'notes-remote-cover-copy.md',
        content: createRemoteCoverImageMarkdown(),
      });

      const imageBlock = page.locator(NOTE_IMAGE_BLOCK_SELECTOR).first();
      await expect(imageBlock).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => getImageBlockDiagnostics(page), { timeout: 30_000 }).toMatchObject({
        hasBlock: true,
        hasImage: true,
        imageComplete: true,
        sourceFallbackCount: 0,
      });

      await hoverImageBlockContent(imageBlock);
      await waitForToolbarInteractive(page);
      await app.evaluate(({ clipboard }) => {
        clipboard.write({
          text: 'https://example.test/stale-image-source',
          html: '<a href="https://example.test/stale-image-source">stale image source</a>',
        });
      });
      await page.locator(`${NOTE_IMAGE_TOOLBAR_SELECTOR} [data-image-toolbar-action="copy"]`).click();

      await expect.poll(async () => app.evaluate(({ clipboard }) => {
        const image = clipboard.readImage();
        return image.isEmpty() ? null : image.getSize();
      }), {
        timeout: 10_000,
        message: 'Expected remote cover copy to place an image on the desktop clipboard',
      }).toMatchObject({
        width: expect.any(Number),
        height: expect.any(Number),
      });
      expect(await app.evaluate(({ clipboard }) => ({
        html: clipboard.readHTML(),
        text: clipboard.readText(),
      }))).toEqual({ html: '', text: '' });

      await app.evaluate(({ clipboard }) => {
        clipboard.clear();
      });
      await clickImageBlockContent(imageBlock);
      const viewer = page.locator('[role="dialog"][data-chat-image-viewer-surface="true"]');
      await expect(viewer).toBeVisible({ timeout: 10_000 });
      await viewer.locator('[data-action="copy"]').click();

      await expect.poll(async () => app.evaluate(({ clipboard }) => {
        const image = clipboard.readImage();
        return image.isEmpty() ? null : image.getSize();
      }), {
        timeout: 10_000,
        message: 'Expected remote cover viewer copy to place an image on the desktop clipboard',
      }).toMatchObject({
        width: expect.any(Number),
        height: expect.any(Number),
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('renders image blocks, opens crop controls, and keeps block selection usable', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-image-block-interaction');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      const opened = await openMarkdownFixture(page, {
        filename: 'notes-image-block-e2e.md',
        content: createImageBlockMarkdown(),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Paragraph before image sentinel', {
        timeout: 30_000,
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Paragraph after image sentinel');
      const imageBlock = page.locator(NOTE_IMAGE_BLOCK_SELECTOR).first();
      await expect(imageBlock).toBeVisible({ timeout: 30_000 });

      await expect.poll(() => getImageBlockDiagnostics(page), { timeout: 30_000 }).toMatchObject({
        hasBlock: true,
        hasImage: true,
        imageComplete: true,
        sourceFallbackCount: 0,
      });

      const initialDiagnostics = await getImageBlockDiagnostics(page);
      const initialDomMetrics = await collectEditorDomMetrics(page);
      expect(initialDiagnostics.blockWidth).toBeGreaterThan(0);
      expect(initialDiagnostics.blockHeight).toBeGreaterThan(0);
      expect(initialDiagnostics.imageSrc).toContain(TINY_PNG_DATA_URL);
      expect(initialDiagnostics.toolbarButtonCount).toBeGreaterThanOrEqual(7);
      expect(initialDiagnostics.cropperImageCount).toBeGreaterThanOrEqual(1);
      expect(initialDomMetrics.countsBySelector.images).toBeGreaterThanOrEqual(1);
      expect(initialDomMetrics.countsBySelector.sourceFallback).toBe(0);

      await hoverImageBlockContent(imageBlock);
      await waitForToolbarInteractive(page);

      const cropOpenStartedAt = Date.now();
      await page.locator(`${NOTE_IMAGE_TOOLBAR_SELECTOR} button`).nth(3).click();
      await waitForCropperToolbarInteractive(page);
      const cropOpenMs = Date.now() - cropOpenStartedAt;

      const cropperDiagnostics = await getImageBlockDiagnostics(page);
      expect(cropperDiagnostics.cropperToolbarButtonCount).toBeGreaterThanOrEqual(2);
      expect(cropperDiagnostics.cropperImageCount).toBeGreaterThanOrEqual(1);

      await page.locator(`${NOTE_IMAGE_CROPPER_TOOLBAR_SELECTOR} button`).first().click();
      await expect.poll(async () => {
        const diagnostics = await getImageBlockDiagnostics(page);
        return diagnostics.cropperToolbarPointerEvents;
      }, { timeout: 10_000 }).toBe('none');

      const selectedCount = await selectNoteBlocksByText(page, [
        'Paragraph before image sentinel',
        'Paragraph after image sentinel',
        'Final image block sentinel',
      ]);
      expect(selectedCount).toBe(3);
      await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(3);

      const blockScanMetrics = await measureRepeatedBlockScan(page, 16);
      expect(blockScanMetrics.blockCount).toBeGreaterThanOrEqual(6);
      expect(blockScanMetrics.p95Ms).toBeLessThan(250);

      await clearSelectedNoteBlocks(page);
      const dragTarget = await getBlankAreaDragTarget(page, 'Paragraph after image sentinel');
      expect(dragTarget).not.toBeNull();

      const dragStartedAt = Date.now();
      await page.mouse.move(dragTarget!.startX, dragTarget!.startY);
      await page.mouse.down();
      await page.mouse.move(dragTarget!.endX, dragTarget!.endY, { steps: 8 });
      await page.mouse.up();
      const dragMs = Date.now() - dragStartedAt;

      await expect(page.locator(SELECTED_BLOCK_SELECTOR).first()).toBeVisible({ timeout: 10_000 });
      const finalDiagnostics = await getImageBlockDiagnostics(page);
      expect(finalDiagnostics.selectedCount).toBeGreaterThan(0);
      expect(finalDiagnostics.sourceFallbackCount).toBe(0);

      console.info('[notes-image-block-interaction]', {
        opened,
        initialDiagnostics,
        cropOpenMs,
        blockScanMetrics,
        dragMs,
        finalDiagnostics,
      });

      expect(cropOpenMs).toBeLessThan(5_000);
      expect(dragMs).toBeLessThan(5_000);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps immediate typing outside an image dragged to the document end', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-image-block-drag-immediate-typing');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'image-block-drag-immediate-typing',
        files: [
          { filename: 'drag-image.md', content: createImageBlockMarkdown() },
          { filename: 'other.md', content: '# Other note' },
        ],
      });
      const notePath = fixture.notePaths[0]!;
      const typedText = 'Immediate typing after dragged image';

      await openAbsoluteNote(page, notePath);
      const imageBlock = page.locator(NOTE_IMAGE_BLOCK_SELECTOR).first();
      await waitForImageBlockReady(imageBlock, 'dragged image');
      const selectionResult = await page.evaluate(async () => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          className?: string;
          dataset?: Record<string, string>;
        }>;
        const index = blocks.findIndex((block) =>
          String(block.className ?? '').includes('editor-paragraph-has-image-block')
          || String(block.className ?? '').includes('image-block-container')
          || block.dataset?.alt === 'Notes image block alt sentinel'
        );
        const count = index >= 0
          ? await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([index])
          : 0;
        return { blocks, count, index };
      });
      expect(selectionResult.count, JSON.stringify(selectionResult.blocks)).toBe(1);

      await moveMouseToBlockHandleGutter(page, imageBlock, { assertCentered: false });
      await expect(page.locator(BLOCK_CONTROLS_SELECTOR)).toBeVisible();
      const handleBox = await page.locator('.editor-block-control-handle').boundingBox();
      const targetBox = await page.locator(`${EDITOR_SELECTOR} p`, {
        hasText: 'Final image block sentinel.',
      }).boundingBox();
      if (!handleBox || !targetBox) {
        throw new Error('Could not resolve image drag geometry');
      }

      const startX = handleBox.x + handleBox.width / 2;
      const startY = handleBox.y + handleBox.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 28, startY, { steps: 4 });
      await expect.poll(async () => page.evaluate(() =>
        document.body.classList.contains('editor-block-drag-active')
      )).toBe(true);
      await page.mouse.move(
        targetBox.x + Math.min(40, targetBox.width / 3),
        targetBox.y + targetBox.height * 0.8,
        { steps: 12 },
      );
      await expect(page.locator('.editor-block-drop-indicator.visible')).toBeVisible();
      await page.mouse.up();
      await expect.poll(async () => page.evaluate(() =>
        document.body.classList.contains('editor-block-drag-active')
      )).toBe(false);

      await page.keyboard.type(typedText);
      const typedParagraph = page.locator(`${EDITOR_SELECTOR} p`, { hasText: typedText });
      await expect(typedParagraph).toBeVisible();
      const typedMetrics = await typedParagraph.evaluate((paragraph, expectedText) => {
        const hasImage = Boolean(paragraph.querySelector('.image-block-container, [data-type="image"]'));
        const textNode = Array.from(paragraph.childNodes).find((node) =>
          node.nodeType === Node.TEXT_NODE && node.textContent?.includes(expectedText)
        );
        const range = textNode ? document.createRange() : null;
        if (range && textNode) range.selectNodeContents(textNode);
        const rect = range?.getBoundingClientRect();
        return { hasImage, height: rect?.height ?? 0, width: rect?.width ?? 0 };
      }, typedText);
      expect(typedMetrics.hasImage).toBe(false);
      expect(typedMetrics.height).toBeGreaterThan(0);
      expect(typedMetrics.width).toBeGreaterThan(0);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), notePath);
      const savedLines = saved.split('\n');
      const imageLineIndex = savedLines.findIndex((line) => line.includes('Notes image block alt sentinel'));
      expect(savedLines.slice(imageLineIndex, imageLineIndex + 3)).toEqual([
        expect.stringContaining('Notes image block alt sentinel'),
        '',
        typedText,
      ]);
      expect(saved.indexOf('Final image block sentinel.')).toBeLessThan(
        saved.indexOf('Notes image block alt sentinel'),
      );

      await openAbsoluteNote(page, fixture.notePaths[1]!);
      await openAbsoluteNote(page, notePath);
      await expect(page.locator(NOTE_IMAGE_BLOCK_SELECTOR)).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: typedText })).toBeVisible();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps the upper local image visible after editing and blurring the lower caption', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-stacked-local-image-caption-blur');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { notePaths } = await createNotesRootFilesFixture(page, {
        name: 'stacked-local-images',
        files: [
          {
            filename: 'stacked-local-images.md',
            content: createStackedLocalImagesMarkdown(),
          },
          {
            filename: 'assets/upper.svg',
            content: createLocalSvg('#4f46e5'),
          },
          {
            filename: 'assets/lower.svg',
            content: createLocalSvg('#0f766e'),
          },
        ],
      });

      await openAbsoluteNote(page, notePaths[0]!);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('After local images sentinel.', {
        timeout: 30_000,
      });

      await expect.poll(() => getAllImageBlockDiagnostics(page), { timeout: 30_000 }).toEqual([
        expect.objectContaining({
          dataSrc: './assets/upper.svg',
          dataAlt: 'Upper local image',
          hasImage: true,
          imageComplete: true,
          blockDisplay: 'block',
          blockVisibility: 'visible',
          imageDisplay: 'block',
          imageVisibility: 'visible',
        }),
        expect.objectContaining({
          dataSrc: './assets/lower.svg',
          dataAlt: 'Lower local image',
          hasImage: true,
          imageComplete: true,
          blockDisplay: 'block',
          blockVisibility: 'visible',
          imageDisplay: 'block',
          imageVisibility: 'visible',
        }),
      ]);

      const lowerImageBlock = page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-src="./assets/lower.svg"]`);
      await hoverImageBlockContent(lowerImageBlock);
      const captionButton = lowerImageBlock.locator('.image-caption-btn');
      await expect(captionButton).toBeVisible({ timeout: 10_000 });
      await captionButton.click();

      const captionInput = lowerImageBlock.locator('.image-caption-toolbar input');
      await expect(captionInput).toBeVisible({ timeout: 10_000 });
      await expect(captionInput).toHaveValue('Lower local image');

      const blankPoint = await getEditorBlankPoint(page);
      expect(blankPoint).not.toBeNull();
      await page.mouse.click(blankPoint!.x, blankPoint!.y);
      await expect(captionInput).toHaveCount(0);

      const diagnostics = await getAllImageBlockDiagnostics(page);
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics[0]).toMatchObject({
        dataSrc: './assets/upper.svg',
        dataAlt: 'Upper local image',
        hasImage: true,
        imageComplete: true,
        blockDisplay: 'block',
        blockVisibility: 'visible',
        imageDisplay: 'block',
        imageVisibility: 'visible',
      });
      expect(diagnostics[0]!.blockWidth).toBeGreaterThan(0);
      expect(diagnostics[0]!.blockHeight).toBeGreaterThan(0);
      expect(diagnostics[0]!.imageWidth).toBeGreaterThan(0);
      expect(diagnostics[0]!.imageHeight).toBeGreaterThan(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('loads Obsidian image embeds relative to the current note directory', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-obsidian-relative-image-embed');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { notePaths } = await createNotesRootFilesFixture(page, {
        name: 'obsidian-relative-image-embed',
        files: [
          {
            filename: 'daily/note.md',
            content: [
              '# E2E Obsidian Relative Image Embed',
              '',
              '![[附件/images.png]]',
              '',
              'After Obsidian image embed sentinel.',
              '',
            ].join('\n'),
          },
        ],
      });
      const notePath = notePaths[0]!;
      const imagePath = path.join(path.dirname(notePath), '附件', 'images.png');
      await fs.mkdir(path.dirname(imagePath), { recursive: true });
      await fs.writeFile(
        imagePath,
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'),
      );

      await openAbsoluteNote(page, notePath);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('After Obsidian image embed sentinel.', {
        timeout: 30_000,
      });

      const imageBlock = page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-src="附件/images.png"]`);
      await scrollImageBlockIntoView(imageBlock);
      await waitForImageBlockReady(imageBlock, 'Obsidian current-note relative image embed');
      await expect.poll(async () => imageBlock.locator('img').evaluate((image) => ({
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        renderedSrc: image.getAttribute('src') ?? '',
        dataSrc: image.getAttribute('data-src') ?? '',
      })), { timeout: 10_000 }).toMatchObject({
        complete: true,
        naturalWidth: 1,
        naturalHeight: 1,
        dataSrc: '附件/images.png',
      });
      await expect(page.locator('[data-note-source-fallback="true"]')).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('resizes image blocks with the editor after narrowing the window', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-image-responsive-window-width');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const { notePaths } = await createNotesRootFilesFixture(page, {
        name: 'responsive-image-window-width',
        files: [
          {
            filename: 'responsive-image-window-width.md',
            content: [
              '# E2E Responsive Image Width',
              '',
              'Before responsive image sentinel.',
              '',
              '![Responsive local image](./assets/responsive.svg)',
              '',
              'After responsive image sentinel.',
              '',
            ].join('\n'),
          },
          {
            filename: 'assets/responsive.svg',
            content: createSizedLocalSvg('#2563eb', 960, 540),
          },
        ],
      });

      await openAbsoluteNote(page, notePaths[0]!);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('After responsive image sentinel.', {
        timeout: 30_000,
      });

      const imageBlock = page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-src="./assets/responsive.svg"]`);
      await scrollImageBlockIntoView(imageBlock);
      await waitForImageBlockReady(imageBlock, 'responsive image wide viewport');
      const wideMetrics = await getImageBlockLayoutMetrics(imageBlock);

      await page.setViewportSize({ width: 760, height: 860 });
      await page.waitForFunction(() => window.innerWidth <= 760);
      await scrollImageBlockIntoView(imageBlock);
      await waitForImageBlockReady(imageBlock, 'responsive image narrow viewport');
      const narrowMetrics = await getImageBlockLayoutMetrics(imageBlock);

      expect(narrowMetrics.editorWidth, { wideMetrics, narrowMetrics }).toBeLessThan(wideMetrics.editorWidth - 100);
      expect(narrowMetrics.blockWidth, { wideMetrics, narrowMetrics }).toBeLessThanOrEqual(narrowMetrics.editorWidth + 2);
      expect(narrowMetrics.imageContainerWidth, { wideMetrics, narrowMetrics })
        .toBeLessThan(wideMetrics.imageContainerWidth - 80);
      expect(narrowMetrics.documentScrollWidth, { wideMetrics, narrowMetrics })
        .toBeLessThanOrEqual(narrowMetrics.viewportWidth + 2);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('does not persist rendered HTML boundary helpers after image interactions', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-image-boundary-helper-persistence');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { notePaths } = await createNotesRootFilesFixture(page, {
        name: 'image-boundary-helper-persistence',
        files: [
          {
            filename: 'image-boundary-helper-persistence.md',
            content: [
              '# E2E Image Boundary Helper Persistence',
              '',
              '<img src="./assets/boundary.svg" alt="Boundary helper image" />',
              '',
              'After boundary helper image.',
              '',
            ].join('\n'),
          },
          {
            filename: 'assets/boundary.svg',
            content: createLocalSvg('#2563eb'),
          },
        ],
      });

      await openAbsoluteNote(page, notePaths[0]!);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('After boundary helper image.', {
        timeout: 30_000,
      });

      const imageBlock = page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-src="./assets/boundary.svg"]`);
      await scrollImageBlockIntoView(imageBlock);
      await waitForImageBlockReady(imageBlock, 'boundary helper image');
      await hoverImageBlockContent(imageBlock);
      await waitForImageToolbarInteractive(imageBlock);
      await imageBlock.locator('[data-image-toolbar-action="align-center"]').click();
      await expect(imageBlock).toHaveAttribute('data-align', 'center');

      await page.evaluate(() => (window as any).__vlainaE2E.flushCurrentEditorMarkdown());
      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate((path) =>
        (window as any).__vlainaE2E.readTextFile(path), notePaths[0]!
      );

      expect(saved).toContain('./assets/boundary.svg');
      expect(saved).toContain('After boundary helper image.');
      expect(saved).not.toContain('vlaina-rendered-html-boundary-blank-line');
      expect(saved).not.toContain('vlaina-markdown-blank-line');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('wraps long image caption names in the lower corner chrome', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-image-long-caption-wrap');
    const longAlt = 'extremely-long-image-file-name-without-natural-breakpoints-abcdefghijklmnopqrstuvwxyz-0123456789-repeat-abcdefghijklmnopqrstuvwxyz-0123456789';

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { notePaths } = await createNotesRootFilesFixture(page, {
        name: 'image-long-caption-wrap',
        files: [
          {
            filename: 'image-long-caption-wrap.md',
            content: [
              '# E2E Image Long Caption Wrap',
              '',
              `![${longAlt}](./assets/long-caption.svg)`,
              '',
              'After long caption image.',
              '',
            ].join('\n'),
          },
          {
            filename: 'assets/long-caption.svg',
            content: createSizedLocalSvg('#0f766e', 640, 360),
          },
        ],
      });

      await openAbsoluteNote(page, notePaths[0]!);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('After long caption image.', {
        timeout: 30_000,
      });

      const imageBlock = page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-src="./assets/long-caption.svg"]`);
      await scrollImageBlockIntoView(imageBlock);
      await waitForImageBlockReady(imageBlock, 'long caption image');
      await hoverImageBlockContent(imageBlock);

      const captionButton = imageBlock.locator('.image-caption-btn');
      await expect(captionButton).toBeVisible({ timeout: 10_000 });
      await expect(captionButton.locator('.image-caption-text')).toHaveText(longAlt);

      const captionMetrics = await captionButton.evaluate((button) => {
        const text = button.querySelector<HTMLElement>('.image-caption-text');
        const buttonRect = button.getBoundingClientRect();
        const textRangeRects = text ? (() => {
          const range = document.createRange();
          range.selectNodeContents(text);
          const rects = Array.from(range.getClientRects()).filter((rect) =>
            rect.width > 0 && rect.height > 0
          );
          range.detach();
          return rects;
        })() : [];
        const textRects = textRangeRects.map((rect) => ({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }));
        const buttonStyle = window.getComputedStyle(button);
        const textStyle = text ? window.getComputedStyle(text) : null;

        return {
          buttonWidth: Math.round(buttonRect.width),
          buttonHeight: Math.round(buttonRect.height),
          textLineCount: textRects.length,
          buttonWhiteSpace: buttonStyle.whiteSpace,
          textOverflowWrap: textStyle?.overflowWrap ?? null,
          textWordBreak: textStyle?.wordBreak ?? null,
          textScrollWidth: text?.scrollWidth ?? 0,
          textClientWidth: text?.clientWidth ?? 0,
        };
      });

      expect(captionMetrics.buttonWhiteSpace, captionMetrics).toBe('normal');
      expect(captionMetrics.textOverflowWrap, captionMetrics).toBe('anywhere');
      expect(captionMetrics.textWordBreak, captionMetrics).toBe('break-word');
      expect(captionMetrics.textLineCount, captionMetrics).toBeGreaterThan(1);
      expect(captionMetrics.buttonHeight, captionMetrics).toBeGreaterThan(24);
      expect(captionMetrics.buttonWidth, captionMetrics).toBeLessThanOrEqual(282);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits many image blocks across caption, alignment, viewer, crop, and resize interactions', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-many-image-interaction-audit');
    const expectedSources = IMAGE_AUDIT_IMAGES.map((image) => image.src);
    const expectedAlts = IMAGE_AUDIT_IMAGES.map((image) => image.alt);

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const fills = [
        '#2563eb',
        '#16a34a',
        '#b45309',
        '#7c3aed',
        '#dc2626',
        '#0f766e',
        '#334155',
        '#be185d',
      ];
      const { notePaths } = await createNotesRootFilesFixture(page, {
        name: 'many-image-interaction-audit',
        files: [
          {
            filename: 'many-image-interaction-audit.md',
            content: createImageInteractionAuditMarkdown(),
          },
          ...fills.map((fill, index) => ({
            filename: `assets/audit-${index}.svg`,
            content: createLocalSvg(fill),
          })),
          {
            filename: 'assets/shared.svg',
            content: createLocalSvg('#0891b2'),
          },
        ],
      });

      await openAbsoluteNote(page, notePaths[0]!);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('After image audit sentinel.', {
        timeout: 30_000,
      });
      await expect(page.locator(NOTE_IMAGE_BLOCK_SELECTOR)).toHaveCount(expectedSources.length, {
        timeout: 30_000,
      });
      await expect.poll(async () => {
        const diagnostics = await getAllImageBlockDiagnostics(page);
        return {
          count: diagnostics.length,
          sources: diagnostics.map((item) => item.dataSrc),
        };
      }, { timeout: 30_000 }).toEqual({
        count: expectedSources.length,
        sources: expectedSources,
      });

      for (let index = 0; index < expectedSources.length; index += 1) {
        const imageBlock = page.locator(NOTE_IMAGE_BLOCK_SELECTOR).nth(index);
        await scrollImageBlockIntoView(imageBlock);
        await waitForImageBlockReady(imageBlock, `initial ${index} ${expectedSources[index]}`);
      }
      await expectImageBlocksStable(page, expectedSources);

      for (let index = 0; index < expectedSources.length; index += 1) {
        const imageBlock = page.locator(NOTE_IMAGE_BLOCK_SELECTOR).nth(index);
        await scrollImageBlockIntoView(imageBlock);
        await waitForImageBlockReady(imageBlock, `caption before ${index} ${expectedSources[index]}`);
        await hoverImageBlockContent(imageBlock);
        await waitForImageToolbarInteractive(imageBlock);

        const captionButton = imageBlock.locator('.image-caption-btn');
        await expect(captionButton).toBeVisible({ timeout: 10_000 });
        await captionButton.click();

        const captionInput = imageBlock.locator('.image-caption-toolbar input');
        await expect(captionInput).toBeVisible({ timeout: 10_000 });
        await expect(captionInput).toHaveValue(expectedAlts[index]);

        if (index % 3 === 0) {
          const nextAlt = `Audit edited caption ${index}`;
          await captionInput.fill(nextAlt);
          await captionInput.press('Enter');
          expectedAlts[index] = nextAlt;
        } else if (index % 3 === 1) {
          await captionInput.fill(`Audit cancelled caption ${index}`);
          await captionInput.press('Escape');
        } else {
          const blankPoint = await getEditorBlankPoint(page);
          if (blankPoint) {
            await page.mouse.click(blankPoint.x, blankPoint.y);
          } else {
            await page.getByText('After image audit sentinel.').click();
          }
        }

        await expect(captionInput).toHaveCount(0);
        await expect(imageBlock).toHaveAttribute('data-alt', expectedAlts[index]);
        await waitForImageBlockReady(imageBlock, `caption after ${index} ${expectedSources[index]}`);
        await expectImageBlocksStable(page, expectedSources);
      }

      const alignments = [
        { action: 'align-left', value: 'left' },
        { action: 'align-center', value: 'center' },
        { action: 'align-right', value: 'right' },
      ] as const;
      for (let index = 0; index < expectedSources.length; index += 1) {
        const imageBlock = page.locator(NOTE_IMAGE_BLOCK_SELECTOR).nth(index);
        const alignment = alignments[index % alignments.length]!;
        await scrollImageBlockIntoView(imageBlock);
        await waitForImageBlockReady(imageBlock, `align before ${index} ${expectedSources[index]}`);
        await hoverImageBlockContent(imageBlock);
        await waitForImageToolbarInteractive(imageBlock);
        await imageBlock.locator(`[data-image-toolbar-action="${alignment.action}"]`).click();
        await expect(imageBlock).toHaveAttribute('data-align', alignment.value);
        await waitForImageBlockReady(imageBlock, `align after ${index} ${expectedSources[index]}`);
        await expectImageBlocksStable(page, expectedSources);
      }

      for (const index of [0, 3, 9]) {
        const imageBlock = page.locator(NOTE_IMAGE_BLOCK_SELECTOR).nth(index);
        await scrollImageBlockIntoView(imageBlock);
        await waitForImageBlockReady(imageBlock, `viewer before ${index} ${expectedSources[index]}`);
        await clickImageBlockContent(imageBlock);

        const viewer = page.locator('[role="dialog"][data-chat-image-viewer-surface="true"]');
        await expect(viewer).toBeVisible({ timeout: 10_000 });
        const viewerButtons = viewer.locator('[data-chat-image-viewer-control="true"] button');
        await expect(viewerButtons).toHaveCount(4);
        await viewerButtons.nth(1).click();
        await viewerButtons.nth(0).click();
        await page.keyboard.press('Escape');
        await expect(viewer).toHaveCount(0);
        await waitForImageBlockReady(imageBlock, `viewer after ${index} ${expectedSources[index]}`);
        await expectImageBlocksStable(page, expectedSources);
      }

      for (const index of [2, 5, 8]) {
        const imageBlock = page.locator(NOTE_IMAGE_BLOCK_SELECTOR).nth(index);
        await scrollImageBlockIntoView(imageBlock);
        await waitForImageBlockReady(imageBlock, `crop before ${index} ${expectedSources[index]}`);
        await hoverImageBlockContent(imageBlock);
        await waitForImageToolbarInteractive(imageBlock);
        await imageBlock.locator('[data-image-toolbar-action="edit"]').click();
        await waitForImageCropperToolbarInteractive(imageBlock);
        await imageBlock.locator('.image-cropper-toolbar button').first().click();
        await expect.poll(async () => imageBlock.locator('.image-cropper-toolbar').evaluate((toolbar) =>
          window.getComputedStyle(toolbar).pointerEvents
        ), { timeout: 10_000 }).toBe('none');
        await waitForImageBlockReady(imageBlock, `crop after ${index} ${expectedSources[index]}`);
        await expectImageBlocksStable(page, expectedSources);
      }

      for (const { index, handleIndex, deltaX, deltaY } of [
        { index: 1, handleIndex: 1, deltaX: 28, deltaY: 0 },
        { index: 4, handleIndex: 4, deltaX: -24, deltaY: 18 },
        { index: 7, handleIndex: 1, deltaX: 24, deltaY: 0 },
      ]) {
        const imageBlock = page.locator(NOTE_IMAGE_BLOCK_SELECTOR).nth(index);
        await scrollImageBlockIntoView(imageBlock);
        await waitForImageBlockReady(imageBlock, `resize before ${index} ${expectedSources[index]}`);
        const handle = imageBlock.locator('[data-resize-handle="true"]').nth(handleIndex);
        const box = await handle.boundingBox();
        expect(box).not.toBeNull();
        const startX = box!.x + box!.width / 2;
        const startY = box!.y + box!.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 6 });
        await page.mouse.up();
        await expect(imageBlock).toHaveAttribute('data-width', /%$/);
        await waitForImageBlockReady(imageBlock, `resize after ${index} ${expectedSources[index]}`);
        await expectImageBlocksStable(page, expectedSources);
      }

      for (let index = 0; index < expectedSources.length; index += 1) {
        const imageBlock = page.locator(NOTE_IMAGE_BLOCK_SELECTOR).nth(index);
        await scrollImageBlockIntoView(imageBlock);
        await waitForImageBlockReady(imageBlock, `final ${index} ${expectedSources[index]}`);
      }
      const finalDiagnostics = await getAllImageBlockDiagnostics(page);
      expect(finalDiagnostics.map((item) => item.dataAlt)).toEqual(expectedAlts);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('uses the same block selection surface for image blocks and text blocks', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-image-block-selection-surface');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      await openMarkdownFixture(page, {
        filename: 'notes-image-block-selection-surface.md',
        content: createHtmlImageBlockMarkdown(),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Paragraph before image sentinel', {
        timeout: 30_000,
      });
      await expect(page.locator(
        `${NOTE_IMAGE_BLOCK_SELECTOR}[data-alt="Notes html image block alt sentinel"]`
      )).toBeVisible({ timeout: 30_000 });

      await page.evaluate(() => document.documentElement.classList.add('dark'));

      const selectableBlocks = await page.evaluate(() =>
        (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          text: string;
          tagName: string;
          from: number;
          to: number;
        }>
      );
      const textIndex = selectableBlocks.findIndex((block) =>
        block.text.includes('Paragraph before image sentinel')
      );
      const imageIndex = selectableBlocks.findIndex((block) =>
        block.tagName === 'DIV' && block.to - block.from > 1
      );

      expect(textIndex, JSON.stringify(selectableBlocks, null, 2)).toBeGreaterThanOrEqual(0);
      expect(imageIndex, JSON.stringify(selectableBlocks, null, 2)).toBeGreaterThanOrEqual(0);

      const imageBlock = page.locator(
        `${NOTE_IMAGE_BLOCK_SELECTOR}[data-alt="Notes html image block alt sentinel"]`
      );
      await expect.poll(async () => imageBlock.evaluate((element) => {
        const image = element.querySelector('img');
        return Boolean(image && image.complete && image.naturalWidth > 0 && image.getBoundingClientRect().width > 0);
      })).toBe(true);

      const geometryAudit = await page.evaluate(async (targetIndex) => {
        const block = document.querySelector<HTMLElement>(
          '.image-block-container[data-alt="Notes html image block alt sentinel"]'
        );
        const wrapper = block?.querySelector<HTMLElement>('[data-image-selection-wrapper="true"]') ?? null;
        const container = wrapper?.firstElementChild instanceof HTMLElement
          ? wrapper.firstElementChild
          : null;
        const image = container?.querySelector<HTMLImageElement>('img') ?? null;
        if (!block || !wrapper || !container || !image) return null;

        const readRect = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          return { height: rect.height, width: rect.width };
        };
        const baseline = {
          container: readRect(container),
          image: readRect(image),
          wrapper: readRect(wrapper),
        };
        const violations: Array<Record<string, unknown>> = [];
        let maxDelta = 0;

        const sample = (cycle: number, phase: string) => {
          const snapshot = {
            container: readRect(container),
            image: readRect(image),
            wrapper: readRect(wrapper),
          };
          const deltas = [
            Math.abs(snapshot.container.width - baseline.container.width),
            Math.abs(snapshot.container.height - baseline.container.height),
            Math.abs(snapshot.image.width - baseline.image.width),
            Math.abs(snapshot.image.height - baseline.image.height),
            Math.abs(snapshot.wrapper.width - baseline.wrapper.width),
            Math.abs(snapshot.wrapper.height - baseline.wrapper.height),
          ];
          maxDelta = Math.max(maxDelta, ...deltas);
          const transform = getComputedStyle(container).transform;
          const dragging = container.dataset.dragging === 'true';
          if (deltas.some((delta) => delta > 0.75) || transform !== 'none' || dragging) {
            violations.push({
              blockClassName: block.className,
              cycle,
              dragging,
              phase,
              snapshot,
              transform,
            });
          }
        };

        for (let cycle = 0; cycle < 24; cycle += 1) {
          const selectPromise = (window as any).__vlainaE2E.selectNoteBlocksByIndexes([targetIndex]);
          sample(cycle, 'selected-sync');
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          sample(cycle, 'selected-frame');
          await selectPromise;
          sample(cycle, 'selected-settled');

          const clearPromise = (window as any).__vlainaE2E.selectNoteBlocksByIndexes([]);
          sample(cycle, 'cleared-sync');
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          sample(cycle, 'cleared-frame');
          await clearPromise;
          sample(cycle, 'cleared-settled');
        }

        return { baseline, maxDelta, violations };
      }, imageIndex);

      expect(geometryAudit).not.toBeNull();
      expect(geometryAudit!.violations, JSON.stringify(geometryAudit, null, 2)).toEqual([]);
      expect(geometryAudit!.maxDelta, JSON.stringify(geometryAudit, null, 2)).toBeLessThanOrEqual(0.75);

      const dragTarget = await getBlankAreaDragTarget(page, 'Paragraph before image sentinel');
      const imageBox = await imageBlock.boundingBox();
      expect(dragTarget).not.toBeNull();
      expect(imageBox).not.toBeNull();
      await page.mouse.move(dragTarget!.startX, dragTarget!.startY);
      await page.mouse.down();
      for (let step = 1; step <= 12; step += 1) {
        const progress = step / 12;
        await page.mouse.move(
          dragTarget!.startX + (dragTarget!.endX - dragTarget!.startX) * progress,
          dragTarget!.startY + (imageBox!.y + imageBox!.height / 2 - dragTarget!.startY) * progress,
        );
        const frameGeometry = await imageBlock.evaluate((element) => {
          const wrapper = element.querySelector<HTMLElement>('[data-image-selection-wrapper="true"]');
          const container = wrapper?.firstElementChild instanceof HTMLElement
            ? wrapper.firstElementChild
            : null;
          const image = container?.querySelector<HTMLImageElement>('img') ?? null;
          if (!wrapper || !container || !image) return null;
          return {
            containerHeight: container.getBoundingClientRect().height,
            containerWidth: container.getBoundingClientRect().width,
            dragging: container.dataset.dragging === 'true',
            imageHeight: image.getBoundingClientRect().height,
            imageWidth: image.getBoundingClientRect().width,
            transform: getComputedStyle(container).transform,
            wrapperHeight: wrapper.getBoundingClientRect().height,
            wrapperWidth: wrapper.getBoundingClientRect().width,
          };
        });
        expect(frameGeometry, `physical drag frame ${step}`).not.toBeNull();
        expect(frameGeometry!.dragging, JSON.stringify(frameGeometry)).toBe(false);
        expect(frameGeometry!.transform, JSON.stringify(frameGeometry)).toBe('none');
        expect(Math.abs(frameGeometry!.containerWidth - geometryAudit!.baseline.container.width)).toBeLessThanOrEqual(0.75);
        expect(Math.abs(frameGeometry!.containerHeight - geometryAudit!.baseline.container.height)).toBeLessThanOrEqual(0.75);
        expect(Math.abs(frameGeometry!.imageWidth - geometryAudit!.baseline.image.width)).toBeLessThanOrEqual(0.75);
        expect(Math.abs(frameGeometry!.imageHeight - geometryAudit!.baseline.image.height)).toBeLessThanOrEqual(0.75);
        expect(Math.abs(frameGeometry!.wrapperWidth - geometryAudit!.baseline.wrapper.width)).toBeLessThanOrEqual(0.75);
        expect(Math.abs(frameGeometry!.wrapperHeight - geometryAudit!.baseline.wrapper.height)).toBeLessThanOrEqual(0.75);
      }
      await page.mouse.up();
      await expect.poll(async () => imageBlock.evaluate((element) => (
        element.classList.contains('editor-block-selected')
        || Boolean(element.closest('.editor-block-selected'))
      ))).toBe(true);
      await clearSelectedNoteBlocks(page);

      const readSelectionPaint = async (index: number) => {
        const selectedCount = await page.evaluate(async (targetIndex) => {
          const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([targetIndex]);
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          return count;
        }, index);
        expect(selectedCount).toBe(1);

        return page.evaluate(() => {
          const selected = document.querySelector<HTMLElement>(
            '.milkdown .ProseMirror .editor-block-selected'
          );
          if (!selected) return null;

          const tokenProbe = document.createElement('div');
          tokenProbe.style.position = 'fixed';
          tokenProbe.style.left = '-9999px';
          tokenProbe.style.top = '-9999px';
          tokenProbe.style.background = 'var(--vlaina-block-selection-color-default)';
          document.body.appendChild(tokenProbe);
          const tokenColor = getComputedStyle(tokenProbe).backgroundColor;
          tokenProbe.remove();

          const resolvePaint = (element: HTMLElement) => {
            const style = getComputedStyle(element);
            const before = getComputedStyle(element, '::before');
            const after = getComputedStyle(element, '::after');
            const activePseudo = [before, after].find((pseudo) =>
              pseudo.content !== 'none' &&
              pseudo.display !== 'none' &&
              pseudo.backgroundColor !== 'rgba(0, 0, 0, 0)'
            );

            return {
              tagName: element.tagName,
              className: element.className,
              text: element.textContent?.trim().slice(0, 120) ?? '',
              backgroundColor: style.backgroundColor,
              pseudoBackgroundColor: activePseudo?.backgroundColor ?? null,
              beforeDisplay: before.display,
              beforeBackgroundColor: before.backgroundColor,
              afterDisplay: after.display,
              afterBackgroundColor: after.backgroundColor,
            };
          };

          const directImage = selected.matches('.image-block-container')
            ? selected
            : selected.querySelector<HTMLElement>(':scope > .image-block-container');
          const lineFills = Array.from(document.querySelectorAll<HTMLElement>(
            '.editor-block-selection-line-fill'
          )).map((fill) => {
            const style = getComputedStyle(fill);
            return {
              backgroundColor: style.backgroundColor,
              display: style.display,
              rect: (() => {
                const rect = fill.getBoundingClientRect();
                return {
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                };
              })(),
            };
          });

          return {
            selected: resolvePaint(selected),
            directImage: directImage ? resolvePaint(directImage) : null,
            lineFills,
            tokenColor,
          };
        });
      };

      const textPaint = await readSelectionPaint(textIndex);
      const imagePaint = await readSelectionPaint(imageIndex);

      expect(textPaint).not.toBeNull();
      expect(imagePaint).not.toBeNull();
      expect(textPaint!.selected.pseudoBackgroundColor ?? textPaint!.selected.backgroundColor)
        .toBe(textPaint!.tokenColor);
      expect(imagePaint!.lineFills.some((fill) => fill.backgroundColor === imagePaint!.tokenColor))
        .toBe(true);
      expect(imagePaint!.selected.pseudoBackgroundColor).not.toBe(imagePaint!.tokenColor);
      expect(imagePaint!.directImage?.pseudoBackgroundColor).not.toBe(imagePaint!.tokenColor);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps image toolbar state colors stable while the image block is selected', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-image-toolbar-selected-color');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      await openMarkdownFixture(page, {
        filename: 'notes-image-toolbar-selected-color.md',
        content: createHtmlImageBlockMarkdown(),
      });

      const imageBlock = page.locator(
        `${NOTE_IMAGE_BLOCK_SELECTOR}[data-alt="Notes html image block alt sentinel"]`
      );
      await scrollImageBlockIntoView(imageBlock);
      await waitForImageBlockReady(imageBlock, 'selected toolbar color image');

      const readButtonPaint = (action: string) => imageBlock
        .locator(`[data-image-toolbar-action="${action}"]`)
        .evaluate((button) => {
          const style = getComputedStyle(button);
          const svgStyle = getComputedStyle(button.querySelector('svg')!);
          const pathStyle = getComputedStyle(button.querySelector('path')!);
          return {
            color: style.color,
            backgroundColor: style.backgroundColor,
            opacity: style.opacity,
            filter: style.filter,
            webkitTextFillColor: style.webkitTextFillColor,
            svgColor: svgStyle.color,
            svgStroke: svgStyle.stroke,
            svgFill: svgStyle.fill,
            pathColor: pathStyle.color,
            pathStroke: pathStyle.stroke,
            pathFill: pathStyle.fill,
          };
        });
      const readToolbarPaint = async () => {
        const active = await readButtonPaint('align-center');
        await imageBlock.locator('[data-image-toolbar-action="align-left"]').hover();
        await page.waitForTimeout(250);
        const hover = await readButtonPaint('align-left');
        await imageBlock.locator('[data-image-toolbar-action="delete"]').hover();
        await page.waitForTimeout(250);
        const danger = await readButtonPaint('delete');
        return { active, hover, danger };
      };
      const waitForToolbarThemeSettled = async () => {
        await expect.poll(async () => {
          const active = await readButtonPaint('align-center');
          const expected = await page.evaluate(() => {
            const probe = document.createElement('span');
            probe.style.color = 'var(--vlaina-accent)';
            probe.style.backgroundColor = 'var(--vlaina-accent-soft)';
            document.body.appendChild(probe);
            const style = getComputedStyle(probe);
            const paint = {
              color: style.color,
              backgroundColor: style.backgroundColor,
            };
            probe.remove();
            return paint;
          });
          return active.color === expected.color
            && active.backgroundColor === expected.backgroundColor;
        }).toBe(true);
      };

      const selectableBlocks = await page.evaluate(() =>
        (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          tagName: string;
          from: number;
          to: number;
        }>
      );
      const imageIndex = selectableBlocks.findIndex((block) =>
        block.tagName === 'DIV' && block.to - block.from > 1
      );
      expect(imageIndex, JSON.stringify(selectableBlocks, null, 2)).toBeGreaterThanOrEqual(0);

      for (const dark of [false, true]) {
        await clearSelectedNoteBlocks(page);
        await page.evaluate((useDarkTheme) => {
          document.documentElement.classList.toggle('dark', useDarkTheme);
        }, dark);
        await hoverImageBlockContent(imageBlock);
        await waitForImageToolbarInteractive(imageBlock);
        await waitForToolbarThemeSettled();
        const hoveredPaint = await readToolbarPaint();

        await page.evaluate(async (targetIndex) => {
          await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([targetIndex]);
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }, imageIndex);
        await hoverImageBlockContent(imageBlock);
        await waitForImageToolbarInteractive(imageBlock);

        expect(await readToolbarPaint()).toEqual(hoveredPaint);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
