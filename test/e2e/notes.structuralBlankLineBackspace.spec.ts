import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  waitForEditorAnimationFrame,
} from './notesE2E';

const TOP_LEVEL_BLANK_LINE_SELECTOR = [
  `${EDITOR_SELECTOR} > [data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]`,
  `${EDITOR_SELECTOR} > p.editor-editable-markdown-blank-line`,
  `${EDITOR_SELECTOR} > p:empty`,
].join(', ');

type StructuralGapCase = {
  anchorText: string;
  content: string;
  filename: string;
  label: string;
  nextText: string;
};

async function selectTextRange(page: Page, text: string): Promise<{ from: number; to: number }> {
  const selected = await page.evaluate((targetText) =>
    (window as any).__vlainaE2E.selectEditorTextByText(targetText, targetText), text
  );

  expect(selected, `Expected to select "${text}"`).toMatchObject({
    selected: true,
    selectedText: text,
  });
  expect(typeof selected.from, `Expected a start position for "${text}"`).toBe('number');
  expect(typeof selected.to, `Expected an end position for "${text}"`).toBe('number');

  return {
    from: selected.from,
    to: selected.to,
  };
}

async function setCursorAtTextStart(page: Page, text: string): Promise<{ from: number; to: number }> {
  const range = await selectTextRange(page, text);
  const selection = await page.evaluate((position) =>
    (window as any).__vlainaE2E.setEditorSelectionRange(position), range.from
  );

  expect(selection, `Expected collapsed selection before "${text}"`).toMatchObject({
    empty: true,
    from: range.from,
    to: range.from,
  });
  await waitForEditorAnimationFrame(page);
  return range;
}

async function collectStructuralGapDiagnostics(page: Page) {
  return page.evaluate(({ blankLineSelector, editorSelector }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    return {
      blankLineCount: document.querySelectorAll(blankLineSelector).length,
      selectedBlocks: editor?.querySelectorAll('.editor-block-selected').length ?? 0,
      selectedNodes: Array.from(editor?.querySelectorAll<HTMLElement>('.ProseMirror-selectednode') ?? [])
        .map((element) => ({
          dataType: element.dataset.type ?? '',
          tagName: element.tagName,
          text: element.textContent ?? '',
        })),
      selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
      text: editor?.textContent ?? '',
    };
  }, {
    blankLineSelector: TOP_LEVEL_BLANK_LINE_SELECTOR,
    editorSelector: EDITOR_SELECTOR,
  });
}

test.describe('notes structural blank line Backspace caret', () => {
  test.setTimeout(120_000);

  test('keeps the caret at the previous structural block end when Backspace deletes the blank line from the next paragraph start', async () => {
    const nestedQuoteText = '就是说我们需要做的就是先把他的体验都给做了,然后就是来把他的用户都给抢过来';
    const userNextText = '需要做的一些事';
    const cases: StructuralGapCase[] = [
      {
        label: 'user nested blockquote',
        filename: 'structural-gap-user-nested-blockquote.md',
        anchorText: nestedQuoteText,
        nextText: userNextText,
        content: [
          '> 我还是希望这个阶段的话就是可以完全的取代typora',
          '>',
          `> > ${nestedQuoteText}`,
          '',
          userNextText,
        ].join('\n'),
      },
      {
        label: 'heading',
        filename: 'structural-gap-heading.md',
        anchorText: 'Heading structural blank sentinel',
        nextText: 'After heading blank line sentinel',
        content: [
          '## Heading structural blank sentinel',
          '',
          'After heading blank line sentinel',
        ].join('\n'),
      },
      {
        label: 'blockquote',
        filename: 'structural-gap-blockquote.md',
        anchorText: 'Quote previous line sentinel',
        nextText: 'After quote blank line sentinel',
        content: [
          '> Quote previous line sentinel',
          '',
          'After quote blank line sentinel',
        ].join('\n'),
      },
      {
        label: 'callout',
        filename: 'structural-gap-callout.md',
        anchorText: 'Callout body before gap sentinel',
        nextText: 'After callout blank line sentinel',
        content: [
          '> [!NOTE] Callout title sentinel',
          '> Callout body before gap sentinel',
          '',
          'After callout blank line sentinel',
        ].join('\n'),
      },
    ];

    const { app, userDataRoot } = await launchIsolatedElectron('notes-structural-gap-backspace');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      for (const testCase of cases) {
        await openMarkdownFixture(page, {
          filename: testCase.filename,
          content: testCase.content,
        });
        await expect(page.locator(EDITOR_SELECTOR), testCase.label).toContainText(testCase.nextText);
        await expect(page.locator(TOP_LEVEL_BLANK_LINE_SELECTOR), testCase.label).toHaveCount(1);

        const anchorRange = await selectTextRange(page, testCase.anchorText);
        await setCursorAtTextStart(page, testCase.nextText);
        await page.keyboard.press('Backspace');
        await waitForEditorAnimationFrame(page);
        await waitForEditorAnimationFrame(page);

        const diagnostics = await collectStructuralGapDiagnostics(page);
        expect(diagnostics.text, `${testCase.label}\n${JSON.stringify(diagnostics, null, 2)}`)
          .toContain(testCase.anchorText);
        expect(diagnostics.text, `${testCase.label}\n${JSON.stringify(diagnostics, null, 2)}`)
          .toContain(testCase.nextText);
        expect(diagnostics.blankLineCount, `${testCase.label}\n${JSON.stringify(diagnostics, null, 2)}`)
          .toBe(0);
        expect(diagnostics.selectedBlocks, `${testCase.label}\n${JSON.stringify(diagnostics, null, 2)}`)
          .toBe(0);
        expect(diagnostics.selectedNodes, `${testCase.label}\n${JSON.stringify(diagnostics, null, 2)}`)
          .toEqual([]);
        expect(diagnostics.selection, `${testCase.label}\n${JSON.stringify(diagnostics, null, 2)}`)
          .toMatchObject({
            empty: true,
            from: anchorRange.to,
            selectedText: '',
            to: anchorRange.to,
          });
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
