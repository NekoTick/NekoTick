import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/lib/ai/types';
import {
  MAX_SESSION_MESSAGES_BYTES,
  serializeSessionMessages,
} from './chatStorage';

function createLargeMessage(id: string, timestamp: number): ChatMessage {
  return {
    id,
    role: 'user',
    content: 'x'.repeat(1024 * 1024),
    modelId: 'model-1',
    timestamp,
    versions: [],
    currentVersionIndex: 0,
  };
}

describe('chatStorage serialization budget', () => {
  it('rejects oversized sessions instead of silently discarding older messages', () => {
    const messages = Array.from({ length: 40 }, (_value, index) =>
      createLargeMessage(`m${index}`, index)
    );

    expect(() => serializeSessionMessages('session-1', messages)).toThrow(
      `Chat session exceeds the ${MAX_SESSION_MESSAGES_BYTES} byte storage limit`,
    );
  });
});
