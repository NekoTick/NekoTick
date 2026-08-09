import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/lib/ai/types';
import { MAX_CHAT_MESSAGE_IMAGE_SOURCES } from '@/components/Chat/common/messageClipboard';
import {
  buildChatDerivativeAggregate,
  createEmptyChatDerivativeAggregate,
  getCachedMessageDerivatives,
  updateChatDerivativeAggregateTail,
} from './chatMessageDerivatives';
import { useStableChatMessageDerivatives } from './useStableChatMessageDerivatives';

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

describe('useStableChatMessageDerivatives aggregate bounds', () => {
  it('reuses the aggregate when streamed assistant text adds no derivatives', () => {
    const user = createMessage('u1', 'user', 'prompt');
    const assistant = createMessage('a1', 'assistant', 'plain response');
    const cache = new Map();
    getCachedMessageDerivatives(cache, user);
    getCachedMessageDerivatives(cache, assistant);
    const aggregate = buildChatDerivativeAggregate(
      [user, assistant],
      cache,
      createEmptyChatDerivativeAggregate(),
    );
    const streamedAssistant = {
      ...assistant,
      content: 'plain response extended',
    };

    const nextAggregate = updateChatDerivativeAggregateTail(
      [assistant],
      [streamedAssistant],
      cache,
      aggregate,
    );

    expect(nextAggregate).toBe(aggregate);
    expect(cache.get(assistant.id)?.message).toBe(streamedAssistant);
  });

  it('bounds the aggregate assistant image gallery across messages', async () => {
    const messages = Array.from(
      { length: MAX_CHAT_MESSAGE_IMAGE_SOURCES + 2 },
      (_, index) => createMessage(
        `a${index}`,
        'assistant',
        `![image](https://example.com/${index}.png)`,
      ),
    );

    const view = renderHook(() => useStableChatMessageDerivatives(messages));

    await waitFor(() => {
      expect(view.result.current.imageGallery).toHaveLength(MAX_CHAT_MESSAGE_IMAGE_SOURCES);
    }, { timeout: 3000 });
    expect(view.result.current.imageGallery.at(0)).toEqual({
      id: 'a0:0',
      src: 'https://example.com/0.png',
    });
    expect(view.result.current.imageGallery.at(-1)).toEqual({
      id: `a${MAX_CHAT_MESSAGE_IMAGE_SOURCES - 1}:0`,
      src: `https://example.com/${MAX_CHAT_MESSAGE_IMAGE_SOURCES - 1}.png`,
    });
  });

  it('keeps only the most recent aggregate sent user messages', async () => {
    const messages = Array.from(
      { length: MAX_CHAT_MESSAGE_IMAGE_SOURCES + 2 },
      (_, index) => createMessage(`u${index}`, 'user', `prompt ${index}`),
    );

    const view = renderHook(() => useStableChatMessageDerivatives(messages));

    await waitFor(() => {
      expect(view.result.current.sentUserMessages).toHaveLength(MAX_CHAT_MESSAGE_IMAGE_SOURCES);
    }, { timeout: 3000 });
    expect(view.result.current.sentUserMessages[0]).toBe('prompt 2');
    expect(view.result.current.sentUserMessages.at(-1)).toBe(
      `prompt ${MAX_CHAT_MESSAGE_IMAGE_SOURCES + 1}`,
    );
  });
});
