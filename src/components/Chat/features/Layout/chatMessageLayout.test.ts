import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/lib/ai/types';
import { MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES } from '@/components/Chat/common/messageClipboard';
import {
  MARKDOWN_CODE_LINE_HEIGHT,
  MARKDOWN_CODE_BLOCK_HEADER_HEIGHT,
  MARKDOWN_CODE_BLOCK_PADDING_Y,
  MARKDOWN_RULE_HEIGHT,
  MARKDOWN_TABLE_CELL_PADDING_Y,
  MARKDOWN_TABLE_LINE_HEIGHT,
  MARKDOWN_TABLE_ROW_BORDER_Y,
} from '@/components/common/markdown/markdownMetrics';
import {
  estimateChatMessageHeight,
} from './chatMessageLayout';

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  const timestamp = Date.now();
  return {
    id: `${role}-${timestamp}`,
    role,
    content,
    modelId: 'model-a',
    timestamp,
    versions: [{ content, createdAt: timestamp, kind: 'original' as const, subsequentMessages: [] }],
    currentVersionIndex: 0,
  };
}

describe('estimateChatMessageHeight', () => {
  it('grows for longer user messages', () => {
    const shortHeight = estimateChatMessageHeight(
      createMessage('user', 'short'),
      { containerWidth: 900, isStreaming: false },
    );
    const longHeight = estimateChatMessageHeight(
      createMessage('user', 'long '.repeat(120)),
      { containerWidth: 900, isStreaming: false },
    );

    expect(longHeight).toBeGreaterThan(shortHeight);
  });

  it('bounds long user message estimates to the collapsed preview', () => {
    const nineLineHeight = estimateChatMessageHeight(
      createMessage('user', Array.from({ length: 9 }, (_, index) => `line ${index}`).join('\n')),
      { containerWidth: 900, isStreaming: true },
    );
    const hundredLineHeight = estimateChatMessageHeight(
      createMessage('user', Array.from({ length: 100 }, (_, index) => `line ${index}`).join('\n')),
      { containerWidth: 900, isStreaming: true },
    );
    const wrappedLongHeight = estimateChatMessageHeight(
      createMessage('user', 'wrapped text '.repeat(500)),
      { containerWidth: 320, isStreaming: true },
    );
    const wrappedVeryLongHeight = estimateChatMessageHeight(
      createMessage('user', 'wrapped text '.repeat(5000)),
      { containerWidth: 320, isStreaming: true },
    );

    expect(hundredLineHeight).toBe(nineLineHeight);
    expect(wrappedVeryLongHeight).toBe(wrappedLongHeight);
  });

  it('does not reserve user toolbar height while waiting for a response', () => {
    const message = createMessage('user', 'short');
    const idleHeight = estimateChatMessageHeight(message, {
      containerWidth: 900,
      isStreaming: false,
    });
    const waitingHeight = estimateChatMessageHeight(message, {
      containerWidth: 900,
      isStreaming: true,
    });

    expect(waitingHeight).toBeLessThan(idleHeight);
  });

  it('does not reserve user image height for markdown examples in code', () => {
    const contentWithExample = 'Use this example:\n\n```md\n![example](attachment://code.png)\n```\n\nDone';
    const textOnlyHeight = estimateChatMessageHeight(
      createMessage('user', contentWithExample),
      { containerWidth: 900, isStreaming: false },
    );
    const realImageHeight = estimateChatMessageHeight(
      createMessage('user', `![image](<attachment://real.png>)\n\n${contentWithExample}`),
      { containerWidth: 900, isStreaming: false },
    );

    expect(realImageHeight - textOnlyHeight).toBeGreaterThan(240);
  });

  it('does not reserve user image stack height for video markdown', () => {
    const videoHeight = estimateChatMessageHeight(
      createMessage('user', '![video](https://example.com/movie.mp4)'),
      { containerWidth: 900, isStreaming: false },
    );
    const emptyHeight = estimateChatMessageHeight(
      createMessage('user', ''),
      { containerWidth: 900, isStreaming: false },
    );
    const textHeight = estimateChatMessageHeight(
      createMessage('user', 'video text'),
      { containerWidth: 900, isStreaming: false },
    );
    const imageHeight = estimateChatMessageHeight(
      createMessage('user', '![image](https://example.com/real.png)'),
      { containerWidth: 900, isStreaming: false },
    );

    expect(videoHeight).toBe(textHeight);
    expect(videoHeight).toBeGreaterThanOrEqual(emptyHeight);
    expect(imageHeight).toBeGreaterThan(videoHeight);
  });

  it('reserves user image stack height for raw html images', () => {
    const textOnlyHeight = estimateChatMessageHeight(
      createMessage('user', 'hello'),
      { containerWidth: 900, isStreaming: false },
    );
    const rawHtmlImageHeight = estimateChatMessageHeight(
      createMessage('user', '<img src="https://example.com/real.png">\n\nhello'),
      { containerWidth: 900, isStreaming: false },
    );

    expect(rawHtmlImageHeight - textOnlyHeight).toBeGreaterThan(240);
  });

  it('does not reserve user image stack height for relative or bare images', () => {
    const relativeHeight = estimateChatMessageHeight(
      createMessage('user', '![local](images/demo.png)'),
      { containerWidth: 900, isStreaming: false },
    );
    const textHeight = estimateChatMessageHeight(
      createMessage('user', 'relative image text'),
      { containerWidth: 900, isStreaming: false },
    );
    const bareHeight = estimateChatMessageHeight(
      createMessage('user', '![image](demo.png)'),
      { containerWidth: 900, isStreaming: false },
    );
    const imageHeight = estimateChatMessageHeight(
      createMessage('user', '![image](https://example.com/demo.png)'),
      { containerWidth: 900, isStreaming: false },
    );

    expect(relativeHeight).toBe(textHeight);
    expect(bareHeight).toBe(textHeight);
    expect(imageHeight - relativeHeight).toBeGreaterThan(200);
  });

  it('bounds user image height estimation for image-heavy messages', () => {
    const boundedHeight = estimateChatMessageHeight(
      createMessage(
        'user',
        Array.from(
          { length: MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES },
          (_, index) => `![image ${index}](https://example.com/${index}.png)`,
        ).join('\n'),
      ),
      { containerWidth: 900, isStreaming: false },
    );
    const oversizedHeight = estimateChatMessageHeight(
      createMessage(
        'user',
        Array.from(
          { length: MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES + 1 },
          (_, index) => `![image ${index}](https://example.com/${index}.png)`,
        ).join('\n'),
      ),
      { containerWidth: 900, isStreaming: false },
    );

    expect(oversizedHeight - boundedHeight).toBeLessThan(256);
  });

  it('estimates multiple user images as a wrapping grid', () => {
    const content = Array.from(
      { length: 8 },
      (_, index) => `![image ${index}](https://example.com/${index}.png)`,
    ).join('\n');
    const wideHeight = estimateChatMessageHeight(
      createMessage('user', content),
      { containerWidth: 900, isStreaming: true },
    );
    const singleImageHeight = estimateChatMessageHeight(
      createMessage('user', '![image](https://example.com/one.png)'),
      { containerWidth: 900, isStreaming: true },
    );
    const narrowHeight = estimateChatMessageHeight(
      createMessage('user', content),
      { containerWidth: 320, isStreaming: true },
    );

    expect(wideHeight).toBeLessThan(singleImageHeight * 2);
    expect(narrowHeight).toBeGreaterThan(wideHeight);
  });

  it('accounts for assistant code fences and images', () => {
    const plainHeight = estimateChatMessageHeight(
      createMessage('assistant', 'hello world'),
      { containerWidth: 900, isStreaming: false },
    );
    const richHeight = estimateChatMessageHeight(
      createMessage(
        'assistant',
        '```ts\nconst a = 1;\nconst b = 2;\n```\n\n![image](<https://example.com/x.png>)',
      ),
      { containerWidth: 900, isStreaming: false },
    );

    expect(richHeight).toBeGreaterThan(plainHeight);
  });

  it('does not reserve assistant image stack height for video markdown', () => {
    const videoHeight = estimateChatMessageHeight(
      createMessage('assistant', '![video](https://example.com/movie.mp4)'),
      { containerWidth: 900, isStreaming: false },
    );
    const textHeight = estimateChatMessageHeight(
      createMessage('assistant', ''),
      { containerWidth: 900, isStreaming: false },
    );
    const imageHeight = estimateChatMessageHeight(
      createMessage('assistant', '![image](https://example.com/real.png)'),
      { containerWidth: 900, isStreaming: false },
    );

    expect(videoHeight).toBeGreaterThan(textHeight);
    expect(imageHeight).toBeGreaterThan(textHeight);
    expect(videoHeight).not.toBe(imageHeight);
  });


  it('uses the shared code block chrome height in assistant estimates', () => {
    const oneLineCodeHeight = estimateChatMessageHeight(
      createMessage('assistant', '```ts\nconst value = 1;\n```'),
      { containerWidth: 900, isStreaming: false },
    );
    const twoLineCodeHeight = estimateChatMessageHeight(
      createMessage('assistant', '```ts\nconst value = 1;\nconst next = 2;\n```'),
      { containerWidth: 900, isStreaming: false },
    );

    expect(twoLineCodeHeight - oneLineCodeHeight).toBe(MARKDOWN_CODE_LINE_HEIGHT);
    expect(oneLineCodeHeight).toBeGreaterThanOrEqual(
      MARKDOWN_CODE_BLOCK_HEADER_HEIGHT + MARKDOWN_CODE_BLOCK_PADDING_Y + MARKDOWN_CODE_LINE_HEIGHT,
    );
  });

  it('accounts for headings, lists, and blockquotes as separate blocks', () => {
    const plainHeight = estimateChatMessageHeight(
      createMessage('assistant', 'hello world'),
      { containerWidth: 900, isStreaming: false },
    );
    const structuredHeight = estimateChatMessageHeight(
      createMessage(
        'assistant',
        '# Title\n\n- first item\n- second item\n\n> quoted line',
      ),
      { containerWidth: 900, isStreaming: false },
    );

    expect(structuredHeight).toBeGreaterThan(plainHeight);
  });

  it('uses the current markdown font size for structured assistant estimates', () => {
    const message = createMessage(
      'assistant',
      '# Title\n\nParagraph with `inline code`.\n\n- first item\n- second item\n\n```ts\nconst value = 1;\n```',
    );
    const defaultHeight = estimateChatMessageHeight(message, {
      containerWidth: 900,
      fontSize: 17,
      isStreaming: false,
    });
    const enlargedHeight = estimateChatMessageHeight(message, {
      containerWidth: 900,
      fontSize: 34,
      isStreaming: false,
    });

    expect(enlargedHeight).toBeGreaterThan(defaultHeight);
  });

  it('includes shared list margins in assistant markdown height estimates', () => {
    const paragraphHeight = estimateChatMessageHeight(
      createMessage('assistant', 'first item\nsecond item'),
      { containerWidth: 900, isStreaming: false },
    );
    const listHeight = estimateChatMessageHeight(
      createMessage('assistant', '- first item\n- second item'),
      { containerWidth: 900, isStreaming: false },
    );

    expect(listHeight - paragraphHeight).toBeGreaterThanOrEqual(40);
  });

  it('includes shared blockquote padding in assistant markdown height estimates', () => {
    const paragraphHeight = estimateChatMessageHeight(
      createMessage('assistant', 'quoted line'),
      { containerWidth: 900, isStreaming: false },
    );
    const blockquoteHeight = estimateChatMessageHeight(
      createMessage('assistant', '> quoted line'),
      { containerWidth: 900, isStreaming: false },
    );

    expect(blockquoteHeight - paragraphHeight).toBeGreaterThanOrEqual(20);
  });

  it('accounts for markdown tables as structured blocks', () => {
    const plainHeight = estimateChatMessageHeight(
      createMessage('assistant', 'alpha beta'),
      { containerWidth: 900, isStreaming: false },
    );
    const tableHeight = estimateChatMessageHeight(
      createMessage(
        'assistant',
        '| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |',
      ),
      { containerWidth: 900, isStreaming: false },
    );

    expect(tableHeight).toBeGreaterThan(plainHeight);
  });

  it('estimates markdown tables from shared table metrics instead of code block chrome', () => {
    const oneRowTableHeight = estimateChatMessageHeight(
      createMessage('assistant', '| a | b |\n| --- | --- |\n| 1 | 2 |'),
      { containerWidth: 900, isStreaming: false },
    );
    const twoRowTableHeight = estimateChatMessageHeight(
      createMessage('assistant', '| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'),
      { containerWidth: 900, isStreaming: false },
    );

    expect(twoRowTableHeight - oneRowTableHeight).toBe(
      MARKDOWN_TABLE_LINE_HEIGHT + MARKDOWN_TABLE_CELL_PADDING_Y + MARKDOWN_TABLE_ROW_BORDER_Y,
    );
  });

  it('uses the shared horizontal rule height in assistant estimates', () => {
    const ruleHeight = estimateChatMessageHeight(
      createMessage('assistant', '---'),
      { containerWidth: 900, isStreaming: false },
    );

    expect(ruleHeight).toBeGreaterThanOrEqual(MARKDOWN_RULE_HEIGHT);
  });

  it('accounts for inline links and code spans in narrow assistant layouts', () => {
    const plainHeight = estimateChatMessageHeight(
      createMessage('assistant', 'Open link and code sample now'),
      { containerWidth: 360, isStreaming: false },
    );
    const richInlineHeight = estimateChatMessageHeight(
      createMessage('assistant', 'Open [link destination](https://example.com) and `code sample` now'),
      { containerWidth: 360, isStreaming: false },
    );

    expect(richInlineHeight).toBeGreaterThanOrEqual(plainHeight);
  });

  it('accounts for active thinking content before streaming completes', () => {
    const withoutThinkingHeight = estimateChatMessageHeight(
      createMessage('assistant', 'processing result'),
      { containerWidth: 900, isStreaming: true },
    );
    const withThinkingHeight = estimateChatMessageHeight(
      createMessage('assistant', '<think>first step\nsecond step'),
      { containerWidth: 900, isStreaming: true },
    );

    expect(withThinkingHeight).toBeGreaterThan(withoutThinkingHeight);
  });

  it('keeps completed thinking collapsed in the height estimate', () => {
    const withShortThinkingHeight = estimateChatMessageHeight(
      createMessage('assistant', '<think>first step</think>processing result'),
      { containerWidth: 900, isStreaming: false },
    );
    const withLongThinkingHeight = estimateChatMessageHeight(
      createMessage('assistant', '<think>first step\nsecond step\nthird step</think>processing result'),
      { containerWidth: 900, isStreaming: false },
    );

    expect(withLongThinkingHeight).toBe(withShortThinkingHeight);
  });

  it('keeps streaming assistant height monotonic as content is appended on the same message', () => {
    const first = createMessage('assistant', '## Title\n\nFirst paragraph');
    const second = {
      ...first,
      content: '## Title\n\nFirst paragraph\n\n- item one\n- item two',
      versions: [{
        content: '## Title\n\nFirst paragraph\n\n- item one\n- item two',
        createdAt: first.timestamp, kind: 'original' as const, subsequentMessages: [],
      }],
    };

    const firstHeight = estimateChatMessageHeight(first, {
      containerWidth: 900,
      isStreaming: true,
    });
    const secondHeight = estimateChatMessageHeight(second, {
      containerWidth: 900,
      isStreaming: true,
    });

    expect(secondHeight).toBeGreaterThanOrEqual(firstHeight);
  });

  it('matches cold parsing when streaming content is incrementally appended on the same message', () => {
    const base = createMessage('assistant', '## Title\n\nFirst paragraph');
    const streamed = {
      ...base,
      content: '## Title\n\nFirst paragraph\n\n- item one\n- item two\n\n```ts\nconst value = 1;\n```',
      versions: [{
        content: '## Title\n\nFirst paragraph\n\n- item one\n- item two\n\n```ts\nconst value = 1;\n```',
        createdAt: base.timestamp, kind: 'original' as const, subsequentMessages: [],
      }],
    };
    const cold = createMessage(
      'assistant',
      '## Title\n\nFirst paragraph\n\n- item one\n- item two\n\n```ts\nconst value = 1;\n```',
    );

    estimateChatMessageHeight(base, {
      containerWidth: 900,
      isStreaming: true,
    });
    const streamedHeight = estimateChatMessageHeight(streamed, {
      containerWidth: 900,
      isStreaming: true,
    });
    const coldHeight = estimateChatMessageHeight(cold, {
      containerWidth: 900,
      isStreaming: true,
    });

    expect(streamedHeight).toBe(coldHeight);
  });
});
