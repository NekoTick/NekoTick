import { expect, test, type Page } from '@playwright/test';
import {
  CHAT_MESSAGE_SELECTOR,
  CHAT_VIEW_SELECTOR,
  cleanupIsolatedElectron,
  createChatFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  measureChatScrollFrames,
  setAppViewMode,
  waitForChatSession,
} from './notesE2E';

const RICH_MARKDOWN_SENTINEL = 'CHAT_MARKDOWN_RENDER_SENTINEL';
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

type ChatMarkdownRenderMetrics = {
  calloutCount: number;
  chatHorizontalOverflowPx: number;
  chatOverflowX: string;
  messageRightOverflowPx: number;
  codeBlockBodyHorizontalScroll: boolean;
  codeBlockBodyRectRightOverflowPx: number;
  documentHorizontalOverflow: boolean;
  hasAssistant: boolean;
  hasSurface: boolean;
  headingFontSizePx: number;
  imageComplete: boolean;
  imageRightOverflowPx: number;
  imageWidth: number;
  inlineCodeHorizontalOverflowPx: number;
  inlineCodeMaxWidth: number;
  inlineCodeRightOverflowPx: number;
  mermaidBlockCount: number;
  mermaidErrorCount: number;
  mermaidGanttScroll: boolean;
  mermaidGanttSvgWidth: number;
  mermaidRightOverflowPx: number;
  mermaidSvgCount: number;
  surfaceHorizontalOverflowPx: number;
  surfaceRightOverflowPx: number;
  surfaceWidth: number;
  tableWrapperCount: number;
  tableWrapperHorizontalScroll: boolean;
  tableWrapperRectRightOverflowPx: number;
  textProblems: Array<{ reason: string; selector: string; text: string }>;
  viewportWidth: number;
};

function createWideMarkdownTable(): string {
  const headers = Array.from({ length: 8 }, (_, index) => `Metric ${index + 1}`);
  const delimiter = headers.map(() => '---');
  const row = headers.map((_, index) => `wide-cell-${index + 1}-${'value-'.repeat(18)}`);
  return [
    `| ${headers.join(' | ')} |`,
    `| ${delimiter.join(' | ')} |`,
    `| ${row.join(' | ')} |`,
  ].join('\n');
}

function createRichMarkdown(): string {
  const longInlineCode = `https://example.com/${'abcdef0123456789'.repeat(40)}.webp`;
  const longCodeLine = `const providerToken = "${'chat-code-line-segment-'.repeat(28)}";`;
  const longLink = `https://example.com/${'chat-rendering-path/'.repeat(24)}final`;

  return [
    '# Chat Markdown Appearance Audit',
    '',
    `This message verifies rich Markdown rendering without layout overflow. ${RICH_MARKDOWN_SENTINEL}`,
    '',
    `Inline stress: \`${longInlineCode}\` and [a long external link](${longLink}) should stay inside the assistant column.`,
    '',
    '> [!callout-icon:%F0%9F%93%8C] Callout content should keep readable spacing.',
    '> The second callout line catches nested paragraph sizing.',
    '',
    '1. Ordered item with **strong text** and `shortCode`.',
    '2. Ordered item with nested details:',
    '   - Nested bullet alpha',
    '   - Nested bullet beta with ==highlighted text== and ++underlined text++.',
    '',
    createWideMarkdownTable(),
    '',
    '```mermaid',
    'gantt',
    '  dateFormat YYYY-MM-DD',
    '  title Chat Mermaid Gantt Audit',
    '  section Review',
    '  Inspect renderer :done, c1, 2026-02-01, 2d',
    '  Verify sizing :active, c2, after c1, 3d',
    '  Keep readable :c3, after c2, 4d',
    '```',
    '',
    '```ts',
    'type ChatRenderProbe = { stable: boolean; overflow: "contained" | "broken" };',
    longCodeLine,
    'export const probe: ChatRenderProbe = { stable: true, overflow: "contained" };',
    '```',
    '',
    `<img src="${TINY_PNG_DATA_URL}" alt="chat markdown preview" width="720" />`,
    '',
    'Final paragraph keeps the rendered answer scannable after tables, code and image blocks.',
  ].join('\n');
}

function createScrollableMessages() {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (let index = 0; index < 28; index += 1) {
    messages.push({
      role: 'user',
      content: `Markdown audit scroll prompt ${index}.`,
    });
    messages.push({
      role: 'assistant',
      content: [
        `## Scroll Section ${index}`,
        '',
        `Regular assistant markdown section ${index}.`,
        '',
        '- Short bullet one',
        '- Short bullet two',
        '',
        '```text',
        `scroll-section-${index}`,
        '```',
      ].join('\n'),
    });
  }

  messages.push({
    role: 'user',
    content: 'Render the rich Markdown audit response.',
  });
  messages.push({
    role: 'assistant',
    content: createRichMarkdown(),
  });

  return messages;
}

async function waitForTwoAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function showRichAssistantMessage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scrollRoot = document.querySelector<HTMLElement>('[data-chat-scrollable="true"]');
    if (scrollRoot) {
      scrollRoot.scrollTop = scrollRoot.scrollHeight;
      scrollRoot.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
  });

  const richAssistant = page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
    hasText: RICH_MARKDOWN_SENTINEL,
  }).first();
  await expect(richAssistant).toBeVisible({ timeout: 30_000 });
  await richAssistant.scrollIntoViewIfNeeded();

  await expect.poll(async () => page.evaluate((sentinel) => {
    const assistant = Array.from(document.querySelectorAll<HTMLElement>(
      '[data-message-item="true"][data-role="assistant"]',
    )).find((element) => element.textContent?.includes(sentinel));
    const image = assistant?.querySelector<HTMLImageElement>('img[alt="chat markdown preview"]');
    return {
      hasSurface: Boolean(assistant?.querySelector('.markdown-surface')),
      imageComplete: Boolean(image && image.complete && image.naturalWidth > 0),
      mermaidErrors: assistant?.querySelectorAll('[data-type="mermaid"].mermaid-error, [data-type="mermaid"] .mermaid-error').length ?? 0,
      mermaidPending: assistant?.querySelectorAll('[data-type="mermaid"] .mermaid-placeholder').length ?? 0,
      mermaidSvgCount: assistant?.querySelectorAll('[data-type="mermaid"] svg').length ?? 0,
    };
  }, RICH_MARKDOWN_SENTINEL), { timeout: 30_000 }).toMatchObject({
    hasSurface: true,
    imageComplete: true,
    mermaidErrors: 0,
    mermaidPending: 0,
    mermaidSvgCount: 1,
  });

  await waitForTwoAnimationFrames(page);
}

async function collectChatMarkdownRenderMetrics(page: Page): Promise<ChatMarkdownRenderMetrics> {
  return page.evaluate((sentinel) => {
    const viewportWidth = window.innerWidth;
    const documentElement = document.documentElement;
    const body = document.body;
    const chatScrollRoot = document.querySelector<HTMLElement>('[data-chat-scrollable="true"]');
    const assistant = Array.from(document.querySelectorAll<HTMLElement>(
      '[data-message-item="true"][data-role="assistant"]',
    )).find((element) => element.textContent?.includes(sentinel)) ?? null;
    const surface = assistant?.querySelector<HTMLElement>('.markdown-surface') ?? null;

    if (!assistant || !surface || !chatScrollRoot) {
      return {
        calloutCount: 0,
        chatHorizontalOverflowPx: 0,
        chatOverflowX: '',
        messageRightOverflowPx: 0,
        codeBlockBodyHorizontalScroll: false,
        codeBlockBodyRectRightOverflowPx: 0,
        documentHorizontalOverflow: false,
        hasAssistant: Boolean(assistant),
        hasSurface: Boolean(surface),
        headingFontSizePx: 0,
        imageComplete: false,
        imageRightOverflowPx: 0,
        imageWidth: 0,
        inlineCodeHorizontalOverflowPx: 0,
        inlineCodeMaxWidth: 0,
        inlineCodeRightOverflowPx: 0,
        mermaidBlockCount: 0,
        mermaidErrorCount: 0,
        mermaidGanttScroll: false,
        mermaidGanttSvgWidth: 0,
        mermaidRightOverflowPx: 0,
        mermaidSvgCount: 0,
        surfaceHorizontalOverflowPx: 0,
        surfaceRightOverflowPx: 0,
        surfaceWidth: 0,
        tableWrapperCount: 0,
        tableWrapperHorizontalScroll: false,
        tableWrapperRectRightOverflowPx: 0,
        textProblems: [],
        viewportWidth,
      };
    }

    const surfaceRect = surface.getBoundingClientRect();
    const chatRect = chatScrollRoot.getBoundingClientRect();
    const assistantRect = assistant.getBoundingClientRect();
    const rightOverflow = (element: HTMLElement | null) => {
      if (!element) return 0;
      const rect = element.getBoundingClientRect();
      return Math.max(0, rect.right - surfaceRect.right);
    };

    const tableWrappers = Array.from(surface.querySelectorAll<HTMLElement>('[data-markdown-table-scroll="true"]'));
    const codeBlockBody = surface.querySelector<HTMLElement>('.code-block-chrome-body');
    const inlineCodes = Array.from(surface.querySelectorAll<HTMLElement>('code'))
      .filter((element) => !element.closest('.code-block-chrome') && !element.closest('pre'));
    const image = surface.querySelector<HTMLImageElement>('img[alt="chat markdown preview"]');
    const heading = surface.querySelector<HTMLElement>('h1');
    const mermaidBlocks = Array.from(surface.querySelectorAll<HTMLElement>('[data-type="mermaid"]'));
    const mermaidGantt = surface.querySelector<HTMLElement>('[data-type="mermaid"][data-mermaid-diagram="gantt"]');
    const mermaidGanttSvg = mermaidGantt?.querySelector<SVGSVGElement>('svg') ?? null;

    const textSelectors = [
      'h1', 'h2', 'h3', 'p', 'li', 'blockquote', 'td', 'th', 'code', 'a',
      '.callout', '.callout-content',
    ].join(',');
    const textProblems = Array.from(surface.querySelectorAll<HTMLElement>(textSelectors))
      .flatMap((element) => {
        const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        if (!text) return [];
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const reasons: string[] = [];
        if (style.display === 'none') reasons.push('display-none');
        if (style.visibility === 'hidden' || style.visibility === 'collapse') reasons.push('visibility-hidden');
        if (Number.parseFloat(style.opacity || '1') <= 0.01) reasons.push('opacity-zero');
        if (rect.width < 1 || rect.height < 1) reasons.push('zero-geometry');
        return reasons.length > 0
          ? [{
              reason: reasons.join(','),
              selector: element.tagName.toLowerCase(),
              text: text.slice(0, 80),
            }]
          : [];
      })
      .slice(0, 10);

    const inlineCodeRects = inlineCodes.map((element) => element.getBoundingClientRect());
    const maxInlineCodeRightOverflow = inlineCodes.reduce(
      (max, element) => Math.max(max, rightOverflow(element)),
      0,
    );
    const maxInlineCodeHorizontalOverflow = inlineCodes.reduce(
      (max, element) => Math.max(max, element.scrollWidth - element.clientWidth),
      0,
    );
    const maxInlineCodeWidth = Math.max(0, ...inlineCodeRects.map((rect) => rect.width));
    const firstTableWrapper = tableWrappers[0] ?? null;
    const headingFontSizePx = heading
      ? Number.parseFloat(window.getComputedStyle(heading).fontSize || '0')
      : 0;

    return {
      calloutCount: surface.querySelectorAll('.callout').length,
      chatHorizontalOverflowPx: Math.max(0, chatScrollRoot.scrollWidth - chatScrollRoot.clientWidth),
      chatOverflowX: window.getComputedStyle(chatScrollRoot).overflowX,
      messageRightOverflowPx: Math.max(0, assistantRect.right - chatRect.right),
      codeBlockBodyHorizontalScroll: Boolean(codeBlockBody && codeBlockBody.scrollWidth > codeBlockBody.clientWidth + 2),
      codeBlockBodyRectRightOverflowPx: rightOverflow(codeBlockBody),
      documentHorizontalOverflow:
        documentElement.scrollWidth > viewportWidth + 2 ||
        body.scrollWidth > viewportWidth + 2,
      hasAssistant: true,
      hasSurface: true,
      headingFontSizePx,
      imageComplete: Boolean(image && image.complete && image.naturalWidth > 0),
      imageRightOverflowPx: rightOverflow(image),
      imageWidth: image?.getBoundingClientRect().width ?? 0,
      inlineCodeHorizontalOverflowPx: maxInlineCodeHorizontalOverflow,
      inlineCodeMaxWidth: maxInlineCodeWidth,
      inlineCodeRightOverflowPx: maxInlineCodeRightOverflow,
      mermaidBlockCount: mermaidBlocks.length,
      mermaidErrorCount: surface.querySelectorAll('[data-type="mermaid"].mermaid-error, [data-type="mermaid"] .mermaid-error').length,
      mermaidGanttScroll: Boolean(mermaidGantt && mermaidGantt.scrollWidth > mermaidGantt.clientWidth + 2),
      mermaidGanttSvgWidth: mermaidGanttSvg?.getBoundingClientRect().width ?? 0,
      mermaidRightOverflowPx: Math.max(0, ...mermaidBlocks.map((element) => rightOverflow(element))),
      mermaidSvgCount: surface.querySelectorAll('[data-type="mermaid"] svg').length,
      surfaceHorizontalOverflowPx: Math.max(0, surface.scrollWidth - surface.clientWidth),
      surfaceRightOverflowPx: Math.max(0, surfaceRect.right - chatRect.right),
      surfaceWidth: surfaceRect.width,
      tableWrapperCount: tableWrappers.length,
      tableWrapperHorizontalScroll: Boolean(firstTableWrapper && firstTableWrapper.scrollWidth > firstTableWrapper.clientWidth + 2),
      tableWrapperRectRightOverflowPx: rightOverflow(firstTableWrapper),
      textProblems,
      viewportWidth,
    };
  }, RICH_MARKDOWN_SENTINEL);
}

function expectStableMarkdownLayout(metrics: ChatMarkdownRenderMetrics) {
  expect(metrics.hasAssistant).toBe(true);
  expect(metrics.hasSurface).toBe(true);
  expect(metrics.documentHorizontalOverflow).toBe(false);
  expect(['hidden', 'clip']).toContain(metrics.chatOverflowX);
  expect(metrics.messageRightOverflowPx).toBeLessThanOrEqual(2);
  expect(metrics.surfaceRightOverflowPx).toBeLessThanOrEqual(2);
  expect(metrics.tableWrapperCount).toBeGreaterThanOrEqual(1);
  expect(metrics.tableWrapperHorizontalScroll).toBe(true);
  expect(metrics.tableWrapperRectRightOverflowPx).toBeLessThanOrEqual(2);
  expect(metrics.codeBlockBodyHorizontalScroll).toBe(true);
  expect(metrics.codeBlockBodyRectRightOverflowPx).toBeLessThanOrEqual(2);
  expect(metrics.inlineCodeMaxWidth).toBeLessThanOrEqual(metrics.surfaceWidth + 2);
  expect(metrics.inlineCodeHorizontalOverflowPx).toBeLessThanOrEqual(2);
  expect(metrics.inlineCodeRightOverflowPx).toBeLessThanOrEqual(2);
  expect(metrics.imageComplete).toBe(true);
  expect(metrics.imageWidth).toBeGreaterThan(0);
  expect(metrics.imageWidth).toBeLessThanOrEqual(metrics.surfaceWidth + 2);
  expect(metrics.imageRightOverflowPx).toBeLessThanOrEqual(2);
  expect(metrics.mermaidBlockCount).toBe(1);
  expect(metrics.mermaidSvgCount).toBe(1);
  expect(metrics.mermaidErrorCount).toBe(0);
  expect(metrics.mermaidGanttScroll).toBe(true);
  expect(metrics.mermaidGanttSvgWidth).toBeGreaterThanOrEqual(900);
  expect(metrics.mermaidRightOverflowPx).toBeLessThanOrEqual(2);
  expect(metrics.calloutCount).toBeGreaterThanOrEqual(1);
  expect(metrics.headingFontSizePx).toBeGreaterThan(0);
  expect(metrics.textProblems).toEqual([]);
}

test.describe('chat markdown rendering', () => {
  test.setTimeout(120_000);

  test('keeps rich assistant markdown contained and scroll performance bounded', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-markdown-rendering');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createChatFixture(page, {
        sessions: [{
          title: 'E2E Markdown Rendering',
          messages: createScrollableMessages(),
        }],
      });

      await setAppViewMode(page, 'chat');
      await expect(page.locator(CHAT_VIEW_SELECTOR)).toBeVisible({ timeout: 30_000 });
      await waitForChatSession(page, {
        sessionId: fixture.sessionIds[0]!,
        minMessageCount: 58,
        sentinelText: RICH_MARKDOWN_SENTINEL,
      });

      const scrollMetrics = await measureChatScrollFrames(page, 40);
      console.info('[chat-markdown-scroll]', scrollMetrics);
      expect(scrollMetrics).not.toBeNull();
      expect(scrollMetrics!.maxFrameMs).toBeLessThan(600);
      expect(scrollMetrics!.p95FrameMs).toBeLessThan(220);

      await showRichAssistantMessage(page);
      const desktopMetrics = await collectChatMarkdownRenderMetrics(page);
      console.info('[chat-markdown-layout-desktop]', desktopMetrics);
      expectStableMarkdownLayout(desktopMetrics);

      await page.setViewportSize({ width: 760, height: 720 });
      await showRichAssistantMessage(page);
      const narrowMetrics = await collectChatMarkdownRenderMetrics(page);
      console.info('[chat-markdown-layout-narrow]', narrowMetrics);
      expectStableMarkdownLayout(narrowMetrics);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
