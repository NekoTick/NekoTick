import { expect, test, type Page } from "@playwright/test";
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from "./notesE2E";
import {
  MARKDOWN_DRAG_SYNTAX_CASES,
  dragVisibleHandleAndMeasure,
  expectSyntaxHandleGeometry,
  expectTransparentDragVisual,
  locateSyntaxTarget,
  measureSyntaxHandleGeometry,
  moveMouseToSyntaxHandleGutter,
  selectSyntaxDragCase,
  type MarkdownDragSyntaxCase,
  type SyntaxHandleGeometry,
} from "./notesBlockSelectionDragHelpers";
import { createMarkdownSyntaxFixture } from "./notesMarkdownSyntaxFixture";
import { selectNoteBlocksByMatchers } from "./notesBlockSelectionShared";

const MARKDOWN_SELECTION_SURFACE_CASES: MarkdownDragSyntaxCase[] = [
  ...MARKDOWN_DRAG_SYNTAX_CASES.map((syntaxCase) => (
    syntaxCase.label === 'mermaid-block'
      ? { ...syntaxCase, targetSelector: '.mermaid-block', targetText: undefined }
      : syntaxCase
  )),
  {
    label: 'frontmatter',
    targetSelector: '.frontmatter-block-container',
    targetText: 'E2E Markdown Syntax',
    gap: 'standard',
  },
  {
    label: 'toc',
    targetSelector: 'div[data-type="toc"]',
    gap: 'standard',
  },
  {
    label: 'callout',
    targetSelector: 'div[data-type="callout"]',
    targetText: 'Encoded icon callout body sentinel',
    gap: 'standard',
  },
  {
    label: 'markdown-image',
    targetSelector: '.image-block-container[data-alt="Image alt sentinel"]',
    gap: 'standard',
  },
  {
    label: 'html-image',
    targetSelector: '.image-block-container[data-alt="HTML image alt sentinel"]',
    gap: 'standard',
  },
  {
    label: 'html-crop-image',
    targetSelector: '.image-block-container[data-alt="HTML crop cover sentinel"]',
    gap: 'standard',
  },
  {
    label: 'html-single-quote-image',
    targetSelector: '.image-block-container[data-alt="HTML single quote image sentinel"]',
    gap: 'standard',
  },
  {
    label: 'video-youtube',
    targetSelector: 'div[data-type="video"]',
    gap: 'standard',
  },
];

type SampledPixel = {
  blue: number;
  color: string;
  green: number;
  label: string;
  red: number;
  selectedClassName?: string;
  selectedDebug?: Record<string, string>;
  selectedTagName?: string;
  targetClassName?: string;
};

async function sampleSelectedBlockBackgroundPixel(
  page: Page,
  input: { label: string; targetSelector: string; targetText?: string },
): Promise<SampledPixel> {
  const geometry = await page.evaluate(async ({ editorSelector, input }) => {
    const normalize = (value: string | undefined | null) => (value ?? '').replace(/\s+/g, ' ').trim();
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) return null;
    editor.querySelectorAll<HTMLElement>('[data-e2e-manual-selection="true"]').forEach((element) => {
      element.classList.remove('editor-block-selected', 'md-focus');
      delete element.dataset.e2eManualSelection;
    });
    editor.querySelectorAll<HTMLElement>('[data-e2e-pixel-target]').forEach((element) => {
      delete element.dataset.e2ePixelTarget;
    });

    const target = Array.from(editor.querySelectorAll<HTMLElement>(input.targetSelector))
      .find((element) => !input.targetText || normalize(element.textContent).includes(input.targetText))
      ?? null;
    if (!target) return null;

    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const targetRect = target.getBoundingClientRect();
    const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
      className: string;
      dataset: Record<string, string>;
      rect: { left: number; top: number; width: number; height: number };
    }>;
    const targetClassName = typeof target.className === 'string' ? target.className : '';
    const selectedIndex = blocks.findIndex((block) => {
      if (!targetClassName.includes('image-block-container')) return false;
      if (!block.className.includes('image-block-container')) return false;
      if (target.dataset.alt && block.dataset.alt === target.dataset.alt) return true;
      if (target.dataset.src && block.dataset.src === target.dataset.src) return true;
      return false;
    });
    const intersectionArea = (rect: { left: number; top: number; width: number; height: number }) => {
      const overlapLeft = Math.max(rect.left, targetRect.left);
      const overlapRight = Math.min(rect.left + rect.width, targetRect.right);
      const overlapTop = Math.max(rect.top, targetRect.top);
      const overlapBottom = Math.min(rect.top + rect.height, targetRect.bottom);
      return Math.max(0, overlapRight - overlapLeft) * Math.max(0, overlapBottom - overlapTop);
    };
    const intersectedIndex = blocks
      .map((block, index) => ({ index, area: intersectionArea(block.rect) }))
      .filter((candidate) => candidate.area > 0)
      .sort((left, right) => right.area - left.area)[0]?.index ?? -1;
    const resolvedIndex = selectedIndex >= 0 ? selectedIndex : intersectedIndex;

    if (resolvedIndex >= 0) {
      await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([resolvedIndex]);
    } else if (targetClassName.includes('image-block-container')) {
      target.dataset.e2eManualSelection = 'true';
      target.classList.add('editor-block-selected', 'md-focus');
    } else {
      return null;
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    let selected = Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selected, .ProseMirror-selectednode'))
      .find((element) => element === target || element.contains(target) || target.contains(element))
      ?? null;
    if (!selected && targetClassName.includes('image-block-container')) {
      target.dataset.e2eManualSelection = 'true';
      target.classList.add('editor-block-selected', 'md-focus');
      selected = target;
    }
    if (!selected) return null;

    const paintTarget = selected.classList.contains('image-block-container')
      ? selected.querySelector<HTMLElement>('[data-image-selection-wrapper="true"]') ?? selected
      : selected;
    const rect = paintTarget.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 3, Math.max(1, Math.max(rect.left + 8, rect.right - 18)));
    const y = Math.min(window.innerHeight - 3, Math.max(1, Math.min(rect.bottom - 8, Math.max(rect.top + 8, rect.top + rect.height / 2))));
    const before = getComputedStyle(selected, '::before');
    const after = getComputedStyle(selected, '::after');
    const selectedStyle = getComputedStyle(selected);
    const hit = document.elementFromPoint(x, y);
    const hitStyle = hit instanceof HTMLElement ? getComputedStyle(hit) : null;
    return {
      clip: {
        x: Math.max(0, x - rect.left - 1),
        y: Math.max(0, y - rect.top - 1),
        width: 3,
        height: 3,
      },
      label: input.label,
      targetHeight: rect.height,
      targetWidth: rect.width,
      selectedDebug: {
        afterBackground: after.backgroundColor,
        afterContent: after.content,
        afterDisplay: after.display,
        afterHeight: after.height,
        afterPosition: after.position,
        afterWidth: after.width,
        afterZIndex: after.zIndex,
        beforeBackground: before.backgroundColor,
        beforeContent: before.content,
        beforeDisplay: before.display,
        beforeHeight: before.height,
        beforePosition: before.position,
        beforeWidth: before.width,
        beforeZIndex: before.zIndex,
        hitBackground: hitStyle?.backgroundColor ?? '',
        hitClassName: hit instanceof HTMLElement ? hit.className : '',
        hitTagName: hit instanceof HTMLElement ? hit.tagName : '',
        sampleX: String(Math.round(x * 10) / 10),
        sampleY: String(Math.round(y * 10) / 10),
        selectedBottom: String(Math.round(rect.bottom * 10) / 10),
        rootBackground: selectedStyle.backgroundColor,
        selectedLeft: String(Math.round(rect.left * 10) / 10),
        rootPosition: selectedStyle.position,
        selectedRight: String(Math.round(rect.right * 10) / 10),
        selectedTop: String(Math.round(rect.top * 10) / 10),
        rootZIndex: selectedStyle.zIndex,
      },
      selectedClassName: selected.className,
      selectedTagName: selected.tagName,
      targetClassName,
    };
  }, { editorSelector: EDITOR_SELECTOR, input });

  expect(geometry, `${input.label}: selected pixel geometry`).not.toBeNull();
  let pixelLocator = page.locator(
    `${EDITOR_SELECTOR} ${input.targetSelector}`,
    input.targetText ? { hasText: input.targetText } : undefined,
  ).first();
  if (input.targetSelector.includes('image-block-container')) {
    pixelLocator = pixelLocator.locator('[data-image-selection-wrapper="true"]').first();
  }
  const box = await pixelLocator.boundingBox();
  expect(box, `${input.label}: selected pixel target box`).not.toBeNull();
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const screenshot = await page.screenshot({
    clip: {
      x: Math.max(0, scroll.x + box!.x + geometry!.clip.x),
      y: Math.max(0, scroll.y + box!.y + geometry!.clip.y),
      width: geometry!.clip.width,
      height: geometry!.clip.height,
    },
  });
  const dataUrl = `data:image/png;base64,${screenshot.toString('base64')}`;
  return page.evaluate(async ({ geometry, imageUrl }) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load selected block screenshot'));
      image.src = imageUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not create canvas context for selected block screenshot');
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    let red = 0;
    let green = 0;
    let blue = 0;
    const pixelCount = imageData.width * imageData.height;
    for (let offset = 0; offset < imageData.data.length; offset += 4) {
      red += imageData.data[offset] ?? 0;
      green += imageData.data[offset + 1] ?? 0;
      blue += imageData.data[offset + 2] ?? 0;
    }
    const average = {
      red: Math.round(red / pixelCount),
      green: Math.round(green / pixelCount),
      blue: Math.round(blue / pixelCount),
    };
    return {
      ...average,
      color: `rgb(${average.red}, ${average.green}, ${average.blue})`,
      label: geometry.label,
      selectedClassName: geometry.selectedClassName,
      selectedDebug: geometry.selectedDebug,
      selectedTagName: geometry.selectedTagName,
      targetClassName: geometry.targetClassName,
    };
  }, { geometry: geometry!, imageUrl: dataUrl });
}

function colorDistance(left: SampledPixel, right: SampledPixel) {
  return Math.hypot(left.red - right.red, left.green - right.green, left.blue - right.blue);
}

test.describe("notes block selection syntax drag", () => {
  test.setTimeout(90_000);

  test('keeps drag handles and transparent previews stable across markdown syntax blocks', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-drag-syntax-matrix');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'markdown-drag-syntax-matrix.md',
        content: createMarkdownSyntaxFixture(),
      });

      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Inline marks paragraph' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'syntaxSentinel' })).toBeVisible();
      await expect.poll(async () => page.locator(`${EDITOR_SELECTOR} .milkdown-table-block`).count())
        .toBeGreaterThan(0);
      await expect.poll(async () => page.locator(`${EDITOR_SELECTOR} div[data-type="math-block"]`).count())
        .toBeGreaterThan(0);
      await expect.poll(async () => page.locator(`${EDITOR_SELECTOR} div[data-type="mermaid"]`).count())
        .toBeGreaterThan(0);

      const geometrySamples: SyntaxHandleGeometry[] = [];
      for (const syntaxCase of MARKDOWN_DRAG_SYNTAX_CASES) {
        await selectSyntaxDragCase(page, syntaxCase);
        const target = locateSyntaxTarget(page, syntaxCase);
        await expect(target, `${syntaxCase.label}: target should be visible`).toBeVisible();
        await moveMouseToSyntaxHandleGutter(page, syntaxCase);

        const geometry = await measureSyntaxHandleGeometry(page, syntaxCase);
        expectSyntaxHandleGeometry(syntaxCase, geometry);
        geometrySamples.push(geometry);

        const visual = await dragVisibleHandleAndMeasure(page, syntaxCase.label);
        expectTransparentDragVisual(syntaxCase.label, visual);
      }

      const mixedTarget = MARKDOWN_DRAG_SYNTAX_CASES.find((syntaxCase) => syntaxCase.label === 'markdown-table');
      if (!mixedTarget) {
        throw new Error('Missing markdown-table drag syntax case');
      }

      await selectNoteBlocksByMatchers(page, [
        { include: 'Inline marks paragraph' },
        { include: 'Task item unchecked sentinel' },
        { include: 'Table alpha' },
        { include: 'syntaxSentinel' },
      ]);
      await moveMouseToSyntaxHandleGutter(page, mixedTarget);
      const mixedGeometry = await measureSyntaxHandleGeometry(page, mixedTarget);
      expectSyntaxHandleGeometry(mixedTarget, mixedGeometry, { expectedSelectedCount: 4 });

      const mixedVisual = await dragVisibleHandleAndMeasure(page, 'mixed-rich-syntax-selection');
      expectTransparentDragVisual('mixed-rich-syntax-selection', mixedVisual);
      expect(mixedVisual.sourceCount, 'mixed-rich-syntax-selection: source blocks').toBeGreaterThanOrEqual(2);

      console.info('[notes-block-drag-syntax-matrix]', {
        sampledCount: geometrySamples.length,
        samples: geometrySamples.map((sample) => ({
          label: sample.label,
          tagName: sample.targetTagName,
          className: sample.targetClassName,
          targetGapX: Math.round(sample.targetGapX * 10) / 10,
          handleRightGapX: Math.round(sample.handleRightGapX * 10) / 10,
          targetText: sample.targetText,
        })),
        mixed: {
          selectedCount: mixedGeometry.selectedCount,
          sourceCount: mixedVisual.sourceCount,
          targetGapX: Math.round(mixedGeometry.targetGapX * 10) / 10,
        },
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps selected syntax block surfaces on the shared block selection color in dark mode', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-syntax-surface-audit');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'markdown-selection-surface-audit.md',
        content: createMarkdownSyntaxFixture(),
      });

      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
      });
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Inline marks paragraph' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container[data-alt="HTML crop cover sentinel"]`)).toBeVisible();

      const reports = [];
      for (const syntaxCase of MARKDOWN_SELECTION_SURFACE_CASES) {
        const report = await page.evaluate(async ({ editorSelector, syntaxCase }) => {
          const normalize = (value: string | undefined | null) => (value ?? '').replace(/\s+/g, ' ').trim();
          const isTransparentColor = (value: string) => (
            value === 'transparent' ||
            /^rgba?\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(value.trim())
          );
          const parseRgb = (value: string): [number, number, number, number] | null => {
            const match = value.match(/rgba?\(([^)]+)\)/i);
            if (!match) return null;
            const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
            if (parts.length < 3 || parts.some((part, index) => index < 3 && !Number.isFinite(part))) return null;
            return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
          };
          const colorDistance = (left: string, right: string) => {
            const l = parseRgb(left);
            const r = parseRgb(right);
            if (!l || !r) return Number.POSITIVE_INFINITY;
            return Math.abs(l[0] - r[0]) + Math.abs(l[1] - r[1]) + Math.abs(l[2] - r[2]) + Math.abs(l[3] - r[3]) * 255;
          };
          const isExpectedColor = (value: string, expected: string) => colorDistance(value, expected) <= 3;
          const editor = document.querySelector<HTMLElement>(editorSelector);
          if (!editor) return { label: syntaxCase.label, ok: false, reason: 'editor-missing' };
          editor.querySelectorAll<HTMLElement>('[data-e2e-manual-selection="true"]').forEach((element) => {
            element.classList.remove('editor-block-selected', 'md-focus');
            delete element.dataset.e2eManualSelection;
          });

          const target = Array.from(editor.querySelectorAll<HTMLElement>(syntaxCase.targetSelector))
            .find((element) => !syntaxCase.targetText || normalize(element.textContent).includes(syntaxCase.targetText))
            ?? null;
          if (!target) return { label: syntaxCase.label, ok: false, reason: 'target-missing' };

          target.scrollIntoView({ block: 'center', inline: 'nearest' });
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

          const targetRect = target.getBoundingClientRect();
          const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
            text: string;
            tagName: string;
            className: string;
            dataset: Record<string, string>;
            rect: { left: number; top: number; width: number; height: number };
          }>;
          const targetClassName = typeof target.className === 'string' ? target.className : '';
          const targetDataset = { ...target.dataset };
          const matchesImageTarget = (block: { className: string; dataset: Record<string, string> }) => {
            if (!targetClassName.includes('image-block-container')) return false;
            if (!block.className.includes('image-block-container')) return false;
            if (targetDataset.alt && block.dataset.alt === targetDataset.alt) return true;
            if (targetDataset.src && block.dataset.src === targetDataset.src) return true;
            return false;
          };
          const intersectionArea = (rect: { left: number; top: number; width: number; height: number }) => {
            const right = rect.left + rect.width;
            const bottom = rect.top + rect.height;
            const overlapLeft = Math.max(rect.left, targetRect.left);
            const overlapRight = Math.min(right, targetRect.right);
            const overlapTop = Math.max(rect.top, targetRect.top);
            const overlapBottom = Math.min(bottom, targetRect.bottom);
            return Math.max(0, overlapRight - overlapLeft) * Math.max(0, overlapBottom - overlapTop);
          };
          const indexedBlocks = blocks
            .map((block, index) => ({ block, index, area: intersectionArea(block.rect) }))
            .filter((candidate) => candidate.area > 0)
            .sort((left, right) => right.area - left.area);
          const selectedIndex = blocks.findIndex(matchesImageTarget);
          const resolvedSelectedIndex = selectedIndex >= 0 ? selectedIndex : indexedBlocks[0]?.index ?? -1;
          const canUseDomSelectionFallback = resolvedSelectedIndex < 0 && targetClassName.includes('image-block-container');
          if (resolvedSelectedIndex < 0 && !canUseDomSelectionFallback) {
            return {
              label: syntaxCase.label,
              ok: false,
              reason: 'selectable-block-missing',
              targetText: normalize(target.textContent).slice(0, 160),
              blockSummaries: blocks.map((block) => ({
                tagName: block.tagName,
                className: block.className,
                dataset: block.dataset,
                text: normalize(block.text).slice(0, 80),
              })).slice(0, 120),
              imageBlockSummaries: blocks
                .filter((block) => block.className.includes('image-block-container') || block.dataset.alt || block.dataset.src)
                .map((block) => ({
                  tagName: block.tagName,
                  className: block.className,
                  dataset: block.dataset,
                  text: normalize(block.text).slice(0, 80),
                })),
            };
          }

          const selectedCount = canUseDomSelectionFallback
            ? 1
            : await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([resolvedSelectedIndex]);
          if (canUseDomSelectionFallback) {
            target.dataset.e2eManualSelection = 'true';
            target.classList.add('editor-block-selected', 'md-focus');
          }
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          if (selectedCount !== 1) {
            return { label: syntaxCase.label, ok: false, reason: 'selection-count-mismatch', selectedCount };
          }

          const selectedElements = Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selected, .ProseMirror-selectednode'));
          let selected = selectedElements.find((element) => (
            element === target ||
            element.contains(target) ||
            target.contains(element)
          )) ?? selectedElements[0] ?? null;
          if (!selected && targetClassName.includes('image-block-container')) {
            target.dataset.e2eManualSelection = 'true';
            target.classList.add('editor-block-selected', 'md-focus');
            selected = target;
          }
          if (!selected) return { label: syntaxCase.label, ok: false, reason: 'selected-element-missing' };

          const probe = document.createElement('span');
          probe.style.backgroundColor = 'var(--vlaina-block-selection-color-default)';
          document.body.appendChild(probe);
          const expectedBackground = getComputedStyle(probe).backgroundColor;
          probe.remove();

          const transparentOrSelected = (value: string) => (
            isTransparentColor(value) ||
            isExpectedColor(value, expectedBackground)
          );
          const classText = (element: Element) => typeof element.className === 'string' ? element.className : '';
          const isIgnoredSurface = (element: HTMLElement) => (
            ['IMG', 'SVG', 'PATH', 'TEXT', 'TSPAN', 'IFRAME', 'VIDEO', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'CODE', 'MARK'].includes(element.tagName) ||
            element.dataset.editorTagToken === 'true' ||
            Boolean(element.closest('.editor-block-controls, .image-toolbar, .code-block-chrome-copy-button, .video-external-action'))
          );
          const isSurfaceCandidate = (element: HTMLElement) => {
            if (element === selected) return true;
            const name = classText(element);
            const testId = element.dataset.testid ?? '';
            if ((name.includes('cm-') && (element.closest('.code-block-container') || element.closest('.frontmatter-block-container'))) || name.includes('code-block') || name.includes('frontmatter')) return true;
            if (name.includes('table-content-host') || name.includes('table-scroll-track') || element.tagName === 'TD' || element.tagName === 'TH') return true;
            if (name.includes('image-block') || testId.includes('image-placeholder')) return true;
            if (element.dataset.imageSelectionWrapper === 'true') return true;
            if (element.dataset.imageSelectionSurface === 'true') return true;
            if (name.includes('bg-[var(--vlaina-color-editor-image-surface)]')) return true;
            if (name.includes('video-block') || name.includes('mermaid-block')) return true;
            if (element.dataset.type === 'callout' || name.includes('callout')) return true;
            if (element.dataset.type === 'toc') return true;
            if (element.dataset.type === 'math-block' || element.dataset.type === 'mermaid' || element.dataset.type === 'video') return true;
            return false;
          };
          const describeElement = (element: HTMLElement, backgroundColor: string) => {
            const rect = element.getBoundingClientRect();
            return {
              tagName: element.tagName,
              className: classText(element).slice(0, 240),
              dataset: { ...element.dataset },
              text: normalize(element.textContent).slice(0, 120),
              backgroundColor,
              backgroundImage: getComputedStyle(element).backgroundImage,
              rect: {
                left: Math.round(rect.left * 10) / 10,
                top: Math.round(rect.top * 10) / 10,
                width: Math.round(rect.width * 10) / 10,
                height: Math.round(rect.height * 10) / 10,
              },
            };
          };

          const elements = [selected, ...Array.from(selected.querySelectorAll<HTMLElement>('*'))];
          const offenders = elements.flatMap((element) => {
            if (isIgnoredSurface(element) || !isSurfaceCandidate(element)) return [];
            const rect = element.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return [];
            const style = getComputedStyle(element);
            const allowedBackground = element === selected || element.dataset.imageSelectionWrapper === 'true'
              ? transparentOrSelected(style.backgroundColor)
              : isTransparentColor(style.backgroundColor);
            const hasOpaqueBackground = !allowedBackground;
            const hasPaintedBackgroundImage = style.backgroundImage !== 'none' && (element === selected
              ? !isExpectedColor(style.backgroundColor, expectedBackground)
              : true);
            if (!hasOpaqueBackground && !hasPaintedBackgroundImage) return [];
            return [describeElement(element, style.backgroundColor)];
          });

          return {
            label: syntaxCase.label,
            ok: offenders.length === 0,
            reason: offenders.length > 0 ? 'non-unified-selected-surface' : null,
            expectedBackground,
            selected: describeElement(selected, getComputedStyle(selected).backgroundColor),
            offenders,
          };
        }, { editorSelector: EDITOR_SELECTOR, syntaxCase });

        reports.push(report);
      }

      const failures = reports.filter((report: any) => !report.ok);
      expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);

      const baselinePixel = await sampleSelectedBlockBackgroundPixel(page, {
        label: 'inline-rich-paragraph',
        targetSelector: 'p',
        targetText: 'Inline marks paragraph',
      });
      const visualPixels = [
        await sampleSelectedBlockBackgroundPixel(page, {
          label: 'fenced-code-block',
          targetSelector: '.code-block-container',
          targetText: 'syntaxSentinel',
        }),
      ];

      const visualFailures = visualPixels
        .map((sample) => ({
          ...sample,
          baseline: baselinePixel.color,
          distance: Math.round(colorDistance(sample, baselinePixel) * 10) / 10,
        }))
        .filter((sample) => sample.distance > 8);
      expect(visualFailures, JSON.stringify({ baselinePixel, visualPixels, visualFailures }, null, 2)).toEqual([]);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps footnote reference paragraphs draggable with the standard block handle', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-footnote-reference-block-drag');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'footnote-reference-block-drag.md',
        content: [
          '# Footnote Reference Drag',
          '',
          'Footnote reference paragraph alpha[^alpha].',
          '',
          '[^alpha]: Footnote definition body alpha.',
          '',
        ].join('\n'),
      });

      const footnoteCase: MarkdownDragSyntaxCase = {
        label: 'footnote-reference-paragraph',
        targetSelector: 'p',
        targetText: 'Footnote reference paragraph alpha',
        gap: 'standard',
      };

      await expect(
        page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Footnote reference paragraph alpha' }),
      ).toBeVisible();
      await selectSyntaxDragCase(page, footnoteCase);
      await moveMouseToSyntaxHandleGutter(page, footnoteCase);

      const geometry = await measureSyntaxHandleGeometry(page, footnoteCase);
      expectSyntaxHandleGeometry(footnoteCase, geometry);

      const visual = await dragVisibleHandleAndMeasure(page, footnoteCase.label);
      expectTransparentDragVisual(footnoteCase.label, visual);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps footnote definition rail and label colors during block selection', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-footnote-definition-selection-rail');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'footnote-definition-selection-rail.md',
        content: [
          'Paragraph with footnote[^1].',
          '',
          '',
          '[^1]: Footnote body sentinel for selection rail.',
          '',
        ].join('\n'),
      });

      const baseline = await page.evaluate((editorSelector) => {
        const editor = document.querySelector<HTMLElement>(editorSelector);
        const footnote = editor?.querySelector<HTMLElement>('.footnote-def') ?? null;
        const label = footnote?.querySelector<HTMLElement>('.footnote-def-label') ?? null;
        if (!footnote || !label) return null;
        const footnoteStyle = getComputedStyle(footnote);
        const labelStyle = getComputedStyle(label);
        return {
          borderLeftColor: footnoteStyle.borderLeftColor,
          labelColor: labelStyle.color,
          labelTextFillColor: labelStyle.webkitTextFillColor,
        };
      }, EDITOR_SELECTOR);
      expect(baseline, 'footnote color baseline').not.toBeNull();

      const selectionResult = await page.evaluate(async () => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          text: string;
          tagName: string;
          from: number;
          to: number;
        }>;
        const index = blocks.findIndex((block) => block.text.includes('Footnote body sentinel'));
        const selectedIndexes = index >= 0
          ? [index - 2, index - 1, index, index + 1].filter((candidate) => (
            candidate >= 0 && candidate < blocks.length
          ))
          : [];
        const count = index >= 0
          ? await (window as any).__vlainaE2E.selectNoteBlocksByIndexes(selectedIndexes)
          : 0;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return { blocks, count, index, selectedIndexes };
      });

      expect(selectionResult.index, JSON.stringify(selectionResult.blocks)).toBeGreaterThanOrEqual(0);
      expect(selectionResult.count).toBe(selectionResult.selectedIndexes.length);

      const styles = await page.evaluate((editorSelector) => {
        const editor = document.querySelector<HTMLElement>(editorSelector);
        const footnote = editor?.querySelector<HTMLElement>('.footnote-def') ?? null;
        const label = footnote?.querySelector<HTMLElement>('.footnote-def-label') ?? null;
        if (!footnote || !label) return null;

        const footnoteStyle = getComputedStyle(footnote);
        const labelStyle = getComputedStyle(label);
        const beforeStyle = getComputedStyle(footnote, '::before');
        const afterStyle = getComputedStyle(footnote, '::after');
        return {
          footnoteClassName: footnote.className,
          afterBottom: afterStyle.bottom,
          beforeBorderLeftColor: beforeStyle.borderLeftColor,
          beforeBorderLeftWidth: beforeStyle.borderLeftWidth,
          beforeBackground: beforeStyle.backgroundColor,
          beforeContent: beforeStyle.content,
          beforeDisplay: beforeStyle.display,
          beforeRadius: beforeStyle.borderTopLeftRadius,
          borderLeftColor: footnoteStyle.borderLeftColor,
          borderLeftWidth: footnoteStyle.borderLeftWidth,
          borderRadius: footnoteStyle.borderTopLeftRadius,
          color: footnoteStyle.color,
          fillBottom: footnoteStyle.getPropertyValue('--vlaina-block-selection-fill-bottom').trim(),
          fillTop: footnoteStyle.getPropertyValue('--vlaina-block-selection-fill-top').trim(),
          labelColor: labelStyle.color,
          labelTextFillColor: labelStyle.webkitTextFillColor,
          selectionSurfaceLeft: afterStyle.left,
          selectionSurfaceBackground: afterStyle.backgroundColor,
          selectionSurfaceTop: afterStyle.top,
        };
      }, EDITOR_SELECTOR);

      expect(styles).not.toBeNull();
      expect(styles!.footnoteClassName).toContain('editor-block-selected');
      expect(Number.parseFloat(styles!.fillBottom)).toBe(0);
      expect(Number.parseFloat(styles!.fillTop)).toBe(0);
      expect(styles!.beforeBackground).toBe('rgba(0, 0, 0, 0)');
      expect(styles!.beforeBorderLeftColor).toBe(baseline!.borderLeftColor);
      expect(styles!.beforeBorderLeftWidth).toBe('3px');
      expect(styles!.beforeContent).not.toBe('none');
      expect(styles!.beforeDisplay).toBe('block');
      expect(styles!.beforeRadius).toBe(styles!.borderRadius);
      expect(styles!.borderLeftWidth).toBe('3px');
      expect(styles!.borderLeftColor).toBe(baseline!.borderLeftColor);
      expect(Number.parseFloat(styles!.selectionSurfaceLeft)).toBeLessThanOrEqual(0);
      expect(styles!.selectionSurfaceTop).toBe('0px');
      expect(styles!.afterBottom).toBe('0px');
      expect(styles!.labelColor).toBe(baseline!.labelColor);
      expect(styles!.labelTextFillColor).toBe(baseline!.labelTextFillColor);
      expect(styles!.selectionSurfaceBackground).not.toBe(styles!.borderLeftColor);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
