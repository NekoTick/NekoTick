import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  SELECTED_BLOCK_SELECTOR,
  cleanupIsolatedElectron,
  clearSelectedNoteBlocks,
  collectEditorDomMetrics,
  collectEditorVisibilityProblems,
  getOpenBridgePages,
  getSelectableBlocks,
  installReferenceTyporaTheme,
  launchIsolatedElectron,
  measureRepeatedBlockScan,
  measureScrollFrames,
  openMarkdownFixture,
  scrollElementIntoViewByText,
  scrollNoteToTop,
  selectNoteBlocksByText,
  waitForStableSelectableBlockCount,
} from './notesE2E';
import { createMarkdownSyntaxFixture } from './notesMarkdownSyntaxFixture';

async function expectEditorContains(page: Page, texts: string[]) {
  for (const text of texts) {
    await expect(page.locator(EDITOR_SELECTOR)).toContainText(text);
  }
}

async function expectParagraphHasHardBreak(page: Page, text: string) {
  await expect.poll(async () => page.evaluate(({ editorSelector, text }) => {
    const paragraphs = Array.from(document.querySelectorAll<HTMLElement>(`${editorSelector} p`));
    return paragraphs.some((paragraph) => paragraph.textContent?.includes(text) && paragraph.querySelector('br'));
  }, { editorSelector: EDITOR_SELECTOR, text })).toBe(true);
}

async function pasteMarkdownAtEnd(page: Page, markdown: string) {
  const focused = await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd());
  expect(focused).toBe(true);
  await page.evaluate(async (clipboardText) => {
    await (window as any).__vlainaE2E.writeClipboardText(clipboardText);
  }, markdown);
  await page.keyboard.press('Control+V');
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

const FULL_MARKDOWN_SYNTAX_TEXT_SENTINELS = [
  'E2E Markdown Syntax',
  'Setext Heading Level One Sentinel',
  'Setext Heading Level Two Sentinel',
  'ATX Closed Heading Sentinel',
  'Heading Level Six Sentinel',
  'Inline marks paragraph',
  'Reference variants',
  'Nested inline sentinel',
  'bold italic sentinel',
  'inline code child',
  'Entity sentinel',
  'colored text sentinel',
  'background color sentinel',
  'html mark sentinel',
  'html sup sentinel',
  'html sub sentinel',
  'html underline sentinel',
  'rgb colored text sentinel',
  'named background color sentinel',
  'mixed css color sentinel',
  'mixed css background sentinel',
  'nested color emphasis sentinel',
  'nested background strong sentinel',
  'Escaped custom inline mark sentinels',
  'literal highlight',
  'literal underline',
  'a < b & c',
  'unsupported inline span sentinel < text',
  'API abbreviation sentinel',
  'Soft break line one sentinel',
  'hard break line two sentinel',
  'backslash hard break line two sentinel',
  'Escaped syntax sentinel',
  'Regular quote line one.',
  'Nested quote bullet sentinel',
  'quoteCodeSentinel',
  'Emoji callout sentinel',
  'Encoded icon callout body sentinel',
  'HTML comment icon callout body sentinel',
  'Bullet item alpha',
  'Third-level bullet sentinel',
  'Plus bullet item sentinel',
  'Star bullet item sentinel',
  'Mixed list parent sentinel',
  'Nested ordered child sentinel',
  'Third-level mixed bullet sentinel',
  'Ordered item beta',
  'Parenthesized ordered item alpha',
  'Parenthesized ordered item beta',
  'Ordered list separator paragraph sentinel',
  'Ordered item custom start sentinel',
  'Task item unchecked sentinel',
  'Task item checked sentinel',
  'Nested task item sentinel',
  'Task item uppercase checked sentinel',
  'Loose task detail sentinel',
  'Term sentinel',
  'Definition description sentinel',
  'Second definition description sentinel',
  'Combined definition description sentinel',
  'Escaped definition marker sentinel',
  'Table alpha',
  'code block sentinel',
  'plain code block sentinel',
  'indented code block sentinel',
  'languageAliasSentinel',
  'tildeFenceSentinel',
  'nestedFenceSentinel',
  'Advanced inline math sentinels',
  'Inline math sentinel',
  'Footnote reference sentinel',
  'Footnote definition sentinel',
  'Nested footnote first paragraph sentinel',
  'Nested footnote list item sentinel',
  'Centered paragraph sentinel',
  'Right aligned heading sentinel',
  'Raw HTML block sentinel',
  'Inline raw HTML sentinel',
  'han sentinel',
  'Details summary sentinel',
  'Details body sentinel',
  'raw pre html sentinel',
  'Final paragraph sentinel',
];

async function expectFullMarkdownSyntaxFixtureCoverage(page: Page) {
  const coverage = await page.evaluate(({ editorSelector, textSentinels }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const editorText = editor?.textContent ?? '';
    const hasText = (selector: string, text: string) =>
      Array.from(editor?.querySelectorAll<HTMLElement>(selector) ?? [])
        .some((element) => element.textContent?.includes(text));
    const count = (selector: string) => editor?.querySelectorAll(selector).length ?? 0;

    return {
      missingTexts: textSentinels.filter((text) => !editorText.includes(text)),
      frontmatter: count('.frontmatter-block-container, div[data-type="frontmatter"]'),
      headings: {
        title: hasText('h1', 'E2E Markdown Syntax'),
        setextH1: hasText('h1', 'Setext Heading Level One Sentinel'),
        setextH2: hasText('h2', 'Setext Heading Level Two Sentinel'),
        closedAtx: hasText('h2', 'ATX Closed Heading Sentinel'),
        h3: hasText('h3', 'Heading Level Three Sentinel'),
        h4: hasText('h4', 'Heading Level Four Sentinel'),
        h5: hasText('h5', 'Heading Level Five Sentinel'),
        h6: hasText('h6', 'Heading Level Six Sentinel'),
      },
      toc: count('div[data-type="toc"]'),
      quotes: {
        regular: hasText('blockquote', 'Regular quote line one'),
        nestedList: hasText('blockquote li', 'Nested quote bullet sentinel'),
        nestedCode: hasText('blockquote .code-block-container', 'quoteCodeSentinel'),
      },
      callouts: {
        count: count('div[data-type="callout"]'),
        emoji: hasText('div[data-type="callout"]', 'Emoji callout sentinel'),
        encoded: hasText('div[data-type="callout"]', 'Encoded icon callout body sentinel'),
        htmlComment: hasText('div[data-type="callout"]', 'HTML comment icon callout body sentinel'),
      },
      lists: {
        thirdLevelBullet: hasText('ul ul ul > li', 'Third-level bullet sentinel'),
        mixedOrdered: hasText('ul ol > li', 'Nested ordered child sentinel'),
        mixedThirdLevel: hasText('ul ol ul > li', 'Third-level mixed bullet sentinel'),
        plusBullet: hasText('ul > li', 'Plus bullet item sentinel'),
        starBullet: hasText('ul > li', 'Star bullet item sentinel'),
        parenthesizedOrdered: hasText('ol > li', 'Parenthesized ordered item alpha'),
        customStart: hasText('ol[start="7"] > li', 'Ordered item custom start sentinel'),
        uncheckedTask: hasText('li[data-item-type="task"][data-checked="false"]', 'Task item unchecked sentinel'),
        checkedTask: hasText('li[data-item-type="task"][data-checked="true"]', 'Task item checked sentinel'),
        nestedTask: hasText('li[data-item-type="task"][data-checked="false"]', 'Nested task item sentinel'),
        uppercaseTask: hasText('li[data-item-type="task"][data-checked="true"]', 'Task item uppercase checked sentinel'),
        looseTask: hasText('li[data-item-type="task"]', 'Loose task detail sentinel'),
      },
      definitionLists: {
        term: editorText.includes('Term sentinel'),
        description: editorText.includes('Definition description sentinel'),
        second: editorText.includes('Second definition description sentinel'),
        combined: editorText.includes('Combined definition description sentinel'),
        escapedMarkerVisible: hasText('p', ': Escaped definition marker sentinel'),
      },
      tables: {
        count: count('table'),
        escapedPipe: hasText('table', 'Escaped | pipe'),
        strong: hasText('table strong', 'Bold table sentinel'),
        code: hasText('table code', 'a | b'),
      },
      code: {
        ts: hasText('.code-block-container[data-language="ts"]', 'syntaxSentinel'),
        alias: hasText('.code-block-container', 'languageAliasSentinel'),
        tilde: hasText('.code-block-container', 'tildeFenceSentinel'),
        nested: hasText('.code-block-container', 'nestedFenceSentinel'),
        plain: hasText('.code-block-container', 'plain code block sentinel'),
        indented: hasText('.code-block-container', 'indented code block sentinel'),
      },
      math: {
        blocks: count('div[data-type="math-block"]'),
        inline: count('span[data-type="math-inline"]'),
      },
      mermaid: count('div[data-type="mermaid"]'),
      media: {
        imageAlt: count('.image-block-container[data-alt="Image alt sentinel"]'),
        htmlImage: count('.image-block-container[data-alt="HTML image alt sentinel"][data-width="40%"][data-align="right"]'),
        htmlSingleQuoteImage: count('.image-block-container[data-alt="HTML single quote image sentinel"][data-width="50%"][data-align="left"]'),
        secondMarkdownImage: count('.image-block-container[data-alt="Second markdown image sentinel"]'),
        escapedMarkdownImage: count('.image-block-container[data-alt="Markdown image escaped < sentinel"]'),
        videos: count('div[data-type="video"]'),
      },
      footnotes: {
        refs: count('sup.footnote-ref'),
        body: hasText('div.footnote-def[data-type="footnote_definition"]', 'Footnote definition sentinel'),
        nested: hasText('div.footnote-def[data-type="footnote_definition"]', 'Nested footnote list item sentinel'),
      },
      inline: {
        strong: hasText('strong', 'strong text'),
        strongUnderscore: hasText('strong', 'strong underscore text'),
        emphasis: hasText('em', 'emphasis text'),
        emphasisUnderscore: hasText('em', 'emphasis underscore text'),
        strike: hasText('s, del', 'strike text'),
        highlight: hasText('mark', 'highlighted text'),
        htmlMark: hasText('mark', 'html mark sentinel'),
        underline: hasText('u', 'underlined text'),
        htmlUnderline: hasText('u', 'html underline sentinel'),
        superscript: hasText('sup', 'superscript text'),
        htmlSuperscript: hasText('sup', 'html sup sentinel'),
        subscript: hasText('sub', 'subscript text'),
        htmlSubscript: hasText('sub', 'html sub sentinel'),
        inlineCode: hasText('code.v-std-code', 'inline code'),
        nestedStrongEm: hasText('strong em, em strong', 'bold italic sentinel'),
        codeInsideStrong: hasText('strong code', 'inline code child'),
        backtickCode: hasText('code', 'npm run `build`'),
        textColor: hasText('span[data-text-color="#2563eb"]', 'colored text sentinel'),
        bgColor: hasText('mark[data-bg-color="#fde047"]', 'background color sentinel'),
        rgbTextColor: hasText('span[data-text-color="rgb(37, 99, 235)"]', 'rgb colored text sentinel'),
        namedBgColor: hasText('mark[data-bg-color="yellow"]', 'named background color sentinel'),
        mixedTextColor: hasText('span[data-text-color="#123456"]', 'mixed css color sentinel'),
        mixedBgColor: hasText('mark[data-bg-color="#ecf6ff"]', 'mixed css background sentinel'),
        escapedHighlightText: hasText('p', '==literal highlight=='),
        escapedUnderlineText: hasText('p', '++literal underline++'),
        htmlAbbr: hasText('abbr[title="HyperText Markup Language"]', 'HTML'),
        apiAbbr: hasText('abbr[title="Application Programming Interface"]', 'API'),
        escapedAbbrDefinition: hasText('p', '*[ESCAPED]: Escaped abbreviation definition sentinel'),
        tag: hasText('[data-editor-tag-token="true"]', '#syntax-tag'),
      },
      links: {
        explicit: hasText('a[href="https://example.com/docs"]', 'explicit link'),
        reference: hasText('a[href="https://example.com/reference"]', 'reference docs link'),
        internal: hasText('a[href="./linked-note.md#target-heading"]', 'internal note link'),
        parenthesized: hasText('a[href="https://example.com/docs/a_(b)"]', 'parenthesized guide'),
        angleLocal: hasText('a[href="docs/file name.md"]', 'angle local file'),
        query: hasText('a[href="docs/file (draft).md?x=1&y=2"]', 'query link'),
        angleAutolink: hasText('a.autolink[href="https://example.com/autolink-angle"]', 'https://example.com/autolink-angle'),
        wwwAutolink: count('a.autolink[href="https://www.example.org"]'),
        mailAutolink: count('a.autolink[href="mailto:syntax@example.com"]'),
      },
      alignmentAndHtml: {
        centerParagraph: hasText('p[data-text-align="center"]', 'Centered paragraph sentinel'),
        rightHeading: hasText('h3[data-text-align="right"]', 'Right aligned heading sentinel'),
        rawHtmlBlock: hasText('.md-htmlblock, .md-htmlblock-container', 'Raw HTML block sentinel'),
        kbd: hasText('kbd', 'Ctrl'),
        ruby: hasText('ruby rt', 'han sentinel'),
        details: hasText('details', 'Details body sentinel'),
        pre: hasText('pre', 'raw pre html sentinel'),
        iframe: count('iframe[src="https://example.com/embed"]'),
        video: count('video[src="xxx.mp4"]'),
        audio: count('audio[src="xxx.mp3"]'),
      },
      horizontalRules: count('[data-type="hr"]'),
      sourceFallback: document.querySelectorAll('[data-note-source-fallback="true"]').length,
    };
  }, { editorSelector: EDITOR_SELECTOR, textSentinels: FULL_MARKDOWN_SYNTAX_TEXT_SENTINELS });

  expect(coverage.missingTexts).toEqual([]);
  expect(coverage.sourceFallback).toBe(0);
  expect(coverage.frontmatter).toBeGreaterThanOrEqual(1);
  expect(coverage.headings).toEqual({
    title: true,
    setextH1: true,
    setextH2: true,
    closedAtx: true,
    h3: true,
    h4: true,
    h5: true,
    h6: true,
  });
  expect(coverage.toc).toBe(2);
  expect(coverage.quotes).toEqual({ regular: true, nestedList: true, nestedCode: true });
  expect(coverage.callouts).toEqual({ count: 3, emoji: true, encoded: true, htmlComment: true });
  expect(coverage.lists).toEqual({
    thirdLevelBullet: true,
    mixedOrdered: true,
    mixedThirdLevel: true,
    plusBullet: true,
    starBullet: true,
    parenthesizedOrdered: true,
    customStart: true,
    uncheckedTask: true,
    checkedTask: true,
    nestedTask: true,
    uppercaseTask: true,
    looseTask: true,
  });
  expect(coverage.definitionLists).toEqual({
    term: true,
    description: true,
    second: true,
    combined: true,
    escapedMarkerVisible: true,
  });
  expect(coverage.tables).toEqual({ count: 1, escapedPipe: true, strong: true, code: true });
  expect(coverage.code).toEqual({
    ts: true,
    alias: true,
    tilde: true,
    nested: true,
    plain: true,
    indented: true,
  });
  expect(coverage.math).toEqual({ blocks: 4, inline: 3 });
  expect(coverage.mermaid).toBe(7);
  expect(coverage.media).toEqual({
    imageAlt: 1,
    htmlImage: 1,
    htmlSingleQuoteImage: 1,
    secondMarkdownImage: 1,
    escapedMarkdownImage: 1,
    videos: 4,
  });
  expect(coverage.footnotes).toEqual({ refs: 2, body: true, nested: true });
  expect(coverage.inline).toEqual({
    strong: true,
    strongUnderscore: true,
    emphasis: true,
    emphasisUnderscore: true,
    strike: true,
    highlight: true,
    htmlMark: true,
    underline: true,
    htmlUnderline: true,
    superscript: true,
    htmlSuperscript: true,
    subscript: true,
    htmlSubscript: true,
    inlineCode: true,
    nestedStrongEm: true,
    codeInsideStrong: true,
    backtickCode: true,
    textColor: true,
    bgColor: true,
    rgbTextColor: true,
    namedBgColor: true,
    mixedTextColor: true,
    mixedBgColor: true,
    escapedHighlightText: true,
    escapedUnderlineText: true,
    htmlAbbr: true,
    apiAbbr: true,
    escapedAbbrDefinition: true,
    tag: true,
  });
  expect(coverage.links).toEqual({
    explicit: true,
    reference: true,
    internal: true,
    parenthesized: true,
    angleLocal: true,
    query: true,
    angleAutolink: true,
    wwwAutolink: 1,
    mailAutolink: 1,
  });
  expect(coverage.alignmentAndHtml).toEqual({
    centerParagraph: true,
    rightHeading: true,
    rawHtmlBlock: true,
    kbd: true,
    ruby: true,
    details: true,
    pre: true,
    iframe: 1,
    video: 1,
    audio: 1,
  });
  expect(coverage.horizontalRules).toBe(3);
}

test.describe('notes markdown syntax rendering', () => {
  test.setTimeout(120_000);

  test('creates supported custom syntax from real keyboard input', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-markdown-typed-syntax');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      const openEmptyFixture = async (filename: string) => {
        const previousEditor = await page.locator(EDITOR_SELECTOR).elementHandle();
        await openMarkdownFixture(page, { filename, content: '' });
        if (previousEditor) {
          await expect.poll(() => page.evaluate(
            (previous) => document.querySelector('.milkdown .ProseMirror') !== previous,
            previousEditor,
          ), { timeout: 30_000 }).toBe(true);
        }
        await expect.poll(() => page.evaluate(
          () => (window as any).__vlainaE2E.focusCurrentEditor()
        ), { timeout: 30_000 }).toBe(true);
      };

      await openEmptyFixture('typed-frontmatter.md');
      await page.keyboard.type('---');
      await page.keyboard.press('Enter');
      await expect(page.locator(`${EDITOR_SELECTOR} .frontmatter-block-container`)).toHaveCount(1);

      await openEmptyFixture('typed-toc.md');
      await page.keyboard.type('[TOC]');
      await page.keyboard.press('Enter');
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="toc"]`)).toHaveCount(1);

      await openEmptyFixture('typed-math-block.md');
      await page.keyboard.type('$$');
      await page.keyboard.press('Enter');
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="math-block"]`)).toHaveCount(1);

      await openEmptyFixture('typed-mermaid.md');
      await page.keyboard.type('```mermaid');
      await page.keyboard.press('Enter');
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="mermaid"]`)).toHaveCount(1);

      await openEmptyFixture('typed-callout.md');
      await page.keyboard.type('> ');
      await page.keyboard.type('💡 Typed callout sentinel');
      await page.keyboard.press('Enter');
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="callout"]`, {
        hasText: 'Typed callout sentinel',
      })).toHaveCount(1);

      await openEmptyFixture('typed-video.md');
      await page.keyboard.type('![video](https://example.com/typed-video.mp4)');
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="video"]`)).toHaveCount(1);

      await openEmptyFixture('typed-images.md');
      await page.keyboard.type('![Typed image](https://example.com/typed-image.png)');
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container[data-alt="Typed image"]`)).toHaveCount(1);
      await page.keyboard.type(' and ![[attachments/typed.png|Typed Obsidian image]]');
      await expect(page.locator(
        `${EDITOR_SELECTOR} .image-block-container[data-alt="Typed Obsidian image"]`,
      )).toHaveCount(1);

      await openEmptyFixture('typed-footnotes.md');
      await page.keyboard.type('Reference [^typed-ref]');
      await page.keyboard.press('Enter');
      await page.keyboard.type('[^typed-ref]: Typed footnote body');
      await page.keyboard.press('Enter');
      await expect(page.locator(`${EDITOR_SELECTOR} sup.footnote-ref`)).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} div.footnote-def`, {
        hasText: 'Typed footnote body',
      })).toHaveCount(1);

      await openEmptyFixture('typed-inline-syntax.md');
      await page.keyboard.type([
        '**Typed strong**',
        '*Typed emphasis*',
        '~~Typed strike~~',
        '`typed-code`',
        '==Typed highlight==',
        '++Typed underline++',
        'X^typed-sup^',
        'H~typed-sub~O',
        '$typed_math$',
        '[Typed link](https://example.com/typed-link)',
        'https://www.example.com ',
        '#typed/tag',
      ].join(' '));
      await expect(page.locator(`${EDITOR_SELECTOR} strong`, { hasText: 'Typed strong' })).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} em`, { hasText: 'Typed emphasis' })).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} s, ${EDITOR_SELECTOR} del`, {
        hasText: 'Typed strike',
      })).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} code`, { hasText: 'typed-code' })).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} mark`, { hasText: 'Typed highlight' })).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} u`, { hasText: 'Typed underline' })).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} sup`, { hasText: 'typed-sup' })).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} sub`, { hasText: 'typed-sub' })).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} span[data-type="math-inline"]`)).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} a[href="https://example.com/typed-link"]`, {
        hasText: 'Typed link',
      })).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} a.autolink[href="https://www.example.com"]`)).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} [data-editor-tag-token="true"]`, {
        hasText: '#typed/tag',
      })).toHaveCount(1);

      const metrics = await collectEditorDomMetrics(page);
      expect(metrics.countsBySelector.sourceFallback).toBe(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('renders supported markdown syntax as Milkdown blocks and keeps block selection usable', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-markdown-syntax');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      page.on('console', (message) => {
        const text = message.text();
        if (text.includes('[notes-milkdown-timing:')) {
          console.info(text);
        }
      });

      const openMetrics = await openMarkdownFixture(page, {
        filename: 'markdown-syntax-e2e.md',
        content: createMarkdownSyntaxFixture(),
      });
      console.info('[notes-markdown-syntax-open]', openMetrics);

      await expectEditorContains(page, [
        'E2E Markdown Syntax',
        'Setext Heading Level One Sentinel',
        'Setext Heading Level Two Sentinel',
        'ATX Closed Heading Sentinel',
        'Heading Level Six Sentinel',
        'Inline marks paragraph',
        'Reference variants',
        'Nested inline sentinel',
        'bold italic sentinel',
        'inline code child',
        'Entity sentinel',
        'colored text sentinel',
        'background color sentinel',
        'html mark sentinel',
        'html sup sentinel',
        'html sub sentinel',
        'html underline sentinel',
        'rgb colored text sentinel',
        'named background color sentinel',
        'mixed css color sentinel',
        'mixed css background sentinel',
        'nested color emphasis sentinel',
        'nested background strong sentinel',
        'Escaped custom inline mark sentinels',
        'literal highlight',
        'literal underline',
        'a < b & c',
        'unsupported inline span sentinel < text',
        'API abbreviation sentinel',
        'Soft break line one sentinel',
        'hard break line two sentinel',
        'backslash hard break line two sentinel',
        'Escaped syntax sentinel',
        'Regular quote line one.',
        'Nested quote bullet sentinel',
        'quoteCodeSentinel',
        'Emoji callout sentinel',
        'Encoded icon callout body sentinel',
        'HTML comment icon callout body sentinel',
        'Bullet item alpha',
        'Third-level bullet sentinel',
        'Plus bullet item sentinel',
        'Star bullet item sentinel',
        'Mixed list parent sentinel',
        'Nested ordered child sentinel',
        'Third-level mixed bullet sentinel',
        'Ordered item beta',
        'Parenthesized ordered item alpha',
        'Parenthesized ordered item beta',
        'Ordered list separator paragraph sentinel',
        'Ordered item custom start sentinel',
        'Task item unchecked sentinel',
        'Task item checked sentinel',
        'Nested task item sentinel',
        'Task item uppercase checked sentinel',
        'Loose task detail sentinel',
        'Term sentinel',
        'Definition description sentinel',
        'Second definition description sentinel',
        'Combined definition description sentinel',
        'Escaped definition marker sentinel',
        'Table alpha',
        'code block sentinel',
        'plain code block sentinel',
        'indented code block sentinel',
        'languageAliasSentinel',
        'tildeFenceSentinel',
        'nestedFenceSentinel',
        'Advanced inline math sentinels',
        'Inline math sentinel',
        'Footnote reference sentinel',
        'Footnote definition sentinel',
        'Nested footnote first paragraph sentinel',
        'Nested footnote list item sentinel',
        'Centered paragraph sentinel',
        'Right aligned heading sentinel',
        'Raw HTML block sentinel',
        'Inline raw HTML sentinel',
        'han sentinel',
        'Details summary sentinel',
        'Details body sentinel',
        'raw pre html sentinel',
        'Final paragraph sentinel',
      ]);

      await expect(page.locator(`${EDITOR_SELECTOR} .frontmatter-block-container`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h1`, { hasText: 'E2E Markdown Syntax' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h1`, { hasText: 'Setext Heading Level One Sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h2`, { hasText: 'Setext Heading Level Two Sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h2`, { hasText: 'ATX Closed Heading Sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h2`, { hasText: 'Inline Marks And Links' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h3`, { hasText: 'Heading Level Three Sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h4`, { hasText: 'Heading Level Four Sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h5`, { hasText: 'Heading Level Five Sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h6`, { hasText: 'Heading Level Six Sentinel' })).toBeVisible();
      const tocBlocks = page.locator(`${EDITOR_SELECTOR} div[data-type="toc"]`);
      await expect(tocBlocks).toHaveCount(2);
      await expect(tocBlocks.first()).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} blockquote`, { hasText: 'Regular quote line one' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} blockquote li`, { hasText: 'Nested quote bullet sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} blockquote .code-block-container`, { hasText: 'quoteCodeSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="callout"]`, { hasText: 'Emoji callout sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="callout"]`, { hasText: 'Encoded icon callout body sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="callout"]`, { hasText: 'HTML comment icon callout body sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li[data-item-type="task"][data-checked="false"]`, { hasText: 'Task item unchecked sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li[data-item-type="task"][data-checked="true"]`, { hasText: 'Task item checked sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li[data-item-type="task"][data-checked="false"]`, { hasText: 'Nested task item sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li[data-item-type="task"][data-checked="true"]`, { hasText: 'Task item uppercase checked sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li[data-item-type="task"]`, { hasText: 'Loose task detail sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} ul ul ul > li`, { hasText: 'Third-level bullet sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} ul ol > li`, { hasText: 'Nested ordered child sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} ul ol ul > li`, { hasText: 'Third-level mixed bullet sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} ul > li`, { hasText: 'Plus bullet item sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} ul > li`, { hasText: 'Star bullet item sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} ol > li`, { hasText: 'Parenthesized ordered item alpha' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} ol[start="7"] > li`, { hasText: 'Ordered item custom start sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR}`, { hasText: 'Term sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR}`, { hasText: 'Definition description sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR}`, { hasText: 'Combined definition description sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} table`, { hasText: 'Table alpha' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} table`, { hasText: 'Escaped | pipe' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} table strong`, { hasText: 'Bold table sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} table code`, { hasText: 'a | b' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} th`).first()).toHaveText('Feature');
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'syntaxSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container[data-language="ts"]`, { hasText: 'syntaxSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'languageAliasSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'tildeFenceSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'nestedFenceSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'plain code block sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'indented code block sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="math-block"]`)).toHaveCount(4);
      await expect(page.locator(`${EDITOR_SELECTOR} span[data-type="math-inline"]`)).toHaveCount(3);
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="mermaid"]`).first()).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="mermaid"]`)).toHaveCount(7);
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container, ${EDITOR_SELECTOR} img.md-image`).first()).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container[data-alt="Image alt sentinel"]`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container[data-alt="HTML image alt sentinel"][data-width="40%"][data-align="right"]`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container[data-alt="HTML single quote image sentinel"][data-width="50%"][data-align="left"]`)).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container[data-alt="Second markdown image sentinel"]`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container[data-alt="Markdown image escaped < sentinel"]`)).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="video"]`)).toHaveCount(4);
      await expect(page.locator(`${EDITOR_SELECTOR} sup.footnote-ref`)).toHaveCount(2);
      await expect(page.locator(`${EDITOR_SELECTOR} div.footnote-def[data-type="footnote_definition"]`, { hasText: 'Footnote definition sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div.footnote-def[data-type="footnote_definition"]`, { hasText: 'Nested footnote list item sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} strong`, { hasText: 'strong text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} strong`, { hasText: 'strong underscore text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} em`, { hasText: 'emphasis text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} em`, { hasText: 'emphasis underscore text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} s, ${EDITOR_SELECTOR} del`, { hasText: 'strike text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} mark`, { hasText: 'highlighted text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} mark`, { hasText: 'html mark sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} u`, { hasText: 'underlined text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} u`, { hasText: 'html underline sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} sup`, { hasText: 'superscript text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} sup`, { hasText: 'html sup sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} sub`, { hasText: 'subscript text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} sub`, { hasText: 'html sub sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} code.v-std-code`).getByText('inline code', { exact: true })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} strong em, ${EDITOR_SELECTOR} em strong`, { hasText: 'bold italic sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} strong code`, { hasText: 'inline code child' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} code`, { hasText: 'npm run `build`' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} span[data-text-color="#2563eb"]`, { hasText: 'colored text sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} mark[data-bg-color="#fde047"]`, { hasText: 'background color sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} span[data-text-color="rgb(37, 99, 235)"]`, { hasText: 'rgb colored text sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} mark[data-bg-color="yellow"]`, { hasText: 'named background color sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} span[data-text-color="#123456"]`, { hasText: 'mixed css color sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} mark[data-bg-color="#ecf6ff"]`, { hasText: 'mixed css background sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} em`, { hasText: 'nested color emphasis sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} strong`, { hasText: 'nested background strong sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Escaped custom inline mark sentinels' })).toContainText('==literal highlight==');
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Escaped custom inline mark sentinels' })).toContainText('++literal underline++');
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'unsupported inline span sentinel < text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} abbr[title="HyperText Markup Language"]`, { hasText: 'HTML' }).first()).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} abbr[title="Application Programming Interface"]`, { hasText: 'API' }).first()).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: '*[ESCAPED]: Escaped abbreviation definition sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-editor-tag-token="true"]`, { hasText: '#syntax-tag' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} a[href="https://example.com/docs"]`, { hasText: 'explicit link' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} a[href="https://example.com/reference"]`, { hasText: 'reference docs link' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} a[href="./linked-note.md#target-heading"]`, { hasText: 'internal note link' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} a[href="https://example.com/docs/a_(b)"]`, { hasText: 'parenthesized guide' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} a[href="docs/file name.md"]`, { hasText: 'angle local file' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} a[href="docs/file (draft).md?x=1&y=2"]`, { hasText: 'query link' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} a.autolink[href="https://example.com/autolink-angle"]`, { hasText: 'https://example.com/autolink-angle' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} a.autolink[href="https://www.example.org"]`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} a.autolink[href="mailto:syntax@example.com"]`)).toBeVisible();
      await expectParagraphHasHardBreak(page, 'Hard break line one sentinel');
      await expectParagraphHasHardBreak(page, 'Backslash hard break line one sentinel');
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'HTML break line one sentinel' })).toContainText('HTML break line two sentinel');
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Escaped syntax sentinel' })).toContainText('# not a heading');
      await expect(page.locator(`${EDITOR_SELECTOR} p[data-text-align="center"]`, { hasText: 'Centered paragraph sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h3[data-text-align="right"]`, { hasText: 'Right aligned heading sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .md-htmlblock, ${EDITOR_SELECTOR} .md-htmlblock-container`, { hasText: 'Raw HTML block sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} kbd`, { hasText: 'Ctrl' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} ruby rt`, { hasText: 'han sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} details`, { hasText: 'Details body sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} pre`, { hasText: 'raw pre html sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} iframe[src="https://example.com/embed"]`)).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} video[src="xxx.mp4"]`)).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} audio[src="xxx.mp3"]`)).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="hr"]`)).toHaveCount(3);

      await expect(page.locator(`${EDITOR_SELECTOR} table th`, { hasText: 'Status' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} table td`, { hasText: 'Covered' })).toBeVisible();

      const metrics = await collectEditorDomMetrics(page);
      console.info('[notes-markdown-syntax-dom]', metrics);
      expect(metrics.countsBySelector.sourceFallback).toBe(0);
      expect(metrics.countsBySelector.headings).toBeGreaterThanOrEqual(14);
      expect(metrics.countsBySelector.blockquotes).toBeGreaterThanOrEqual(1);
      expect(metrics.countsBySelector.callouts).toBeGreaterThanOrEqual(3);
      expect(metrics.countsBySelector.bulletItems).toBeGreaterThanOrEqual(9);
      expect(metrics.countsBySelector.orderedItems).toBeGreaterThanOrEqual(7);
      expect(metrics.countsBySelector.taskItems).toBeGreaterThanOrEqual(4);
      expect(metrics.countsBySelector.tables).toBeGreaterThanOrEqual(1);
      expect(metrics.countsBySelector.codeBlocks).toBeGreaterThanOrEqual(6);
      expect(metrics.countsBySelector.frontmatter).toBeGreaterThanOrEqual(1);
      expect(metrics.countsBySelector.mathBlocks).toBeGreaterThanOrEqual(4);
      expect(metrics.countsBySelector.mathInline).toBeGreaterThanOrEqual(3);
      expect(metrics.countsBySelector.mermaid).toBeGreaterThanOrEqual(7);
      expect(metrics.countsBySelector.video).toBeGreaterThanOrEqual(4);
      expect(metrics.countsBySelector.toc).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.footnoteRefs).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.footnoteDefs).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.images).toBeGreaterThanOrEqual(5);
      expect(metrics.countsBySelector.highlights).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.superscript).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.subscript).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.abbr).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.tags).toBeGreaterThanOrEqual(1);
      expect(metrics.countsBySelector.autolinks).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.explicitLinks).toBeGreaterThanOrEqual(4);
      expect(metrics.countsBySelector.horizontalRules).toBeGreaterThanOrEqual(3);
      expect(metrics.selectableBlockCount).toBeGreaterThan(50);

      const selectableBlocks = await getSelectableBlocks(page);
      expect(selectableBlocks).toEqual(expect.arrayContaining([
        expect.objectContaining({ tagName: 'H1', text: expect.stringContaining('E2E Markdown Syntax') }),
        expect.objectContaining({ text: expect.stringContaining('Inline marks paragraph') }),
        expect.objectContaining({ tagName: 'LI', text: expect.stringContaining('Task item checked sentinel') }),
        expect.objectContaining({ text: expect.stringContaining('Final paragraph sentinel') }),
      ]));

      const selectedCount = await selectNoteBlocksByText(page, [
        'Inline marks paragraph',
        'Task item checked sentinel',
        'Right aligned heading sentinel',
        'Final paragraph sentinel',
      ]);
      expect(selectedCount).toBeGreaterThanOrEqual(4);
      await expect(page.locator(SELECTED_BLOCK_SELECTOR).first()).toBeVisible();

      const hoveredSelected = page.locator(SELECTED_BLOCK_SELECTOR, { hasText: 'Inline marks paragraph' }).first();
      await scrollNoteToTop(page);
      await scrollElementIntoViewByText(page, SELECTED_BLOCK_SELECTOR, 'Inline marks paragraph');
      await hoveredSelected.scrollIntoViewIfNeeded();

      await expect.poll(async () => {
        const selectedRect = await hoveredSelected.boundingBox();
        if (!selectedRect) return false;
        await page.mouse.move(Math.max(8, selectedRect.x - 18), selectedRect.y + selectedRect.height / 2);
        await page.waitForTimeout(50);
        const geometry = await page.evaluate(() => {
          const controls = document.querySelector<HTMLElement>('.editor-block-controls.visible');
          const selected = Array.from(
            document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror .editor-block-selected')
          ).find((element) => element.textContent?.includes('Inline marks paragraph'));
          if (!controls || !selected) return null;
          const controlsRect = controls.getBoundingClientRect();
          const selectedRect = selected.getBoundingClientRect();
          return {
            controlsCenterY: controlsRect.top + controlsRect.height / 2,
            selectedCenterY: selectedRect.top + selectedRect.height / 2,
            controlsLeft: controlsRect.left,
            selectedLeft: selectedRect.left,
          };
        });
        return (
          geometry !== null &&
          Math.abs(geometry.controlsCenterY - geometry.selectedCenterY) <= 2 &&
          geometry.controlsLeft < geometry.selectedLeft
        );
      }, { timeout: 5000 }).toBe(true);

      await clearSelectedNoteBlocks(page);
      await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('pastes the full supported markdown syntax fixture through the clipboard', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-markdown-syntax-paste');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      page.on('console', (message) => {
        const text = message.text();
        if (text.includes('[notes-milkdown-timing:')) {
          console.info(text);
        }
      });

      await openMarkdownFixture(page, {
        filename: 'markdown-syntax-paste-e2e.md',
        content: '',
      });

      const pastedAt = Date.now();
      await pasteMarkdownAtEnd(page, createMarkdownSyntaxFixture());
      await expectEditorContains(page, [
        'E2E Markdown Syntax',
        'Setext Heading Level One Sentinel',
        'Setext Heading Level Two Sentinel',
        'Inline marks paragraph',
        'Regular quote line one.',
        'Emoji callout sentinel',
        'Bullet item alpha',
        'Task item checked sentinel',
        'Definition description sentinel',
        'Table alpha',
        'syntaxSentinel',
        'tildeFenceSentinel',
        'Advanced inline math sentinels',
        'Footnote definition sentinel',
        'Centered paragraph sentinel',
        'Raw HTML block sentinel',
        'Details body sentinel',
        'Final paragraph sentinel',
      ]);

      await expect(page.locator(`${EDITOR_SELECTOR} .frontmatter-block-container`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h1`, { hasText: 'E2E Markdown Syntax' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h1`, { hasText: 'Setext Heading Level One Sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} h2`, { hasText: 'Setext Heading Level Two Sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="toc"]`)).toHaveCount(2);
      await expect(page.locator(`${EDITOR_SELECTOR} blockquote`, { hasText: 'Regular quote line one' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="callout"]`, { hasText: 'Emoji callout sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li[data-item-type="task"][data-checked="true"]`, { hasText: 'Task item checked sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} ul ul ul > li`, { hasText: 'Third-level bullet sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} ol[start="7"] > li`, { hasText: 'Ordered item custom start sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} table`, { hasText: 'Table alpha' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container[data-language="ts"]`, { hasText: 'syntaxSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'nestedFenceSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="math-block"]`)).toHaveCount(4);
      await expect(page.locator(`${EDITOR_SELECTOR} span[data-type="math-inline"]`)).toHaveCount(3);
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="mermaid"]`)).toHaveCount(7);
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container[data-alt="Image alt sentinel"]`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="video"]`)).toHaveCount(4);
      await expect(page.locator(`${EDITOR_SELECTOR} sup.footnote-ref`)).toHaveCount(2);
      await expect(page.locator(`${EDITOR_SELECTOR} div.footnote-def`, { hasText: 'Footnote definition sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} mark`, { hasText: 'highlighted text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} u`, { hasText: 'underlined text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} sup`, { hasText: 'superscript text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} sub`, { hasText: 'subscript text' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} abbr[title="Application Programming Interface"]`, { hasText: 'API' }).first()).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-editor-tag-token="true"]`, { hasText: '#syntax-tag' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} a[href="https://example.com/docs"]`, { hasText: 'explicit link' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} a.autolink[href="mailto:syntax@example.com"]`)).toBeVisible();
      await expectParagraphHasHardBreak(page, 'Hard break line one sentinel');
      await expect(page.locator(`${EDITOR_SELECTOR} p[data-text-align="center"]`, { hasText: 'Centered paragraph sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .md-htmlblock, ${EDITOR_SELECTOR} .md-htmlblock-container`, { hasText: 'Raw HTML block sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} details`, { hasText: 'Details body sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="hr"]`)).toHaveCount(3);
      await expectFullMarkdownSyntaxFixtureCoverage(page);

      const stableSelectableBlockCount = await waitForStableSelectableBlockCount(page);
      const metrics = await collectEditorDomMetrics(page);
      const blockScanMetrics = await measureRepeatedBlockScan(page, 10);
      console.info('[notes-markdown-syntax-paste]', {
        pasteMs: Date.now() - pastedAt,
        stableSelectableBlockCount,
        metrics,
        blockScanMetrics,
      });

      expect(metrics.countsBySelector.sourceFallback).toBe(0);
      expect(metrics.countsBySelector.headings).toBeGreaterThanOrEqual(14);
      expect(metrics.countsBySelector.blockquotes).toBeGreaterThanOrEqual(1);
      expect(metrics.countsBySelector.callouts).toBeGreaterThanOrEqual(3);
      expect(metrics.countsBySelector.bulletItems).toBeGreaterThanOrEqual(9);
      expect(metrics.countsBySelector.orderedItems).toBeGreaterThanOrEqual(7);
      expect(metrics.countsBySelector.taskItems).toBeGreaterThanOrEqual(4);
      expect(metrics.countsBySelector.tables).toBeGreaterThanOrEqual(1);
      expect(metrics.countsBySelector.codeBlocks).toBeGreaterThanOrEqual(6);
      expect(metrics.countsBySelector.frontmatter).toBeGreaterThanOrEqual(1);
      expect(metrics.countsBySelector.mathBlocks).toBeGreaterThanOrEqual(4);
      expect(metrics.countsBySelector.mathInline).toBeGreaterThanOrEqual(3);
      expect(metrics.countsBySelector.mermaid).toBeGreaterThanOrEqual(7);
      expect(metrics.countsBySelector.images).toBeGreaterThanOrEqual(5);
      expect(metrics.countsBySelector.video).toBeGreaterThanOrEqual(4);
      expect(metrics.countsBySelector.footnoteRefs).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.footnoteDefs).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.highlights).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.superscript).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.subscript).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.abbr).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.tags).toBeGreaterThanOrEqual(1);
      expect(metrics.countsBySelector.autolinks).toBeGreaterThanOrEqual(2);
      expect(metrics.countsBySelector.explicitLinks).toBeGreaterThanOrEqual(4);
      expect(metrics.countsBySelector.horizontalRules).toBeGreaterThanOrEqual(3);
      expect(metrics.selectableBlockCount).toBeGreaterThan(50);
      expect(metrics.selectableBlockCount).toBe(stableSelectableBlockCount);
      expect(blockScanMetrics.blockCount).toBe(stableSelectableBlockCount);
      expect(blockScanMetrics.p95Ms).toBeLessThan(250);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps markdown syntax visible and editor operations usable under an imported Typora theme', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-markdown-syntax-typora-theme');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      page.on('console', (message) => {
        const text = message.text();
        if (text.includes('[notes-milkdown-timing:')) {
          console.info(text);
        }
      });

      const installedTheme = await installReferenceTyporaTheme(page, 'phycat-sky.css');
      console.info('[notes-markdown-syntax-typora-theme]', installedTheme);

      const openMetrics = await openMarkdownFixture(page, {
        filename: 'markdown-syntax-typora-theme-e2e.md',
        content: createMarkdownSyntaxFixture(),
      });
      console.info('[notes-markdown-syntax-typora-open]', openMetrics);

      await expectEditorContains(page, [
        'E2E Markdown Syntax',
        'Inline marks paragraph',
        'Regular quote line one.',
        'Task item checked sentinel',
        'Definition description sentinel',
        'Table alpha',
        'syntaxSentinel',
        'Inline math sentinel',
        'Footnote definition sentinel',
        'Raw HTML block sentinel',
        'Final paragraph sentinel',
      ]);

      await expect(page.locator(`${EDITOR_SELECTOR} h1`, { hasText: 'E2E Markdown Syntax' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Inline marks paragraph' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} blockquote`, { hasText: 'Regular quote line one' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li[data-item-type="task"][data-checked="true"]`, { hasText: 'Task item checked sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} table`, { hasText: 'Table alpha' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'syntaxSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} span[data-type="math-inline"]`)).toHaveCount(3);
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container[data-alt="Image alt sentinel"]`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} div.footnote-def`, { hasText: 'Footnote definition sentinel' })).toBeVisible();

      const visibilityProblems = await collectEditorVisibilityProblems(page);
      const stableSelectableBlockCount = await waitForStableSelectableBlockCount(page);
      const metrics = await collectEditorDomMetrics(page);
      const blockScanMetrics = await measureRepeatedBlockScan(page, 10);
      const scrollMetrics = await measureScrollFrames(page, 30);
      console.info('[notes-markdown-syntax-typora-dom]', {
        stableSelectableBlockCount,
        metrics,
        visibilityProblems,
        blockScanMetrics,
        scrollMetrics,
      });

      expect(metrics.countsBySelector.sourceFallback).toBe(0);
      expect(metrics.countsBySelector.headings).toBeGreaterThanOrEqual(14);
      expect(metrics.countsBySelector.blockquotes).toBeGreaterThanOrEqual(1);
      expect(metrics.countsBySelector.callouts).toBeGreaterThanOrEqual(3);
      expect(metrics.countsBySelector.taskItems).toBe(4);
      expect(metrics.countsBySelector.tables).toBeGreaterThanOrEqual(1);
      expect(metrics.countsBySelector.codeBlocks).toBeGreaterThanOrEqual(3);
      expect(metrics.countsBySelector.images).toBeGreaterThanOrEqual(5);
      expect(metrics.selectableBlockCount).toBeGreaterThan(50);
      expect(visibilityProblems).toEqual([]);
      expect(metrics.selectableBlockCount).toBe(stableSelectableBlockCount);
      expect(blockScanMetrics.blockCount).toBe(stableSelectableBlockCount);
      expect(blockScanMetrics.p95Ms).toBeLessThan(250);
      expect(scrollMetrics).not.toBeNull();
      expect(scrollMetrics!.maxFrameMs).toBeLessThan(1_500);

      const selectedCount = await selectNoteBlocksByText(page, [
        'Inline marks paragraph',
        'Task item checked sentinel',
        'Final paragraph sentinel',
      ]);
      expect(selectedCount).toBeGreaterThanOrEqual(3);
      await expect(page.locator(SELECTED_BLOCK_SELECTOR).first()).toBeVisible();

      await scrollNoteToTop(page);
      await scrollElementIntoViewByText(page, SELECTED_BLOCK_SELECTOR, 'Inline marks paragraph');
      await selectNoteBlocksByText(page, [
        'Inline marks paragraph',
        'Task item checked sentinel',
        'Final paragraph sentinel',
      ]);
      await expect(page.locator(SELECTED_BLOCK_SELECTOR, { hasText: 'Inline marks paragraph' })).toBeVisible();

      await clearSelectedNoteBlocks(page);
      await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
