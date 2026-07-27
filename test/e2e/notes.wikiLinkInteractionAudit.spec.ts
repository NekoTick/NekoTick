import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openAbsoluteNote,
  openMarkdownFixture,
  openNotesRootInNotes,
  waitForEditorAnimationFrame,
} from './notesE2E';

type TextRange = { from: number; to: number };

async function getEditorTextRange(page: Page, text: string): Promise<TextRange> {
  const range = await page.evaluate((value) =>
    (window as any).__vlainaE2E.getEditorTextRange(value), text);
  expect(range, `Expected editor text range for "${text}"`).not.toBeNull();
  return range!;
}

async function getSelection(page: Page) {
  return page.evaluate(() => (window as any).__vlainaE2E.getEditorSelectionSummary());
}

async function expectExpandedSource(page: Page, source: string): Promise<void> {
  await expect.poll(async () => page.locator(
    `${EDITOR_SELECTOR} .wiki-link-expanded`
  ).allTextContents()).toEqual(expect.arrayContaining([expect.any(String)]));
  await expect.poll(async () => (
    await page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`).allTextContents()
  ).join('')).toBe(source);
}

async function setSelection(page: Page, from: number, to = from): Promise<void> {
  await page.evaluate(({ nextFrom, nextTo }) =>
    (window as any).__vlainaE2E.setEditorSelectionRange(nextFrom, nextTo), {
    nextFrom: from,
    nextTo: to,
  });
}

async function resolveTextBoundaryPoint(
  page: Page,
  text: string,
  offset: number,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(async ({ editorSelector, value, boundaryOffset }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) return null;
    const doc = editor.ownerDocument as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    const walker = doc.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    for (let current = walker.nextNode(); current; current = walker.nextNode()) {
      if (current instanceof Text) textNodes.push(current);
    }
    const text = textNodes.map((node) => node.data).join('');
    const valueStart = text.indexOf(value);
    if (valueStart < 0 || value.length === 0) return null;

    const boundedOffset = Math.max(0, Math.min(value.length, boundaryOffset));
    const absoluteOffset = valueStart + boundedOffset;
    const locateCharacter = (characterOffset: number) => {
      let consumed = 0;
      for (const node of textNodes) {
        const nextConsumed = consumed + node.data.length;
        if (characterOffset < nextConsumed) {
          return { node, offset: characterOffset - consumed };
        }
        consumed = nextConsumed;
      }
      return null;
    };
    const globalOffset = (targetNode: Node, offset: number) => {
      let consumed = 0;
      for (const node of textNodes) {
        if (node === targetNode) return consumed + Math.max(0, Math.min(offset, node.data.length));
        consumed += node.data.length;
      }
      return null;
    };
    const rectForCharacter = (characterOffset: number) => {
      const character = locateCharacter(characterOffset);
      if (!character) return null;
      const range = doc.createRange();
      range.setStart(character.node, character.offset);
      range.setEnd(character.node, character.offset + 1);
      const rect = range.getBoundingClientRect();
      range.detach();
      return rect.width > 0 && rect.height > 0 ? rect : null;
    };

    const scrollCharacter = locateCharacter(Math.min(valueStart + boundedOffset, valueStart + value.length - 1));
    scrollCharacter?.node.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const previousRect = rectForCharacter(Math.max(valueStart, absoluteOffset - 1));
    const nextRect = rectForCharacter(Math.min(valueStart + value.length - 1, absoluteOffset));
    const rect = nextRect ?? previousRect;
    if (!rect) return null;
    const boundaryX = boundedOffset === 0
      ? nextRect?.left ?? rect.left
      : boundedOffset === value.length
        ? previousRect?.right ?? rect.right
        : ((previousRect?.right ?? rect.left) + (nextRect?.left ?? rect.right)) / 2;
    const samples = [boundaryX, boundaryX - 1, boundaryX + 1, boundaryX - 2, boundaryX + 2];
    const y = rect.top + rect.height / 2;
    for (const x of samples) {
      const caret = doc.caretPositionFromPoint?.(x, y);
      if (caret && globalOffset(caret.offsetNode, caret.offset) === absoluteOffset) {
        return { x, y };
      }
      const range = doc.caretRangeFromPoint?.(x, y) ?? null;
      const matches = range && globalOffset(range.startContainer, range.startOffset) === absoluteOffset;
      range?.detach();
      if (matches) return { x, y };
    }
    return { x: boundaryX, y };
  }, {
    editorSelector: EDITOR_SELECTOR,
    value: text,
    boundaryOffset: offset,
  });

  expect(point, `Expected pointer point for "${text}" at ${offset}`).not.toBeNull();
  return point!;
}

async function clickTextBoundary(page: Page, text: string, offset: number): Promise<void> {
  await page.waitForTimeout(550);
  const point = await resolveTextBoundaryPoint(page, text, offset);
  await page.mouse.click(point.x, point.y);
  await waitForEditorAnimationFrame(page);
}

async function selectTextByKeyboard(
  page: Page,
  text: string,
  fromOffset: number,
  length: number,
): Promise<void> {
  const textRange = await getEditorTextRange(page, text);
  await clickTextBoundary(page, text, fromOffset);
  await expect.poll(() => getSelection(page)).toMatchObject({
    empty: true,
    from: textRange.from + fromOffset,
    to: textRange.from + fromOffset,
  });
  await page.keyboard.down('Shift');
  for (let index = 0; index < length; index += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.up('Shift');
  await expect.poll(() => getSelection(page)).toMatchObject({
    empty: false,
    selectedText: text.slice(fromOffset, fromOffset + length),
  });
}

async function selectTextByPointer(
  page: Page,
  text: string,
  fromOffset: number,
  length: number,
): Promise<void> {
  await dragTextBoundaries(
    page,
    { text, offset: fromOffset },
    { text, offset: fromOffset + length },
  );
  await expect.poll(() => getSelection(page)).toMatchObject({
    empty: false,
    selectedText: text.slice(fromOffset, fromOffset + length),
  });
}

async function dragTextBoundaries(
  page: Page,
  start: { text: string; offset: number },
  end: { text: string; offset: number },
): Promise<void> {
  await page.waitForTimeout(550);
  const startPoint = await resolveTextBoundaryPoint(page, start.text, start.offset);
  const endPoint = await resolveTextBoundaryPoint(page, end.text, end.offset);
  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await page.mouse.move(endPoint.x, endPoint.y, { steps: 16 });
  await page.mouse.up();
  await waitForEditorAnimationFrame(page);
}

async function dragWholeText(page: Page, text: string, reverse = false): Promise<void> {
  await dragTextBoundaries(
    page,
    { text, offset: reverse ? text.length : 0 },
    { text, offset: reverse ? 0 : text.length },
  );
}

async function openWikiAuditFixture(page: Page) {
  const target = 'Project Beta';
  const alias = 'the beta note';
  const source = `[[${target}|${alias}]]`;
  const opened = await openMarkdownFixture(page, {
    filename: 'wiki-link-system-audit.md',
    content: [
      '# Wiki Link System Audit',
      '',
      `Before ${source} following selectable text.`,
      '',
      'Adjacent [[First]][[Second]] links.',
      '',
      '[ordinary link](https://example.test/docs)',
    ].join('\n'),
  });
  return { ...opened, target, alias, source };
}

test.describe('notes wiki-link interaction audit', () => {
  test('places a trailing blank click after the complete wiki-link source', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-line-end-blank-click');
    const source = '[[Project Beta|the beta note]]';
    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await openMarkdownFixture(page, {
        filename: 'wiki-link-line-end-blank-click.md',
        content: [
          '# Wiki Link Line End',
          '',
          `Line ending with ${source}`,
        ].join('\n'),
      });

      const wikiLink = page.locator(
        `${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="Project Beta"]`,
      );
      await expect(wikiLink).toBeVisible();
      const resolveBlankPoint = () => wikiLink.evaluate((element) => {
        const linkRect = element.getBoundingClientRect();
        const editorRect = element.closest('.ProseMirror')?.getBoundingClientRect();
        if (!editorRect) return null;
        return {
          x: Math.min(editorRect.right - 24, linkRect.right + 32),
          y: linkRect.top + linkRect.height / 2,
          linkRight: linkRect.right,
        };
      });
      let blankPoint = await resolveBlankPoint();
      expect(blankPoint).not.toBeNull();
      expect(blankPoint!.x).toBeGreaterThan(blankPoint!.linkRight + 16);

      await page.mouse.click(blankPoint!.x, blankPoint!.y);
      await waitForEditorAnimationFrame(page);
      await expectExpandedSource(page, source);
      const sourceRange = await getEditorTextRange(page, source);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: true,
        from: sourceRange.to,
        to: sourceRange.to,
      });

      await setSelection(page, sourceRange.from - 1);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
      blankPoint = await resolveBlankPoint();
      expect(blankPoint).not.toBeNull();
      expect(blankPoint!.x).toBeGreaterThan(blankPoint!.linkRight + 16);
      await page.mouse.click(blankPoint!.x, blankPoint!.y);
      await waitForEditorAnimationFrame(page);
      await expectExpandedSource(page, source);
      const reopenedSourceRange = await getEditorTextRange(page, source);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: true,
        from: reopenedSourceRange.to,
        to: reopenedSourceRange.to,
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits trailing blank clicks across wiki-link line shapes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-line-shape-audit');
    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 945, height: 1036 });
      await openMarkdownFixture(page, {
        filename: 'wiki-link-line-shape-audit.md',
        content: [
          '# Wiki Link Line Shapes',
          '',
          'Aliasless [[Alpha]]',
          '',
          'Adjacent [[First]][[Second]]',
          '',
          'Link then [[Middle|middle alias]] trailing text',
          '',
          'Hard break [[Hard Target|hard alias]]  ',
          'Hard continuation',
          '',
          '- List ending [[List Target|list alias]]',
          '',
          'Empty sibling list:',
          '',
          '- ',
          '- [[x|y]]',
          '',
          '## Heading ending [[Heading Target|heading alias]]',
          '',
          '> Quote ending [[Quote Target|quote alias]]',
          '',
          '- [ ] Task ending [[Task Target|task alias]]',
        ].join('\n'),
      });

      const clickTrailingBlank = async (
        locator: ReturnType<Page['locator']>,
        gapFromTarget: number | null = null,
      ) => {
        const point = await locator.evaluate((element, gap) => {
          const targetRect = element.getBoundingClientRect();
          const editorRect = element.closest('.ProseMirror')?.getBoundingClientRect();
          if (!editorRect) return null;
          return {
            x: gap === null
              ? editorRect.right - 24
              : Math.min(editorRect.right - 24, targetRect.right + gap),
            y: targetRect.top + Math.min(targetRect.height - 2, Math.max(2, targetRect.height / 2)),
            targetRight: targetRect.right,
          };
        }, gapFromTarget);
        expect(point).not.toBeNull();
        expect(point!.x).toBeGreaterThan(point!.targetRight);
        await page.mouse.click(point!.x, point!.y);
        await waitForEditorAnimationFrame(page);
      };
      const expectSourceEnd = async (source: string) => {
        await expectExpandedSource(page, source);
        const range = await getEditorTextRange(page, source);
        await expect.poll(() => getSelection(page)).toMatchObject({
          empty: true,
          from: range.to,
          to: range.to,
        });
        await expect(page.locator('.editor-forced-line-end-caret')).toHaveCount(0);
        await setSelection(page, 1);
        await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
      };
      const wikiLink = (target: string) => page.locator(
        `${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="${target}"]`,
      );

      await clickTrailingBlank(wikiLink('Alpha'));
      await expectSourceEnd('[[Alpha]]');

      await clickTrailingBlank(wikiLink('Second'));
      await expectSourceEnd('[[Second]]');

      const middleLine = wikiLink('Middle').locator('xpath=ancestor::p[1]');
      const middleLineEnd = (await getEditorTextRange(page, 'trailing text')).to;
      await clickTrailingBlank(middleLine);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: true,
        from: middleLineEnd,
        to: middleLineEnd,
      });

      await clickTrailingBlank(wikiLink('Hard Target'));
      await expectSourceEnd('[[Hard Target|hard alias]]');

      await clickTrailingBlank(wikiLink('List Target'));
      await expectSourceEnd('[[List Target|list alias]]');

      const emptySiblingLink = wikiLink('x');
      const emptySiblingFirstParagraph = emptySiblingLink.locator('xpath=ancestor::ul[1]/li[1]/p[1]');
      const emptySiblingFirstItemBox = await emptySiblingFirstParagraph.boundingBox();
      expect(emptySiblingFirstItemBox).not.toBeNull();
      const emptySiblingFirstItemPoint = {
        x: emptySiblingFirstItemBox!.x + 2,
        y: emptySiblingFirstItemBox!.y + emptySiblingFirstItemBox!.height / 2,
      };
      const emptySiblingFirstItemPos = await page.evaluate(({ x, y }) =>
        (window as any).__vlainaE2E.getEditorPositionAtPoint(x, y), emptySiblingFirstItemPoint);
      expect(emptySiblingFirstItemPos).not.toBeNull();
      await page.mouse.click(
        emptySiblingFirstItemPoint.x,
        emptySiblingFirstItemPoint.y,
      );
      await waitForEditorAnimationFrame(page);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: true,
        from: emptySiblingFirstItemPos,
        to: emptySiblingFirstItemPos,
      });
      await clickTrailingBlank(emptySiblingLink, 1);
      await expectExpandedSource(page, '[[x|y]]');
      const emptySiblingExpandedRange = await getEditorTextRange(page, '[[x|y]]');
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: true,
        from: emptySiblingExpandedRange.to,
        to: emptySiblingExpandedRange.to,
      });
      await page.keyboard.type('z');
      await expect.poll(() => getEditorTextRange(page, '[[x|y]]z')).toMatchObject({
        from: emptySiblingExpandedRange.from,
        to: emptySiblingExpandedRange.to + 1,
      });
      await page.keyboard.press('Backspace');
      await expectSourceEnd('[[x|y]]');

      await page.mouse.click(
        emptySiblingFirstItemPoint.x,
        emptySiblingFirstItemPoint.y,
      );
      await waitForEditorAnimationFrame(page);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: true,
        from: emptySiblingFirstItemPos,
        to: emptySiblingFirstItemPos,
      });
      await clickTrailingBlank(emptySiblingLink);
      await expectExpandedSource(page, '[[x|y]]');
      await expectSourceEnd('[[x|y]]');

      await clickTrailingBlank(wikiLink('Heading Target'));
      await expectSourceEnd('[[Heading Target|heading alias]]');

      await clickTrailingBlank(wikiLink('Quote Target'));
      await expectSourceEnd('[[Quote Target|quote alias]]');

      await clickTrailingBlank(wikiLink('Task Target'));
      await expectSourceEnd('[[Task Target|task alias]]');

      const collapsedLabels = [
        ['Alpha', 'Alpha'],
        ['Second', 'Second'],
        ['Middle', 'middle alias'],
        ['Hard Target', 'hard alias'],
        ['List Target', 'list alias'],
        ['x', 'y'],
        ['Heading Target', 'heading alias'],
        ['Quote Target', 'quote alias'],
        ['Task Target', 'task alias'],
      ] as const;
      for (const [target, label] of collapsedLabels) {
        await expect(wikiLink(target)).toHaveText(label);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits styled and expansion-wrapped wiki-link line ends', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-styled-line-ends');
    const wrappedTarget = [
      'Wrapped Target With A Deliberately Long Name',
      'That Expands Onto Another Visual Line',
    ].join(' ');
    const cases = [
      { target: 'Bold Line Target', alias: 'bold line alias', source: '[[Bold Line Target|bold line alias]]' },
      { target: 'Super Line Target', alias: 'super line alias', source: '[[Super Line Target|super line alias]]' },
      { target: wrappedTarget, alias: 'wrapped alias', source: `[[${wrappedTarget}|wrapped alias]]`, wrapped: true },
    ];

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 945, height: 1036 });
      await openMarkdownFixture(page, {
        filename: 'wiki-link-styled-line-ends.md',
        content: [
          '# Styled Wiki Link Line Ends',
          '',
          '**[[Bold Line Target|bold line alias]]**',
          '',
          'X^[[Super Line Target|super line alias]]^',
          '',
          `Long expansion [[${wrappedTarget}|wrapped alias]]`,
        ].join('\n'),
      });

      for (const testCase of cases) {
        await test.step(testCase.target, async () => {
          const link = page.locator(
            `${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="${testCase.target}"]`,
          );
          const point = await link.evaluate((element) => {
            const rects = Array.from(element.getClientRects()).filter((rect) => (
              rect.width > 0 && rect.height > 0
            ));
            const linkRect = rects[rects.length - 1] ?? element.getBoundingClientRect();
            const editorRect = element.closest('.ProseMirror')?.getBoundingClientRect();
            if (!editorRect) return null;
            return {
              x: editorRect.right - 24,
              y: linkRect.top + linkRect.height / 2,
              linkRight: linkRect.right,
            };
          });
          expect(point).not.toBeNull();
          expect(point!.x).toBeGreaterThan(point!.linkRight + 16);
          await page.mouse.click(point!.x, point!.y);
          await waitForEditorAnimationFrame(page);

          await expectExpandedSource(page, testCase.source);
          const range = await getEditorTextRange(page, testCase.source);
          await expect.poll(() => getSelection(page)).toMatchObject({
            empty: true,
            from: range.to,
            to: range.to,
          });
          await expect(page.locator('.editor-forced-line-end-caret')).toHaveCount(0);
          if (testCase.wrapped) {
            const lineCount = await page.locator(
              `${EDITOR_SELECTOR} .wiki-link-expanded`,
            ).evaluateAll((elements) => new Set(elements.flatMap((element) => (
              Array.from(element.getClientRects()).map((rect) => Math.round(rect.top))
            ))).size);
            expect(lineCount).toBeGreaterThan(1);
          }

          await setSelection(page, 1);
          await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
          await expect(link).toHaveText(testCase.alias);
        });
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits collapsed presentation and mouse entry at every source boundary', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-presentation-pointer-audit');
    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { alias, source, target } = await openWikiAuditFixture(page);
      const wikiLink = page.locator(`${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="${target}"]`).first();
      const ordinaryLink = page.locator(`${EDITOR_SELECTOR} a[href="https://example.test/docs"]`);

      await expect(wikiLink).toHaveText(alias);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
      const presentation = await page.evaluate(({ wikiSelector, ordinarySelector }) => {
        const wiki = document.querySelector<HTMLElement>(wikiSelector);
        const ordinary = document.querySelector<HTMLElement>(ordinarySelector);
        if (!wiki || !ordinary) return null;
        const wikiStyle = getComputedStyle(wiki);
        const ordinaryStyle = getComputedStyle(ordinary);
        return {
          wikiColor: wikiStyle.color,
          ordinaryColor: ordinaryStyle.color,
          wikiBorder: wikiStyle.borderBottomWidth,
          ordinaryBorder: ordinaryStyle.borderBottomWidth,
        };
      }, {
        wikiSelector: `${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="${target}"]`,
        ordinarySelector: `${EDITOR_SELECTOR} a[href="https://example.test/docs"]`,
      });
      expect(presentation).toEqual({
        wikiColor: presentation?.ordinaryColor,
        ordinaryColor: presentation?.ordinaryColor,
        wikiBorder: '0px',
        ordinaryBorder: '0px',
      });

      const linkBox = await wikiLink.boundingBox();
      expect(linkBox).not.toBeNull();
      await page.mouse.click(linkBox!.x - 1, linkBox!.y + linkBox!.height / 2);
      await expectExpandedSource(page, source);

      const sourceRange = await getEditorTextRange(page, source);
      const offsets = [
        0,
        1,
        2,
        5,
        2 + target.length,
        3 + target.length,
        3 + target.length + 4,
        source.length - 2,
        source.length - 1,
        source.length,
      ];
      for (const offset of offsets) {
        await clickTextBoundary(page, source, offset);
        await expect.poll(() => getSelection(page), {
          message: `Expected source caret at offset ${offset}`,
        }).toMatchObject({
          empty: true,
          from: sourceRange.from + offset,
          to: sourceRange.from + offset,
        });
      }

      await setSelection(page, sourceRange.to + 1);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
      await expect(wikiLink).toHaveText(alias);
      const foldedBox = await wikiLink.boundingBox();
      expect(foldedBox).not.toBeNull();
      await page.mouse.click(foldedBox!.x + foldedBox!.width + 1, foldedBox!.y + foldedBox!.height / 2);
      await expectExpandedSource(page, source);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits keyboard traversal, forward and reverse selection, and double click', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-keyboard-selection-audit');
    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { alias, source, target } = await openWikiAuditFixture(page);
      await clickTextBoundary(page, 'the beta note', 4);
      await expectExpandedSource(page, source);
      const sourceRange = await getEditorTextRange(page, source);

      await clickTextBoundary(page, source, 0);
      expect(await getSelection(page)).toMatchObject({
        empty: true,
        from: sourceRange.from,
      });
      for (let offset = 1; offset <= source.length; offset += 1) {
        await page.keyboard.press('ArrowRight');
        expect(await getSelection(page), `ArrowRight offset ${offset}`).toMatchObject({
          empty: true,
          from: sourceRange.from + offset,
        });
      }
      for (let offset = source.length - 1; offset >= 0; offset -= 1) {
        await page.keyboard.press('ArrowLeft');
        expect(await getSelection(page), `ArrowLeft offset ${offset}`).toMatchObject({
          empty: true,
          from: sourceRange.from + offset,
        });
      }

      const shiftAnchorOffset = 3;
      const shiftHeadOffset = `[[${target}|`.length + 4;
      await clickTextBoundary(page, source, shiftAnchorOffset);
      const shiftHeadPoint = await resolveTextBoundaryPoint(page, source, shiftHeadOffset);
      await page.keyboard.down('Shift');
      await page.mouse.click(shiftHeadPoint.x, shiftHeadPoint.y);
      await page.keyboard.up('Shift');
      await waitForEditorAnimationFrame(page);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: source.slice(shiftAnchorOffset, shiftHeadOffset),
      });
      await expectExpandedSource(page, source);

      await dragWholeText(page, source);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: source,
      });
      await setSelection(page, sourceRange.from + 3);
      await dragWholeText(page, source, true);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: source,
      });

      await selectTextByPointer(page, source, 2, target.length);
      await setSelection(page, sourceRange.from + 3);
      await selectTextByPointer(page, source, `[[${target}|`.length, alias.length);
      await setSelection(page, sourceRange.from + 3);

      const rightText = ' following selectable text.';
      const linkToRightText = source.slice(2) + rightText.slice(0, 10);
      await dragTextBoundaries(
        page,
        { text: source, offset: 2 },
        { text: rightText, offset: 10 },
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: linkToRightText,
      });
      await setSelection(page, sourceRange.from + 3);
      await dragTextBoundaries(
        page,
        { text: rightText, offset: 10 },
        { text: source, offset: 2 },
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: linkToRightText,
      });
      await setSelection(page, sourceRange.from + 3);

      const leftText = 'Before ';
      const leftTextToLink = leftText.slice(3) + source.slice(0, source.length - 2);
      await dragTextBoundaries(
        page,
        { text: leftText, offset: 3 },
        { text: source, offset: source.length - 2 },
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: leftTextToLink,
      });
      await setSelection(page, sourceRange.from + 3);
      await dragTextBoundaries(
        page,
        { text: source, offset: source.length - 2 },
        { text: leftText, offset: 3 },
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: leftTextToLink,
      });

      await clickTextBoundary(page, source, 5);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: true,
        from: sourceRange.from + 5,
        to: sourceRange.from + 5,
      });
      await dragTextBoundaries(
        page,
        { text: source, offset: source.length - 2 },
        { text: leftText, offset: 3 },
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: leftTextToLink,
      });

      await page.waitForTimeout(550);
      const targetPoint = await resolveTextBoundaryPoint(page, source, 5);
      await page.mouse.dblclick(targetPoint.x, targetPoint.y);
      await waitForEditorAnimationFrame(page);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: 'Project',
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits target and alias edits, deletion, undo, redo, folding, and invalid fallback', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-edit-history-audit');
    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { alias, source, target } = await openWikiAuditFixture(page);
      await clickTextBoundary(page, alias, 4);
      let sourceRange = await getEditorTextRange(page, source);

      await selectTextByKeyboard(page, source, 2, target.length);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: target,
      });
      await page.keyboard.type('P');
      await expectExpandedSource(page, `[[P|${alias}]]`);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: true,
        selectedText: '',
      });
      await page.keyboard.type('roject Gamma');
      let editedSource = `[[Project Gamma|${alias}]]`;
      await expectExpandedSource(page, editedSource);
      await page.keyboard.press('Control+z');
      await expectExpandedSource(page, source);
      await page.keyboard.press('Control+y');
      await expectExpandedSource(page, editedSource);

      sourceRange = await getEditorTextRange(page, editedSource);
      await selectTextByKeyboard(page, editedSource, '[[Project Gamma|'.length, alias.length);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: alias,
      });
      await page.keyboard.type('gamma alias');
      editedSource = '[[Project Gamma|gamma alias]]';
      await expectExpandedSource(page, editedSource);
      await page.waitForTimeout(550);

      sourceRange = await getEditorTextRange(page, editedSource);
      await setSelection(page, sourceRange.to - 1);
      await page.keyboard.press('Backspace');
      const invalidSource = '[[Project Gamma|gamma alias]';
      await expectExpandedSource(page, invalidSource);
      await page.keyboard.press('Control+z');
      await expectExpandedSource(page, editedSource);

      sourceRange = await getEditorTextRange(page, editedSource);
      await setSelection(page, sourceRange.to + 1);
      const folded = page.locator(`${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="Project Gamma"]`);
      await expect(folded).toHaveText('gamma alias');
      await clickTextBoundary(page, 'gamma alias', 5);
      await expectExpandedSource(page, editedSource);

      sourceRange = await getEditorTextRange(page, editedSource);
      await setSelection(page, sourceRange.to - 1);
      await page.keyboard.press('Delete');
      await expectExpandedSource(page, invalidSource);
      const invalidRange = await getEditorTextRange(page, invalidSource);
      await setSelection(page, invalidRange.to + 1);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link`)).toHaveCount(2);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(invalidSource);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits adjacent-link boundary ownership', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-adjacent-boundary-audit');
    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await openWikiAuditFixture(page);
      const first = page.locator(`${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="First"]`);
      const second = page.locator(`${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="Second"]`);
      await dragTextBoundaries(
        page,
        { text: 'First', offset: 1 },
        { text: 'Second', offset: 5 },
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: 'irstSecon',
      });
      await setSelection(page, (await getEditorTextRange(page, 'Adjacent')).from);
      const firstBox = await first.boundingBox();
      expect(firstBox).not.toBeNull();
      await page.mouse.click(firstBox!.x + firstBox!.width, firstBox!.y + firstBox!.height / 2);
      await expectExpandedSource(page, '[[Second]]');

      const secondSourceRange = await getEditorTextRange(page, '[[Second]]');
      await setSelection(page, secondSourceRange.to + 1);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
      await expect(first).toHaveText('First');
      await expect(second).toHaveText('Second');

      await clickTextBoundary(page, 'First', 2);
      await expectExpandedSource(page, '[[First]]');
      const firstSourceRange = await getEditorTextRange(page, '[[First]]');
      await setSelection(page, firstSourceRange.from - 1);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
      const convertedFirstBox = await first.boundingBox();
      expect(convertedFirstBox).not.toBeNull();
      await page.mouse.click(
        convertedFirstBox!.x + convertedFirstBox!.width,
        convertedFirstBox!.y + convertedFirstBox!.height / 2,
      );
      await expectExpandedSource(page, '[[Second]]');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits modified-click navigation and save-reopen persistence', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-navigation-persistence-audit');
    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'wiki-link-navigation-persistence',
        files: [
          {
            filename: 'Source.md',
            content: '# Source\n\nOpen [[Project Beta|the beta note]].\n',
          },
          {
            filename: 'Project Beta.md',
            content: '# Project Beta\n\nTarget content.\n',
          },
          {
            filename: 'Parking.md',
            content: '# Parking\n',
          },
        ],
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'wiki-link-navigation-persistence',
        minFileCount: 3,
      });
      const [sourcePath, targetPath, parkingPath] = fixture.notePaths;
      await openAbsoluteNote(page, sourcePath!);
      const link = page.locator(`${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="Project Beta"]`);

      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await link.click({ modifiers: [modifier] });
      const targetFilename = targetPath!.replace(/\\/g, '/').split('/').pop();
      await expect.poll(async () => page.evaluate(() =>
        (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null
      )).toBe(targetFilename);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Target content.');

      await openAbsoluteNote(page, sourcePath!);
      await clickTextBoundary(page, 'the beta note', 4);
      const source = '[[Project Beta|the beta note]]';
      const sourceRange = await getEditorTextRange(page, source);
      await selectTextByKeyboard(
        page,
        source,
        '[[Project Beta|'.length,
        'the beta note'.length,
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: 'the beta note',
      });
      await page.keyboard.type('saved alias');
      await expectExpandedSource(page, '[[Project Beta|saved alias]]');

      await page.evaluate(() => (window as any).__vlainaE2E.flushCurrentEditorMarkdown());
      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      await expect.poll(async () => page.evaluate((path) =>
        (window as any).__vlainaE2E.readTextFile(path), sourcePath!
      )).toContain('[[Project Beta|saved alias]]');

      await openAbsoluteNote(page, parkingPath!);
      await openAbsoluteNote(page, sourcePath!);
      const persisted = page.locator(`${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="Project Beta"]`);
      await expect(persisted).toHaveText('saved alias');
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits wiki links combined with other markdown syntax', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-syntax-combinations');
    const combinations = [
      {
        target: 'Bold Target',
        alias: 'bold alias',
        editedAlias: 'edited bold',
        wrap: (source: string) => `**${source}**`,
        ancestor: 'strong',
      },
      {
        target: 'Italic Target',
        alias: 'italic alias',
        editedAlias: 'edited italic',
        wrap: (source: string) => `*${source}*`,
        ancestor: 'em',
      },
      {
        target: 'Strike Target',
        alias: 'strike alias',
        editedAlias: 'edited strike',
        wrap: (source: string) => `~~${source}~~`,
        ancestor: 'del',
      },
      {
        target: 'Highlight Target',
        alias: 'highlight alias',
        editedAlias: 'edited highlight',
        wrap: (source: string) => `==${source}==`,
        ancestor: 'mark',
      },
      {
        target: 'Underline Target',
        alias: 'underline alias',
        editedAlias: 'edited underline',
        wrap: (source: string) => `++${source}++`,
        ancestor: 'u',
      },
      {
        target: 'Super Target',
        alias: 'super alias',
        editedAlias: 'edited super',
        wrap: (source: string) => `X^${source}^`,
        ancestor: 'sup',
      },
      {
        target: 'Sub Target',
        alias: 'sub alias',
        editedAlias: 'edited sub',
        wrap: (source: string) => `H~${source}~O`,
        ancestor: 'sub',
      },
      {
        target: 'Nested Marks Target',
        alias: 'nested marks alias',
        editedAlias: 'edited nested marks',
        wrap: (source: string) => `***${source}***`,
        ancestor: 'strong em, em strong',
      },
      {
        target: 'Text Color Target',
        alias: 'text color alias',
        editedAlias: 'edited text color',
        wrap: (source: string) => `<span style="color: #123456">${source}</span>`,
        ancestor: 'span[data-text-color]',
      },
    ];
    const structuralCombinations: Array<{
      target: string;
      alias: string;
      editedAlias: string;
      ancestor: string;
      persistedSource?: string;
    }> = [
      {
        target: 'Task Structure Target',
        alias: 'task structure alias',
        editedAlias: 'edited task structure',
        ancestor: 'li',
      },
      {
        target: 'Callout Structure Target',
        alias: 'callout structure alias',
        editedAlias: 'edited callout structure',
        ancestor: '.callout',
      },
      {
        target: 'Table Target',
        alias: 'table alias',
        editedAlias: 'edited table',
        ancestor: 'td',
        persistedSource: '[[Table Target\\|edited table]]',
      },
      {
        target: 'Definition Description Target',
        alias: 'definition description alias',
        editedAlias: 'edited definition description',
        ancestor: 'dd',
      },
    ];
    const content = [
      '# Wiki Link Syntax Combinations',
      '',
      ...combinations.flatMap(({ target, alias, wrap }) => [
        wrap(`[[${target}|${alias}]]`),
        '',
      ]),
      '`[[Inline Code]]` and $[[Inline Math]]$.',
      '',
      '![alt [[Image Text]]](missing-image.png)',
      '',
      '![[attachments/missing.png|Embedded Image]]',
      '',
      '[outer [[Nested Link]]](https://example.test/docs)',
      '',
      '[ordinary link](https://example.test) beside [[Adjacent Target|adjacent alias]] #combo/tag',
      '',
      '## Structure [[Heading Structure Target|heading structure alias]]',
      '',
      '- [ ] Task [[Task Structure Target|task structure alias]]',
      '',
      '> 💡 Callout [[Callout Structure Target|callout structure alias]]',
      '',
      '| Context | Link |',
      '| --- | --- |',
      '| Table | [[Table Target\\|table alias]] |',
      '',
      'Footnote reference [^combo].',
      '',
      '[^combo]: [[Footnote Target|footnote alias]]',
      '',
      'Definition term',
      ': Body [[Definition Description Target|definition description alias]]',
      '',
      String.raw`Escaped \[[Escaped Link]] remains literal.`,
      '',
      '```md',
      '[[Fenced Code]]',
      '```',
    ].join('\n');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'wiki-link-syntax-combinations',
        files: [
          { filename: 'Combinations.md', content },
          { filename: 'Parking.md', content: '# Parking\n' },
        ],
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'wiki-link-syntax-combinations',
        minFileCount: 2,
      });
      const [notePath, parkingPath] = fixture.notePaths;
      await openAbsoluteNote(page, notePath!);

      for (const protectedTarget of [
        'Inline Code',
        'Inline Math',
        'Image Text',
        'attachments/missing.png',
        'Nested Link',
        'Escaped Link',
        'Fenced Code',
      ]) {
        await expect(page.locator(
          `${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="${protectedTarget}"]`,
        )).toHaveCount(0);
      }
      await expect(page.locator(`${EDITOR_SELECTOR} code`, { hasText: '[[Inline Code]]' }))
        .toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="math-inline"]`)).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container`)).toHaveCount(2);
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, {
        hasText: '[[Fenced Code]]',
      })).toHaveCount(1);
      await expect(page.locator(EDITOR_SELECTOR))
        .toContainText('Escaped [[Escaped Link]] remains literal.');
      for (const target of ['Adjacent Target', 'Heading Structure Target', 'Footnote Target']) {
        await expect(page.locator(
          `${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="${target}"]`,
        )).toHaveCount(1);
      }

      const outsidePosition = (await getEditorTextRange(page, 'Wiki Link Syntax Combinations')).from;
      for (const combination of combinations) {
        await test.step(combination.target, async () => {
          const { target, alias, editedAlias, ancestor } = combination;
          const link = page.locator(
            `${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="${target}"]`,
          );
          await expect(link).toHaveText(alias);
          await expect.poll(() => link.evaluate((element, selector) => (
            Boolean(element.closest(selector))
          ), ancestor)).toBe(true);

          await clickTextBoundary(page, alias, Math.floor(alias.length / 2));
          const source = `[[${target}|${alias}]]`;
          await expectExpandedSource(page, source);
          const aliasOffset = `[[${target}|`.length;
          await selectTextByKeyboard(page, source, aliasOffset, alias.length);
          await page.keyboard.press('ArrowLeft');
          const sourceRange = await getEditorTextRange(page, source);
          await expect.poll(() => getSelection(page)).toMatchObject({
            empty: true,
            from: sourceRange.from + aliasOffset,
            to: sourceRange.from + aliasOffset,
          });
          await selectTextByPointer(page, source, aliasOffset, alias.length);
          await page.keyboard.type(editedAlias);
          const editedSource = `[[${target}|${editedAlias}]]`;
          await expectExpandedSource(page, editedSource);

          await setSelection(page, outsidePosition);
          await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
          await expect(link).toHaveText(editedAlias);
          await expect.poll(() => link.evaluate((element, selector) => (
            Boolean(element.closest(selector))
          ), ancestor)).toBe(true);
          combination.alias = editedAlias;
        });
      }

      for (const { target, alias, editedAlias, ancestor } of structuralCombinations) {
        const link = page.locator(
          `${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="${target}"]`,
        );
        await expect(link).toHaveText(alias);
        await expect.poll(() => link.evaluate((element, selector) => (
          Boolean(element.closest(selector))
        ), ancestor)).toBe(true);

        await clickTextBoundary(page, alias, Math.floor(alias.length / 2));
        const source = `[[${target}|${alias}]]`;
        await expectExpandedSource(page, source);
        const aliasOffset = `[[${target}|`.length;
        await selectTextByPointer(page, source, aliasOffset, alias.length);
        await page.keyboard.type(editedAlias);
        await expectExpandedSource(page, `[[${target}|${editedAlias}]]`);
        await setSelection(page, outsidePosition);
        await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
        await expect(link).toHaveText(editedAlias);
        await expect.poll(() => link.evaluate((element, selector) => (
          Boolean(element.closest(selector))
        ), ancestor)).toBe(true);
      }

      await page.evaluate(() => (window as any).__vlainaE2E.flushCurrentEditorMarkdown());
      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate((path) => (
        (window as any).__vlainaE2E.readTextFile(path)
      ), notePath!);
      for (const { target, alias, wrap } of combinations) {
        expect(saved).toContain(wrap(`[[${target}|${alias}]]`));
      }
      for (const testCase of structuralCombinations) {
        expect(saved).toContain(
          testCase.persistedSource ?? `[[${testCase.target}|${testCase.editedAlias}]]`,
        );
      }

      await openAbsoluteNote(page, parkingPath!);
      await openAbsoluteNote(page, notePath!);
      for (const { target, alias, ancestor } of combinations) {
        const link = page.locator(
          `${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="${target}"]`,
        );
        await expect(link).toHaveText(alias);
        await expect.poll(() => link.evaluate((element, selector) => (
          Boolean(element.closest(selector))
        ), ancestor)).toBe(true);
      }
      for (const { target, editedAlias, ancestor } of structuralCombinations) {
        const link = page.locator(
          `${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="${target}"]`,
        );
        await expect(link).toHaveText(editedAlias);
        await expect.poll(() => link.evaluate((element, selector) => (
          Boolean(element.closest(selector))
        ), ancestor)).toBe(true);
      }

      const boldLink = page.locator(
        `${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="Bold Target"]`,
      );
      const blankPoint = await boldLink.evaluate((element) => {
        const linkRect = element.getBoundingClientRect();
        const editorRect = element.closest('.ProseMirror')?.getBoundingClientRect();
        if (!editorRect) return null;
        return {
          x: Math.min(editorRect.right - 24, linkRect.right + 32),
          y: linkRect.top + linkRect.height / 2,
          linkRight: linkRect.right,
        };
      });
      expect(blankPoint).not.toBeNull();
      expect(blankPoint!.x).toBeGreaterThan(blankPoint!.linkRight + 16);
      await page.mouse.click(blankPoint!.x, blankPoint!.y);
      await waitForEditorAnimationFrame(page);
      const boldSource = '[[Bold Target|edited bold]]';
      await expectExpandedSource(page, boldSource);
      const boldRange = await getEditorTextRange(page, boldSource);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: true,
        from: boldRange.to,
        to: boldRange.to,
      });
      await expect(page.locator('.editor-forced-line-end-caret')).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
