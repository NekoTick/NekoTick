import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getBlankAreaDragTarget,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  startMainThreadFrameProbe,
  stopMainThreadFrameProbe,
  waitForEditorAnimationFrame,
} from './notesE2E';

function createBlockSelectionPerformanceMarkdown(blockCount: number): string {
  const blocks = ['# Block Selection Performance', ''];

  for (let index = 0; index < blockCount; index += 1) {
    blocks.push(
      [
        `Performance block ${index} sentinel paragraph.`,
        'This paragraph is intentionally plain so the test measures block selection scaling.',
        'Repeated ordinary blocks catch regressions where decoration or overlay work grows with every selected block.',
      ].join(' '),
      '',
    );
  }

  return blocks.join('\n');
}

function createHardBreakBlockSelectionPerformanceMarkdown(blockCount: number): string {
  const blocks = ['# Block Selection Hard Break Performance', ''];

  for (let index = 0; index < blockCount; index += 1) {
    blocks.push(
      [
        `Performance hard break block ${index} first visual line.\\`,
        'Second visual line keeps the paragraph in one selectable block.\\',
        'Third visual line triggers line-fill overlay measurement.',
      ].join('\n'),
      '',
    );
  }

  return blocks.join('\n');
}

function createMalformedTyporaLikeBlockSelectionMarkdown(sectionCount: number): string {
  const blankLine = '<!--vlaina-markdown-blank-line-->';
  const blocks = [
    '---',
    'vlaina_cover: "./assets/13.jpg" x=50 y=35.92496673701899 height=200 scale=1',
    'vlaina_icon: "🍓"',
    'vlaina_created: 2026-05-02 21:41:13 +08:00',
    'vlaina_updated: 2026-06-11 18:32:29 +08:00',
    '---',
    '',
    '# Typora-like malformed block selection pressure',
    '',
  ];

  for (let index = 0; index < sectionCount; index += 1) {
    blocks.push(
      `${index + 1}. Typora compatibility item ${index} with unsupported syntax [toc], [TOC], ++underline++, ==highlight==, ^sup^, ~sub~ and [broken link ${index}(https://example.invalid/${index}`,
      '',
      blankLine,
      blankLine,
      '',
      `## 常用快捷键 ${index}\\\\`,
      '',
      blankLine,
      blankLine,
      '',
      `| 功能 ${index} | 操作步骤 | Windows | macOS | dangling |`,
      '| --- | ----------- | ------------- | :----- |',
      `| 源代码模式 | 视图->源代码模式 | Ctrl+/ | command+/ | extra-${index} | overflow |`,
      `| 表格坏行 | https\\:/[/example.com](https://example.com/${index}) | **bold | *italic* |`,
      '',
      `> > > nested quote ${index} with [!callout-icon:%ZZ] and unmatched **strong marker`,
      '',
      `<video src="./assets/${index}.mp4" /><audio src="./assets/${index}.mp3"></audio><iframe src="https://example.invalid/${index}"></iframe>`,
      '',
      `[^bad-${index}: footnote-like text without closing label`,
      '',
      `- [ ] task ${index}`,
      `  - [x] nested task ${index}`,
      '',
      '```txt',
      `old flow syntax ${index}: st=>start cond=>condition 对象A->对象B: missing renderer`,
      '```',
      '',
      `Final malformed block sentinel ${index}.`,
      '',
    );
  }

  blocks.push('Final malformed typora-like block selection sentinel.');
  return blocks.join('\n');
}

test.describe('notes block selection performance', () => {
  test.setTimeout(120_000);

  test('keeps growing block selections responsive in large notes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-performance');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'block-selection-performance.md',
        content: createBlockSelectionPerformanceMarkdown(700),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Performance block 0 sentinel' })).toBeVisible();

      const metrics = await page.evaluate(async () =>
        (window as any).__vlainaE2E.measureGrowingBlockSelectionByIndexCounts([
          1,
          25,
          100,
          250,
          500,
          700,
        ]));

      console.info('[notes-block-selection-growing-performance]', metrics);

      expect(metrics.selectableCount).toBeGreaterThanOrEqual(700);
      expect(metrics.results).toHaveLength(6);
      for (const result of metrics.results) {
        expect(result.selectedStateCount).toBe(result.requestedCount);
        expect(result.selectedDomCount).toBe(result.requestedCount);
      }

      const largestSelection = metrics.results.at(-1);
      expect(largestSelection?.dispatchMs ?? Number.POSITIVE_INFINITY).toBeLessThan(80);
      expect(largestSelection?.totalMs ?? Number.POSITIVE_INFINITY).toBeLessThan(140);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps blank-area block selection smooth while edge auto-scrolling', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-edge-autoscroll-performance');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'block-selection-edge-autoscroll-performance.md',
        content: createBlockSelectionPerformanceMarkdown(650),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Performance block 0 sentinel' })).toBeVisible();

      const dragTarget = await getBlankAreaDragTarget(page, 'Performance block 0 sentinel');
      expect(dragTarget, 'blank-area drag target').not.toBeNull();
      if (!dragTarget) return;

      const edgeTarget = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        if (!editor || !scrollRoot) return null;
        const editorRect = editor.getBoundingClientRect();
        const scrollRootRect = scrollRoot.getBoundingClientRect();
        return {
          x: Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, dragTargetVisualX(editorRect))),
          y: scrollRootRect.bottom - 4,
        };

        function dragTargetVisualX(rect: DOMRect): number {
          return rect.left + Math.min(320, Math.max(80, rect.width * 0.35));
        }
      });
      expect(edgeTarget, 'edge auto-scroll target').not.toBeNull();
      if (!edgeTarget) return;

      await page.mouse.move(dragTarget.startX, dragTarget.startY);
      await page.mouse.down();
      await page.mouse.move(dragTarget.endX, dragTarget.endY, { steps: 8 });
      await waitForEditorAnimationFrame(page);

      await page.mouse.move(edgeTarget.x, edgeTarget.y, { steps: 8 });
      await startMainThreadFrameProbe(page, '__vlainaBlockSelectionEdgeAutoScrollProbe');
      await page.waitForTimeout(700);
      const frameProbe = await stopMainThreadFrameProbe(page, '__vlainaBlockSelectionEdgeAutoScrollProbe');
      await page.mouse.up();

      const metrics = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        return {
          scrollTop: Math.round(scrollRoot?.scrollTop ?? 0),
          selectedDomCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
          selectableCount: (window as any).__vlainaE2E.getNoteSelectableBlocks().length,
        };
      });

      console.info('[notes-block-selection-edge-autoscroll-performance]', {
        ...metrics,
        frameProbe,
      });

      expect(metrics.selectableCount).toBeGreaterThanOrEqual(650);
      expect(metrics.scrollTop).toBeGreaterThan(80);
      expect(metrics.selectedDomCount).toBeGreaterThan(10);
      expect(frameProbe.p95FrameMs).toBeLessThan(80);
      expect(frameProbe.maxFrameMs).toBeLessThan(180);
      expect(frameProbe.longFramesOver100).toBeLessThanOrEqual(2);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps growing block selections responsive with hard-break paragraphs', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-hard-break-performance');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'block-selection-hard-break-performance.md',
        content: createHardBreakBlockSelectionPerformanceMarkdown(520),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Performance hard break block 0' })).toBeVisible();

      const metrics = await page.evaluate(async () =>
        (window as any).__vlainaE2E.measureGrowingBlockSelectionByIndexCounts([
          1,
          25,
          100,
        ]));

      console.info('[notes-block-selection-hard-break-growing-performance]', metrics);

      expect(metrics.selectableCount).toBeGreaterThanOrEqual(520);
      expect(metrics.results).toHaveLength(3);
      for (const result of metrics.results) {
        expect(result.selectedStateCount).toBe(result.requestedCount);
        expect(result.selectedDomCount).toBeGreaterThanOrEqual(result.requestedCount);
        expect(result.selectedDomCount).toBeLessThanOrEqual(result.requestedCount * 2);
      }

      const largestSelection = metrics.results.at(-1);
      expect(largestSelection?.lineFillCount ?? 0).toBeGreaterThan(0);
      expect(largestSelection?.dispatchMs ?? Number.POSITIVE_INFINITY).toBeLessThan(80);
      expect(largestSelection?.totalMs ?? Number.POSITIVE_INFINITY).toBeLessThan(160);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps growing block selections responsive in malformed Typora-like markdown', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-malformed-typora-like-performance');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'block-selection-malformed-typora-like-performance.md',
        content: createMalformedTyporaLikeBlockSelectionMarkdown(70),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final malformed typora-like block selection sentinel');
      await expect.poll(
        async () => page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks().length),
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(900);

      const metrics = await page.evaluate(async () =>
        (window as any).__vlainaE2E.measureGrowingBlockSelectionByIndexCounts([
          1,
          50,
          150,
          300,
          600,
          900,
        ]));

      console.info('[notes-block-selection-malformed-typora-like-performance]', metrics);

      expect(metrics.selectableCount).toBeGreaterThanOrEqual(900);
      expect(metrics.results).toHaveLength(6);
      for (const result of metrics.results) {
        expect(result.selectedStateCount).toBe(result.requestedCount);
        expect(result.selectedDomCount).toBeGreaterThanOrEqual(result.requestedCount);
        expect(result.selectedDomCount).toBeLessThanOrEqual(result.requestedCount * 2);
      }

      const largestSelection = metrics.results.at(-1);
      const slowestDispatch = metrics.results.reduce((slowest: any, result: any) =>
        result.dispatchMs > slowest.dispatchMs ? result : slowest, metrics.results[0]);
      expect(largestSelection?.dispatchMs ?? Number.POSITIVE_INFINITY).toBeLessThan(160);
      expect(largestSelection?.totalMs ?? Number.POSITIVE_INFINITY).toBeLessThan(220);
      expect(slowestDispatch?.dispatchMs ?? Number.POSITIVE_INFINITY).toBeLessThan(160);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps drag block selection responsive in long malformed Typora-like markdown', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-malformed-typora-like-drag-performance');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'block-selection-malformed-typora-like-drag-performance.md',
        content: createMalformedTyporaLikeBlockSelectionMarkdown(90),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final malformed typora-like block selection sentinel');
      await expect.poll(
        async () => page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks().length),
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(1_100);

      const dragTarget = await getBlankAreaDragTarget(page, 'Typora compatibility item 0');
      expect(dragTarget, 'blank-area drag target').not.toBeNull();
      if (!dragTarget) return;

      const edgeTarget = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        if (!editor || !scrollRoot) return null;
        const editorRect = editor.getBoundingClientRect();
        const scrollRootRect = scrollRoot.getBoundingClientRect();
        return {
          x: Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, editorRect.left + editorRect.width * 0.35)),
          y: scrollRootRect.bottom - 4,
        };
      });
      expect(edgeTarget, 'edge auto-scroll target').not.toBeNull();
      if (!edgeTarget) return;

      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(250);

      const dispatchProfileStarted = await page.evaluate(() => (
        window as any
      ).__vlainaE2E.startEditorDispatchProfile?.() ?? false);
      await page.mouse.move(dragTarget.startX, dragTarget.startY);
      await startMainThreadFrameProbe(page, '__vlainaBlockSelectionMalformedDragProbe');
      const dragStartedAt = Date.now();
      await page.mouse.down();
      await page.mouse.move(dragTarget.endX, dragTarget.endY, { steps: 12 });
      await page.mouse.move(edgeTarget.x, edgeTarget.y, { steps: 18 });
      await page.waitForTimeout(900);
      const frameProbe = await stopMainThreadFrameProbe(page, '__vlainaBlockSelectionMalformedDragProbe');
      await page.mouse.up();
      await waitForEditorAnimationFrame(page);
      const dispatchProfile = dispatchProfileStarted
        ? await page.evaluate(() => (
          window as any
        ).__vlainaE2E.stopEditorDispatchProfile?.() ?? null)
        : null;

      const metrics = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        return {
          lineFillCount: document.querySelectorAll('.editor-block-selection-line-fill').length,
          scrollTop: Math.round(scrollRoot?.scrollTop ?? 0),
          selectableCount: (window as any).__vlainaE2E.getNoteSelectableBlocks().length,
          selectedDomCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
        };
      });

      console.info('[notes-block-selection-malformed-typora-like-drag-performance]', {
        ...metrics,
        dispatchProfile,
        dragMs: Date.now() - dragStartedAt,
        frameProbe,
      });

      expect(metrics.selectableCount).toBeGreaterThanOrEqual(1_100);
      expect(metrics.scrollTop).toBeGreaterThan(80);
      expect(metrics.selectedDomCount).toBeGreaterThan(20);
      expect(frameProbe.p95FrameMs).toBeLessThan(90);
      expect(frameProbe.maxFrameMs).toBeLessThan(360);
      expect(frameProbe.longFramesOver100).toBeLessThanOrEqual(3);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps drag block selection responsive with body line numbers enabled', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-body-line-numbers-drag-performance');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await page.evaluate(() => (window as any).__vlainaE2E.setMarkdownBodyLineNumbers(true));

      await openMarkdownFixture(page, {
        filename: 'block-selection-body-line-numbers-drag-performance.md',
        content: createMalformedTyporaLikeBlockSelectionMarkdown(70),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator('.milkdown-editor.markdown-body-line-numbers')).toBeVisible();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final malformed typora-like block selection sentinel');
      await expect.poll(
        async () => page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks().length),
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(900);
      await expect.poll(
        async () => page.evaluate(() => document.querySelectorAll('.body-line-number').length),
        { timeout: 30_000 },
      ).toBeGreaterThan(200);

      const lineNumberColorBaseline = await page.evaluate(() => {
        const lineNumber = document.querySelector<HTMLElement>('.body-line-number');
        const style = lineNumber ? getComputedStyle(lineNumber) : null;
        return {
          color: style?.color ?? null,
          textFillColor: style?.getPropertyValue('-webkit-text-fill-color') ?? null,
        };
      });
      expect(lineNumberColorBaseline.color).not.toBeNull();

      const dragTarget = await getBlankAreaDragTarget(page, 'Typora compatibility item 0');
      expect(dragTarget, 'blank-area drag target').not.toBeNull();
      if (!dragTarget) return;

      const edgeTarget = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        if (!editor || !scrollRoot) return null;
        const editorRect = editor.getBoundingClientRect();
        const scrollRootRect = scrollRoot.getBoundingClientRect();
        return {
          x: Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, editorRect.left + editorRect.width * 0.35)),
          y: scrollRootRect.bottom - 4,
        };
      });
      expect(edgeTarget, 'edge auto-scroll target').not.toBeNull();
      if (!edgeTarget) return;

      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(250);

      await page.mouse.move(dragTarget.startX, dragTarget.startY);
      await startMainThreadFrameProbe(page, '__vlainaBlockSelectionBodyLineNumbersDragProbe');
      const dragStartedAt = Date.now();
      await page.mouse.down();
      await page.mouse.move(dragTarget.endX, dragTarget.endY, { steps: 12 });
      await page.mouse.move(edgeTarget.x, edgeTarget.y, { steps: 16 });
      await page.waitForTimeout(750);
      const frameProbe = await stopMainThreadFrameProbe(page, '__vlainaBlockSelectionBodyLineNumbersDragProbe');
      const autoScrollReached = await page.evaluate(async ({ minScrollTop, minSelectedDomCount }) => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        const startedAt = performance.now();
        while (performance.now() - startedAt < 1_800) {
          const selectedDomCount = document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length;
          if ((scrollRoot?.scrollTop ?? 0) > minScrollTop && selectedDomCount > minSelectedDomCount) {
            return true;
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
        }
        return false;
      }, {
        minScrollTop: 80,
        minSelectedDomCount: 20,
      });
      const midDragLineNumberSelection = await page.evaluate(() => {
        const selectedLabels = Array.from(
          document.querySelectorAll<HTMLElement>('.body-line-number.body-line-number-selected')
        );
        const firstSelectedLabel = selectedLabels[0] ?? null;
        const style = firstSelectedLabel ? getComputedStyle(firstSelectedLabel) : null;
        return {
          count: selectedLabels.length,
          color: style?.color ?? null,
          textFillColor: style?.getPropertyValue('-webkit-text-fill-color') ?? null,
        };
      });
      await page.mouse.up();
      await waitForEditorAnimationFrame(page);

      const metrics = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        return {
          lineNumberCount: document.querySelectorAll('.body-line-number').length,
          scrollTop: Math.round(scrollRoot?.scrollTop ?? 0),
          selectableCount: (window as any).__vlainaE2E.getNoteSelectableBlocks().length,
          selectedDomCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
        };
      });

      console.info('[notes-block-selection-body-line-numbers-drag-performance]', {
        ...metrics,
        autoScrollReached,
        midDragLineNumberSelection,
        dragMs: Date.now() - dragStartedAt,
        frameProbe,
      });

      expect(metrics.lineNumberCount).toBeGreaterThan(200);
      expect(metrics.selectableCount).toBeGreaterThanOrEqual(900);
      expect(autoScrollReached).toBe(true);
      expect(midDragLineNumberSelection.count).toBeGreaterThan(0);
      expect(midDragLineNumberSelection.color).toBe(lineNumberColorBaseline.color);
      expect(midDragLineNumberSelection.textFillColor).toBe(lineNumberColorBaseline.textFillColor);
      expect(metrics.scrollTop).toBeGreaterThan(80);
      expect(metrics.selectedDomCount).toBeGreaterThan(20);
      expect(frameProbe.p95FrameMs).toBeLessThan(100);
      expect(frameProbe.maxFrameMs).toBeLessThan(380);
      expect(frameProbe.longFramesOver100).toBeLessThanOrEqual(3);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
