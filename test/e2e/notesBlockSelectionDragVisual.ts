import { expect, type Page } from '@playwright/test';
import { EDITOR_SELECTOR } from './notesE2E';
import type { DragVisualGeometry } from './notesBlockSelectionTypes';

async function readDragVisual(page: Page): Promise<DragVisualGeometry> {
  return page.evaluate((editorSelector) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--vlaina-block-selection-color-default)';
    document.body.appendChild(probe);
    const expectedBackground = getComputedStyle(probe).backgroundColor;
    probe.style.color = 'var(--vlaina-color-white)';
    const expectedCodeBlockSelectedBorderColor = getComputedStyle(probe).color;
    probe.remove();

    const source = document.querySelector<HTMLElement>(
      `${editorSelector} .editor-block-drag-source, ${editorSelector} .editor-block-selected`
    );
    const sourceStyle = source ? getComputedStyle(source) : null;
    const sourceRect = source?.getBoundingClientRect() ?? null;
    const codeBlockProbe = document.createElement('span');
    codeBlockProbe.style.backgroundColor = 'var(--vlaina-code-block-background)';
    codeBlockProbe.style.setProperty('color', 'var(--vlaina-code-syntax-foreground)', 'important');
    const tokenProbeHost = source ?? source?.closest<HTMLElement>('.milkdown-editor') ?? document.body;
    tokenProbeHost.appendChild(codeBlockProbe);
    const expectedCodeBlockBackground = getComputedStyle(codeBlockProbe).backgroundColor;
    const expectedCodeSyntaxForeground = getComputedStyle(codeBlockProbe).color;
    codeBlockProbe.style.setProperty('color', 'var(--vlaina-code-syntax-muted)', 'important');
    const expectedCodeSyntaxMuted = getComputedStyle(codeBlockProbe).color;
    codeBlockProbe.style.setProperty('color', 'var(--vlaina-code-syntax-keyword)', 'important');
    const expectedCodeSyntaxKeyword = getComputedStyle(codeBlockProbe).color;
    codeBlockProbe.remove();
    const sourceCodeLine = source?.querySelector<HTMLElement>('.cm-line, .code-block-lazy-preview') ?? null;
    const sourceCodeLanguage = source?.querySelector<HTMLElement>('.code-block-chrome-language-label, .cm-lineNumbers, .code-block-lazy-line-numbers') ?? null;
    const sourceCodeKeyword = source?.querySelector<HTMLElement>('.cm-keyword, .token.keyword') ?? null;
    const sourceAfterStyle = source ? getComputedStyle(source, '::after') : null;
    const sourceAfterLeft = sourceAfterStyle ? Number.parseFloat(sourceAfterStyle.left) : Number.NaN;
    const sourceAfterRight = sourceAfterStyle ? Number.parseFloat(sourceAfterStyle.right) : Number.NaN;
    const sourceBleedStart = sourceStyle
      ? Number.parseFloat(sourceStyle.getPropertyValue('--vlaina-block-selection-bleed-x-start'))
      : Number.NaN;
    const sourceBleedEnd = sourceStyle
      ? Number.parseFloat(sourceStyle.getPropertyValue('--vlaina-block-selection-bleed-x-end'))
      : Number.NaN;
    const preview = document.querySelector<HTMLElement>('.editor-block-drag-preview');
    const previewLayer = preview?.querySelector<HTMLElement>('.editor-block-drag-preview-layer') ?? null;
    const previewStyle = preview ? getComputedStyle(preview) : null;
    const previewLayerStyle = previewLayer ? getComputedStyle(previewLayer) : null;
    const previewRect = preview?.getBoundingClientRect() ?? null;
    const previewCodeBlock = previewLayer?.querySelector<HTMLElement>('.code-block-container') ?? null;
    const previewCodeBlockStyle = previewCodeBlock ? getComputedStyle(previewCodeBlock) : null;
    const previewCodeBlockRect = previewCodeBlock?.getBoundingClientRect() ?? null;
    const previewCodeBlockAfterStyle = previewCodeBlock ? getComputedStyle(previewCodeBlock, '::after') : null;
    const previewCodeBlockSurface = previewCodeBlock?.querySelector<HTMLElement>([
      '.code-block-chrome',
      '.code-block-chrome-header',
      '.code-block-editable',
      '.code-block-lazy-preview',
      '.code-block-lazy-line-numbers',
      '.cm-editor',
      '.cm-scroller',
      '.cm-content',
      '.cm-line',
      '.cm-gutters',
      '.cm-gutter',
      '.cm-gutterElement',
      '.cm-lineNumbers',
      '.cm-gutter-filler',
    ].join(',')) ?? null;
    const previewCodeBlockSurfaceStyle = previewCodeBlockSurface ? getComputedStyle(previewCodeBlockSurface) : null;
    const controls = document.querySelector<HTMLElement>('.editor-block-controls.dragging, .editor-block-controls.visible');
    const controlsBeforeStyle = controls ? getComputedStyle(controls, '::before') : null;

    return {
      dragActive: document.body.classList.contains('editor-block-drag-active'),
      controlsDragging: controls?.classList.contains('dragging') ?? false,
      sourceCount: document.querySelectorAll(`${editorSelector} .editor-block-drag-source`).length,
      selectedCount: document.querySelectorAll(`${editorSelector} .editor-block-selected`).length,
      sourceClassName: source?.className ?? null,
      sourceIsCodeBlock: source?.classList.contains('code-block-container') ?? false,
      sourceWidth: sourceRect ? Math.round(sourceRect.width * 10) / 10 : null,
      sourceHeight: sourceRect ? Math.round(sourceRect.height * 10) / 10 : null,
      sourceBackgroundColor: sourceStyle?.backgroundColor ?? null,
      sourceBorderTopColor: sourceStyle?.borderTopColor ?? null,
      sourceBoxShadow: sourceStyle?.boxShadow ?? null,
      sourceOutlineStyle: sourceStyle?.outlineStyle ?? null,
      sourceOutlineWidth: sourceStyle?.outlineWidth ?? null,
      sourceOpacity: sourceStyle?.opacity ?? null,
      sourceAfterBackgroundColor: sourceAfterStyle?.backgroundColor ?? null,
      sourceAfterLeft: Number.isFinite(sourceAfterLeft) ? sourceAfterLeft : null,
      sourceAfterRight: Number.isFinite(sourceAfterRight) ? sourceAfterRight : null,
      sourceCodeLineColor: sourceCodeLine ? getComputedStyle(sourceCodeLine).color : null,
      sourceCodeLanguageColor: sourceCodeLanguage ? getComputedStyle(sourceCodeLanguage).color : null,
      sourceCodeKeywordColor: sourceCodeKeyword ? getComputedStyle(sourceCodeKeyword).color : null,
      sourceBleedStart: Number.isFinite(sourceBleedStart) ? sourceBleedStart : null,
      sourceBleedEnd: Number.isFinite(sourceBleedEnd) ? sourceBleedEnd : null,
      expectedBackground,
      expectedCodeBlockBackground,
      expectedCodeSyntaxForeground,
      expectedCodeSyntaxMuted,
      expectedCodeSyntaxKeyword,
      expectedCodeBlockSelectedBorderColor,
      previewExists: preview !== null,
      previewWidth: previewRect ? Math.round(previewRect.width * 10) / 10 : null,
      previewHeight: previewRect ? Math.round(previewRect.height * 10) / 10 : null,
      previewBackgroundColor: previewStyle?.backgroundColor ?? null,
      previewOpacity: previewStyle?.opacity ?? null,
      previewBoxShadow: previewStyle?.boxShadow ?? null,
      previewLayerBackgroundColor: previewLayerStyle?.backgroundColor ?? null,
      previewLayerOpacity: previewLayerStyle?.opacity ?? null,
      previewLayerBoxShadow: previewLayerStyle?.boxShadow ?? null,
      previewCodeBlockExists: previewCodeBlock !== null,
      previewCodeBlockWidth: previewCodeBlockRect ? Math.round(previewCodeBlockRect.width * 10) / 10 : null,
      previewCodeBlockHeight: previewCodeBlockRect ? Math.round(previewCodeBlockRect.height * 10) / 10 : null,
      previewCodeBlockBackgroundColor: previewCodeBlockStyle?.backgroundColor ?? null,
      previewCodeBlockBorderTopColor: previewCodeBlockStyle?.borderTopColor ?? null,
      previewCodeBlockBorderTopStyle: previewCodeBlockStyle?.borderTopStyle ?? null,
      previewCodeBlockBorderTopWidth: previewCodeBlockStyle?.borderTopWidth ?? null,
      previewCodeBlockBoxShadow: previewCodeBlockStyle?.boxShadow ?? null,
      previewCodeBlockOutlineStyle: previewCodeBlockStyle?.outlineStyle ?? null,
      previewCodeBlockOutlineWidth: previewCodeBlockStyle?.outlineWidth ?? null,
      previewCodeBlockAfterBackgroundColor: previewCodeBlockAfterStyle?.backgroundColor ?? null,
      previewCodeBlockSurfaceBackgroundColor: previewCodeBlockSurfaceStyle?.backgroundColor ?? null,
      controlsBeforeBackgroundColor: controlsBeforeStyle?.backgroundColor ?? null,
    };
  }, EDITOR_SELECTOR);
}

export async function dragVisibleHandleAndMeasure(page: Page, label: string): Promise<DragVisualGeometry> {
  const handleBox = await page.locator('.editor-block-control-handle').boundingBox();
  if (!handleBox) {
    throw new Error(`${label}: could not resolve block drag handle geometry`);
  }

  const dragStartX = handleBox.x + handleBox.width / 2;
  const dragStartY = handleBox.y + handleBox.height / 2;
  let mouseIsDown = false;

  try {
    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    mouseIsDown = true;
    await page.mouse.move(dragStartX + 28, dragStartY, { steps: 4 });

    await expect.poll(async () => page.evaluate(() =>
      document.body.classList.contains('editor-block-drag-active')
    ), { message: `${label}: drag session should become active` }).toBe(true);

    await expect.poll(async () => {
      const visual = await readDragVisual(page);
      return visual.previewExists &&
        (visual.previewWidth ?? 0) > 0 &&
        (visual.previewHeight ?? 0) > 0;
    }, { message: `${label}: drag preview should be laid out` }).toBe(true);

    const visual = await readDragVisual(page);
    await page.mouse.move(dragStartX, dragStartY, { steps: 2 });
    return visual;
  } finally {
    if (mouseIsDown) {
      await page.mouse.up().catch(() => undefined);
    }
    await page.mouse.move(8, 8).catch(() => undefined);
    await expect.poll(async () => page.evaluate(() =>
      document.body.classList.contains('editor-block-drag-active')
    ), { message: `${label}: drag session should stop after mouse up` }).toBe(false);
  }
}

export function expectTransparentDragVisual(label: string, visual: DragVisualGeometry): void {
  expect(visual.dragActive, `${label}: drag active`).toBe(true);
  expect(visual.controlsDragging, `${label}: controls dragging class`).toBe(true);
  expect(visual.selectedCount + visual.sourceCount, `${label}: selected/source count`).toBeGreaterThan(0);
  if (visual.sourceIsCodeBlock) {
    expectCodeBlockDragSourceSelectionSurface(label, visual);
    expectCodeBlockDragPreviewFrame(label, visual);
  } else {
    expectDragSourceSelectionSurface(label, visual);
  }
  expect(visual.sourceOpacity, `${label}: source opacity`).toBe('1');
  expect(visual.previewExists, `${label}: preview should exist`).toBe(true);
  expect(visual.previewWidth ?? 0, `${label}: preview width`).toBeGreaterThan(0);
  expect(visual.previewHeight ?? 0, `${label}: preview height`).toBeGreaterThan(0);
  expect(visual.previewBackgroundColor, `${label}: preview background`).toBe('rgba(0, 0, 0, 0)');
  expect(visual.previewOpacity, `${label}: preview opacity`).toBe('1');
  expect(visual.previewBoxShadow, `${label}: preview shadow`).toBe('none');
  expect(visual.previewLayerBackgroundColor, `${label}: preview layer background`).toBe('rgba(0, 0, 0, 0)');
  expect(visual.previewLayerOpacity, `${label}: preview layer opacity`).toBe('1');
  expect(visual.previewLayerBoxShadow, `${label}: preview layer shadow`).toBe('none');
  expect(visual.controlsBeforeBackgroundColor, `${label}: handle pseudo background`).toBe('rgba(0, 0, 0, 0)');
}

function isTransparentCssColor(value: string | null): boolean {
  return value === 'rgba(0, 0, 0, 0)' || value === 'transparent';
}

export function expectCodeBlockDragSourceSelectionSurface(
  label: string,
  visual: Pick<DragVisualGeometry,
    | 'sourceBackgroundColor'
    | 'sourceBorderTopColor'
    | 'sourceOutlineStyle'
    | 'sourceOutlineWidth'
    | 'sourceAfterBackgroundColor'
    | 'sourceClassName'
    | 'sourceCodeLanguageColor'
    | 'sourceCodeLineColor'
    | 'sourceCodeKeywordColor'
    | 'expectedBackground'
    | 'expectedCodeBlockSelectedBorderColor'
    | 'expectedCodeSyntaxForeground'
    | 'expectedCodeSyntaxKeyword'
    | 'expectedCodeSyntaxMuted'
  >,
): void {
  expect(visual.sourceClassName ?? '', `${label}: code block source class`).toContain('code-block-container');
  expect(visual.sourceBorderTopColor, `${label}: code block source selected border`).toBe(visual.expectedCodeBlockSelectedBorderColor);
  expect(visual.sourceOutlineStyle, `${label}: code block source selected outline style`).toBe('solid');
  expect(visual.sourceOutlineWidth, `${label}: code block source selected outline width`).not.toBe('0px');
  expect(
    visual.sourceBackgroundColor === visual.expectedBackground ||
      visual.sourceAfterBackgroundColor === visual.expectedBackground,
    `${label}: code block source should keep selection surface`,
  ).toBe(true);
  expect(visual.sourceCodeLineColor, `${label}: code line color`).toBe(visual.expectedCodeSyntaxForeground);
  expect(visual.sourceCodeLanguageColor, `${label}: code language color`).toBe(visual.expectedCodeSyntaxMuted);
  expect(visual.sourceCodeKeywordColor, `${label}: code keyword color`).toBe(visual.expectedCodeSyntaxKeyword);
}

export function expectCodeBlockDragPreviewFrame(
  label: string,
  visual: Pick<DragVisualGeometry,
    | 'previewCodeBlockExists'
    | 'previewCodeBlockWidth'
    | 'previewCodeBlockHeight'
    | 'previewCodeBlockBackgroundColor'
    | 'previewCodeBlockBorderTopColor'
    | 'previewCodeBlockBorderTopStyle'
    | 'previewCodeBlockBorderTopWidth'
    | 'previewCodeBlockBoxShadow'
    | 'previewCodeBlockOutlineStyle'
    | 'previewCodeBlockOutlineWidth'
    | 'previewCodeBlockAfterBackgroundColor'
    | 'previewCodeBlockSurfaceBackgroundColor'
    | 'expectedCodeBlockSelectedBorderColor'
    | 'sourceWidth'
    | 'sourceHeight'
  >,
): void {
  expect(visual.previewCodeBlockExists, `${label}: preview code block exists`).toBe(true);
  expect(visual.previewCodeBlockWidth ?? 0, `${label}: preview code block width`).toBeGreaterThan(0);
  expect(visual.previewCodeBlockHeight ?? 0, `${label}: preview code block height`).toBeGreaterThan(0);
  expect(visual.sourceWidth, `${label}: source code block width`).not.toBeNull();
  expect(visual.sourceHeight, `${label}: source code block height`).not.toBeNull();
  expect(visual.previewCodeBlockWidth!, `${label}: preview code block frame should not collapse to text width`)
    .toBeGreaterThanOrEqual(Math.max(0, visual.sourceWidth! - 4));
  expect(visual.previewCodeBlockHeight!, `${label}: preview code block frame should not collapse vertically`)
    .toBeGreaterThanOrEqual(Math.max(0, visual.sourceHeight! - 4));
  expect(isTransparentCssColor(visual.previewCodeBlockBackgroundColor), `${label}: preview code block background`).toBe(true);
  expect(visual.previewCodeBlockBorderTopColor, `${label}: preview code block border`).toBe(visual.expectedCodeBlockSelectedBorderColor);
  expect(visual.previewCodeBlockBorderTopStyle, `${label}: preview code block border style`).toBe('solid');
  expect(visual.previewCodeBlockBorderTopWidth, `${label}: preview code block border width`).not.toBe('0px');
  expect(visual.previewCodeBlockBoxShadow, `${label}: preview code block shadow`).toBe('none');
  expect(visual.previewCodeBlockOutlineStyle, `${label}: preview code block outline style`).toBe('solid');
  expect(visual.previewCodeBlockOutlineWidth, `${label}: preview code block outline width`).not.toBe('0px');
  expect(isTransparentCssColor(visual.previewCodeBlockAfterBackgroundColor), `${label}: preview code block pseudo background`).toBe(true);
  expect(isTransparentCssColor(visual.previewCodeBlockSurfaceBackgroundColor), `${label}: preview code block inner background`).toBe(true);
}

export function expectDragSourceSelectionSurface(
  label: string,
  visual: Pick<DragVisualGeometry,
    | 'sourceBackgroundColor'
    | 'sourceBoxShadow'
    | 'sourceAfterBackgroundColor'
    | 'sourceAfterLeft'
    | 'sourceAfterRight'
    | 'sourceBleedStart'
    | 'sourceBleedEnd'
    | 'expectedBackground'
  >,
): void {
  if (visual.sourceBackgroundColor === visual.expectedBackground) {
    return;
  }

  expect(visual.sourceBackgroundColor, `${label}: text source element background`).toBe('rgba(0, 0, 0, 0)');
  expect(visual.sourceBoxShadow, `${label}: text source element shadow`).toBe('none');
  expect(visual.sourceAfterBackgroundColor, `${label}: source selection pseudo background`).toBe(visual.expectedBackground);
  expect(visual.sourceAfterLeft, `${label}: source selection pseudo left`).not.toBeNull();
  expect(visual.sourceAfterRight, `${label}: source selection pseudo right`).not.toBeNull();
  expect(visual.sourceBleedStart, `${label}: source bleed start`).not.toBeNull();
  expect(visual.sourceBleedEnd, `${label}: source bleed end`).not.toBeNull();
  expect(visual.sourceAfterLeft!, `${label}: source pseudo should preserve left bleed`)
    .toBeCloseTo(-visual.sourceBleedStart!, 0);
  expect(visual.sourceAfterRight!, `${label}: source pseudo should preserve right bleed`)
    .toBeCloseTo(-visual.sourceBleedEnd!, 0);
}
