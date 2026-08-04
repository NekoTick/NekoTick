import { expect, test, type Page } from '@playwright/test';
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

function getRoundedPreviewHorizontalBoundsSpread(pathData: string): number {
  const bounds = pathData.split('Z').flatMap((subpath) => {
    const move = /^M([-\d.]+) /.exec(subpath);
    const topEdge = /H([-\d.]+)A([-\d.]+) /.exec(subpath);
    if (!move || !topEdge) return [];
    const radius = Number.parseFloat(topEdge[2] ?? '');
    return [{
      left: Number.parseFloat(move[1] ?? '') - radius,
      right: Number.parseFloat(topEdge[1] ?? '') + radius,
    }];
  });
  if (bounds.length === 0) return Number.POSITIVE_INFINITY;

  const lefts = bounds.map((bound) => bound.left);
  const rights = bounds.map((bound) => bound.right);
  return Math.max(
    Math.max(...lefts) - Math.min(...lefts),
    Math.max(...rights) - Math.min(...rights),
  );
}

async function measureEdgeAutoScrollMotion(
  page: Page,
  direction: 'up' | 'down',
  durationMs: number,
) {
  return page.evaluate(async ({ direction: expectedDirection, durationMs: duration }) => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
    if (!scrollRoot) return null;

    const velocities: number[] = [];
    const startedAt = performance.now();
    const startScrollTop = scrollRoot.scrollTop;
    let previousAt = startedAt;
    let previousScrollTop = startScrollTop;
    while (performance.now() - startedAt < duration) {
      const frameAt = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      const scrollTop = scrollRoot.scrollTop;
      const elapsedMs = frameAt - previousAt;
      const directedDelta = expectedDirection === 'down'
        ? scrollTop - previousScrollTop
        : previousScrollTop - scrollTop;
      if (directedDelta > 0 && elapsedMs > 0) {
        velocities.push(directedDelta * 1000 / elapsedMs);
      }
      previousAt = frameAt;
      previousScrollTop = scrollTop;
    }

    velocities.sort((left, right) => left - right);
    const pick = (ratio: number) => velocities[
      Math.min(
        velocities.length - 1,
        Math.max(0, Math.ceil(velocities.length * ratio) - 1),
      )
    ] ?? 0;
    const p10Velocity = pick(0.1);
    const p90Velocity = pick(0.9);
    return {
      endScrollTop: Math.round(scrollRoot.scrollTop),
      p10Velocity: Math.round(p10Velocity),
      p90Velocity: Math.round(p90Velocity),
      sampleCount: velocities.length,
      startScrollTop: Math.round(startScrollTop),
      velocitySpread: p10Velocity > 0
        ? Math.round(p90Velocity / p10Velocity * 100) / 100
        : Number.POSITIVE_INFINITY,
    };
  }, { direction, durationMs });
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
      const committedPreviewPath = await page.evaluate(() => (
        document.querySelector<SVGPathElement>(
          '[data-editor-block-selection-committed-preview="true"] path'
        )?.getAttribute('d') ?? ''
      ));
      console.info('[notes-block-selection-growing-performance]', metrics);

      expect(metrics.selectableCount).toBeGreaterThanOrEqual(700);
      expect(metrics.results).toHaveLength(6);
      expect(committedPreviewPath).toContain('A');
      expect(getRoundedPreviewHorizontalBoundsSpread(committedPreviewPath)).toBeLessThanOrEqual(1);
      for (const result of metrics.results) {
        expect(result.selectedStateCount).toBe(result.requestedCount);
        expect(result.selectedDomCount + result.committedPreviewCount).toBe(result.requestedCount);
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
      const autoScrollMotion = await measureEdgeAutoScrollMotion(page, 'down', 700);
      expect(autoScrollMotion, 'auto-scroll motion samples').not.toBeNull();
      if (!autoScrollMotion) return;
      const expandedSelectionSnapshot = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        const preview = document.querySelector<HTMLElement>(
          '[data-editor-block-selection-preview="true"]'
        );
        const dragBox = document.querySelector<HTMLElement>('[data-editor-drag-box="true"]');
        const previewPathData = preview?.firstElementChild?.getAttribute('d') ?? '';
        const previewPathRect = preview?.firstElementChild?.getBoundingClientRect();
        const scrollRootRect = scrollRoot?.getBoundingClientRect();
        return {
          previewPathData,
          previewCount: Number.parseInt(preview?.dataset.selectionCount ?? '0', 10),
          previewHasRoundedCorners: previewPathData.includes('A'),
          previewPathVisible: Boolean(
            previewPathRect
            && scrollRootRect
            && previewPathRect.width > 0
            && previewPathRect.height > 0
            && previewPathRect.bottom > scrollRootRect.top
            && previewPathRect.top < scrollRootRect.bottom
          ),
          selectionRectFill: dragBox ? getComputedStyle(dragBox).backgroundColor : '',
          scrollTop: Math.round(scrollRoot?.scrollTop ?? 0),
        };
      });
      const { previewPathData, ...expandedSelectionMetrics } = expandedSelectionSnapshot;
      const expandedSelection = {
        ...expandedSelectionMetrics,
        previewHorizontalBoundsSpread: getRoundedPreviewHorizontalBoundsSpread(previewPathData),
      };
      const upwardEdgeTarget = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        if (!editor || !scrollRoot) return null;
        const editorRect = editor.getBoundingClientRect();
        const scrollRootRect = scrollRoot.getBoundingClientRect();
        return {
          x: Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, editorRect.left + 320)),
          y: scrollRootRect.top + 4,
        };
      });
      expect(upwardEdgeTarget, 'upward edge auto-scroll target').not.toBeNull();
      if (!upwardEdgeTarget) return;

      await page.mouse.move(upwardEdgeTarget.x, upwardEdgeTarget.y, { steps: 12 });
      const upwardAutoScrollMotion = await measureEdgeAutoScrollMotion(page, 'up', 450);
      expect(upwardAutoScrollMotion, 'upward auto-scroll motion samples').not.toBeNull();
      if (!upwardAutoScrollMotion) return;
      await waitForEditorAnimationFrame(page);
      const shrunkSelection = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        const preview = document.querySelector<HTMLElement>(
          '[data-editor-block-selection-preview="true"]'
        );
        return {
          previewCount: Number.parseInt(preview?.dataset.selectionCount ?? '0', 10),
          scrollTop: Math.round(scrollRoot?.scrollTop ?? 0),
        };
      });
      const stopTarget = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        if (!editor || !scrollRoot) return null;
        const editorRect = editor.getBoundingClientRect();
        const scrollRootRect = scrollRoot.getBoundingClientRect();
        return {
          x: Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, editorRect.left + 320)),
          y: scrollRootRect.top + scrollRootRect.height * 0.45,
        };
      });
      expect(stopTarget, 'auto-scroll stop target').not.toBeNull();
      if (!stopTarget) return;
      await page.mouse.move(stopTarget.x, stopTarget.y, { steps: 8 });
      await waitForEditorAnimationFrame(page);
      const stoppedScrollTop = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        return Math.round(scrollRoot?.scrollTop ?? 0);
      });
      await page.waitForTimeout(120);
      const settledScrollTop = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        return Math.round(scrollRoot?.scrollTop ?? 0);
      });
      const frameProbe = await stopMainThreadFrameProbe(page, '__vlainaBlockSelectionEdgeAutoScrollProbe');
      await page.mouse.up();

      const metrics = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        return {
          scrollTop: Math.round(scrollRoot?.scrollTop ?? 0),
          committedPreviewCount: Number.parseInt(
            document.querySelector<SVGSVGElement>(
              '[data-editor-block-selection-committed-preview="true"]'
            )?.dataset.selectionCount ?? '0',
            10,
          ),
          selectedDomCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
          selectableCount: (window as any).__vlainaE2E.getNoteSelectableBlocks().length,
        };
      });

      console.info('[notes-block-selection-edge-autoscroll-performance]', {
        ...metrics,
        autoScrollMotion,
        expandedSelection,
        frameProbe,
        settledScrollTop,
        shrunkSelection,
        stoppedScrollTop,
        upwardAutoScrollMotion,
      });

      expect(metrics.selectableCount).toBeGreaterThanOrEqual(650);
      expect(metrics.scrollTop).toBeGreaterThan(80);
      expect(autoScrollMotion.sampleCount).toBeGreaterThan(12);
      expect(autoScrollMotion.velocitySpread).toBeLessThanOrEqual(1.4);
      expect(autoScrollMotion.endScrollTop).toBeGreaterThan(autoScrollMotion.startScrollTop);
      expect(upwardAutoScrollMotion.sampleCount).toBeGreaterThan(8);
      expect(upwardAutoScrollMotion.velocitySpread).toBeLessThanOrEqual(1.4);
      expect(upwardAutoScrollMotion.endScrollTop).toBeLessThan(upwardAutoScrollMotion.startScrollTop);
      expect(expandedSelection.previewCount).toBeGreaterThan(10);
      expect(expandedSelection.previewHasRoundedCorners).toBe(true);
      expect(expandedSelection.previewHorizontalBoundsSpread).toBeLessThanOrEqual(1);
      expect(expandedSelection.previewPathVisible).toBe(true);
      expect(expandedSelection.selectionRectFill).toBe('rgba(0, 0, 0, 0)');
      expect(shrunkSelection.previewCount).toBeLessThan(expandedSelection.previewCount);
      expect(shrunkSelection.previewCount).toBeGreaterThan(0);
      expect(metrics.selectedDomCount + metrics.committedPreviewCount).toBeGreaterThan(0);
      expect(settledScrollTop).toBe(stoppedScrollTop);
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
        expect(result.selectedDomCount + result.committedPreviewCount)
          .toBeGreaterThanOrEqual(result.requestedCount);
        expect(result.selectedDomCount + result.committedPreviewCount)
          .toBeLessThanOrEqual(result.requestedCount * 2);
      }

      const largestSelection = metrics.results.at(-1);
      expect(largestSelection?.committedPreviewCount ?? 0).toBeGreaterThan(0);
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
        expect(result.selectedDomCount + result.committedPreviewCount)
          .toBeGreaterThanOrEqual(result.requestedCount);
        expect(result.selectedDomCount + result.committedPreviewCount)
          .toBeLessThanOrEqual(result.requestedCount * 2);
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

      await page.mouse.move(dragTarget.startX, dragTarget.startY);
      await startMainThreadFrameProbe(page, '__vlainaBlockSelectionMalformedDragProbe');
      const dragStartedAt = Date.now();
      await page.mouse.down();
      await page.mouse.move(dragTarget.endX, dragTarget.endY, { steps: 12 });
      await waitForEditorAnimationFrame(page);
      const dragDispatchProfileStarted = await page.evaluate(() => (
        window as any
      ).__vlainaE2E.startEditorDispatchProfile?.() ?? false);
      await page.mouse.move(edgeTarget.x, edgeTarget.y, { steps: 18 });
      await page.waitForTimeout(900);
      const frameProbe = await stopMainThreadFrameProbe(page, '__vlainaBlockSelectionMalformedDragProbe');
      const dragPreviewPath = await page.evaluate(() => (
        document.querySelector<SVGPathElement>(
          '[data-editor-block-selection-preview="true"] path'
        )?.getAttribute('d') ?? ''
      ));
      const dragDispatchProfile = dragDispatchProfileStarted
        ? await page.evaluate(() => (
          window as any
        ).__vlainaE2E.stopEditorDispatchProfile?.() ?? null)
        : null;
      const releaseDispatchProfileStarted = await page.evaluate(() => (
        window as any
      ).__vlainaE2E.startEditorDispatchProfile?.() ?? false);
      await page.mouse.up();
      await waitForEditorAnimationFrame(page);
      const releaseDispatchProfile = releaseDispatchProfileStarted
        ? await page.evaluate(() => (
          window as any
        ).__vlainaE2E.stopEditorDispatchProfile?.() ?? null)
        : null;
      const committedPreviewPath = await page.evaluate(() => (
        document.querySelector<SVGPathElement>(
          '[data-editor-block-selection-committed-preview="true"] path'
        )?.getAttribute('d') ?? ''
      ));

      const metrics = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        return {
          lineFillCount: document.querySelectorAll('.editor-block-selection-line-fill').length,
          committedPreviewCount: Number.parseInt(
            document.querySelector<SVGSVGElement>(
              '[data-editor-block-selection-committed-preview="true"]'
            )?.dataset.selectionCount ?? '0',
            10,
          ),
          scrollTop: Math.round(scrollRoot?.scrollTop ?? 0),
          selectableCount: (window as any).__vlainaE2E.getNoteSelectableBlocks().length,
          selectedDomCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
        };
      });

      console.info('[notes-block-selection-malformed-typora-like-drag-performance]', {
        ...metrics,
        dragDispatchProfile,
        dragMs: Date.now() - dragStartedAt,
        frameProbe,
        releaseDispatchProfile,
      });

      expect(metrics.selectableCount).toBeGreaterThanOrEqual(1_100);
      expect(metrics.scrollTop).toBeGreaterThan(80);
      expect(metrics.selectedDomCount + metrics.committedPreviewCount).toBeGreaterThan(20);
      expect(getRoundedPreviewHorizontalBoundsSpread(dragPreviewPath)).toBeLessThanOrEqual(1);
      expect(getRoundedPreviewHorizontalBoundsSpread(committedPreviewPath)).toBeLessThanOrEqual(1);
      expect(dragDispatchProfile?.dispatchCount).toBe(0);
      expect(releaseDispatchProfile?.dispatchCount).toBe(1);
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
      const autoScrollReached = await page.evaluate(async ({ minScrollTop, minSelectionFeedbackCount }) => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        const startedAt = performance.now();
        while (performance.now() - startedAt < 1_800) {
          const selectedDomCount = document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length;
          const preview = document.querySelector<SVGSVGElement>(
            '[data-editor-block-selection-preview="true"]'
          );
          const previewCount = Number.parseInt(preview?.dataset.selectionCount ?? '0', 10);
          if (
            (scrollRoot?.scrollTop ?? 0) > minScrollTop
            && selectedDomCount + previewCount > minSelectionFeedbackCount
          ) {
            return true;
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
        }
        return false;
      }, {
        minScrollTop: 800,
        minSelectionFeedbackCount: 10,
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
          committedPreviewCount: Number.parseInt(
            document.querySelector<SVGSVGElement>(
              '[data-editor-block-selection-committed-preview="true"]'
            )?.dataset.selectionCount ?? '0',
            10,
          ),
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
      expect(metrics.selectedDomCount + metrics.committedPreviewCount).toBeGreaterThan(20);
      expect(frameProbe.p95FrameMs).toBeLessThan(100);
      expect(frameProbe.maxFrameMs).toBeLessThan(380);
      expect(frameProbe.longFramesOver100).toBeLessThanOrEqual(3);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
