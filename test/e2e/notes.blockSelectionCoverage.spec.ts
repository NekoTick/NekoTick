import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EDITOR_SELECTOR,
  SELECTED_BLOCK_SELECTOR,
  cleanupIsolatedElectron,
  getBlankAreaDragTarget,
  getOpenBridgePages,
  getSelectableBlocks,
  launchIsolatedElectron,
  openMarkdownFixture,
  selectNoteBlocksByIndexes,
  waitForEditorAnimationFrame,
} from './notesE2E';
import { createMarkdownSyntaxFixture } from './notesMarkdownSyntaxFixture';

type SelectionEdgeSample = {
  index: number;
  label: string;
  tagName: string;
  className: string;
  text: string;
  rawLeft: number;
  rawRight: number;
  visualLeft: number;
  visualRight: number;
  fillLeft: number | null;
  fillRight: number | null;
  baselineLeftDelta: number;
  baselineRightDelta: number;
  bleedStart: number;
  bleedEnd: number;
};

type SelectionPaintEdgeSample = {
  afterDisplay: string;
  afterLeft: number | null;
  bleedStart: number;
  className: string;
  expectedPaintLeft: number;
  largeActive: boolean;
  leftGap: number;
  paintLeft: number;
  previewSelectionCount: number;
  rectLeft: number;
  selectedCount: number;
  text: string;
  usesSvgPreview: boolean;
};

type DraggedCodeBlockPaintSample = {
  activeActive: boolean;
  borderBottomColor: string | null;
  borderBottomWidth: string | null;
  borderLeftColor: string | null;
  borderLeftWidth: string | null;
  borderRightColor: string | null;
  borderRightWidth: string | null;
  borderTopColor: string | null;
  borderTopWidth: string | null;
  className: string;
  codeBackgroundColor: string;
  codeLineColor: string | null;
  codeLineTextFillColor: string | null;
  codeSelected: boolean;
  committedPreviewPresent: boolean;
  dragPreviewActive: boolean;
  dragPreviewPresent: boolean;
  editorZIndex: string;
  expectedBorderColor: string;
  expectedCodeLineColor: string;
  expectedLanguageColor: string;
  expectedTokenColor: string;
  innerBackgroundColor: string | null;
  languageColor: string | null;
  languageTextFillColor: string | null;
  largeActive: boolean;
  previewFillColor: string | null;
  previewSelectionCount: number;
  previewSurfaceActive: boolean;
  previewZIndex: string | null;
  selectedCount: number;
  selectionColor: string;
  text: string;
  tokenClassName: string | null;
  tokenColor: string | null;
  tokenText: string | null;
  tokenTextFillColor: string | null;
};

type DragPreviewGeometrySample = {
  pathIndex: number;
  previewBottom: number;
  previewHeight: number;
  previewTop: number;
  targetBottom: number;
  targetHeight: number;
  targetTop: number;
};

type RenderedSelectionPixelSlot =
  | 'innerSurface'
  | 'topBleed'
  | 'bottomBleed'
  | 'leftBleed'
  | 'rightBleed';

type RenderedSelectionPixelSample = {
  alpha: number;
  color: string;
  distance: number;
  slot: RenderedSelectionPixelSlot;
  x: number;
  y: number;
};

type RenderedSelectionPixelReport = {
  activeActive: boolean;
  className: string;
  clip: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  insideSelectedParent: boolean;
  largeActive: boolean;
  pendingActive: boolean;
  rect: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  };
  previewSelectionCount: number;
  samples: RenderedSelectionPixelSample[];
  selectedCount: number;
  selectionColor: string;
  targetSelected: boolean;
  text: string;
};

type RenderedCodeBlockBorderPixelSlot =
  | 'topBorder'
  | 'rightBorder'
  | 'bottomBorder'
  | 'leftBorder';

type RenderedCodeBlockBorderPixelSample = {
  alpha: number;
  color: string;
  distance: number;
  slot: RenderedCodeBlockBorderPixelSlot;
  x: number;
  y: number;
};

type RenderedCodeBlockBorderPixelReport = {
  className: string;
  clip: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  expectedBorderColor: string;
  rect: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  };
  samples: RenderedCodeBlockBorderPixelSample[];
  text: string;
};

type LargeSelectionPaintCase = {
  label: string;
  selector: string;
  anchorText: string;
  targetIndexSelector?: string;
  targetText?: string;
};

const LARGE_SELECTION_SAMPLE_COUNT = 132;

const LARGE_SELECTION_SYNTAX_PAINT_CASES: LargeSelectionPaintCase[] = [
  {
    label: 'frontmatter',
    selector: '.frontmatter-block-container',
    anchorText: 'title: E2E Markdown Syntax',
    targetText: 'title: E2E Markdown Syntax',
  },
  {
    label: 'toc',
    selector: 'div[data-type="toc"]',
    anchorText: 'Heading Coverage',
    targetText: 'Heading Coverage',
  },
  {
    label: 'heading',
    selector: 'h2',
    anchorText: 'Inline Marks And Links',
    targetText: 'Inline Marks And Links',
  },
  {
    label: 'paragraph',
    selector: 'p',
    anchorText: 'Inline marks paragraph',
    targetText: 'Inline marks paragraph',
  },
  {
    label: 'blockquote',
    selector: 'blockquote',
    anchorText: 'Regular quote line one',
    targetText: 'Regular quote line one',
  },
  {
    label: 'callout',
    selector: 'div[data-type="callout"]',
    anchorText: 'Emoji callout sentinel',
    targetText: 'Emoji callout sentinel',
  },
  {
    label: 'list-item',
    selector: 'ul > li',
    anchorText: 'Bullet item alpha',
    targetText: 'Bullet item alpha',
  },
  {
    label: 'nested-list-item',
    selector: 'li li li',
    anchorText: 'Third-level bullet sentinel',
    targetText: 'Third-level bullet sentinel',
  },
  {
    label: 'task-list-item',
    selector: 'li[data-item-type="task"]',
    anchorText: 'Task item unchecked sentinel',
    targetText: 'Task item unchecked sentinel',
  },
  {
    label: 'table',
    selector: '.milkdown-table-block',
    anchorText: 'Table alpha',
    targetText: 'Table alpha',
  },
  {
    label: 'horizontal-rule',
    selector: '.md-hr',
    anchorText: 'Horizontal Rules',
    targetIndexSelector: '.md-hr',
  },
  {
    label: 'code-block',
    selector: '.code-block-container',
    anchorText: 'syntaxSentinel',
    targetText: 'syntaxSentinel',
  },
  {
    label: 'math-block',
    selector: 'div[data-type="math-block"]',
    anchorText: 'E=mc',
    targetText: 'E=mc',
  },
  {
    label: 'mermaid-block',
    selector: '.mermaid-block',
    anchorText: 'Inline math sentinel',
  },
  {
    label: 'image-block',
    selector: '.image-block-container[data-alt="Image alt sentinel"]',
    anchorText: 'Media',
    targetIndexSelector: '.image-block-container[data-alt="Image alt sentinel"]',
  },
  {
    label: 'video-block',
    selector: 'div[data-type="video"]',
    anchorText: 'Media',
    targetIndexSelector: 'div[data-type="video"]',
  },
  {
    label: 'footnote-definition',
    selector: 'div.footnote-def[data-type="footnote_definition"]',
    anchorText: 'Footnote definition sentinel',
    targetText: 'Footnote definition sentinel',
  },
  {
    label: 'html-block',
    selector: '.md-htmlblock',
    anchorText: 'Raw HTML block sentinel',
    targetText: 'Raw HTML block sentinel',
  },
];

function createLargeSelectionSyntaxAuditMarkdown(): string {
  const tail = Array.from(
    { length: 180 },
    (_, index) => `Large selection syntax audit tail block ${index} sentinel.`,
  ).join('\n\n');

  return [
    createMarkdownSyntaxFixture(),
    '',
    '## Large Selection Syntax Audit Tail',
    '',
    tail,
  ].join('\n');
}

function createLargeDragSelectionCodeMarkdown(): string {
  const beforeCode = Array.from(
    { length: 30 },
    (_, index) => `Drag code selection filler before ${index} sentinel.`,
  ).join('\n\n');
  const afterCode = Array.from(
    { length: 158 },
    (_, index) => `Drag code selection filler after ${index} sentinel.`,
  ).join('\n\n');

  return [
    '# Drag Code Selection Audit',
    '',
    'Drag code selection start sentinel.',
    '',
    beforeCode,
    '',
    '```ts',
    'const dragCodeSentinel = "selected code background";',
    'console.log(dragCodeSentinel);',
    '```',
    '',
    afterCode,
  ].join('\n');
}

function createContainedCodeSelectionAuditMarkdown(): string {
  const tail = Array.from(
    { length: 180 },
    (_, index) => `Contained code large selection tail block ${index} sentinel.`,
  ).join('\n\n');

  return [
    '# Contained Code Selection Audit',
    '',
    '- Contained code parent sentinel',
    '',
    '  ```ts',
    '  const nestedCodeSelectionSentinel = "selected parent";',
    '  console.log(nestedCodeSelectionSentinel);',
    '  ```',
    '',
    tail,
  ].join('\n');
}

test.describe('notes block selection visual coverage', () => {
  test.setTimeout(120_000);

  test('keeps selected block edges aligned across supported markdown block types', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-coverage');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      page.on('console', (message) => {
        const text = message.text();
        if (text.includes('[notes-milkdown-timing:') || text.includes('Error') || text.includes('error')) {
          console.info(`[notes-block-selection-coverage:console] ${text}`);
        }
      });
      page.on('pageerror', (error) => {
        console.info(`[notes-block-selection-coverage:pageerror] ${error.message}`);
      });
      await openMarkdownFixture(page, {
        filename: 'markdown-selection-warmup.md',
        content: ['# Selection Warmup', '', 'Warmup paragraph sentinel.'].join('\n'),
      });
      await openMarkdownFixture(page, {
        filename: 'markdown-selection-coverage.md',
        content: createMarkdownSyntaxFixture(),
      });

      await expect.poll(
        async () => (await getSelectableBlocks(page)).length,
        { timeout: 30_000 },
      ).toBeGreaterThan(50);
      const selectableBlocks = await getSelectableBlocks(page);
      expect(selectableBlocks.length).toBeGreaterThan(50);

      const baselineIndex = selectableBlocks.findIndex((block) =>
        block.text.includes('Inline marks paragraph'));
      expect(baselineIndex).toBeGreaterThanOrEqual(0);

      const baseline = await measureSelectedBlock(page, baselineIndex, 'baseline-paragraph');
      expect(baseline).not.toBeNull();

      const samples: SelectionEdgeSample[] = [];
      for (let index = 0; index < selectableBlocks.length; index += 1) {
        if (index === baselineIndex) continue;
        const sample = await measureSelectedBlock(page, index, `block-${index}`, baseline!);
        if (sample) samples.push(sample);
      }

      expect(samples.length).toBeGreaterThan(50);

      const outliers = samples.filter((sample) =>
        !sample.className.includes('editor-list-gap-placeholder-item') &&
        (Math.abs(sample.baselineLeftDelta) > 4 || Math.abs(sample.baselineRightDelta) > 4));
      const sampledKinds = Array.from(new Set(samples.map((sample) => describeSelectedKind(sample))));
      console.info('[notes-block-selection-edge-samples]', {
        baseline,
        sampledCount: samples.length,
        sampledKinds,
        outliers,
      });

      expect(outliers).toEqual([]);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps large manual-fixture block selection painted to the same left edge as single selection', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-manual-large-edge');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const manualMarkdown = readFileSync(resolve(process.cwd(), 'test/e2e/notes-manual-performance.md'), 'utf8');

      await openMarkdownFixture(page, {
        filename: 'manual-large-block-selection-edge.md',
        content: manualMarkdown,
      });

      await expect.poll(
        async () => (await getSelectableBlocks(page)).length,
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(180);
      const selectableBlocks = await getSelectableBlocks(page);
      expect(selectableBlocks.length).toBeGreaterThanOrEqual(180);

      const targetIndex = selectableBlocks.findIndex((block) =>
        block.text.includes('这份文档模拟一份功能全面的 Markdown 使用手册')
      );
      expect(targetIndex).toBeGreaterThanOrEqual(0);
      expect(selectableBlocks.length - targetIndex).toBeGreaterThanOrEqual(140);

      const targetText = selectableBlocks[targetIndex].text.slice(0, 28);
      await selectNoteBlocksByIndexes(page, [targetIndex]);
      const singleSelection = await measureSelectedPaintEdge(page, targetText);
      expect(singleSelection.largeActive).toBe(true);
      expect(singleSelection.afterDisplay).not.toBe('none');
      expect(Math.abs(singleSelection.leftGap)).toBeLessThanOrEqual(1);

      const largeIndexes = Array.from({ length: 132 }, (_, offset) => targetIndex + offset);
      const codeIndex = selectableBlocks.findIndex((block) => block.text.includes('blockquote{border-left'));
      expect(codeIndex).toBeGreaterThanOrEqual(0);
      expect(largeIndexes).toContain(codeIndex);
      await selectNoteBlocksByIndexes(page, largeIndexes);
      const largeSelection = await measureSelectedPaintEdge(page, targetText);
      const largeCodeBlockPixels = await measureRenderedSelectionPixels(page, {
        selector: '.code-block-container',
        targetText: 'blockquote{border-left',
      });

      console.info('[notes-block-selection-manual-large-edge]', {
        targetIndex,
        singleSelection,
        largeSelection,
        largeCodeBlockPixels,
      });

      expect(largeSelection.largeActive).toBe(true);
      expect(largeSelection.usesSvgPreview).toBe(true);
      expect(largeSelection.previewSelectionCount).toBeGreaterThanOrEqual(128);
      expect(largeSelection.selectedCount).toBe(0);
      expect(largeSelection.afterDisplay).toBe('svg');
      expect(Math.abs(largeSelection.leftGap)).toBeLessThanOrEqual(1);
      expect(Math.abs(largeSelection.paintLeft - singleSelection.paintLeft)).toBeLessThanOrEqual(2);
      expect(largeCodeBlockPixels.largeActive).toBe(true);
      expect(largeCodeBlockPixels.selectedCount).toBe(0);
      expectSelectionPixels(largeCodeBlockPixels, 'manual fixture code block', [
        'innerSurface',
        'leftBleed',
        'rightBleed',
      ]);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps code block blue selection background visible while dragging a large block range', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-drag-code-large-paint');
    let mouseIsDown = false;

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'drag-code-large-selection-paint.md',
        content: createLargeDragSelectionCodeMarkdown(),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Drag code selection start sentinel' })).toBeVisible();

      const dragTarget = await getLargeBlankAreaDragTarget(page, 'Drag code selection start sentinel');
      expect(dragTarget, 'blank-area drag target').not.toBeNull();
      if (!dragTarget) return;

      await page.mouse.move(dragTarget.startX, dragTarget.startY);
      await page.mouse.down();
      mouseIsDown = true;
      await page.mouse.move(dragTarget.edgeX, dragTarget.edgeY, { steps: 10 });
      await page.waitForFunction(({ editorSelector, targetText }) => {
        const editor = document.querySelector<HTMLElement>(editorSelector);
        const target = Array.from(editor?.querySelectorAll<HTMLElement>('.code-block-container') ?? [])
          .find((element) => element.textContent?.includes(targetText));
        const preview = document.querySelector<SVGSVGElement>('[data-editor-block-selection-preview="true"]');
        return Boolean(
          editor?.classList.contains('editor-block-selection-drag-preview-active')
          && preview?.firstElementChild?.hasAttribute('d')
          // One visible block can sit just above the viewport while the
          // committed preview threshold is reached during auto-scroll.
          && Number(preview.dataset.selectionCount ?? '0') >= 31
          && target?.classList.contains('editor-block-selection-preview-surface')
        );
      }, {
        editorSelector: EDITOR_SELECTOR,
        targetText: 'dragCodeSentinel',
      });

      const draggingSample = await measureDraggedCodeBlockPaint(page, 'dragCodeSentinel');
      expect(draggingSample).not.toBeNull();
      if (!draggingSample) return;
      expect(draggingSample.dragPreviewActive).toBe(true);
      expect(draggingSample.dragPreviewPresent).toBe(true);
      expect(draggingSample.committedPreviewPresent).toBe(false);
      expect(draggingSample.largeActive).toBe(true);
      expect(draggingSample.selectedCount).toBe(0);
      expect(draggingSample.previewSelectionCount).toBeGreaterThan(0);
      expect(draggingSample.codeSelected).toBe(true);
      expect(draggingSample.previewSurfaceActive).toBe(true);
      expect(draggingSample.previewFillColor).toBe(draggingSample.selectionColor);
      expect(draggingSample.previewZIndex).toBe('0');
      expect(draggingSample.editorZIndex).toBe('1');
      expect(draggingSample.codeBackgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(draggingSample.innerBackgroundColor).toBe('rgba(0, 0, 0, 0)');
      if (draggingSample.codeLineColor !== null) {
        expect(draggingSample.codeLineColor, 'dragging code block: CodeMirror line color')
          .toBe(draggingSample.expectedCodeLineColor);
        expect(draggingSample.codeLineTextFillColor, 'dragging code block: CodeMirror line text fill')
          .toBe(draggingSample.expectedCodeLineColor);
      }

      const codeCenter = await page.evaluate((targetText) => {
        const target = Array.from(document.querySelectorAll<HTMLElement>('.code-block-container'))
          .find((element) => element.textContent?.includes(targetText));
        if (!target) return null;
        const rect = target.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }, 'dragCodeSentinel');
      expect(codeCenter, 'selected code block center').not.toBeNull();
      if (!codeCenter) return;
      await page.mouse.move(codeCenter.x, codeCenter.y);
      await waitForEditorAnimationFrame(page);

      const initialGeometry = await measureDragPreviewGeometry(page, 'dragCodeSentinel');
      expect(initialGeometry, 'initial code block drag preview geometry').not.toBeNull();
      if (!initialGeometry) return;
      expect(Math.abs(initialGeometry.previewTop - initialGeometry.targetTop)).toBeLessThanOrEqual(8);
      expect(Math.abs(initialGeometry.previewBottom - initialGeometry.targetBottom)).toBeLessThanOrEqual(8);

      await page.evaluate((targetText) => {
        const target = Array.from(document.querySelectorAll<HTMLElement>('.code-block-container'))
          .find((element) => element.textContent?.includes(targetText));
        if (!target) return;
        target.style.minHeight = `${Math.ceil(target.getBoundingClientRect().height + 240)}px`;
      }, 'dragCodeSentinel');

      let resizedGeometry: DragPreviewGeometrySample | null = null;
      await expect.poll(async () => {
        resizedGeometry = await measureDragPreviewGeometry(
          page,
          'dragCodeSentinel',
          initialGeometry.pathIndex,
        );
        if (!resizedGeometry) return Number.POSITIVE_INFINITY;
        return Math.max(
          Math.abs(resizedGeometry.previewTop - resizedGeometry.targetTop),
          Math.abs(resizedGeometry.previewBottom - resizedGeometry.targetBottom),
        );
      }, { timeout: 5_000 }).toBeLessThanOrEqual(8);
      expect(resizedGeometry).not.toBeNull();
      expect(resizedGeometry!.targetHeight - initialGeometry.targetHeight).toBeGreaterThanOrEqual(220);
      expect(resizedGeometry!.previewHeight - initialGeometry.previewHeight).toBeGreaterThanOrEqual(220);

      await page.mouse.up();
      mouseIsDown = false;

      const settledSample = await waitForDraggedCodeBlockPaint(page, 'dragCodeSentinel');
      expect(settledSample.dragPreviewActive).toBe(false);
      expect(settledSample.dragPreviewPresent).toBe(false);
      expect(settledSample.committedPreviewPresent).toBe(true);
      expect(settledSample.largeActive).toBe(true);
      expect(settledSample.selectedCount).toBe(0);
      expect(settledSample.previewSelectionCount).toBeGreaterThanOrEqual(32);
      expect(settledSample.previewSurfaceActive).toBe(true);
      expect(settledSample.previewFillColor).toBe(settledSample.selectionColor);
      expect(settledSample.previewZIndex).toBe('0');
      expect(settledSample.editorZIndex).toBe('1');
      expect(settledSample.codeBackgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(settledSample.innerBackgroundColor).toBe('rgba(0, 0, 0, 0)');
      expectSelectedCodeBlockColors(settledSample, 'settled code block');
      const settledPixels = await measureRenderedSelectionPixels(page, {
        selector: '.code-block-container',
        targetText: 'dragCodeSentinel',
      });
      expectSelectionPixels(settledPixels, 'settled code block', ['innerSurface', 'leftBleed', 'rightBleed']);
      const settledBorderPixels = await measureRenderedCodeBlockBorderPixels(page, 'dragCodeSentinel');
      expectCodeBlockBorderPixels(settledBorderPixels, 'settled code block');

      console.info('[notes-block-selection-drag-code-large-paint]', {
        dragTarget,
        draggingSample,
        initialGeometry,
        resizedGeometry,
        settledSample,
        settledPixels,
        settledBorderPixels,
      });
    } finally {
      if (mouseIsDown) {
        await app.firstWindow().then(async () => {
          const [page] = await getOpenBridgePages(app, 1);
          await page.mouse.up().catch(() => undefined);
        }).catch(() => undefined);
      }
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps contained code blocks blue when a large selected range includes their parent item', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-contained-code-large-paint');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'contained-code-large-selection-paint.md',
        content: createContainedCodeSelectionAuditMarkdown(),
      });

      await expect.poll(
        async () => (await getSelectableBlocks(page)).length,
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(132);
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'nestedCodeSelectionSentinel' })).toBeVisible();

      const selection = await selectLargeRangeIncludingText(page, 'Contained code parent sentinel');
      const containedPixels = await measureRenderedSelectionPixels(page, {
        selector: '.code-block-container',
        targetText: 'nestedCodeSelectionSentinel',
      });

      console.info('[notes-block-selection-contained-code-large-paint]', {
        selection,
        containedPixels,
      });

      expect(selection.selectedCount).toBeGreaterThanOrEqual(128);
      expect(containedPixels.largeActive).toBe(true);
      expect(containedPixels.selectedCount).toBe(0);
      expect(
        containedPixels.targetSelected || containedPixels.insideSelectedParent,
        'contained code block should be selected directly or through its parent',
      ).toBe(true);
      expectSelectionPixels(containedPixels, 'contained code block', ['innerSurface']);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps large selection paint surfaces visible across markdown syntax block types', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-large-syntax-paint-audit');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'large-selection-syntax-paint-audit.md',
        content: createLargeSelectionSyntaxAuditMarkdown(),
      });

      await expect.poll(
        async () => (await getSelectableBlocks(page)).length,
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(180);
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'syntaxSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .milkdown-table-block`, { hasText: 'Table alpha' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="math-block"]`).first()).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="mermaid"]`).first()).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container[data-alt="Image alt sentinel"]`)).toBeVisible();

      const samples: Array<RenderedSelectionPixelReport & {
        label: string;
        selectedStartIndex: number;
        targetIndex: number;
      }> = [];

      for (const paintCase of LARGE_SELECTION_SYNTAX_PAINT_CASES) {
        await scrollLargeSelectionPaintTargetIntoView(page, paintCase);
        const selection = await selectLargeRangeForPaintCase(page, paintCase);
        await scrollLargeSelectionPaintTargetIntoView(page, paintCase);
        await waitForCommittedSelectionTargetPreview(page, paintCase, selection.selectedCount);
        const sample = await measureRenderedSelectionPixels(page, {
          selector: paintCase.selector,
          targetText: paintCase.targetText,
          allowCommittedPreviewTarget: true,
        });

        expect(selection.selectedCount, `${paintCase.label}: logical selection count`).toBeGreaterThanOrEqual(128);
        expect(sample.largeActive, `${paintCase.label}: large selection class`).toBe(true);
        expect(sample.selectedCount, `${paintCase.label}: deferred DOM decoration count`).toBe(0);
        expect(sample.previewSelectionCount, `${paintCase.label}: SVG selection count`).toBeGreaterThanOrEqual(128);
        expect(sample.targetSelected, `${paintCase.label}: selected target`).toBe(true);
        if (paintCase.label !== 'mermaid-block') {
          expectSelectionPixels(
            sample,
            paintCase.label,
            paintCase.label === 'image-block' || paintCase.label === 'video-block'
              ? ['leftBleed', 'rightBleed']
              : ['innerSurface'],
          );
        }

        samples.push({
          ...sample,
          label: paintCase.label,
          selectedStartIndex: selection.startIndex,
          targetIndex: selection.targetIndex,
        });
      }

      console.info('[notes-block-selection-large-syntax-paint-audit]', samples.map((sample) => ({
        label: sample.label,
        className: sample.className,
        previewSelectionCount: sample.previewSelectionCount,
        sampledColors: sample.samples.map(({ slot, color }) => ({ slot, color })),
        selectionColor: sample.selectionColor,
        selectedStartIndex: sample.selectedStartIndex,
        targetIndex: sample.targetIndex,
        text: sample.text,
      })));
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps nested rich surfaces transparent during drag previews', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-nested-rich-drag-preview');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'nested-rich-drag-preview.md',
        content: createLargeSelectionSyntaxAuditMarkdown(),
      });

      await expect.poll(
        async () => (await getSelectableBlocks(page)).length,
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(180);
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'quoteCodeSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="callout"]`, { hasText: 'Emoji callout sentinel' })).toBeVisible();

      const dragTarget = await getBlankAreaDragTarget(page, 'Nested quote container sentinel');
      expect(dragTarget, 'nested rich drag target').not.toBeNull();
      if (!dragTarget) return;

      await page.mouse.move(dragTarget.startX, dragTarget.startY);
      await page.mouse.down();
      await page.mouse.move(dragTarget.endX, dragTarget.endY, { steps: 12 });
      await waitForEditorAnimationFrame(page);

      const draggingVisual = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror[contenteditable="true"]');
        const quote = Array.from(editor?.querySelectorAll<HTMLElement>('blockquote') ?? [])
          .find((element) => element.textContent?.includes('Nested quote container sentinel')) ?? null;
        const code = Array.from(editor?.querySelectorAll<HTMLElement>('.code-block-container') ?? [])
          .find((element) => element.textContent?.includes('quoteCodeSentinel')) ?? null;
        const callout = Array.from(editor?.querySelectorAll<HTMLElement>('div[data-type="callout"]') ?? [])
          .find((element) => element.textContent?.includes('Emoji callout sentinel')) ?? null;
        const previewSurfaceSelector = '.editor-block-selection-preview-surface';
        const getSurface = (element: HTMLElement | null) => element?.closest<HTMLElement>(previewSurfaceSelector) ?? null;
        const getBackground = (element: HTMLElement | null) => element ? getComputedStyle(element).backgroundColor : null;
        const getInnerBackground = (element: HTMLElement | null) => {
          const inner = element?.querySelector<HTMLElement>('.code-block-editable, .cm-editor, .callout-content');
          return inner ? getComputedStyle(inner).backgroundColor : null;
        };
        return {
          calloutBackground: getBackground(callout),
          calloutSurface: Boolean(getSurface(callout)),
          codeBackground: getBackground(code),
          codeInnerBackground: getInnerBackground(code),
          codeSurface: Boolean(getSurface(code)),
          previewActive: Boolean(editor?.classList.contains('editor-block-selection-drag-preview-active')),
          quoteSurface: Boolean(getSurface(quote)),
        };
      });
      await page.mouse.up();
      await waitForEditorAnimationFrame(page);

      const settledVisual = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror[contenteditable="true"]');
        const quote = Array.from(editor?.querySelectorAll<HTMLElement>('blockquote') ?? [])
          .find((element) => element.textContent?.includes('Nested quote container sentinel')) ?? null;
        const code = Array.from(editor?.querySelectorAll<HTMLElement>('.code-block-container') ?? [])
          .find((element) => element.textContent?.includes('quoteCodeSentinel')) ?? null;
        const callout = Array.from(editor?.querySelectorAll<HTMLElement>('div[data-type="callout"]') ?? [])
          .find((element) => element.textContent?.includes('Emoji callout sentinel')) ?? null;
        const selectedSelector = '.editor-block-selected, .editor-block-selection-preview-surface';
        const selected = (element: HTMLElement | null) => Boolean(element?.matches(selectedSelector) || element?.closest(selectedSelector));
        return {
          calloutSelected: selected(callout),
          codeSelected: selected(code),
          previewActive: Boolean(editor?.classList.contains('editor-block-selection-drag-preview-active')),
          quoteSelected: selected(quote),
        };
      });

      expect(draggingVisual.previewActive).toBe(true);
      expect(draggingVisual.quoteSurface).toBe(true);
      expect(draggingVisual.codeSurface).toBe(true);
      expect(draggingVisual.codeBackground).toBe('rgba(0, 0, 0, 0)');
      expect(draggingVisual.codeInnerBackground).toBe('rgba(0, 0, 0, 0)');
      expect(draggingVisual.calloutSurface).toBe(true);
      expect(draggingVisual.calloutBackground).toBe('rgba(0, 0, 0, 0)');
      expect(settledVisual.previewActive).toBe(false);
      expect(settledVisual.quoteSelected).toBe(true);
      expect(settledVisual.codeSelected).toBe(true);
      expect(settledVisual.calloutSelected).toBe(true);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});

async function measureSelectedPaintEdge(
  page: import('@playwright/test').Page,
  targetText: string,
): Promise<SelectionPaintEdgeSample> {
  let sample: SelectionPaintEdgeSample | null = null;
  await expect.poll(async () => {
    sample = await page.evaluate(async ({ editorSelector, targetText }) => {
      const editors = Array.from(document.querySelectorAll<HTMLElement>(editorSelector));
      const activePreviewPath = Array.from(document.querySelectorAll<SVGPathElement>(
        '[data-editor-block-selection-committed-preview="true"] path',
      )).find((path) => (
        path.hasAttribute('d') && path.ownerSVGElement?.dataset.selectionCount !== '0'
      )) ?? null;
      const editor = activePreviewPath?.ownerSVGElement?.parentElement?.querySelector<HTMLElement>(
        ':scope > .ProseMirror[contenteditable="true"]',
      ) ?? editors[0] ?? null;
      if (!editor) return null;
      const findCommittedPreviewPath = () => {
        const path = Array.from(document.querySelectorAll<SVGPathElement>(
          '[data-editor-block-selection-committed-preview="true"] path',
        )).find((candidate) => (
          candidate.hasAttribute('d')
          && candidate.ownerSVGElement?.dataset.selectionCount !== '0'
        ));
        return path ?? null;
      };
      const findSelectionRoot = () => (
        Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selected'))
          .find((element) => element.textContent?.includes(targetText))
        ?? Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selection-preview-surface'))
          .find((element) => element.textContent?.includes(targetText))
        ?? (findCommittedPreviewPath()
          ? Array.from(editor.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre'))
              .find((element) => element.textContent?.includes(targetText))
          : null)
        ?? null
      );
      let selected = findSelectionRoot();
      if (!selected) return null;

      if (!findCommittedPreviewPath()) {
        selected.scrollIntoView({ block: 'center', inline: 'nearest' });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        selected = findSelectionRoot();
        if (!selected) return null;
      }

      const rect = selected.getBoundingClientRect();
      const style = getComputedStyle(selected);
      const afterStyle = getComputedStyle(selected, '::after');
      const bleedStart = Number.parseFloat(style.getPropertyValue('--vlaina-block-selection-bleed-x-start')) || 0;
      const afterLeft = Number.parseFloat(afterStyle.left);
      const previewPath = findCommittedPreviewPath();
      const preview = previewPath?.ownerSVGElement ?? null;
      const usesSvgPreview = Boolean(previewPath);
      const previewBox = usesSvgPreview && previewPath ? previewPath.getBBox() : null;
      const previewRect = usesSvgPreview && preview ? preview.getBoundingClientRect() : null;
      const paintLeft = previewBox && previewRect
        ? previewRect.left + previewBox.x
        : afterStyle.display !== 'none' && Number.isFinite(afterLeft)
          ? rect.left + afterLeft
          : rect.left;
      const expectedPaintLeft = rect.left - bleedStart;

      return {
        afterDisplay: usesSvgPreview ? 'svg' : afterStyle.display,
        afterLeft: Number.isFinite(afterLeft) ? Math.round(afterLeft * 10) / 10 : null,
        bleedStart: Math.round(bleedStart * 10) / 10,
        className: selected.className,
        expectedPaintLeft: Math.round(expectedPaintLeft * 10) / 10,
        largeActive: editor.classList.contains('editor-block-selection-large'),
        leftGap: Math.round((paintLeft - expectedPaintLeft) * 10) / 10,
        paintLeft: Math.round(paintLeft * 10) / 10,
        previewSelectionCount: Number(preview?.dataset.selectionCount ?? '0'),
        rectLeft: Math.round(rect.left * 10) / 10,
        selectedCount: editor.querySelectorAll('.editor-block-selected').length,
        text: selected.textContent?.trim().slice(0, 80) ?? '',
        usesSvgPreview,
      };
    }, { editorSelector: EDITOR_SELECTOR, targetText });
    return sample !== null;
  }, { timeout: 5_000 }).toBe(true);

  return sample!;
}

async function getLargeBlankAreaDragTarget(
  page: import('@playwright/test').Page,
  targetText: string,
): Promise<{
  edgeX: number;
  edgeY: number;
  startX: number;
  startY: number;
} | null> {
  return page.evaluate(async ({ editorSelector, targetText }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
    if (!editor || !scrollRoot) return null;

    const block = Array.from(editor.querySelectorAll<HTMLElement>('p,li,blockquote,pre,table,h1,h2,h3,h4,h5,h6'))
      .find((element) => element.textContent?.includes(targetText)) ?? null;
    if (!block) return null;

    block.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const rect = block.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const scrollRootRect = scrollRoot.getBoundingClientRect();
    const visibleTop = Math.max(rect.top, scrollRootRect.top + 24);
    const visibleBottom = Math.min(rect.bottom, scrollRootRect.bottom - 24);
    const startY = visibleTop + Math.max(12, (visibleBottom - visibleTop) * 0.35);
    const startX = Math.min(scrollRootRect.right - 24, editorRect.right + 72);

    return {
      edgeX: Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, rect.left + 24)),
      edgeY: scrollRootRect.bottom - 4,
      startX,
      startY,
    };
  }, { editorSelector: EDITOR_SELECTOR, targetText });
}

async function waitForDraggedCodeBlockPaint(
  page: import('@playwright/test').Page,
  targetText: string,
): Promise<DraggedCodeBlockPaintSample> {
  let sample: DraggedCodeBlockPaintSample | null = null;

  await expect.poll(async () => {
    sample = await measureDraggedCodeBlockPaint(page, targetText, true);
    if (!sample) return 'missing';
    return sample.codeSelected &&
      sample.previewSurfaceActive &&
      !sample.dragPreviewPresent &&
      sample.committedPreviewPresent &&
      !sample.dragPreviewActive &&
      sample.largeActive &&
      sample.selectedCount === 0 &&
      sample.previewSelectionCount > 0 &&
      sample.previewFillColor === sample.selectionColor &&
      sample.previewZIndex === '0' &&
      sample.editorZIndex === '1' &&
      sample.codeBackgroundColor === 'rgba(0, 0, 0, 0)' &&
      sample.innerBackgroundColor === 'rgba(0, 0, 0, 0)' &&
      sample.expectedLanguageColor !== '' &&
      sample.expectedTokenColor !== '' &&
      sample.languageColor === sample.expectedLanguageColor &&
      sample.languageTextFillColor === sample.expectedLanguageColor &&
      sample.tokenColor === sample.expectedTokenColor &&
      sample.tokenTextFillColor === sample.expectedTokenColor &&
      hasSelectedCodeBlockBorder(sample) &&
      sample.expectedCodeLineColor !== '' &&
      sample.codeLineColor === sample.expectedCodeLineColor &&
      sample.codeLineTextFillColor === sample.expectedCodeLineColor
      ? 'ready'
      : JSON.stringify(sample);
  }, { timeout: 30_000 }).toBe('ready');

  return sample!;
}

async function measureDragPreviewGeometry(
  page: import('@playwright/test').Page,
  targetText: string,
  pathIndex?: number,
): Promise<DragPreviewGeometrySample | null> {
  return page.evaluate(({ targetText, requestedPathIndex }) => {
    const target = Array.from(document.querySelectorAll<HTMLElement>('.code-block-container'))
      .find((element) => element.textContent?.includes(targetText)) ?? null;
    const path = document.querySelector<SVGPathElement>(
      '[data-editor-block-selection-preview="true"] path',
    );
    const pathData = path?.getAttribute('d') ?? '';
    if (!target || !path || !pathData) return null;

    const matrix = path.getScreenCTM();
    const toScreenPoint = (x: number, y: number) => {
      if (!matrix) return { x, y };
      const point = new DOMPoint(x, y).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    };
    const previewRects = pathData.split('Z').flatMap((subpath, index) => {
      const move = /^M([-\d.]+) ([-\d.]+)/.exec(subpath);
      const topEdge = /H([-\d.]+)A([-\d.]+) /.exec(subpath);
      const firstVertical = /V([-\d.]+)/.exec(subpath);
      if (!move || !topEdge || !firstVertical) return [];
      const radius = Number.parseFloat(topEdge[2] ?? '');
      const topLeft = toScreenPoint(
        Number.parseFloat(move[1] ?? '') - radius,
        Number.parseFloat(move[2] ?? ''),
      );
      const bottomRight = toScreenPoint(
        Number.parseFloat(topEdge[1] ?? '') + radius,
        Number.parseFloat(firstVertical[1] ?? '') + radius,
      );
      return [{
        index,
        top: Math.min(topLeft.y, bottomRight.y),
        bottom: Math.max(topLeft.y, bottomRight.y),
      }];
    });
    if (previewRects.length === 0) return null;

    const targetRect = target.getBoundingClientRect();
    const matchedRect = requestedPathIndex === undefined
      ? previewRects.reduce((best, candidate) => {
        const bestDistance = Math.abs(best.top - targetRect.top) + Math.abs(best.bottom - targetRect.bottom);
        const candidateDistance = Math.abs(candidate.top - targetRect.top)
          + Math.abs(candidate.bottom - targetRect.bottom);
        return candidateDistance < bestDistance ? candidate : best;
      })
      : previewRects.find((rect) => rect.index === requestedPathIndex) ?? null;
    if (!matchedRect) return null;

    return {
      pathIndex: matchedRect.index,
      previewBottom: Math.round(matchedRect.bottom * 10) / 10,
      previewHeight: Math.round((matchedRect.bottom - matchedRect.top) * 10) / 10,
      previewTop: Math.round(matchedRect.top * 10) / 10,
      targetBottom: Math.round(targetRect.bottom * 10) / 10,
      targetHeight: Math.round(targetRect.height * 10) / 10,
      targetTop: Math.round(targetRect.top * 10) / 10,
    };
  }, { targetText, requestedPathIndex: pathIndex });
}

async function measureDraggedCodeBlockPaint(
  page: import('@playwright/test').Page,
  targetText: string,
  settle = false,
): Promise<DraggedCodeBlockPaintSample | null> {
  return page.evaluate(async ({ editorSelector, targetText, settle }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) return null;

    const target = Array.from(editor.querySelectorAll<HTMLElement>('.code-block-container'))
      .find((element) => element.textContent?.includes(targetText)) ?? null;
    if (settle && target) {
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    const dragPreview = document.querySelector<SVGSVGElement>('[data-editor-block-selection-preview="true"]');
    const committedPreview = document.querySelector<SVGSVGElement>('[data-editor-block-selection-committed-preview="true"]');
    const committedPreviewActive = Boolean(
      committedPreview?.dataset.selectionCount !== '0'
      && committedPreview?.firstElementChild?.hasAttribute('d')
    );
    const preview = dragPreview ?? committedPreview;
    const previewPath = preview?.firstElementChild;
    const previewSurface = target?.closest<HTMLElement>('.editor-block-selection-preview-surface')
      ?? Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selection-preview-surface'))
        .find((element) => element.textContent?.includes(targetText))
      ?? null;
    const selected = previewSurface ? target : null;
    if (!selected) {
      return {
        activeActive: editor.classList.contains('editor-block-selection-active'),
        borderBottomColor: null,
        borderBottomWidth: null,
        borderLeftColor: null,
        borderLeftWidth: null,
        borderRightColor: null,
        borderRightWidth: null,
        borderTopColor: null,
        borderTopWidth: null,
        className: '',
        codeBackgroundColor: '',
        codeLineColor: null,
        codeLineTextFillColor: null,
        codeSelected: false,
        committedPreviewPresent: committedPreviewActive,
        dragPreviewActive: editor.classList.contains('editor-block-selection-drag-preview-active'),
        dragPreviewPresent: Boolean(dragPreview),
        editorZIndex: getComputedStyle(editor).zIndex,
        expectedBorderColor: '',
        expectedCodeLineColor: '',
        expectedLanguageColor: '',
        expectedTokenColor: '',
        innerBackgroundColor: null,
        languageColor: null,
        languageTextFillColor: null,
        largeActive: editor.classList.contains('editor-block-selection-large'),
        previewFillColor: previewPath ? getComputedStyle(previewPath).fill : null,
        previewSelectionCount: Number(preview?.dataset.selectionCount ?? '0'),
        previewSurfaceActive: false,
        previewZIndex: preview ? getComputedStyle(preview).zIndex : null,
        selectedCount: editor.querySelectorAll('.editor-block-selected').length,
        selectionColor: '',
        text: '',
        tokenClassName: null,
        tokenColor: null,
        tokenText: null,
        tokenTextFillColor: null,
      };
    }

    const style = getComputedStyle(selected);
    const inner = selected.querySelector<HTMLElement>([
      '.code-block-editable',
      '.cm-editor',
      '.code-block-lazy-preview',
      '.cm-content',
      '.cm-line',
    ].join(','));
    const language = selected.querySelector<HTMLElement>('.code-block-chrome-language-label, .code-block-chrome-language');
    const codeLine = selected.querySelector<HTMLElement>('.cm-content .cm-line, .code-block-editable .cm-line, .code-block-lazy-preview');
    const token = selected.querySelector<HTMLElement>('.cm-keyword, .token.keyword');
    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.pointerEvents = 'none';
    probe.style.backgroundColor = 'var(--vlaina-block-selection-color-default)';
    probe.style.borderColor = 'var(--vlaina-color-white)';
    selected.appendChild(probe);
    const probeStyle = getComputedStyle(probe);
    const expectedBorderColor = probeStyle.borderColor;
    const selectionColor = probeStyle.backgroundColor;
    probe.style.color = 'var(--vlaina-code-syntax-foreground)';
    const expectedCodeLineColor = getComputedStyle(probe).color;
    probe.style.color = 'var(--vlaina-code-syntax-muted)';
    const expectedLanguageColor = getComputedStyle(probe).color;
    probe.style.color = 'var(--vlaina-code-syntax-keyword)';
    const expectedTokenColor = getComputedStyle(probe).color;
    probe.remove();
    const languageStyle = language ? getComputedStyle(language) : null;
    const codeLineStyle = codeLine ? getComputedStyle(codeLine) : null;
    const tokenStyle = token ? getComputedStyle(token) : null;

    return {
      activeActive: editor.classList.contains('editor-block-selection-active'),
      borderBottomColor: style.borderBottomColor,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftColor: style.borderLeftColor,
      borderLeftWidth: style.borderLeftWidth,
      borderRightColor: style.borderRightColor,
      borderRightWidth: style.borderRightWidth,
      borderTopColor: style.borderTopColor,
      borderTopWidth: style.borderTopWidth,
      className: selected.className,
      codeBackgroundColor: style.backgroundColor,
      codeLineColor: codeLineStyle?.color ?? null,
      codeLineTextFillColor: codeLineStyle?.getPropertyValue('-webkit-text-fill-color') || null,
      codeSelected: true,
      committedPreviewPresent: committedPreviewActive,
      dragPreviewActive: editor.classList.contains('editor-block-selection-drag-preview-active'),
      dragPreviewPresent: Boolean(dragPreview),
      editorZIndex: getComputedStyle(editor).zIndex,
      expectedBorderColor,
      expectedCodeLineColor,
      expectedLanguageColor,
      expectedTokenColor,
      innerBackgroundColor: inner ? getComputedStyle(inner).backgroundColor : null,
      languageColor: languageStyle?.color ?? null,
      languageTextFillColor: languageStyle?.getPropertyValue('-webkit-text-fill-color') || null,
      largeActive: editor.classList.contains('editor-block-selection-large'),
      previewFillColor: previewPath ? getComputedStyle(previewPath).fill : null,
      previewSelectionCount: Number(preview?.dataset.selectionCount ?? '0'),
      previewSurfaceActive: Boolean(previewSurface),
      previewZIndex: preview ? getComputedStyle(preview).zIndex : null,
      selectedCount: editor.querySelectorAll('.editor-block-selected').length,
      selectionColor,
      text: selected.textContent?.trim().slice(0, 120) ?? '',
      tokenClassName: token?.className ?? null,
      tokenColor: tokenStyle?.color ?? null,
      tokenText: token?.textContent?.slice(0, 80) ?? null,
      tokenTextFillColor: tokenStyle?.getPropertyValue('-webkit-text-fill-color') || null,
    };
  }, { editorSelector: EDITOR_SELECTOR, targetText, settle });
}

function expectSelectedCodeBlockColors(sample: DraggedCodeBlockPaintSample, label: string): void {
  expectSelectedCodeBlockBorder(sample, label);
  expect(sample.languageColor, `${label}: language label color`).toBe(sample.expectedLanguageColor);
  expect(sample.languageTextFillColor, `${label}: language label text fill`).toBe(sample.expectedLanguageColor);
  expect(sample.codeLineColor, `${label}: CodeMirror line color`).toBe(sample.expectedCodeLineColor);
  expect(sample.codeLineTextFillColor, `${label}: CodeMirror line text fill`).toBe(sample.expectedCodeLineColor);
  expect(sample.tokenClassName, `${label}: syntax token class`).not.toBeNull();
  expect(sample.tokenText, `${label}: syntax token text`).not.toBeNull();
  expect(sample.tokenColor, `${label}: syntax token color`).toBe(sample.expectedTokenColor);
  expect(sample.tokenTextFillColor, `${label}: syntax token text fill`).toBe(sample.expectedTokenColor);
}

function hasSelectedCodeBlockBorder(sample: DraggedCodeBlockPaintSample): boolean {
  return sample.expectedBorderColor !== '' &&
    sample.borderTopColor === sample.expectedBorderColor &&
    sample.borderRightColor === sample.expectedBorderColor &&
    sample.borderBottomColor === sample.expectedBorderColor &&
    sample.borderLeftColor === sample.expectedBorderColor &&
    Number.parseFloat(sample.borderTopWidth ?? '0') >= 2 &&
    Number.parseFloat(sample.borderRightWidth ?? '0') >= 2 &&
    Number.parseFloat(sample.borderBottomWidth ?? '0') >= 2 &&
    Number.parseFloat(sample.borderLeftWidth ?? '0') >= 2;
}

function expectSelectedCodeBlockBorder(sample: DraggedCodeBlockPaintSample, label: string): void {
  expect(sample.expectedBorderColor, `${label}: expected code block border`).not.toBe('');
  expect(sample.borderTopColor, `${label}: top border color`).toBe(sample.expectedBorderColor);
  expect(sample.borderRightColor, `${label}: right border color`).toBe(sample.expectedBorderColor);
  expect(sample.borderBottomColor, `${label}: bottom border color`).toBe(sample.expectedBorderColor);
  expect(sample.borderLeftColor, `${label}: left border color`).toBe(sample.expectedBorderColor);
  expect(Number.parseFloat(sample.borderTopWidth ?? '0'), `${label}: top border width`).toBeGreaterThanOrEqual(2);
  expect(Number.parseFloat(sample.borderRightWidth ?? '0'), `${label}: right border width`).toBeGreaterThanOrEqual(2);
  expect(Number.parseFloat(sample.borderBottomWidth ?? '0'), `${label}: bottom border width`).toBeGreaterThanOrEqual(2);
  expect(Number.parseFloat(sample.borderLeftWidth ?? '0'), `${label}: left border width`).toBeGreaterThanOrEqual(2);
}

async function measureRenderedCodeBlockBorderPixels(
  page: import('@playwright/test').Page,
  targetText: string,
): Promise<RenderedCodeBlockBorderPixelReport> {
  const geometry = await page.evaluate(async ({ editorSelector, targetText }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) return null;

    const target = Array.from(editor.querySelectorAll<HTMLElement>('.code-block-container'))
      .find((element) => element.textContent?.includes(targetText) && (
        element.classList.contains('editor-block-selected')
        || element.classList.contains('editor-block-selection-preview-surface')
        || Boolean(element.closest('.editor-block-selection-preview-surface'))
      )) ?? null;
    if (!target) return null;

    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    const topWidth = Number.parseFloat(style.borderTopWidth) || 0;
    const rightWidth = Number.parseFloat(style.borderRightWidth) || 0;
    const bottomWidth = Number.parseFloat(style.borderBottomWidth) || 0;
    const leftWidth = Number.parseFloat(style.borderLeftWidth) || 0;
    if (topWidth <= 0 || rightWidth <= 0 || bottomWidth <= 0 || leftWidth <= 0) return null;

    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.pointerEvents = 'none';
    probe.style.borderColor = 'var(--vlaina-color-white)';
    target.appendChild(probe);
    const expectedBorderColor = getComputedStyle(probe).borderColor;
    probe.remove();

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const points: Array<{ slot: RenderedCodeBlockBorderPixelSlot; x: number; y: number }> = [
      { slot: 'topBorder', x: centerX, y: rect.top + topWidth / 2 },
      { slot: 'rightBorder', x: rect.right - rightWidth / 2, y: centerY },
      { slot: 'bottomBorder', x: centerX, y: rect.bottom - bottomWidth / 2 },
      { slot: 'leftBorder', x: rect.left + leftWidth / 2, y: centerY },
    ].filter((point) => (
      point.x >= 0 &&
      point.y >= 0 &&
      point.x < window.innerWidth &&
      point.y < window.innerHeight
    ));

    if (points.length === 0) return null;

    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    const clipX = Math.max(0, Math.floor(minX - 4));
    const clipY = Math.max(0, Math.floor(minY - 4));
    const clipRight = Math.min(window.innerWidth, Math.ceil(maxX + 4));
    const clipBottom = Math.min(window.innerHeight, Math.ceil(maxY + 4));

    return {
      className: target.className,
      clip: {
        height: Math.max(1, clipBottom - clipY),
        width: Math.max(1, clipRight - clipX),
        x: clipX,
        y: clipY,
      },
      expectedBorderColor,
      points,
      rect: {
        bottom: Math.round(rect.bottom * 10) / 10,
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        top: Math.round(rect.top * 10) / 10,
      },
      text: target.textContent?.trim().slice(0, 120) ?? '',
    };
  }, { editorSelector: EDITOR_SELECTOR, targetText });

  expect(geometry, `missing selected code block border target containing "${targetText}"`).not.toBeNull();

  const screenshot = await page.screenshot({ clip: geometry!.clip });
  const dataUrl = `data:image/png;base64,${screenshot.toString('base64')}`;
  const samples = await page.evaluate(async ({ imageUrl, clip, points, expectedBorderColor }) => {
    const colorMatch = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(expectedBorderColor);
    if (!colorMatch) {
      throw new Error(`Could not parse code block border color: ${expectedBorderColor}`);
    }
    const expected = {
      red: Number.parseInt(colorMatch[1] ?? '0', 10),
      green: Number.parseInt(colorMatch[2] ?? '0', 10),
      blue: Number.parseInt(colorMatch[3] ?? '0', 10),
    };

    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load code block border screenshot'));
      image.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Could not create canvas context for code block border screenshot');
    }
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const scaleX = image.naturalWidth / clip.width;
    const scaleY = image.naturalHeight / clip.height;

    return points.map((point) => {
      const sampleX = Math.max(0, Math.min(image.naturalWidth - 1, Math.round((point.x - clip.x) * scaleX)));
      const sampleY = Math.max(0, Math.min(image.naturalHeight - 1, Math.round((point.y - clip.y) * scaleY)));
      const offset = (sampleY * imageData.width + sampleX) * 4;
      const red = imageData.data[offset] ?? 0;
      const green = imageData.data[offset + 1] ?? 0;
      const blue = imageData.data[offset + 2] ?? 0;
      const alpha = imageData.data[offset + 3] ?? 0;
      const distance = Math.hypot(
        red - expected.red,
        green - expected.green,
        blue - expected.blue,
      );

      return {
        alpha,
        color: `rgb(${red}, ${green}, ${blue})`,
        distance: Math.round(distance * 10) / 10,
        slot: point.slot,
        x: Math.round(point.x * 10) / 10,
        y: Math.round(point.y * 10) / 10,
      };
    });
  }, {
    imageUrl: dataUrl,
    clip: geometry!.clip,
    expectedBorderColor: geometry!.expectedBorderColor,
    points: geometry!.points,
  });

  return {
    className: geometry!.className,
    clip: geometry!.clip,
    expectedBorderColor: geometry!.expectedBorderColor,
    rect: geometry!.rect,
    samples,
    text: geometry!.text,
  };
}

async function measureRenderedSelectionPixels(
  page: import('@playwright/test').Page,
  input: {
    allowCommittedPreviewTarget?: boolean;
    selector: string;
    targetText?: string;
  },
): Promise<RenderedSelectionPixelReport> {
  const geometry = await page.evaluate(async ({
    allowCommittedPreviewTarget,
    editorSelector,
    selector,
    targetText,
  }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) return null;

    const committedPreview = Array.from(editor.parentElement?.querySelectorAll<SVGSVGElement>(
      ':scope > [data-editor-block-selection-committed-preview="true"]',
    ) ?? []).find((preview) => (
      Number(preview.dataset.selectionCount ?? '0') > 0
      && preview.firstElementChild?.hasAttribute('d')
    )) ?? null;
    const canUseCommittedPreviewTarget = Boolean(allowCommittedPreviewTarget && committedPreview);
    const matchingPreviewSurface = Array.from(editor.querySelectorAll<HTMLElement>(
      '.editor-block-selection-preview-surface',
    )).find((element) => (
      targetText === undefined || element.textContent?.includes(targetText)
    )) ?? null;
    const target = Array.from(editor.querySelectorAll<HTMLElement>(selector))
      .find((element) => (targetText === undefined || element.textContent?.includes(targetText)) && (
        element.classList.contains('editor-block-selected') ||
        Boolean(element.closest('.editor-block-selected')) ||
        element.classList.contains('editor-block-selection-preview-surface') ||
        Boolean(element.closest('.editor-block-selection-preview-surface')) ||
        matchingPreviewSurface !== null ||
        canUseCommittedPreviewTarget
      )) ?? null;
    if (!target) return null;

    if (!canUseCommittedPreviewTarget) {
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    const selectionRoot = target.classList.contains('editor-block-selected')
      ? target
      : target.closest<HTMLElement>('.editor-block-selected')
        ?? (target.classList.contains('editor-block-selection-preview-surface')
          ? target
          : target.closest<HTMLElement>('.editor-block-selection-preview-surface'))
        ?? matchingPreviewSurface
        ?? (canUseCommittedPreviewTarget ? target : null);
    if (!selectionRoot) return null;

    const targetRect = target.getBoundingClientRect();
    const selectionStyle = getComputedStyle(selectionRoot);
    const bleedStart = Number.parseFloat(selectionStyle.getPropertyValue('--vlaina-block-selection-bleed-x-start')) || 0;
    const bleedEnd = Number.parseFloat(selectionStyle.getPropertyValue('--vlaina-block-selection-bleed-x-end')) || 0;
    const bleedY = Number.parseFloat(selectionStyle.getPropertyValue('--vlaina-block-selection-bleed-y')) || 0;

    const selectionColor = getComputedStyle(selectionRoot)
      .getPropertyValue('--vlaina-block-selection-color')
      .trim();

    const centerX = targetRect.left + targetRect.width / 2;
    const visibleTop = Math.max(targetRect.top, 0);
    const visibleBottom = Math.min(targetRect.bottom, window.innerHeight);
    const centerY = targetRect.top < 0
      ? visibleTop + (visibleBottom - visibleTop) * 0.75
      : targetRect.top + targetRect.height / 2;
    const innerInsetX = Math.max(8, Math.min(32, targetRect.width / 5));
    const tightInnerInsetX = Math.max(4, Math.min(8, targetRect.width / 20));
    const dragBoxRect = document.querySelector<HTMLElement>('[data-editor-drag-box="true"]')?.getBoundingClientRect() ?? null;
    const isInsideDragBox = (x: number, y: number) => (
      dragBoxRect !== null &&
      x >= dragBoxRect.left + 2 &&
      x <= dragBoxRect.right - 2 &&
      y >= dragBoxRect.top + 2 &&
      y <= dragBoxRect.bottom - 2
    );
    const innerSurfaceCandidateXs = [
      targetRect.left + tightInnerInsetX,
      targetRect.right - tightInnerInsetX,
      targetRect.left + innerInsetX,
      targetRect.right - innerInsetX,
      centerX,
    ].filter((x, index, values) => (
      x > targetRect.left &&
      x < targetRect.right &&
      values.findIndex((value) => Math.abs(value - x) < 0.5) === index
    ));
    const sortedInnerSurfaceCandidateXs = [...innerSurfaceCandidateXs].sort((left, right) => {
      const leftInsideDragBox = isInsideDragBox(left, centerY);
      const rightInsideDragBox = isInsideDragBox(right, centerY);
      if (leftInsideDragBox !== rightInsideDragBox) return leftInsideDragBox ? 1 : -1;
      return 0;
    });
    const innerSurfaceCandidateYs = targetRect.top < 0
      ? [
        visibleTop + (visibleBottom - visibleTop) * 0.25,
        visibleTop + (visibleBottom - visibleTop) * 0.5,
        visibleTop + (visibleBottom - visibleTop) * 0.85,
      ]
      : [centerY];
    const innerSurfacePoints = sortedInnerSurfaceCandidateXs.flatMap((x) => (
      innerSurfaceCandidateYs.map((y) => ({
        slot: 'innerSurface' as const,
        x,
        y,
      }))
    ));
    const bleedXStart = Math.max(2, Math.min(24, bleedStart / 2 || 2));
    const bleedXEnd = Math.max(2, Math.min(24, bleedEnd / 2 || 2));
    const bleedInsetY = Math.max(2, Math.min(8, bleedY / 2 || 2));
    const points: Array<{ slot: RenderedSelectionPixelSlot; x: number; y: number }> = [
      ...(innerSurfacePoints.length > 0 ? innerSurfacePoints : [{ slot: 'innerSurface' as const, x: centerX, y: centerY }]),
      { slot: 'topBleed', x: centerX, y: targetRect.top - bleedInsetY },
      { slot: 'bottomBleed', x: centerX, y: targetRect.bottom + bleedInsetY },
      { slot: 'leftBleed', x: targetRect.left - bleedXStart, y: centerY },
      { slot: 'rightBleed', x: targetRect.right + bleedXEnd, y: centerY },
    ].filter((point) => (
      point.x >= 0 &&
      point.y >= 0 &&
      point.x < window.innerWidth &&
      point.y < window.innerHeight
    ));

    if (points.length === 0) return null;

    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    const clipX = Math.max(0, Math.floor(minX - 4));
    const clipY = Math.max(0, Math.floor(minY - 4));
    const clipRight = Math.min(window.innerWidth, Math.ceil(maxX + 4));
    const clipBottom = Math.min(window.innerHeight, Math.ceil(maxY + 4));

    return {
      activeActive: editor.classList.contains('editor-block-selection-active'),
      className: target.className,
      clip: {
        height: Math.max(1, clipBottom - clipY),
        width: Math.max(1, clipRight - clipX),
        x: clipX,
        y: clipY,
      },
      insideSelectedParent: !target.classList.contains('editor-block-selected'),
      largeActive: editor.classList.contains('editor-block-selection-large'),
      pendingActive: editor.classList.contains('editor-block-selection-pending'),
      points,
      previewSelectionCount: Number(committedPreview?.dataset.selectionCount ?? '0'),
      rect: {
        bottom: Math.round(targetRect.bottom * 10) / 10,
        left: Math.round(targetRect.left * 10) / 10,
        right: Math.round(targetRect.right * 10) / 10,
        top: Math.round(targetRect.top * 10) / 10,
      },
      selectedCount: editor.querySelectorAll('.editor-block-selected').length,
      selectionColor,
      targetSelected: target.matches('.editor-block-selected, .editor-block-selection-preview-surface')
        || Boolean(target.closest('.editor-block-selection-preview-surface'))
        || matchingPreviewSurface !== null
        || canUseCommittedPreviewTarget,
      text: target.textContent?.trim().slice(0, 120) ?? '',
    };
  }, { editorSelector: EDITOR_SELECTOR, ...input });

  expect(
    geometry,
    `missing selected pixel target ${input.selector}` +
      (input.targetText ? ` containing "${input.targetText}"` : ''),
  ).not.toBeNull();

  const screenshot = await page.screenshot({ clip: geometry!.clip });
  const dataUrl = `data:image/png;base64,${screenshot.toString('base64')}`;
  const samples = await page.evaluate(async ({ imageUrl, clip, points, selectionColor }) => {
    const colorMatch = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(selectionColor);
    const hexMatch = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(selectionColor);
    if (!colorMatch && !hexMatch) {
      throw new Error(`Could not parse selection color: ${selectionColor}`);
    }
    const expected = {
      red: Number.parseInt(colorMatch?.[1] ?? hexMatch?.[1] ?? '0', colorMatch ? 10 : 16),
      green: Number.parseInt(colorMatch?.[2] ?? hexMatch?.[2] ?? '0', colorMatch ? 10 : 16),
      blue: Number.parseInt(colorMatch?.[3] ?? hexMatch?.[3] ?? '0', colorMatch ? 10 : 16),
    };

    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load selection screenshot'));
      image.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Could not create canvas context for selection screenshot');
    }
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const scaleX = image.naturalWidth / clip.width;
    const scaleY = image.naturalHeight / clip.height;

    return points.map((point) => {
      const sampleX = Math.max(0, Math.min(image.naturalWidth - 1, Math.round((point.x - clip.x) * scaleX)));
      const sampleY = Math.max(0, Math.min(image.naturalHeight - 1, Math.round((point.y - clip.y) * scaleY)));
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let count = 0;

      for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
        for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
          const x = Math.max(0, Math.min(image.naturalWidth - 1, sampleX + xOffset));
          const y = Math.max(0, Math.min(image.naturalHeight - 1, sampleY + yOffset));
          const offset = (y * imageData.width + x) * 4;
          red += imageData.data[offset] ?? 0;
          green += imageData.data[offset + 1] ?? 0;
          blue += imageData.data[offset + 2] ?? 0;
          alpha += imageData.data[offset + 3] ?? 0;
          count += 1;
        }
      }

      const average = {
        red: Math.round(red / count),
        green: Math.round(green / count),
        blue: Math.round(blue / count),
        alpha: Math.round(alpha / count),
      };
      const distance = Math.hypot(
        average.red - expected.red,
        average.green - expected.green,
        average.blue - expected.blue,
      );

      return {
        alpha: average.alpha,
        color: `rgb(${average.red}, ${average.green}, ${average.blue})`,
        distance: Math.round(distance * 10) / 10,
        slot: point.slot,
        x: Math.round(point.x * 10) / 10,
        y: Math.round(point.y * 10) / 10,
      };
    });
  }, {
    clip: geometry!.clip,
    imageUrl: dataUrl,
    points: geometry!.points,
    selectionColor: geometry!.selectionColor,
  });

  return {
    activeActive: geometry!.activeActive,
    className: geometry!.className,
    clip: geometry!.clip,
    insideSelectedParent: geometry!.insideSelectedParent,
    largeActive: geometry!.largeActive,
    pendingActive: geometry!.pendingActive,
    previewSelectionCount: geometry!.previewSelectionCount,
    rect: geometry!.rect,
    samples,
    selectedCount: geometry!.selectedCount,
    selectionColor: geometry!.selectionColor,
    targetSelected: geometry!.targetSelected,
    text: geometry!.text,
  };
}

function expectSelectionPixels(
  report: RenderedSelectionPixelReport,
  label: string,
  slots: readonly RenderedSelectionPixelSlot[] = ['innerSurface', 'topBleed', 'bottomBleed', 'leftBleed', 'rightBleed'],
): void {
  const effectiveSlots = slots.filter((slot) => {
    if (slot === 'topBleed' && report.className.includes('editor-block-selected-has-previous')) {
      return false;
    }
    if (slot === 'bottomBleed' && report.className.includes('editor-block-selected-has-next')) {
      return false;
    }
    return true;
  });
  const samples = report.samples.filter((sample) => effectiveSlots.includes(sample.slot));
  const sampledSlots = Array.from(new Set(samples.map((sample) => sample.slot))).sort();
  expect(sampledSlots, `${label}: sampled slots`).toEqual([...effectiveSlots].sort());
  for (const slot of effectiveSlots) {
    const slotSamples = samples.filter((sample) => sample.slot === slot);
    const maxDistance = slot === 'innerSurface'
      ? 18
      : 52;
    if (slot === 'innerSurface') {
      const hasSelectedSurfacePixel = slotSamples.some((sample) => (
        sample.alpha >= 240 && sample.distance <= maxDistance
      ));
      expect(
        hasSelectedSurfacePixel,
        `${label}: innerSurface candidates ${JSON.stringify({ ...report, samples: slotSamples })}`,
      ).toBe(true);
      continue;
    }

    for (const sample of slotSamples) {
      expect(sample.alpha, `${label}: ${sample.slot} alpha ${JSON.stringify(report)}`).toBeGreaterThanOrEqual(240);
      expect(sample.distance, `${label}: ${sample.slot} color ${sample.color} expected ${report.selectionColor}`).toBeLessThanOrEqual(maxDistance);
    }
  }
}

function expectCodeBlockBorderPixels(report: RenderedCodeBlockBorderPixelReport, label: string): void {
  expect(report.expectedBorderColor, `${label}: expected rendered border color`).toBe('rgb(255, 255, 255)');
  expect(
    Array.from(new Set(report.samples.map((sample) => sample.slot))).sort(),
    `${label}: sampled rendered border slots`,
  ).toEqual(['bottomBorder', 'leftBorder', 'rightBorder', 'topBorder']);
  for (const sample of report.samples) {
    expect(sample.alpha, `${label}: ${sample.slot} alpha ${JSON.stringify(report)}`).toBeGreaterThanOrEqual(240);
    expect(sample.distance, `${label}: ${sample.slot} color ${sample.color} expected ${report.expectedBorderColor}`).toBeLessThanOrEqual(18);
  }
}

async function selectLargeRangeForPaintCase(
  page: import('@playwright/test').Page,
  paintCase: LargeSelectionPaintCase,
): Promise<{
  startIndex: number;
  targetIndex: number;
  selectedCount: number;
}> {
  if (!paintCase.targetIndexSelector) {
    return selectLargeRangeIncludingText(page, paintCase.anchorText);
  }

  const targetIndex = await resolveSelectableIndexBySelector(page, paintCase.targetIndexSelector);
  expect(targetIndex, `${paintCase.label}: selectable index for ${paintCase.targetIndexSelector}`).toBeGreaterThanOrEqual(0);
  return selectLargeRangeAroundIndex(page, targetIndex);
}

async function scrollLargeSelectionPaintTargetIntoView(
  page: import('@playwright/test').Page,
  paintCase: LargeSelectionPaintCase,
): Promise<void> {
  await page.evaluate(async ({ editorSelector, selector, targetText }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const target = Array.from(editor?.querySelectorAll<HTMLElement>(selector) ?? [])
      .find((element) => targetText === undefined || element.textContent?.includes(targetText));
    target?.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }, { editorSelector: EDITOR_SELECTOR, ...paintCase });
}

async function waitForCommittedSelectionTargetPreview(
  page: import('@playwright/test').Page,
  paintCase: LargeSelectionPaintCase,
  expectedCount: number,
): Promise<void> {
  await expect.poll(() => page.evaluate(({ editorSelector, expectedCount: requiredCount, selector, targetText }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const preview = editor?.parentElement?.querySelector<SVGSVGElement>(
      ':scope > [data-editor-block-selection-committed-preview="true"]',
    );
    const target = Array.from(editor?.querySelectorAll<HTMLElement>(selector) ?? [])
      .find((element) => targetText === undefined || element.textContent?.includes(targetText));
    const path = preview?.firstElementChild;
    if (!preview || !(path instanceof SVGPathElement) || !target) return false;
    if (Number(preview.dataset.selectionCount ?? '0') !== requiredCount) return false;

    const targetRect = target.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    if (targetRect.width <= 0 || targetRect.height <= 0 || previewRect.width <= 0 || previewRect.height <= 0) {
      return false;
    }

    return path.isPointInFill(new DOMPoint(
      targetRect.left + targetRect.width / 2 - previewRect.left,
      targetRect.top + targetRect.height / 2 - previewRect.top,
    ));
  }, {
    editorSelector: EDITOR_SELECTOR,
    expectedCount,
    selector: paintCase.selector,
    targetText: paintCase.targetText,
  }), { timeout: 5_000 }).toBe(true);
}

async function resolveSelectableIndexBySelector(
  page: import('@playwright/test').Page,
  selector: string,
): Promise<number> {
  return page.evaluate(async ({ editorSelector, selector }) => {
    const bridge = (window as any).__vlainaE2E;
    const blocks = bridge.getNoteSelectableBlocks();

    for (let index = 0; index < blocks.length; index += 1) {
      await bridge.selectNoteBlocksByIndexes([index]);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const selected = document.querySelector(`${editorSelector} ${selector}.editor-block-selected`);
      if (selected) return index;
    }

    await bridge.selectNoteBlocksByIndexes([]);
    return -1;
  }, { editorSelector: EDITOR_SELECTOR, selector });
}

async function selectLargeRangeAroundIndex(
  page: import('@playwright/test').Page,
  targetIndex: number,
): Promise<{
  startIndex: number;
  targetIndex: number;
  selectedCount: number;
}> {
  const selectableBlocks = await getSelectableBlocks(page);
  const maxStartIndex = Math.max(0, selectableBlocks.length - LARGE_SELECTION_SAMPLE_COUNT);
  const startIndex = Math.min(
    Math.max(targetIndex - Math.floor(LARGE_SELECTION_SAMPLE_COUNT / 2), 0),
    maxStartIndex,
  );
  const indexes = Array.from(
    { length: Math.min(LARGE_SELECTION_SAMPLE_COUNT, selectableBlocks.length - startIndex) },
    (_, offset) => startIndex + offset,
  );

  const selectedCount = await selectNoteBlocksByIndexes(page, indexes);
  expect(selectedCount, `Selected range around index ${targetIndex}`).toBe(indexes.length);

  return {
    startIndex,
    targetIndex,
    selectedCount,
  };
}

async function selectLargeRangeIncludingText(
  page: import('@playwright/test').Page,
  targetText: string,
): Promise<{
  startIndex: number;
  targetIndex: number;
  selectedCount: number;
}> {
  const selectableBlocks = await getSelectableBlocks(page);
  const targetIndex = selectableBlocks.findIndex((block) => block.text.includes(targetText));
  expect(targetIndex, `Missing selectable block containing "${targetText}"`).toBeGreaterThanOrEqual(0);
  return selectLargeRangeAroundIndex(page, targetIndex);
}

async function measureSelectedBlock(
  page: import('@playwright/test').Page,
  index: number,
  label: string,
  baseline?: SelectionEdgeSample,
): Promise<SelectionEdgeSample | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const selectedCount = await selectNoteBlocksByIndexes(page, [index]);
    expect(selectedCount).toBe(1);
    const selectedReady = await page.waitForFunction(
      (selector) => document.querySelectorAll(selector).length > 0,
      SELECTED_BLOCK_SELECTOR,
      { timeout: 3000 },
    ).then(() => true).catch(() => false);
    if (selectedReady) break;
    if (attempt === 2) {
      await expect(page.locator(SELECTED_BLOCK_SELECTOR).first()).toBeVisible();
    }
    await page.waitForTimeout(250);
  }
  return page.evaluate(async ({ editorSelector, index, label, baseline }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const selected = document.querySelector<HTMLElement>(`${editorSelector} .editor-block-selected`);
    if (!editor || !selected) return null;
    selected.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const rect = selected.getBoundingClientRect();
    if (rect.width <= 0.5 || rect.height <= 0.5) return null;
    const styles = getComputedStyle(selected);
    const bleedStart = Number.parseFloat(styles.getPropertyValue('--vlaina-block-selection-bleed-x-start')) || 0;
    const bleedEnd = Number.parseFloat(styles.getPropertyValue('--vlaina-block-selection-bleed-x-end')) || 0;
    const selectedCenterY = rect.top + rect.height / 2;
    const lineFillRects = Array.from(
      document.querySelectorAll<HTMLElement>('.editor-block-selection-line-fill')
    ).map((fill) => fill.getBoundingClientRect())
      .filter((fillRect) => (
        fillRect.width > 0 &&
        fillRect.height > 0 &&
        selectedCenterY >= fillRect.top - 2 &&
        selectedCenterY <= fillRect.bottom + 2
      ));
    const rawVisualLeft = rect.left - bleedStart;
    const rawVisualRight = rect.right + bleedEnd;
    const fillLeft = lineFillRects.length > 0
      ? Math.min(...lineFillRects.map((fillRect) => fillRect.left))
      : null;
    const fillRight = lineFillRects.length > 0
      ? Math.max(...lineFillRects.map((fillRect) => fillRect.right))
      : null;
    const visualLeft = Math.round(Math.min(rawVisualLeft, fillLeft ?? rawVisualLeft) * 10) / 10;
    const visualRight = Math.round(Math.max(rawVisualRight, fillRight ?? rawVisualRight) * 10) / 10;
    return {
      index,
      label,
      tagName: selected.tagName,
      className: selected.className,
      text: selected.textContent?.trim().slice(0, 120) ?? '',
      rawLeft: Math.round(rect.left * 10) / 10,
      rawRight: Math.round(rect.right * 10) / 10,
      visualLeft,
      visualRight,
      fillLeft: fillLeft === null ? null : Math.round(fillLeft * 10) / 10,
      fillRight: fillRight === null ? null : Math.round(fillRight * 10) / 10,
      baselineLeftDelta: baseline ? Math.round((visualLeft - baseline.visualLeft) * 10) / 10 : 0,
      baselineRightDelta: baseline ? Math.round((visualRight - baseline.visualRight) * 10) / 10 : 0,
      bleedStart: Math.round(bleedStart * 10) / 10,
      bleedEnd: Math.round(bleedEnd * 10) / 10,
    };
  }, { editorSelector: EDITOR_SELECTOR, index, label, baseline });
}

function describeSelectedKind(sample: SelectionEdgeSample): string {
  if (sample.className.includes('frontmatter-block-container')) return 'frontmatter';
  if (sample.className.includes('toc-block')) return 'toc';
  if (sample.className.includes('code-block-container')) return 'code';
  if (sample.className.includes('math-block')) return 'math';
  if (sample.className.includes('mermaid-block')) return 'mermaid';
  if (sample.className.includes('image-block-container')) return 'image';
  if (sample.className.includes('video-block')) return 'video';
  if (sample.className.includes('milkdown-table-block')) return 'table';
  if (sample.className.includes('callout')) return 'callout';
  if (sample.tagName === 'LI') return 'list-item';
  if (sample.tagName === 'BLOCKQUOTE') return 'blockquote';
  if (/^H[1-6]$/.test(sample.tagName)) return 'heading';
  if (sample.className.includes('md-htmlblock')) return 'html-block';
  return sample.tagName.toLowerCase();
}
