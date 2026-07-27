import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openAbsoluteNote,
  waitForEditorAnimationFrame,
} from './notesE2E';

const ROOT_BLANK_LINE_SELECTOR = [
  `${EDITOR_SELECTOR} > [data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]`,
  `${EDITOR_SELECTOR} > p.editor-editable-markdown-blank-line`,
  `${EDITOR_SELECTOR} > p:empty`,
].join(', ');

type InputCase = {
  filename: string;
  input: string;
  expectedKinds: string[];
};

type ExactBoundaryCase = {
  filename: string;
  content: string;
  expected?: string;
  visibleText?: [string, string];
};

const INPUT_CASES: InputCase[] = [
  { filename: 'ordered-list.md', input: '1. ', expectedKinds: ['heading', 'ordered_list', 'code_block'] },
  { filename: 'bullet-list.md', input: '- ', expectedKinds: ['heading', 'bullet_list', 'code_block'] },
  { filename: 'task-list.md', input: '- [ ] ', expectedKinds: ['heading', 'bullet_list', 'code_block'] },
  { filename: 'blockquote.md', input: '> ', expectedKinds: ['heading', 'blockquote', 'code_block'] },
  { filename: 'heading.md', input: '# ', expectedKinds: ['heading', 'heading', 'code_block'] },
  { filename: 'fenced-code.md', input: '``` ', expectedKinds: ['heading', 'code_block', 'code_block'] },
  { filename: 'table.md', input: '|2x2| ', expectedKinds: ['heading', 'table', 'code_block'] },
];

const EXACT_BOUNDARY_CASES: ExactBoundaryCase[] = [
  ...[
    { name: 'image', line: '![alt](image.png)', blankLineCounts: [0, 1, 2] },
    {
      name: 'video',
      line: '![video](https://example.com/video.mp4 "Demo")',
      blankLineCounts: [0, 1, 2],
    },
    {
      name: 'raw-html-comment',
      line: '<!-- User-authored raw HTML -->',
      blankLineCounts: [0, 1, 2],
    },
    {
      name: 'alignment-center',
      line: '<!--align:center-->',
      blankLineCounts: [0, 1, 2],
    },
    {
      name: 'alignment-left',
      line: '<!--align:left-->',
      blankLineCounts: [0, 1, 2],
    },
    {
      name: 'raw-html-div',
      line: '<div>Raw HTML</div>',
      blankLineCounts: [1, 2],
    },
    {
      name: 'wiki-link',
      line: 'See [[Project Alpha]] and [[Project Beta|the beta note]].',
      blankLineCounts: [0, 1, 2],
    },
  ].flatMap(({ name, line, blankLineCounts }) => blankLineCounts.map((blankLineCount) => {
    const blanks = Array.from({ length: blankLineCount }, () => '');
    return {
      filename: `${name}-${blankLineCount}-blank-lines.md`,
      content: [
        '# Before boundary',
        ...blanks,
        line,
        ...blanks,
        '## After boundary',
      ].join('\n'),
    };
  })),
  ...[0, 1, 2].map((blankLineCount) => ({
    filename: `alignment-leading-${blankLineCount}-blank-lines.md`,
    content: [
      '<!--align:center-->',
      ...Array.from({ length: blankLineCount }, () => ''),
      '# Leading alignment',
      'Tail',
    ].join('\n'),
    visibleText: ['Leading alignment', 'Tail'] as [string, string],
  })),
  ...[0, 1, 2].map((blankLineCount) => {
    const blanks = Array.from({ length: blankLineCount }, () => '');
    return {
      filename: `obsidian-image-embed-${blankLineCount}-blank-lines.md`,
      content: [
        '# Before boundary',
        ...blanks,
        '![[assets/image.png|Local image]]',
        ...blanks,
        '## After boundary',
      ].join('\n'),
      expected: [
        '# Before boundary',
        ...blanks,
        '![Local image](assets/image.png)',
        ...blanks,
        '## After boundary',
      ].join('\n'),
    };
  }),
];

function createBoundaryMarkdown(): string {
  return ['# 1', '', '```code', 'code', '```'].join('\n');
}

async function readRootBlockKinds(page: Page): Promise<string[]> {
  return page.locator(EDITOR_SELECTOR).evaluate((editor) =>
    Array.from(editor.children).map((element) => {
      if (/^H[1-6]$/.test(element.tagName)) return 'heading';
      if (element.tagName === 'OL') return 'ordered_list';
      if (element.tagName === 'UL') return 'bullet_list';
      if (element.tagName === 'BLOCKQUOTE') return 'blockquote';
      if (element.matches('.code-block-container')) return 'code_block';
      if (element.matches('.milkdown-table-block')) return 'table';
      return `${element.tagName.toLowerCase()}:${element.getAttribute('data-type') ?? ''}`;
    })
  );
}

async function clickRootBlankLine(page: Page): Promise<void> {
  const blankLine = page.locator(ROOT_BLANK_LINE_SELECTOR).first();
  await expect(blankLine).toBeVisible({ timeout: 30_000 });
  const box = await blankLine.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function expectNoGeneratedRootBlankLines(
  page: Page,
  expectedKinds: string[],
): Promise<void> {
  await expect.poll(() => readRootBlockKinds(page), { timeout: 10_000 }).toEqual(expectedKinds);
  await expect(page.locator(ROOT_BLANK_LINE_SELECTOR)).toHaveCount(0);
}

async function saveAndRead(page: Page, notePath: string): Promise<string> {
  await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
  return page.evaluate(
    (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
    notePath,
  );
}

async function forceNoContentChangeSerialization(page: Page): Promise<void> {
  const lastBlock = page.locator(`${EDITOR_SELECTOR} > *`).last();
  await expect(lastBlock).toBeVisible();
  await lastBlock.click();
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await page.keyboard.press('Backspace');
  await waitForEditorAnimationFrame(page);
}

function expectCleanTightMarkdown(markdown: string): void {
  expect(markdown).not.toContain('\n\n');
  expectNoInternalMarkdownArtifacts(markdown);
}

function expectNoInternalMarkdownArtifacts(markdown: string): void {
  expect(markdown).not.toContain('<!--vlaina-markdown-blank-line-->');
  expect(markdown).not.toContain('<!--vlaina-rendered-html-boundary-blank-line-->');
  expect(markdown).not.toContain('<!--vlaina-markdown-tight-heading-->');
  expect(markdown).not.toContain('\u200B');
  expect(markdown).not.toContain('\u200C');
}

test.describe('notes block insertion without generated content', () => {
  test.setTimeout(180_000);

  test('keeps typed block syntax tight through save, note switch, and reopen', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-no-extra-block-insertion');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'no-extra-block-insertion',
        files: [
          ...INPUT_CASES.map(({ filename }) => ({ filename, content: createBoundaryMarkdown() })),
          {
            filename: 'setext-heading.md',
            content: ['Setext heading', '', '```code', 'code', '```'].join('\n'),
          },
          { filename: 'switch-target.md', content: '# Switch target' },
        ],
      });
      const switchTargetPath = fixture.notePaths.at(-1)!;

      for (const [index, inputCase] of INPUT_CASES.entries()) {
        await test.step(inputCase.filename, async () => {
          const notePath = fixture.notePaths[index]!;
          await openAbsoluteNote(page, notePath);
          await clickRootBlankLine(page);
          await page.keyboard.type(inputCase.input);
          await waitForEditorAnimationFrame(page);
          await expectNoGeneratedRootBlankLines(page, inputCase.expectedKinds);

          const saved = await saveAndRead(page, notePath);
          expectCleanTightMarkdown(saved);

          await openAbsoluteNote(page, switchTargetPath);
          await openAbsoluteNote(page, notePath);
          await expectNoGeneratedRootBlankLines(page, inputCase.expectedKinds);
          expect(await saveAndRead(page, notePath)).toBe(saved);
        });
      }

      await test.step('setext heading', async () => {
        const notePath = fixture.notePaths[INPUT_CASES.length]!;
        const expectedKinds = ['heading', 'code_block'];
        await openAbsoluteNote(page, notePath);
        await clickRootBlankLine(page);
        await page.keyboard.type('---');
        await page.keyboard.press('Enter');
        await waitForEditorAnimationFrame(page);
        await expectNoGeneratedRootBlankLines(page, expectedKinds);

        const saved = await saveAndRead(page, notePath);
        expect(saved).toBe(['## Setext heading', '```code', 'code', '```'].join('\n'));
        expectCleanTightMarkdown(saved);

        await openAbsoluteNote(page, switchTargetPath);
        await openAbsoluteNote(page, notePath);
        await expectNoGeneratedRootBlankLines(page, expectedKinds);
        expect(await saveAndRead(page, notePath)).toBe(saved);
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('preserves exact block boundary blank lines through save and reopen', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-exact-block-boundaries');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'exact-block-boundaries',
        files: [
          ...EXACT_BOUNDARY_CASES.map(({ filename, content }) => ({ filename, content })),
          { filename: 'switch-target.md', content: '# Switch target' },
        ],
      });
      const switchTargetPath = fixture.notePaths.at(-1)!;

      for (const [index, boundaryCase] of EXACT_BOUNDARY_CASES.entries()) {
        await test.step(boundaryCase.filename, async () => {
          const notePath = fixture.notePaths[index]!;
          const expected = boundaryCase.expected ?? boundaryCase.content;
          const visibleText = boundaryCase.visibleText ?? ['Before boundary', 'After boundary'];
          await openAbsoluteNote(page, notePath);
          await expect(page.locator(EDITOR_SELECTOR)).toContainText(visibleText[0]);
          await expect(page.locator(EDITOR_SELECTOR)).toContainText(visibleText[1]);
          await forceNoContentChangeSerialization(page);

          const saved = await saveAndRead(page, notePath);
          expect(saved).toBe(expected);
          expectNoInternalMarkdownArtifacts(saved);

          await openAbsoluteNote(page, switchTargetPath);
          await openAbsoluteNote(page, notePath);
          await expect(page.locator(EDITOR_SELECTOR)).toContainText(visibleText[0]);
          await expect(page.locator(EDITOR_SELECTOR)).toContainText(visibleText[1]);
          expect(await saveAndRead(page, notePath)).toBe(expected);
        });
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
