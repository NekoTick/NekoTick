import { expect, test } from "@playwright/test";
import {
  BLOCK_CONTROLS_SELECTOR,
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
} from "./notesE2E";
import {
  selectNoteBlocksByMatchers,
  moveMouseToBlockHandleGutter,
  measureVisibleHandleGeometry,
  expectHandleCenteredOnTarget,
  expectHandleAnchoredToListRow,
  expectHandleAnchoredToOuterListRow,
} from "./notesBlockSelectionShared";

test.describe("notes block selection list handles", () => {
  test.setTimeout(90_000);

  test('keeps ordered-list markers visible when selecting continuation paragraphs', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-ordered-continuation-marker-selection');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { notePath } = await page.evaluate(() =>
        (window as any).__vlainaE2E.createNotesFixture({
          filename: 'ordered-continuation-marker-selection.md',
          content: [
            '# Ordered Continuation Marker Selection',
            '',
            '1. YAML Front Matter parent marker sentinel',
            '',
            '   frontmatter metadata continuation sentinel',
            '',
            '2. Source mode parent marker sentinel',
            '',
            '   source mode continuation sentinel',
            '',
          ].join('\n'),
        })
      );

      await page.evaluate((pathToOpen) => (window as any).__vlainaE2E.openAbsoluteNote(pathToOpen), notePath);
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} ol > li`, { hasText: 'YAML Front Matter parent marker sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'frontmatter metadata continuation sentinel' })).toBeVisible();

      await selectNoteBlocksByMatchers(page, [{ exact: 'frontmatter metadata continuation sentinel' }]);

      const visual = await page.evaluate(() => {
        const item = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror ol > li'))
          .find((element) => element.textContent?.includes('YAML Front Matter parent marker sentinel')) ?? null;
        const selected = item
          ? Array.from(item.children).find((child): child is HTMLElement => (
            child instanceof HTMLElement &&
            child.classList.contains('editor-block-selected') &&
            Boolean(child.textContent?.includes('frontmatter metadata continuation sentinel'))
          )) ?? null
          : null;
        if (!item || !selected) return null;

        const backgroundProbe = document.createElement('span');
        backgroundProbe.style.backgroundColor = 'var(--vlaina-block-selection-color-default)';
        document.body.appendChild(backgroundProbe);
        const selectedBackground = getComputedStyle(backgroundProbe).backgroundColor;
        backgroundProbe.remove();

        const bleedProbe = document.createElement('span');
        bleedProbe.style.marginLeft = 'calc(-1 * var(--vlaina-block-selection-bleed-x-start))';
        selected.appendChild(bleedProbe);
        const resolvedSelectionBleedLeft = Number.parseFloat(getComputedStyle(bleedProbe).marginLeft || 'NaN');
        bleedProbe.remove();

        return {
          itemText: item.textContent?.trim() ?? '',
          markerColor: getComputedStyle(item, '::marker').color,
          resolvedSelectionBleedLeft,
          selectedBackground,
          selectedBackgroundColor: getComputedStyle(selected).backgroundColor,
          selectedTagName: selected.tagName,
          selectedTextColor: getComputedStyle(selected).color,
          selectedText: selected.textContent?.trim() ?? '',
        };
      });

      expect(visual).not.toBeNull();
      expect(visual!.itemText).toContain('YAML Front Matter parent marker sentinel');
      expect(visual!.selectedText).toBe('frontmatter metadata continuation sentinel');
      expect(visual!.selectedTagName).toBe('P');
      expect(visual!.markerColor).toBe(visual!.selectedTextColor);
      expect(visual!.selectedBackgroundColor).toBe(visual!.selectedBackground);
      expect(Math.abs(visual!.resolvedSelectionBleedLeft)).toBeGreaterThanOrEqual(72);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps standalone rich child blocks inside lists visibly selected', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-list-rich-child-selection-surface');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { notePath } = await page.evaluate(() =>
        (window as any).__vlainaE2E.createNotesFixture({
          filename: 'list-rich-child-selection-surface.md',
          content: [
            '# List Rich Child Selection Surface',
            '',
            '- Code rich parent',
            '  ```ts',
            '  const listCodeSelectionSentinel = true;',
            '  ```',
            '',
            '- Math rich parent',
            '  $$',
            '  listMathSelectionSentinel = 1',
            '  $$',
            '',
            '- Mermaid rich parent',
            '  ```mermaid',
            '  flowchart TD',
            '    ListStart[listMermaidSelectionSentinel] --> ListEnd[Done]',
            '  ```',
            '',
            '- Table rich parent',
            '',
            '  | Label | Value |',
            '  | --- | --- |',
            '  | listTableSelectionSentinel | 1 |',
            '',
          ].join('\n'),
        })
      );

      await page.evaluate((pathToOpen) => (window as any).__vlainaE2E.openAbsoluteNote(pathToOpen), notePath);
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'listCodeSelectionSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="math-block"]`, { hasText: 'listMathSelectionSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .mermaid-block`, { hasText: 'listMermaidSelectionSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .milkdown-table-block`, { hasText: 'listTableSelectionSentinel' })).toBeVisible();

      for (const sample of [
        { label: 'list-code-child', sentinel: 'listCodeSelectionSentinel', expectedClass: 'code-block-container' },
        { label: 'list-math-child', sentinel: 'listMathSelectionSentinel', expectedType: 'math-block' },
        { label: 'list-mermaid-child', sentinel: 'listMermaidSelectionSentinel', expectedClass: 'mermaid-block' },
        { label: 'list-table-child', sentinel: 'listTableSelectionSentinel', expectedClass: 'milkdown-table-block' },
      ]) {
        const selected = await selectShortestSelectableBlockContaining(page, sample.sentinel);
        expect(selected.ok, `${sample.label}: ${JSON.stringify(selected)}`).toBe(true);

        const visual = await measureSelectedBlockSelectionSurface(page, sample.sentinel);
        expect(visual, `${sample.label}: missing selected visual`).not.toBeNull();
        if (sample.expectedClass) {
          expect(visual!.className, `${sample.label}: selected class`).toContain(sample.expectedClass);
        }
        if (sample.expectedType) {
          expect(visual!.dataType, `${sample.label}: selected data-type`).toBe(sample.expectedType);
        }
        expect(
          visual!.surfaceColors,
          `${sample.label}: selected block should have a visible selection surface\n${JSON.stringify(visual, null, 2)}`,
        ).toContain(visual!.expectedBackground);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps child-row handles on the outer edge when a parent list group is selected', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-parent-list-group-drag-handle');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { notePath } = await page.evaluate(() =>
        (window as any).__vlainaE2E.createNotesFixture({
          filename: 'parent-list-group-drag-handle.md',
          content: [
            '# Parent List Group Drag',
            '',
            '- Parent drag group',
            '  - Nested child stays visually grouped',
            '',
            'Standalone paragraph after group',
            '',
          ].join('\n'),
        })
      );

      await page.evaluate((pathToOpen) => (window as any).__vlainaE2E.openAbsoluteNote(pathToOpen), notePath);
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li li`, { hasText: 'Nested child stays visually grouped' })).toBeVisible();

      const selectedCount = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks();
        const parentIndex = blocks.findIndex((block: { text: string }) => block.text.includes('Parent drag group'));
        const childIndex = blocks.findIndex((block: { text: string }) => block.text === 'Nested child stays visually grouped');
        if (parentIndex < 0 || childIndex < 0) return 0;
        return (window as any).__vlainaE2E.selectNoteBlocksByIndexes([parentIndex, childIndex]);
      });
      expect(selectedCount).toBe(2);

      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} li li`, { hasText: 'Nested child stays visually grouped' }),
      );

      const geometry = await page.evaluate(() => {
        const controls = document.querySelector<HTMLElement>('.editor-block-controls.visible');
        const parentItem = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror > ul > li'))
          .find((element) => element.textContent?.includes('Parent drag group'));
        const childItem = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror li li'))
          .find((element) => element.textContent?.includes('Nested child stays visually grouped'));
        if (!controls || !parentItem || !childItem) return null;
        const controlsRect = controls.getBoundingClientRect();
        const parentRect = parentItem.getBoundingClientRect();
        const childRect = childItem.getBoundingClientRect();
        return {
          controlsCenterY: controlsRect.top + controlsRect.height / 2,
          childCenterY: childRect.top + childRect.height / 2,
          parentGapX: parentRect.left - controlsRect.left,
          childGapX: childRect.left - controlsRect.left,
          childIndentX: childRect.left - parentRect.left,
        };
      });

      expect(geometry).not.toBeNull();
      expect(Math.abs(geometry!.controlsCenterY - geometry!.childCenterY)).toBeLessThanOrEqual(2);
      expect(geometry!.parentGapX).toBeGreaterThan(48);
      expect(geometry!.parentGapX).toBeLessThan(88);
      expect(geometry!.childIndentX).toBeGreaterThan(16);
      expect(geometry!.childGapX).toBeGreaterThan(geometry!.parentGapX + 16);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps drag handle anchors correct across nested list selection modes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-nested-handle-anchor-matrix');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { notePath } = await page.evaluate(() =>
        (window as any).__vlainaE2E.createNotesFixture({
          filename: 'nested-handle-anchor-matrix.md',
          content: [
            '# Nested Handle Anchor Matrix',
            '',
            '- ParentOwnAlpha',
            '  - ChildOnlyBeta',
            '',
            '- ParentWholeAlpha',
            '  - ChildWholeBeta',
            '    - GrandchildWholeGamma',
            '',
            '- ParentMixedAlpha',
            '  - ChildMixedBeta',
            '',
            'StandaloneMixedDelta',
            '',
            '- CodeGroupAlpha',
            '  ```ts',
            '  const codeGroupSentinel = true;',
            '  ```',
            '',
          ].join('\n'),
        })
      );

      await page.evaluate((pathToOpen) => (window as any).__vlainaE2E.openAbsoluteNote(pathToOpen), notePath);
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li li`, { hasText: 'ChildOnlyBeta' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li li li`, { hasText: 'GrandchildWholeGamma' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'codeGroupSentinel' })).toBeVisible();

      await selectNoteBlocksByMatchers(page, [{ exact: 'ChildOnlyBeta' }]);
      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} li li`, { hasText: 'ChildOnlyBeta' }),
      );
      const childOnlyGeometry = await measureVisibleHandleGeometry(page, {
        targetSelector: '.milkdown .ProseMirror li li',
        targetText: 'ChildOnlyBeta',
        anchorSelector: '.milkdown .ProseMirror > ul > li',
        anchorText: 'ParentOwnAlpha',
      });
      expectHandleAnchoredToListRow(childOnlyGeometry);
      expect(childOnlyGeometry.targetGapX).toBeGreaterThan(childOnlyGeometry.anchorGapX + 16);

      await selectNoteBlocksByMatchers(page, [
        { include: 'ParentWholeAlpha' },
        { include: 'ChildWholeBeta', exclude: ['ParentWholeAlpha'] },
        { exact: 'GrandchildWholeGamma' },
      ]);
      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} li li li`, { hasText: 'GrandchildWholeGamma' }),
      );
      const deepGroupGeometry = await measureVisibleHandleGeometry(page, {
        targetSelector: '.milkdown .ProseMirror li li li',
        targetText: 'GrandchildWholeGamma',
        anchorSelector: '.milkdown .ProseMirror > ul > li',
        anchorText: 'ParentWholeAlpha',
      });
      expectHandleAnchoredToOuterListRow(deepGroupGeometry);

      await selectNoteBlocksByMatchers(page, [
        { include: 'ParentMixedAlpha' },
        { exact: 'ChildMixedBeta' },
        { exact: 'StandaloneMixedDelta' },
      ]);
      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} li li`, { hasText: 'ChildMixedBeta' }),
      );
      const mixedChildGeometry = await measureVisibleHandleGeometry(page, {
        targetSelector: '.milkdown .ProseMirror li li',
        targetText: 'ChildMixedBeta',
        anchorSelector: '.milkdown .ProseMirror > ul > li',
        anchorText: 'ParentMixedAlpha',
      });
      expectHandleAnchoredToOuterListRow(mixedChildGeometry);

      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'StandaloneMixedDelta' }),
      );
      const mixedStandaloneGeometry = await measureVisibleHandleGeometry(page, {
        targetSelector: '.milkdown .ProseMirror p',
        targetText: 'StandaloneMixedDelta',
        anchorSelector: '.milkdown .ProseMirror > ul > li',
        anchorText: 'ParentMixedAlpha',
      });
      expectHandleCenteredOnTarget(mixedStandaloneGeometry);
      expect(mixedStandaloneGeometry.targetGapX).toBeGreaterThan(24);
      expect(mixedStandaloneGeometry.targetGapX).toBeLessThan(72);
      expect(mixedStandaloneGeometry.targetGapX).toBeLessThan(mixedStandaloneGeometry.anchorGapX);

      await selectNoteBlocksByMatchers(page, [
        { include: 'CodeGroupAlpha' },
        { include: 'codeGroupSentinel', exclude: ['CodeGroupAlpha'] },
      ]);
      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'codeGroupSentinel' }),
      );
      const codeGroupGeometry = await measureVisibleHandleGeometry(page, {
        targetSelector: '.milkdown .ProseMirror .code-block-container',
        targetText: 'codeGroupSentinel',
        anchorSelector: '.milkdown .ProseMirror > ul > li',
        anchorText: 'CodeGroupAlpha',
      });
      expectHandleCenteredOnTarget(codeGroupGeometry);
      expect(codeGroupGeometry.anchorGapX).toBeGreaterThan(48);
      expect(codeGroupGeometry.anchorGapX).toBeLessThan(88);
      expect(codeGroupGeometry.targetIndentFromAnchorX).toBeGreaterThan(0);
      expect(codeGroupGeometry.targetGapX).toBeGreaterThan(codeGroupGeometry.anchorGapX);
      expect(codeGroupGeometry.targetGapX).toBeLessThan(codeGroupGeometry.anchorGapX + 16);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});

async function selectShortestSelectableBlockContaining(
  page: import('@playwright/test').Page,
  sentinel: string,
): Promise<{
  ok: boolean;
  index: number;
  count: number;
  selectedText: string;
  candidates: Array<{ index: number; text: string; tagName: string }>;
}> {
  return page.evaluate(async (targetSentinel) => {
    const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
      text: string;
      tagName: string;
    }>;
    const candidates = blocks
      .map((block, index) => ({ index, text: block.text, tagName: block.tagName }))
      .filter((block) => block.text.includes(targetSentinel))
      .sort((left, right) => (
        left.text.length - right.text.length ||
        left.index - right.index
      ));
    const target = candidates[0] ?? null;
    const count = target
      ? await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([target.index])
      : 0;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return {
      ok: Boolean(target && count === 1),
      index: target?.index ?? -1,
      count,
      selectedText: target?.text ?? '',
      candidates,
    };
  }, sentinel);
}

async function measureSelectedBlockSelectionSurface(
  page: import('@playwright/test').Page,
  sentinel: string,
): Promise<{
  tagName: string;
  className: string;
  dataType: string | null;
  backgroundColor: string;
  beforeBackgroundColor: string;
  afterBackgroundColor: string;
  boxShadow: string;
  expectedBackground: string;
  surfaceColors: string[];
} | null> {
  return page.evaluate((targetSentinel) => {
    const selected = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror .editor-block-selected'))
      .find((element) => element.textContent?.includes(targetSentinel)) ?? null;
    if (!selected) return null;

    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--vlaina-block-selection-color-default)';
    document.body.appendChild(probe);
    const expectedBackground = getComputedStyle(probe).backgroundColor;
    probe.remove();

    const styles = getComputedStyle(selected);
    const beforeStyles = getComputedStyle(selected, '::before');
    const afterStyles = getComputedStyle(selected, '::after');
    const surfaceColors = [
      styles.backgroundColor,
      beforeStyles.backgroundColor,
      afterStyles.backgroundColor,
    ].filter((color) => color && color !== 'rgba(0, 0, 0, 0)');

    return {
      tagName: selected.tagName,
      className: selected.className,
      dataType: selected.getAttribute('data-type'),
      backgroundColor: styles.backgroundColor,
      beforeBackgroundColor: beforeStyles.backgroundColor,
      afterBackgroundColor: afterStyles.backgroundColor,
      boxShadow: styles.boxShadow,
      expectedBackground,
      surfaceColors,
    };
  }, sentinel);
}
