import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  waitForEditorAnimationFrame,
} from './notesE2E';

type ListBlankLineState = {
  anchorListItemText: string | null;
  anchorParagraphText: string | null;
  gapCount: number;
  listItemPrimaryTexts: string[];
  topLevelLists: Array<{
    items: string[];
    tagName: string;
  }>;
  selection: {
    empty: boolean;
    from: number;
    to: number;
  } | null;
};

type ListBlankLineCase = {
  content: string;
  expectedAfterDelete: string[];
  expectedAfterLineEndType: string[];
  expectedAfterType: string[];
  expectedTopLevelListsAfterDelete: ListBlankLineState['topLevelLists'];
  expectedTopLevelListsAfterType: ListBlankLineState['topLevelLists'];
  filename: string;
  label: string;
};

const listBlankLineCases: ListBlankLineCase[] = [
  {
    label: 'ordered list',
    filename: 'ordered-list-blank-line-caret.md',
    content: ['1. 1', '', '1. 2'].join('\n'),
    expectedAfterDelete: ['1', '2'],
    expectedAfterLineEndType: ['1X', '', '2'],
    expectedAfterType: ['1X', '2'],
    expectedTopLevelListsAfterDelete: [{ tagName: 'OL', items: ['1', '2'] }],
    expectedTopLevelListsAfterType: [{ tagName: 'OL', items: ['1X', '2'] }],
  },
  {
    label: 'bullet list',
    filename: 'bullet-list-blank-line-caret.md',
    content: ['- 1', '', '- 2'].join('\n'),
    expectedAfterDelete: ['1', '2'],
    expectedAfterLineEndType: ['1X', '', '2'],
    expectedAfterType: ['1X', '2'],
    expectedTopLevelListsAfterDelete: [{ tagName: 'UL', items: ['1', '2'] }],
    expectedTopLevelListsAfterType: [{ tagName: 'UL', items: ['1X', '2'] }],
  },
  {
    label: 'task list',
    filename: 'task-list-blank-line-caret.md',
    content: ['- [ ] 1', '', '- [x] 2'].join('\n'),
    expectedAfterDelete: ['1', '2'],
    expectedAfterLineEndType: ['1X', '', '2'],
    expectedAfterType: ['1X', '2'],
    expectedTopLevelListsAfterDelete: [{ tagName: 'UL', items: ['1', '2'] }],
    expectedTopLevelListsAfterType: [{ tagName: 'UL', items: ['1X', '2'] }],
  },
  {
    label: 'nested bullet list',
    filename: 'nested-bullet-list-blank-line-caret.md',
    content: ['- parent', '  - 1', '', '  - 2'].join('\n'),
    expectedAfterDelete: ['parent', '1', '2'],
    expectedAfterLineEndType: ['parent', '1X', '', '2'],
    expectedAfterType: ['parent', '1X', '2'],
    expectedTopLevelListsAfterDelete: [{ tagName: 'UL', items: ['parent'] }],
    expectedTopLevelListsAfterType: [{ tagName: 'UL', items: ['parent'] }],
  },
  {
    label: 'nested ordered list',
    filename: 'nested-ordered-list-blank-line-caret.md',
    content: ['1. parent', '   1. 1', '', '   1. 2'].join('\n'),
    expectedAfterDelete: ['parent', '1', '2'],
    expectedAfterLineEndType: ['parent', '1X', '', '2'],
    expectedAfterType: ['parent', '1X', '2'],
    expectedTopLevelListsAfterDelete: [{ tagName: 'OL', items: ['parent'] }],
    expectedTopLevelListsAfterType: [{ tagName: 'OL', items: ['parent'] }],
  },
  {
    label: 'nested task list',
    filename: 'nested-task-list-blank-line-caret.md',
    content: ['- [ ] parent', '  - [ ] 1', '', '  - [x] 2'].join('\n'),
    expectedAfterDelete: ['parent', '1', '2'],
    expectedAfterLineEndType: ['parent', '1X', '', '2'],
    expectedAfterType: ['parent', '1X', '2'],
    expectedTopLevelListsAfterDelete: [{ tagName: 'UL', items: ['parent'] }],
    expectedTopLevelListsAfterType: [{ tagName: 'UL', items: ['parent'] }],
  },
];

async function setCursorAtFirstListGapStart(page: Page): Promise<void> {
  const selection = await page.evaluate(() => {
    const bridge = (window as any).__vlainaE2E;
    const blocks = bridge.getNoteSelectableBlocks() as Array<{
      className?: string;
      from: number;
      text: string;
      to: number;
    }>;
    const gapBlock = blocks.find((block) =>
      (block.className ?? '').includes('editor-list-gap-placeholder-item')
    ) ?? blocks.find((block) => block.text.trim() === '\u2800')
      ?? blocks.find((block) => block.text.includes('\u2800'));
    if (!gapBlock) return null;

    return bridge.setEditorSelectionRange(Math.max(gapBlock.from + 1, gapBlock.to - 2));
  });

  expect(selection, 'Expected a selectable list gap block').not.toBeNull();
  await expect.poll(async () => page.evaluate(() => {
    const selectionSummary = (window as any).__vlainaE2E.getEditorSelectionSummary();
    return Boolean(selectionSummary?.empty);
  })).toBe(true);
}

async function collectListBlankLineState(page: Page): Promise<ListBlankLineState> {
  return page.evaluate((editorSelector) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const normalizeText = (text: string | null | undefined) =>
      (text ?? '').replace(/\u2800/g, '').trim();
    const selection = document.getSelection();
    const anchorNode = selection?.anchorNode ?? null;
    const anchorElement = anchorNode instanceof HTMLElement
      ? anchorNode
      : anchorNode?.parentElement ?? null;
    const anchorListItem = anchorElement?.closest('li') ?? null;
    const anchorParagraph = anchorElement?.closest('p') ?? null;
    const getPrimaryText = (item: HTMLElement) => {
      const paragraph = item.querySelector<HTMLElement>(':scope > p');
      return normalizeText(paragraph?.textContent);
    };

    return {
      anchorListItemText: anchorListItem ? normalizeText(anchorListItem.textContent) : null,
      anchorParagraphText: anchorParagraph ? normalizeText(anchorParagraph.textContent) : null,
      gapCount: editor?.querySelectorAll('li.editor-list-gap-placeholder-item').length ?? 0,
      listItemPrimaryTexts: Array.from(editor?.querySelectorAll<HTMLElement>('li') ?? [])
        .map((item) => getPrimaryText(item)),
      topLevelLists: Array.from(editor?.querySelectorAll<HTMLElement>(':scope > ul, :scope > ol') ?? [])
        .map((list) => ({
          items: Array.from(list.querySelectorAll<HTMLElement>(':scope > li')).map((item) => getPrimaryText(item)),
          tagName: list.tagName,
        })),
      selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
    };
  }, EDITOR_SELECTOR);
}

test.describe('notes list blank line caret', () => {
  test.setTimeout(90_000);

  test('keeps line-end clicks on the previous list item out of the blank gap', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-list-line-end-gap-click');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      for (const listCase of listBlankLineCases) {
        await openMarkdownFixture(page, {
          filename: `line-end-${listCase.filename}`,
          content: listCase.content,
        });

        await expect.poll(async () => collectListBlankLineState(page), {
          message: `Expected ${listCase.label} to expose one list gap before the line-end click`,
        }).toMatchObject({
          gapCount: 1,
        });

        const firstItemParagraph = page.locator(`${EDITOR_SELECTOR} li:not(.editor-list-gap-placeholder-item) > p`, {
          hasText: /^1$/,
        }).first();
        await expect(firstItemParagraph).toBeVisible({ timeout: 30_000 });
        const lineEndPoint = await firstItemParagraph.evaluate((paragraph) => {
          const paragraphRect = paragraph.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(paragraph);
          const textRect = range.getBoundingClientRect();
          range.detach();
          return {
            x: Math.min(paragraphRect.right - 1, Math.max(paragraphRect.left + 1, textRect.right - 1)),
            y: textRect.top + textRect.height / 2,
          };
        });

        await page.mouse.click(lineEndPoint.x, lineEndPoint.y);
        await page.keyboard.type('X');
        await waitForEditorAnimationFrame(page);

        await expect.poll(async () => collectListBlankLineState(page), {
          message: `Expected ${listCase.label} line-end typing to stay in the previous item`,
        }).toMatchObject({
          anchorParagraphText: '1X',
          gapCount: 1,
          listItemPrimaryTexts: listCase.expectedAfterLineEndType,
          selection: {
            empty: true,
          },
        });
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps the caret after the previous list item when Backspace deletes a blank line', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-list-blank-line-caret');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      for (const listCase of listBlankLineCases) {
        const opened = await openMarkdownFixture(page, {
          filename: listCase.filename,
          content: listCase.content,
        });

        await expect.poll(async () => collectListBlankLineState(page)).toMatchObject({
          gapCount: 1,
        });

        await setCursorAtFirstListGapStart(page);
        await page.keyboard.press('Backspace');
        await waitForEditorAnimationFrame(page);

        await expect.poll(async () => collectListBlankLineState(page)).toMatchObject({
          anchorParagraphText: '1',
          gapCount: 0,
          listItemPrimaryTexts: listCase.expectedAfterDelete,
          selection: {
            empty: true,
          },
          topLevelLists: listCase.expectedTopLevelListsAfterDelete,
        });
        await expect.poll(async () => {
          const markdown = await page.evaluate((pathToRead) =>
            (window as any).__vlainaE2E.readTextFile(pathToRead), opened.notePath);
          return markdown !== listCase.content &&
            !markdown.includes('\u2800') &&
            listCase.expectedAfterDelete.every((text) => markdown.includes(text));
        }).toBe(true);

        await page.keyboard.type('X');
        await waitForEditorAnimationFrame(page);

        await expect.poll(async () => collectListBlankLineState(page)).toMatchObject({
          gapCount: 0,
          listItemPrimaryTexts: listCase.expectedAfterType,
          topLevelLists: listCase.expectedTopLevelListsAfterType,
        });
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
