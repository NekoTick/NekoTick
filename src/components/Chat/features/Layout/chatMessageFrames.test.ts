import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/lib/ai/types';
import {
  buildChatMessageFrameLayout,
  buildTrailingChatLayout,
  CHAT_MESSAGE_LOADING_GAP,
  CHAT_MESSAGE_LIST_ACTIVE_OVERSCAN,
  CHAT_MESSAGE_LIST_BOTTOM_PADDING,
  CHAT_MESSAGE_LIST_GAP,
  CHAT_MESSAGE_LIST_TOP_PADDING,
  CHAT_MESSAGE_LIST_TAIL_OVERSCAN,
  findVisibleChatMessageRange,
  rememberMeasuredChatMessageHeight,
  resolveChatMessageListOverscan,
  resolveVisibleChatMessageRange,
  restoreCachedMeasuredHeights,
} from './chatMessageFrames';

function createMessage(id: string, role: ChatMessage['role'], content: string): ChatMessage {
  const timestamp = Date.now();
  return {
    id,
    role,
    content,
    modelId: 'model-a',
    timestamp,
    versions: [{ content, createdAt: timestamp, kind: 'original' as const, subsequentMessages: [] }],
    currentVersionIndex: 0,
  };
}

describe('chatMessageFrames', () => {
  it('builds sequential message frames with measured height overrides', () => {
    const messages = [
      createMessage('u1', 'user', 'hello'),
      createMessage('a1', 'assistant', 'world'),
    ];
    const measuredHeights = new Map<string, number>([
      ['u1', 120],
      ['a1', 180],
    ]);

    const layout = buildChatMessageFrameLayout(messages, {
      containerWidth: 900,
      isSessionActive: false,
      measuredHeights,
    });

    expect(layout.items).toHaveLength(2);
    expect(layout.items[0]).toMatchObject({
      id: 'u1',
      index: 0,
      top: CHAT_MESSAGE_LIST_TOP_PADDING,
      height: 120,
      bottom: CHAT_MESSAGE_LIST_TOP_PADDING + 120,
    });
    expect(layout.items[1]).toMatchObject({
      id: 'a1',
      index: 1,
      top: CHAT_MESSAGE_LIST_TOP_PADDING + 120 + CHAT_MESSAGE_LIST_GAP,
      height: 180,
      bottom: CHAT_MESSAGE_LIST_TOP_PADDING + 120 + CHAT_MESSAGE_LIST_GAP + 180,
    });
    expect(layout.endOffset).toBe(CHAT_MESSAGE_LIST_TOP_PADDING + 120 + CHAT_MESSAGE_LIST_GAP + 180);
  });

  it('builds layouts for legacy messages without version metadata', () => {
    const legacyMessage = {
      id: 'legacy-assistant',
      role: 'assistant',
      content: 'legacy response',
      modelId: 'model-a',
      timestamp: 1,
    } as unknown as ChatMessage;

    const layout = buildChatMessageFrameLayout([legacyMessage], {
      containerWidth: 900,
      isSessionActive: false,
    });

    expect(layout.items[0]).toMatchObject({ id: 'legacy-assistant', index: 0 });
  });

  it('reuses cached estimated layouts for the same session and width', () => {
    const messages = [
      createMessage('u1', 'user', 'hello'),
      createMessage('a1', 'assistant', 'world'),
    ];

    const first = buildChatMessageFrameLayout(messages, {
      cacheKey: 'chat-1',
      containerWidth: 900,
      isSessionActive: false,
    });
    const second = buildChatMessageFrameLayout(messages, {
      cacheKey: 'chat-1',
      containerWidth: 900,
      isSessionActive: false,
    });

    expect(second).toBe(first);
  });

  it('reuses cached estimated layouts across nearby widths in the same bucket', () => {
    const messages = [
      createMessage('u1', 'user', 'hello'),
      createMessage('a1', 'assistant', 'world'),
    ];

    const first = buildChatMessageFrameLayout(messages, {
      cacheKey: 'chat-bucket',
      containerWidth: 721,
      isSessionActive: false,
    });
    const second = buildChatMessageFrameLayout(messages, {
      cacheKey: 'chat-bucket',
      containerWidth: 727,
      isSessionActive: false,
    });

    expect(second).toBe(first);
  });

  it('reuses the unchanged prefix when only the last message changes', () => {
    const firstMessages = [
      createMessage('u1', 'user', 'hello'),
      createMessage('a1', 'assistant', 'stream'),
    ];
    const secondMessages = [
      firstMessages[0]!,
      {
        ...firstMessages[1]!,
        content: 'stream updated',
        versions: [{ content: 'stream updated', createdAt: firstMessages[1]!.timestamp, kind: 'original' as const, subsequentMessages: [] }],
      },
    ];

    const first = buildChatMessageFrameLayout(firstMessages, {
      cacheKey: 'chat-stream',
      containerWidth: 900,
      isSessionActive: true,
    });
    const second = buildChatMessageFrameLayout(secondMessages, {
      cacheKey: 'chat-stream',
      containerWidth: 900,
      isSessionActive: true,
    });

    expect(second).not.toBe(first);
    expect(second.items[0]).toBe(first.items[0]);
    expect(second.items[1]).not.toBe(first.items[1]);
  });

  it('does not rescan unchanged historical message content during streaming updates', () => {
    const historicalMessage = createMessage('u1', 'user', 'history'.repeat(10_000));
    const historicalContent = historicalMessage.content;
    let contentReads = 0;
    Object.defineProperty(historicalMessage, 'content', {
      configurable: true,
      get: () => {
        contentReads += 1;
        return historicalContent;
      },
    });
    const streamingMessage = createMessage('a1', 'assistant', 'stream');

    buildChatMessageFrameLayout([historicalMessage, streamingMessage], {
      cacheKey: 'chat-stream-signature-cache',
      containerWidth: 900,
      isSessionActive: true,
    });
    const readsAfterInitialLayout = contentReads;

    buildChatMessageFrameLayout([
      historicalMessage,
      { ...streamingMessage, content: 'stream updated' },
    ], {
      cacheKey: 'chat-stream-signature-cache',
      containerWidth: 900,
      isSessionActive: true,
    });

    expect(readsAfterInitialLayout).toBeGreaterThan(0);
    expect(contentReads).toBe(readsAfterInitialLayout);
  });

  it('invalidates estimated layout cache when long same-length content changes in sampled regions', () => {
    const prefix = 'a'.repeat(2000);
    const suffix = 'z'.repeat(2000);
    const firstMessages = [
      createMessage('a1', 'assistant', `${prefix}middle-a${suffix}`),
    ];
    const secondMessages = [
      createMessage('a1', 'assistant', `${prefix}middle-b${suffix}`),
    ];

    const first = buildChatMessageFrameLayout(firstMessages, {
      cacheKey: 'chat-long-same-length',
      containerWidth: 900,
      isSessionActive: false,
    });
    const second = buildChatMessageFrameLayout(secondMessages, {
      cacheKey: 'chat-long-same-length',
      containerWidth: 900,
      isSessionActive: false,
    });

    expect(firstMessages[0]!.content).toHaveLength(secondMessages[0]!.content.length);
    expect(second).not.toBe(first);
  });

  it('invalidates estimated layout cache when long sampled content keeps its edges but line breaks change', () => {
    const prefix = 'p'.repeat(2000);
    const middle = 'm'.repeat(2000);
    const suffix = 's'.repeat(2000);
    const firstMessages = [
      createMessage('a1', 'assistant', `${prefix}${middle}${suffix}`),
    ];
    const secondMessages = [
      createMessage('a1', 'assistant', `${prefix}${middle.replaceAll('m'.repeat(100), `${'m'.repeat(99)}\n`)}${suffix}`),
    ];

    const first = buildChatMessageFrameLayout(firstMessages, {
      cacheKey: 'chat-long-linebreaks',
      containerWidth: 900,
      isSessionActive: false,
    });
    const second = buildChatMessageFrameLayout(secondMessages, {
      cacheKey: 'chat-long-linebreaks',
      containerWidth: 900,
      isSessionActive: false,
    });

    expect(firstMessages[0]!.content).toHaveLength(secondMessages[0]!.content.length);
    expect(firstMessages[0]!.content.slice(0, 32)).toBe(secondMessages[0]!.content.slice(0, 32));
    expect(firstMessages[0]!.content.slice(-32)).toBe(secondMessages[0]!.content.slice(-32));
    expect(second).not.toBe(first);
  });

  it('reuses all existing frames when a new message is appended', () => {
    const firstMessages = [
      createMessage('u1', 'user', 'hello'),
      createMessage('a1', 'assistant', 'world'),
    ];
    const secondMessages = [
      ...firstMessages,
      createMessage('a2', 'assistant', 'new tail'),
    ];

    const first = buildChatMessageFrameLayout(firstMessages, {
      cacheKey: 'chat-append',
      containerWidth: 900,
      isSessionActive: false,
    });
    const second = buildChatMessageFrameLayout(secondMessages, {
      cacheKey: 'chat-append',
      containerWidth: 900,
      isSessionActive: false,
    });

    expect(second.items).toHaveLength(3);
    expect(second.items[0]).toBe(first.items[0]);
    expect(second.items[1]).toBe(first.items[1]);
  });

  it('does not let stale measured assistant heights overlap following messages while active', () => {
    const messages = [
      createMessage('u1', 'user', 'hello'),
      createMessage('a1', 'assistant', 'line\n\n'.repeat(20)),
      createMessage('u2', 'user', 'next question'),
    ];
    const estimated = buildChatMessageFrameLayout(messages, {
      activeMessageId: 'a1',
      cacheKey: 'active-floor-estimated',
      containerWidth: 900,
      isSessionActive: true,
    });
    const staleAssistantHeight = 24;

    const layout = buildChatMessageFrameLayout(messages, {
      activeMessageId: 'a1',
      cacheKey: 'active-floor-measured',
      containerWidth: 900,
      isSessionActive: true,
      measuredHeights: new Map([['a1', staleAssistantHeight]]),
    });

    expect(layout.items[1]!.height).toBe(estimated.items[1]!.height);
    expect(layout.items[2]!.top).toBeGreaterThan(
      layout.items[1]!.top + staleAssistantHeight + CHAT_MESSAGE_LIST_GAP,
    );
  });

  it('only floors the active assistant height while a later assistant is streaming', () => {
    const messages = [
      createMessage('u1', 'user', 'hello'),
      createMessage('a1', 'assistant', 'line\n\n'.repeat(20)),
      createMessage('u2', 'user', 'next question'),
      createMessage('a2', 'assistant', 'streaming reply'),
    ];
    const measuredHeights = new Map<string, number>([
      ['a1', 80],
      ['a2', 20],
    ]);
    const estimated = buildChatMessageFrameLayout(messages, {
      activeMessageId: 'a2',
      cacheKey: 'active-only-estimated',
      containerWidth: 900,
      isSessionActive: true,
    });
    const layout = buildChatMessageFrameLayout(messages, {
      activeMessageId: 'a2',
      cacheKey: 'active-only-measured',
      containerWidth: 900,
      isSessionActive: true,
      measuredHeights,
    });

    expect(layout.items[1]!.height).toBe(80);
    expect(layout.items[3]!.height).toBe(estimated.items[3]!.height);
  });

  it('finds a visible message slice using binary search', () => {
    const layout = {
      endOffset: 612,
      items: [
        { id: 'm1', index: 0, top: 32, bottom: 132, height: 100 },
        { id: 'm2', index: 1, top: 164, bottom: 304, height: 140 },
        { id: 'm3', index: 2, top: 336, bottom: 456, height: 120 },
        { id: 'm4', index: 3, top: 488, bottom: 612, height: 124 },
      ],
    };

    expect(findVisibleChatMessageRange(layout.items, 150, 180, 0)).toEqual({
      start: 1,
      end: 2,
    });
  });

  it('anchors the visible range to the tail when requested', () => {
    const items = [
      { id: 'm1', index: 0, top: 32, bottom: 132, height: 100 },
      { id: 'm2', index: 1, top: 164, bottom: 304, height: 140 },
      { id: 'm3', index: 2, top: 336, bottom: 456, height: 120 },
      { id: 'm4', index: 3, top: 488, bottom: 612, height: 124 },
    ];

    expect(
      resolveVisibleChatMessageRange(items, {
        anchorTail: true,
        scrollTop: 40,
        viewportHeight: 180,
        overscan: 0,
      }),
    ).toEqual({
      start: 2,
      end: 4,
    });
  });

  it('resolves tighter overscan values for active and tail-anchored states', () => {
    expect(resolveChatMessageListOverscan({
      viewportHeight: 0,
    })).toBe(480);

    expect(resolveChatMessageListOverscan({
      isSessionActive: true,
      viewportHeight: 600,
    })).toBe(CHAT_MESSAGE_LIST_ACTIVE_OVERSCAN);

    expect(resolveChatMessageListOverscan({
      anchorTail: true,
      isSessionActive: true,
      viewportHeight: 600,
    })).toBe(CHAT_MESSAGE_LIST_TAIL_OVERSCAN);
  });

  it('uses smaller overscan to tighten the visible slice', () => {
    const items = [
      { id: 'm1', index: 0, top: 0, bottom: 100, height: 100 },
      { id: 'm2', index: 1, top: 132, bottom: 232, height: 100 },
      { id: 'm3', index: 2, top: 264, bottom: 364, height: 100 },
      { id: 'm4', index: 3, top: 396, bottom: 496, height: 100 },
      { id: 'm5', index: 4, top: 528, bottom: 628, height: 100 },
      { id: 'm6', index: 5, top: 660, bottom: 760, height: 100 },
    ];

    expect(findVisibleChatMessageRange(items, 300, 120, 480)).toEqual({
      start: 0,
      end: 6,
    });

    expect(findVisibleChatMessageRange(items, 300, 120, 96)).toEqual({
      start: 1,
      end: 4,
    });
  });

  it('restores cached measured heights for the same session and width', () => {
    const message = createMessage('u1', 'user', 'hello world');
    rememberMeasuredChatMessageHeight(message, {
      cacheKey: 'chat-1',
      containerWidth: 900,
      isSessionActive: false,
      height: 144,
    });

    const restored = restoreCachedMeasuredHeights([message], {
      cacheKey: 'chat-1',
      containerWidth: 900,
      isSessionActive: false,
    });

    expect(restored.get('u1')).toBe(144);
  });

  it('does not restore measured heights across markdown font sizes', () => {
    const message = createMessage('font-size-cache', 'assistant', 'hello world');
    rememberMeasuredChatMessageHeight(message, {
      cacheKey: 'chat-font-size-cache',
      containerWidth: 900,
      fontSize: 17,
      isSessionActive: false,
      height: 144,
    });

    const restored = restoreCachedMeasuredHeights([message], {
      cacheKey: 'chat-font-size-cache',
      containerWidth: 900,
      fontSize: 34,
      isSessionActive: false,
    });

    expect(restored.has(message.id)).toBe(false);
  });

  it('restores cached measured heights across nearby widths in the same bucket', () => {
    const message = createMessage('u2', 'assistant', 'hello world');
    rememberMeasuredChatMessageHeight(message, {
      cacheKey: 'chat-3',
      containerWidth: 721,
      isSessionActive: false,
      height: 188,
    });

    const restored = restoreCachedMeasuredHeights([message], {
      cacheKey: 'chat-3',
      containerWidth: 727,
      isSessionActive: false,
    });

    expect(restored.get('u2')).toBe(188);
  });

  it('invalidates cached measured heights when the message signature changes', () => {
    const first = createMessage('u1', 'user', 'first version');
    rememberMeasuredChatMessageHeight(first, {
      cacheKey: 'chat-2',
      containerWidth: 900,
      isSessionActive: false,
      height: 132,
    });

    const updated = {
      ...first,
      content: 'second version',
      currentVersionIndex: 1,
      versions: [
        ...first.versions,
        { content: 'second version', createdAt: first.timestamp + 1, kind: 'original' as const, subsequentMessages: [] },
      ],
    };

    const restored = restoreCachedMeasuredHeights([updated], {
      cacheKey: 'chat-2',
      containerWidth: 900,
      isSessionActive: false,
    });

    expect(restored.has('u1')).toBe(false);
  });

  it('invalidates cached measured heights when a version is replaced at the same index', () => {
    const previous = createMessage('a-replaced-version', 'assistant', '');
    rememberMeasuredChatMessageHeight(previous, {
      cacheKey: 'chat-replaced-version',
      containerWidth: 900,
      isSessionActive: true,
      height: 520,
    });

    const replacement = {
      ...previous,
      versions: [{
        content: '',
        createdAt: previous.timestamp + 1,
        kind: 'regeneration' as const,
        subsequentMessages: [],
      }],
    };
    const restored = restoreCachedMeasuredHeights([replacement], {
      activeMessageId: replacement.id,
      cacheKey: 'chat-replaced-version',
      containerWidth: 900,
      isSessionActive: true,
    });

    expect(restored.has(replacement.id)).toBe(false);
  });

  it('does not restore measured heights across idle and active session states', () => {
    const message = createMessage('u1', 'user', 'hello world');
    rememberMeasuredChatMessageHeight(message, {
      cacheKey: 'chat-4',
      containerWidth: 900,
      isSessionActive: false,
      height: 144,
    });

    const restored = restoreCachedMeasuredHeights([message], {
      cacheKey: 'chat-4',
      containerWidth: 900,
      isSessionActive: true,
    });

    expect(restored.has('u1')).toBe(false);
  });

  it('uses active measured height cache only for the active tail message', () => {
    const previousAssistant = createMessage('a1', 'assistant', 'previous answer');
    const activeAssistant = createMessage('a2', 'assistant', 'streaming answer');

    rememberMeasuredChatMessageHeight(previousAssistant, {
      cacheKey: 'chat-active-tail',
      containerWidth: 900,
      isSessionActive: false,
      height: 180,
    });
    rememberMeasuredChatMessageHeight(previousAssistant, {
      cacheKey: 'chat-active-tail',
      containerWidth: 900,
      isSessionActive: true,
      height: 420,
    });
    rememberMeasuredChatMessageHeight(activeAssistant, {
      cacheKey: 'chat-active-tail',
      containerWidth: 900,
      isSessionActive: true,
      height: 260,
    });

    const restored = restoreCachedMeasuredHeights([previousAssistant, activeAssistant], {
      activeMessageId: 'a2',
      cacheKey: 'chat-active-tail',
      containerWidth: 900,
      isSessionActive: true,
    });

    expect(restored.get('a1')).toBe(180);
    expect(restored.get('a2')).toBe(260);
  });

  it('builds trailing layout for loading and spacer blocks after messages', () => {
    const messageLayout = {
      endOffset: CHAT_MESSAGE_LIST_TOP_PADDING + 240,
      items: [{ id: 'm1', index: 0, top: CHAT_MESSAGE_LIST_TOP_PADDING, bottom: CHAT_MESSAGE_LIST_TOP_PADDING + 240, height: 240 }],
    };

    const trailing = buildTrailingChatLayout(messageLayout, true, 96);

    expect(trailing.loadingTop).toBe(CHAT_MESSAGE_LIST_TOP_PADDING + 240 + CHAT_MESSAGE_LOADING_GAP);
    expect(trailing.spacerTop).toBe(
      CHAT_MESSAGE_LIST_TOP_PADDING + 240 + CHAT_MESSAGE_LOADING_GAP + 24 + CHAT_MESSAGE_LIST_GAP,
    );
    expect(trailing.totalHeight).toBe(
      CHAT_MESSAGE_LIST_TOP_PADDING + 240 + CHAT_MESSAGE_LOADING_GAP + 24 + CHAT_MESSAGE_LIST_GAP + 96 + CHAT_MESSAGE_LIST_BOTTOM_PADDING,
    );
  });
});
