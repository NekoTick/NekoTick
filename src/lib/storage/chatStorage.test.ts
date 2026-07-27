import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/lib/ai/types';

const mocks = vi.hoisted(() => ({
  storage: {
    getBasePath: vi.fn().mockResolvedValue('/appdata'),
    exists: vi.fn().mockResolvedValue(false),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    stat: vi.fn().mockResolvedValue(null),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  },
  joinPath: vi.fn(async (...parts: string[]) => parts.join('/')),
}));

vi.mock('@/lib/storage/adapter', () => ({
  getStorageAdapter: () => mocks.storage,
  joinPath: mocks.joinPath,
}));

import {
  MAX_CHAT_SESSION_FLUSH_CONCURRENCY,
  MAX_SESSION_MESSAGES_BYTES,
  MAX_SESSION_MESSAGE_NODES,
  MAX_SESSION_MESSAGE_SCAN_RECORDS,
  normalizeSessionMessages,
  mergeSessionMessages,
  parseSessionMessagesPayload,
  preserveUnknownPersistedMessages,
  registerChatStorageAutoSyncTrigger,
  cancelSessionJsonSave,
  flushPendingSessionJsonSave,
  loadSessionJson,
  deleteSessionJson,
  saveSessionJson,
  scheduleSessionJsonSave,
  serializeSessionMessages,
  setChatStorageAutoSyncTrigger,
  flushPendingSessionJsonSaves,
} from './chatStorage';
import {
  clearChatStorageStatus,
  getChatStorageStatusSnapshot,
} from './chatStorageStatus';

describe('chatStorage session message normalization', () => {
  it('serializes session files with an explicit envelope', () => {
    vi.setSystemTime(new Date('2026-05-09T00:00:00Z'));

    const payload = JSON.parse(serializeSessionMessages('session-1', [{
      id: 'm1',
      role: 'user',
      content: 'hello',
      modelId: 'model-1',
      timestamp: 1,
      versions: [{ content: 'hello', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }],
      currentVersionIndex: 0,
    }]));

    expect(payload).toMatchObject({
      version: 1,
      sessionId: 'session-1',
      updatedAt: Date.parse('2026-05-09T00:00:00Z'),
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'hello',
        },
      ],
    });
  });

  it('normalizes session messages before serializing them to disk', () => {
    const payload = JSON.parse(serializeSessionMessages('session-1', [{
      id: 'm1',
      role: 'user',
      content: [
        '![unsafe](<http://127.0.0.1:3000/secret.png>)',
        '![safe](<attachment://safe.png>)',
        '![inline](<DATA:IMAGE/PNG;BASE64,AQI=>)',
        '![svg](<data:image/svg+xml;base64,PHN2Zz4=>)',
        '![video](<https://example.com/movie.mp4>)',
        'Describe it',
      ].join('\n'),
      modelId: 'model-1',
      timestamp: 1,
      versions: [{
        content: [
          '![unsafe](<http://127.0.0.1:3000/secret.png>)',
          '![safe](<attachment://safe.png>)',
          '![inline](<DATA:IMAGE/PNG;BASE64,AQI=>)',
          '![svg](<data:image/svg+xml;base64,PHN2Zz4=>)',
          '![video](<https://example.com/movie.mp4>)',
          'Describe it',
        ].join('\n'),
        createdAt: 1,
        kind: 'original' as const,
        subsequentMessages: [],
      }],
      currentVersionIndex: 0,
      imageSources: [
        'DATA:IMAGE/PNG;BASE64,AQI=',
        'http://127.0.0.1:3000/secret.png',
        'data:image/svg+xml;base64,PHN2Zz4=',
        'https://example.com/movie.mp4',
        'attachment://safe.png',
      ],
    }]));

    expect(payload.messages[0].imageSources).toEqual([
      'attachment://safe.png',
      'data:image/png;base64,AQI=',
    ]);
  });

  it('preserves safe bounded request context snapshots', () => {
    const serialized = serializeSessionMessages('session-1', [{
      id: 'm1',
      role: 'user',
      content: '@notes.md',
      requestContext: {
        text: 'Attached file body',
        imageSources: ['attachment://diagram.png', 'file:///tmp/private.png'],
        attachmentSources: ['attachment://notes.md', '../private.txt'],
      },
      modelId: 'model-1',
      timestamp: 1,
      versions: [],
      currentVersionIndex: 0,
    }]);
    const payload = JSON.parse(serialized);

    expect(payload.messages[0].requestContext).toEqual({
      text: 'Attached file body',
      imageSources: ['attachment://diagram.png'],
      attachmentSources: ['attachment://notes.md'],
    });
    expect(payload.messages[0].versions[0].requestContext).toEqual(
      payload.messages[0].requestContext,
    );
  });

  it('does not serialize relative or bare images as session image source caches', () => {
    const payload = JSON.parse(serializeSessionMessages('session-1', [{
      id: 'm1',
      role: 'user',
      content: [
        '![local](<images/demo.png>)',
        '![bare](<demo.png>)',
      ].join('\n'),
      modelId: 'model-1',
      timestamp: 1,
      versions: [],
      currentVersionIndex: 0,
      imageSources: ['images/demo.png', 'demo.png'],
    }]));

    expect(payload.messages[0].imageSources).toBeUndefined();
  });

  it('rejects oversized serialized session message files', () => {
    const messageContent = 'x'.repeat(1024 * 1024);
    const messages = Array.from({ length: 40 }, (_, index) => ({
      id: `m${index}`,
      role: 'user' as const,
      content: messageContent,
      modelId: 'model-1',
      timestamp: index + 1,
      versions: [],
      currentVersionIndex: 0,
    }));

    expect(() => serializeSessionMessages('session-1', messages)).toThrow(
      `Chat session exceeds the ${MAX_SESSION_MESSAGES_BYTES} byte storage limit`,
    );
  });

  it('applies the serialized session limit to UTF-8 bytes', () => {
    const messageContent = '你'.repeat(1024 * 1024);
    const messages = Array.from({ length: 9 }, (_, index) => ({
      id: `m${index}`,
      role: 'user' as const,
      content: messageContent,
      modelId: 'model-1',
      timestamp: index + 1,
      versions: [],
      currentVersionIndex: 0,
    }));

    expect(() => serializeSessionMessages('session-1', messages)).toThrow(
      `Chat session exceeds the ${MAX_SESSION_MESSAGES_BYTES} byte storage limit`,
    );
  });

  it('loads only matching versioned session envelopes', () => {
    const messages = parseSessionMessagesPayload('session-1', {
      version: 1,
      sessionId: 'session-1',
      updatedAt: 1,
      messages: [{
        id: 'm1',
        role: 'assistant',
        content: 'answer',
        modelId: 'model-1',
        timestamp: 1,
      }],
    });

    expect(messages?.[0]).toMatchObject({
      id: 'm1',
      role: 'assistant',
      content: 'answer',
      currentVersionIndex: 0,
    });
    expect(parseSessionMessagesPayload('session-2', {
      version: 1,
      sessionId: 'session-1',
      messages: [],
    })).toBeNull();
    expect(parseSessionMessagesPayload('session-1', [])).toBeNull();
  });

  it('keeps persisted messages that an incoming stale write does not know about', () => {
    const incoming = normalizeSessionMessages([
      { id: 'm1', role: 'user', content: 'hello', modelId: 'model-1', timestamp: 1 },
    ]);
    const persisted = normalizeSessionMessages([
      { id: 'm1', role: 'user', content: 'hello', modelId: 'model-1', timestamp: 1 },
      { id: 'm2', role: 'assistant', content: 'newer answer', modelId: 'model-1', timestamp: 2 },
    ]);

    expect(preserveUnknownPersistedMessages(incoming, persisted).map((message) => message.id)).toEqual([
      'm1',
      'm2',
    ]);
  });

  it('does not duplicate messages already preserved inside a branch version', () => {
    const incoming = normalizeSessionMessages([
      {
        id: 'm1',
        role: 'user',
        content: 'edited',
        modelId: 'model-1',
        timestamp: 1,
        versions: [{
          content: 'original',
          createdAt: 1,
          kind: 'edit' as const,
          subsequentMessages: [
            { id: 'm2', role: 'assistant', content: 'older answer', modelId: 'model-1', timestamp: 2 },
          ],
        }],
      },
    ]);
    const persisted = normalizeSessionMessages([
      { id: 'm1', role: 'user', content: 'original', modelId: 'model-1', timestamp: 1 },
      { id: 'm2', role: 'assistant', content: 'older answer', modelId: 'model-1', timestamp: 2 },
    ]);

    expect(preserveUnknownPersistedMessages(incoming, persisted).map((message) => message.id)).toEqual(['m1']);
  });

  it('keeps the preferred message when the same message id changed', () => {
    const incoming = normalizeSessionMessages([
      { id: 'm1', role: 'user', content: 'local edit', modelId: 'model-1', timestamp: 1 },
    ]);
    const persisted = normalizeSessionMessages([
      { id: 'm1', role: 'user', content: 'other window edit', modelId: 'model-1', timestamp: 2 },
    ]);

    const merged = mergeSessionMessages(incoming, persisted, { preferredSource: 'incoming' });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.content).toBe('local edit');
    expect(merged[0]?.versions.map((version) => version.content)).toEqual(['local edit']);
  });

  it('can prefer the persisted message without creating visible versions from local edits', () => {
    const incoming = normalizeSessionMessages([
      { id: 'm1', role: 'user', content: 'local edit', modelId: 'model-1', timestamp: 1 },
    ]);
    const persisted = normalizeSessionMessages([
      { id: 'm1', role: 'user', content: 'other window edit', modelId: 'model-1', timestamp: 2 },
    ]);

    const merged = mergeSessionMessages(incoming, persisted, { preferredSource: 'persisted' });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.content).toBe('other window edit');
    expect(merged[0]?.versions.map((version) => version.content)).toEqual(['other window edit']);
  });

  it('matches API transcript versions without stringifying transcript messages', () => {
    const transcript = [
      {
        role: 'assistant',
        content: [
          { type: 'text' as const, text: 'answer' },
          { type: 'image_url' as const, image_url: { url: 'attachment://safe.png', detail: 'low' as const } },
        ],
        reasoning_content: 'hidden',
        tool_calls: [{
          id: 'call-1',
          type: 'function' as const,
          function: { name: 'web_search', arguments: '{"query":"sample"}' },
        }],
      },
      { role: 'tool', tool_call_id: 'call-1', name: 'web_search', content: 'result' },
    ];
    const incoming = normalizeSessionMessages([{
      id: 'm1',
      role: 'assistant',
      content: 'answer',
      modelId: 'model-1',
      timestamp: 1,
      apiTranscript: transcript,
      versions: [{
        content: 'answer',
        createdAt: 1,
        kind: 'original' as const,
        subsequentMessages: [],
        apiTranscript: transcript,
      }],
      currentVersionIndex: 0,
    }]);
    const persisted = normalizeSessionMessages([{
      id: 'm1',
      role: 'assistant',
      content: 'answer',
      modelId: 'model-1',
      timestamp: 1,
      apiTranscript: transcript,
      versions: [{
        content: 'answer',
        createdAt: 1,
        kind: 'original' as const,
        subsequentMessages: [],
        apiTranscript: transcript,
      }],
      currentVersionIndex: 0,
    }]);
    const stringifySpy = vi.spyOn(JSON, 'stringify').mockImplementation(() => {
      throw new Error('JSON.stringify should not be used for transcript comparison');
    });

    try {
      const merged = mergeSessionMessages(incoming, persisted, { preferredSource: 'incoming' });

      expect(merged[0]?.currentVersionIndex).toBe(0);
      expect(merged[0]?.versions).toHaveLength(1);
    } finally {
      stringifySpy.mockRestore();
    }
  });

  it('backfills versions for legacy persisted messages', () => {
    vi.setSystemTime(new Date('2026-05-09T00:00:00Z'));

    const messages = normalizeSessionMessages([{
      id: 'm1',
      role: 'assistant',
      content: 'Legacy answer',
      modelId: 'model-1',
      timestamp: 1,
      apiTranscript: [{ role: 'assistant', content: 'Legacy answer', reasoning_content: 'hidden' }],
    }]);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: 'm1',
      role: 'assistant',
      content: 'Legacy answer',
      currentVersionIndex: 0,
    });
    expect(messages[0]?.versions).toEqual([{
      content: 'Legacy answer',
      createdAt: 1,
      kind: 'original' as const,
      subsequentMessages: [],
      apiTranscript: [{ role: 'assistant', content: 'Legacy answer', reasoning_content: 'hidden' }],
    }]);
  });

  it('drops untyped persisted versions instead of exposing storage artifacts as chat choices', () => {
    const messages = normalizeSessionMessages([{
      id: 'm1',
      role: 'assistant',
      content: 'Current answer',
      modelId: 'model-1',
      timestamp: 3,
      versions: [
        { content: 'Stream snapshot 1', createdAt: 1, subsequentMessages: [] },
        { content: 'Stream snapshot 2', createdAt: 2, subsequentMessages: [] },
      ],
    }]);

    expect(messages[0]?.versions).toEqual([{
      content: 'Current answer',
      createdAt: 3,
      kind: 'original' as const,
      subsequentMessages: [],
    }]);
  });

  it('drops version kinds that do not match the message role', () => {
    const messages = normalizeSessionMessages([{
      id: 'm1',
      role: 'assistant',
      content: 'Current answer',
      modelId: 'model-1',
      timestamp: 3,
      versions: [
        { content: 'Original answer', createdAt: 1, kind: 'original', subsequentMessages: [] },
        { content: 'Bad edit artifact', createdAt: 2, kind: 'edit', subsequentMessages: [] },
      ],
    }]);

    expect(messages[0]?.versions).toEqual([{
      content: 'Original answer',
      createdAt: 1,
      kind: 'original' as const,
      subsequentMessages: [],
    }]);
  });

  it('clamps invalid current version indexes and recursively normalizes branch messages', () => {
    const messages = normalizeSessionMessages([{
      id: 'm1',
      role: 'user',
      content: 'Edited prompt',
      modelId: 'model-1',
      timestamp: 1,
      currentVersionIndex: 99,
      versions: [{
        content: 'Original prompt',
        createdAt: 1,
        kind: 'edit' as const,
        subsequentMessages: [{
          id: 'a1',
          role: 'assistant',
          content: 'Legacy branch answer',
          modelId: 'model-1',
          timestamp: 2,
        }],
      }],
    }]);

    expect(messages[0]?.currentVersionIndex).toBe(0);
    expect(messages[0]?.versions[0]?.subsequentMessages[0]).toMatchObject({
      id: 'a1',
      role: 'assistant',
      content: 'Legacy branch answer',
      currentVersionIndex: 0,
      versions: [{
        content: 'Legacy branch answer',
        createdAt: 2,
        kind: 'original' as const,
        subsequentMessages: [],
      }],
    });
  });

  it('drops invalid message records instead of exposing malformed chat state', () => {
    const messages = normalizeSessionMessages([
      { id: 'bad-role', role: 'tool', content: 'bad' },
      null,
      { id: 'ok', role: 'user', content: 'hello', modelId: 'model-1', timestamp: 1 },
    ]);

    expect(messages.map((message) => message.id)).toEqual(['ok']);
  });

  it('does not let invalid message records spend the restored message node budget', () => {
    const messages = normalizeSessionMessages([
      ...Array.from({ length: MAX_SESSION_MESSAGE_NODES }, (_, index) => ({
        id: `invalid-${index}`,
        role: 'tool',
        content: 'bad',
      })),
      { id: 'ok-1', role: 'user', content: 'hello', modelId: 'model-1', timestamp: 1 },
      { id: 'ok-2', role: 'assistant', content: 'hi', modelId: 'model-1', timestamp: 2 },
    ]);

    expect(messages.map((message) => message.id)).toEqual(['ok-1', 'ok-2']);
  });

  it('caps oversized persisted message fields during normalization', () => {
    const oversizedContent = 'x'.repeat(1024 * 1024 + 1);
    const oversizedModelId = 'model-'.repeat(200);

    const messages = normalizeSessionMessages([{
      id: 'm1',
      role: 'assistant',
      content: oversizedContent,
      modelId: oversizedModelId,
      timestamp: 1,
      versions: [{
        content: oversizedContent,
        createdAt: 1,
        kind: 'original' as const,
        subsequentMessages: [],
      }],
      currentVersionIndex: 0,
    }]);

    expect(messages[0]?.content).toHaveLength(1024 * 1024);
    expect(messages[0]?.versions[0]?.content).toHaveLength(1024 * 1024);
    expect(messages[0]?.modelId).toHaveLength(512);
  });

  it('does not scan top-level persisted message ids beyond the scan budget', () => {
    const overBudgetMessage = {
      get id() {
        throw new Error('Out-of-budget message ids should not be scanned');
      },
      role: 'user',
      content: 'out of budget',
      modelId: 'model-1',
      timestamp: 1,
    };
    const messages = [
      ...Array.from({ length: MAX_SESSION_MESSAGE_SCAN_RECORDS }, (_, index) => ({
        id: `m${index}`,
        role: 'user',
        content: `message ${index}`,
        modelId: 'model-1',
        timestamp: 1,
      })),
      overBudgetMessage,
    ];

    const normalized = normalizeSessionMessages(messages);

    expect(normalized).toHaveLength(MAX_SESSION_MESSAGE_NODES);
    expect(normalized.at(-1)?.id).toBe(`m${MAX_SESSION_MESSAGE_NODES - 1}`);
  });

  it('filters derived image source caches before exposing restored messages', () => {
    const messages = normalizeSessionMessages([{
      id: 'm1',
      role: 'user',
      content: [
        '![unsafe](<http://127.0.0.1:3000/secret.png>)',
        '![inline](<DATA:IMAGE/PNG;BASE64,AQI=>)',
        '![svg](<data:image/svg+xml;base64,PHN2Zz4=>)',
        '![video](<https://example.com/movie.mp4>)',
        '![safe](<attachment://safe.png>)',
        '![traversal](<attachment://..%2Fsecret.png>)',
        '![relative](<images/demo.png>)',
        '![bare](<demo.png>)',
        'Describe it',
      ].join('\n'),
      modelId: 'model-1',
      timestamp: 1,
      imageSources: [
        'DATA:IMAGE/PNG;BASE64,AQI=',
        'http://127.0.0.1:3000/secret.png',
        'data:image/svg+xml;base64,PHN2Zz4=',
        'https://example.com/movie.mp4',
        'attachment://safe.png',
        'attachment://..%2Fsecret.png',
        'images/demo.png',
        'demo.png',
        42,
      ],
    }]);

    expect(messages[0]?.imageSources).toEqual([
      'data:image/png;base64,AQI=',
      'attachment://safe.png',
    ]);
  });

  it('normalizes hidden API transcripts before they can be replayed', () => {
    const messages = normalizeSessionMessages([{
      id: 'm1',
      role: 'assistant',
      content: 'answer',
      modelId: 'model-1',
      timestamp: 1,
      apiTranscript: [
        {
          role: 'assistant',
          content: null,
          reasoning_content: 'hidden',
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"catime"}' },
            },
            { id: 'bad', type: 'function', function: { name: 'broken', arguments: 1 } },
          ],
        },
        { role: 'tool', content: 'missing tool id' },
        { role: 'tool', tool_call_id: 'call-1', name: 'web_search', content: 'result' },
        { role: 'invalid', content: 'bad' },
      ],
    }]);

    expect(messages[0]?.apiTranscript).toEqual([
      {
        role: 'assistant',
        content: '',
        reasoning_content: 'hidden',
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'web_search', arguments: '{"query":"catime"}' },
        }],
      },
      { role: 'tool', content: 'result', tool_call_id: 'call-1', name: 'web_search' },
    ]);
    expect(messages[0]?.versions[0]?.apiTranscript).toEqual(messages[0]?.apiTranscript);
  });

  it('drops orphan tool transcript messages while filling required content fields', () => {
    const messages = normalizeSessionMessages([{
      id: 'm1',
      role: 'assistant',
      content: 'answer',
      modelId: 'model-1',
      timestamp: 1,
      apiTranscript: [
        { role: 'system' },
        { role: 'user' },
        { role: 'tool', tool_call_id: 'call-1' },
      ],
    }]);

    expect(messages[0]?.apiTranscript).toEqual([
      { role: 'system', content: '' },
      { role: 'user', content: '' },
    ]);
  });
});

function createMessage(id: string): ChatMessage {
  return {
    id,
    role: 'user',
    content: id,
    modelId: 'model-1',
    timestamp: 1,
    versions: [],
    currentVersionIndex: 0,
  };
}

describe('chatStorage auto sync registration', () => {
  beforeEach(() => {
    mocks.storage.getBasePath.mockClear();
    mocks.storage.exists.mockClear();
    mocks.storage.exists.mockResolvedValue(false);
    mocks.storage.mkdir.mockClear();
    mocks.storage.readFile.mockReset();
    mocks.storage.stat.mockReset();
    mocks.storage.stat.mockResolvedValue(null);
    mocks.storage.writeFile.mockClear();
    mocks.storage.deleteFile.mockClear();
    mocks.joinPath.mockClear();
    mocks.joinPath.mockImplementation(async (...parts: string[]) => parts.join('/'));
    setChatStorageAutoSyncTrigger(null);
    clearChatStorageStatus('session-1');
  });

  it('keeps the newest chat-session auto-sync trigger when an older registration is disposed', async () => {
    const staleTrigger = vi.fn();
    const activeTrigger = vi.fn();
    const unregisterStale = registerChatStorageAutoSyncTrigger(staleTrigger);
    const unregisterActive = registerChatStorageAutoSyncTrigger(activeTrigger);

    unregisterStale();

    await saveSessionJson('session-1', [createMessage('m1')]);

    expect(staleTrigger).not.toHaveBeenCalled();
    expect(activeTrigger).toHaveBeenCalledTimes(1);
    expect(activeTrigger).toHaveBeenCalledWith('session-1');

    unregisterActive();
  });

  it('reads existing session files with bounded reads while saving when stat has no size', async () => {
    mocks.storage.exists.mockImplementation(async (path: string) => (
      path === '/appdata/.vlaina/chat/sessions/session-1/messages.json'
    ));
    mocks.storage.stat.mockResolvedValue({ isFile: true });
    mocks.storage.readFile.mockResolvedValue(JSON.stringify({
      version: 1,
      sessionId: 'session-1',
      updatedAt: 1,
      messages: [{
        id: 'm0',
        role: 'assistant',
        content: 'persisted',
        modelId: 'model-1',
        timestamp: 1,
      }],
    }));

    await saveSessionJson('session-1', [createMessage('m1')]);

    expect(mocks.storage.readFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      MAX_SESSION_MESSAGES_BYTES,
    );
    expect(mocks.storage.writeFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      expect.stringContaining('"m1"'),
    );
    expect(mocks.storage.writeFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      expect.stringContaining('"m0"'),
    );
  });

  it('replaces persisted messages for authoritative destructive mutations', async () => {
    mocks.storage.exists.mockImplementation(async (path: string) => (
      path === '/appdata/.vlaina/chat/sessions/session-1/messages.json'
    ));
    mocks.storage.stat.mockResolvedValue({ isFile: true, size: 200 });
    mocks.storage.readFile.mockResolvedValue(JSON.stringify({
      version: 1,
      sessionId: 'session-1',
      updatedAt: 1,
      messages: [{
        id: 'retracted-message',
        role: 'user',
        content: 'do not restore',
        modelId: 'model-1',
        timestamp: 1,
      }],
    }));

    await saveSessionJson('session-1', [createMessage('kept-message')], {
      mergePersisted: false,
    });

    expect(mocks.storage.readFile).not.toHaveBeenCalled();
    const serialized = mocks.storage.writeFile.mock.calls.at(-1)?.[1] as string;
    expect(serialized).toContain('"kept-message"');
    expect(serialized).not.toContain('"retracted-message"');
  });

  it('does not merge existing session files while saving when content exceeds the limit after read', async () => {
    mocks.storage.exists.mockImplementation(async (path: string) => (
      path === '/appdata/.vlaina/chat/sessions/session-1/messages.json'
    ));
    mocks.storage.stat.mockResolvedValue({ isFile: true, size: 200 });
    mocks.storage.readFile.mockResolvedValue('x'.repeat(25 * 1024 * 1024 + 1));

    await saveSessionJson('session-1', [createMessage('m1')]);

    expect(mocks.storage.readFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      MAX_SESSION_MESSAGES_BYTES,
    );
    expect(mocks.storage.writeFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      expect.stringContaining('"m1"'),
    );
  });

  it('overwrites unreadable existing session files instead of leaving saves pending', async () => {
    mocks.storage.exists.mockImplementation(async (path: string) => (
      path === '/appdata/.vlaina/chat/sessions/session-1/messages.json'
    ));
    mocks.storage.stat.mockResolvedValue({ isFile: true, size: 200 });
    mocks.storage.readFile.mockResolvedValue('{broken json');

    await expect(saveSessionJson('session-1', [createMessage('m1')])).resolves.toBeUndefined();

    expect(mocks.storage.readFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      MAX_SESSION_MESSAGES_BYTES,
    );
    expect(mocks.storage.writeFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      expect.stringContaining('"m1"'),
    );
  });

  it('overwrites existing session files that disappear after stat', async () => {
    mocks.storage.exists.mockImplementation(async (path: string) => (
      path === '/appdata/.vlaina/chat/sessions/session-1/messages.json'
    ));
    mocks.storage.stat.mockResolvedValue({ isFile: true, size: 200 });
    mocks.storage.readFile.mockRejectedValue(new Error('file disappeared'));

    await expect(saveSessionJson('session-1', [createMessage('m1')])).resolves.toBeUndefined();

    expect(mocks.storage.readFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      MAX_SESSION_MESSAGES_BYTES,
    );
    expect(mocks.storage.writeFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      expect.stringContaining('"m1"'),
    );
  });

  it('reports failed session writes until a later save succeeds', async () => {
    mocks.storage.writeFile.mockRejectedValueOnce(new Error('disk busy'));

    await expect(saveSessionJson('session-1', [createMessage('m1')])).rejects.toThrow('disk busy');
    expect(getChatStorageStatusSnapshot()['session-1']).toBe('saveFailed');

    await expect(saveSessionJson('session-1', [createMessage('m1')])).resolves.toBeUndefined();
    expect(getChatStorageStatusSnapshot()['session-1']).toBeUndefined();
  });

  it('flushes only the requested session queue', async () => {
    scheduleSessionJsonSave('session-1', [createMessage('m1')], 10_000);
    scheduleSessionJsonSave('session-2', [createMessage('m2')], 10_000);

    await flushPendingSessionJsonSave('session-1');
    cancelSessionJsonSave('session-2');

    expect(mocks.storage.writeFile).toHaveBeenCalledTimes(1);
    expect(mocks.storage.writeFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      expect.stringContaining('"m1"'),
    );
  });

  it('limits concurrent writes while flushing all pending session queues', async () => {
    let activeWrites = 0;
    let maxActiveWrites = 0;
    const resolveWrites: Array<() => void> = [];
    mocks.storage.writeFile.mockImplementation(async () => {
      activeWrites += 1;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      await new Promise<void>((resolve) => {
        resolveWrites.push(resolve);
      });
      activeWrites -= 1;
    });

    for (let index = 0; index < MAX_CHAT_SESSION_FLUSH_CONCURRENCY + 3; index += 1) {
      scheduleSessionJsonSave(`session-${index}`, [createMessage(`m${index}`)], 10_000);
    }

    const flushRequest = flushPendingSessionJsonSaves();
    await vi.waitFor(() => {
      expect(resolveWrites).toHaveLength(MAX_CHAT_SESSION_FLUSH_CONCURRENCY);
    });

    expect(maxActiveWrites).toBeLessThanOrEqual(MAX_CHAT_SESSION_FLUSH_CONCURRENCY);
    while (resolveWrites.length > 0) {
      resolveWrites.shift()?.();
      await Promise.resolve();
    }
    await vi.waitFor(() => {
      expect(mocks.storage.writeFile).toHaveBeenCalledTimes(MAX_CHAT_SESSION_FLUSH_CONCURRENCY + 3);
    });
    while (resolveWrites.length > 0) {
      resolveWrites.shift()?.();
      await Promise.resolve();
    }

    await expect(flushRequest).resolves.toBeUndefined();
    expect(maxActiveWrites).toBeLessThanOrEqual(MAX_CHAT_SESSION_FLUSH_CONCURRENCY);
  });

  it('loads session files with bounded reads when stat has no size', async () => {
    mocks.storage.exists.mockResolvedValue(true);
    mocks.storage.stat.mockResolvedValue({ isFile: true });
    mocks.storage.readFile.mockResolvedValue(JSON.stringify({
      version: 1,
      sessionId: 'session-1',
      updatedAt: 1,
      messages: [{
        id: 'm1',
        role: 'user',
        content: 'hello',
        modelId: 'model-1',
        timestamp: 1,
      }],
    }));

    await expect(loadSessionJson('session-1')).resolves.toMatchObject([
      {
        id: 'm1',
        role: 'user',
        content: 'hello',
      },
    ]);

    expect(mocks.storage.readFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      MAX_SESSION_MESSAGES_BYTES,
    );
  });

  it('does not load session files with invalid known stat sizes', async () => {
    mocks.storage.exists.mockResolvedValue(true);
    mocks.storage.stat.mockResolvedValue({ isFile: true, size: -1 });
    mocks.storage.readFile.mockRejectedValue(new Error('Invalid stat size should not be read'));

    await expect(loadSessionJson('session-1')).resolves.toBeNull();

    expect(mocks.storage.readFile).not.toHaveBeenCalled();
  });

  it('does not load session content that exceeds the limit after read', async () => {
    mocks.storage.exists.mockResolvedValue(true);
    mocks.storage.stat.mockResolvedValue({ isFile: true, size: 200 });
    mocks.storage.readFile.mockResolvedValue('x'.repeat(25 * 1024 * 1024 + 1));

    await expect(loadSessionJson('session-1')).resolves.toBeNull();

    expect(mocks.storage.readFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      MAX_SESSION_MESSAGES_BYTES,
    );
  });

  it('does not load session files that disappear after stat', async () => {
    mocks.storage.exists.mockResolvedValue(true);
    mocks.storage.stat.mockResolvedValue({ isFile: true, size: 200 });
    mocks.storage.readFile.mockRejectedValue(new Error('file disappeared'));

    await expect(loadSessionJson('session-1')).resolves.toBeNull();

    expect(mocks.storage.readFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/sessions/session-1/messages.json',
      MAX_SESSION_MESSAGES_BYTES,
    );
  });

  it('deletes session files even when a canceled in-flight save fails', async () => {
    let rejectWrite!: (error: Error) => void;
    mocks.storage.exists.mockImplementation(async (path: string) => (
      path === '/appdata/.vlaina/chat/sessions/session-1/messages.json'
    ));
    mocks.storage.writeFile.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectWrite = reject;
    }));

    const saveRequest = saveSessionJson('session-1', [createMessage('m1')]).catch(() => undefined);
    await vi.waitFor(() => {
      expect(mocks.storage.writeFile).toHaveBeenCalledWith(
        '/appdata/.vlaina/chat/sessions/session-1/messages.json',
        expect.stringContaining('"m1"'),
      );
    });

    const deleteRequest = deleteSessionJson('session-1');
    rejectWrite(new Error('disk busy'));

    await expect(deleteRequest).resolves.toBeUndefined();
    await saveRequest;
    expect(mocks.storage.deleteFile).toHaveBeenCalledWith('/appdata/.vlaina/chat/sessions/session-1/messages.json');
  });

  it('ignores stale session saves while and after deleting the session file', async () => {
    let resolveDelete!: () => void;
    const sessionId = 'session-delete-guard';
    const sessionPath = `/appdata/.vlaina/chat/sessions/${sessionId}/messages.json`;
    mocks.storage.exists.mockImplementation(async (path: string) => path === sessionPath);
    mocks.storage.deleteFile.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveDelete = resolve;
    }));

    const deleteRequest = deleteSessionJson(sessionId);
    await vi.waitFor(() => expect(mocks.storage.deleteFile).toHaveBeenCalledWith(sessionPath));

    await saveSessionJson(sessionId, [createMessage('during-delete')]);
    scheduleSessionJsonSave(sessionId, [createMessage('scheduled-during-delete')], 0);
    await Promise.resolve();

    resolveDelete();
    await deleteRequest;

    await saveSessionJson(sessionId, [createMessage('after-delete')]);
    scheduleSessionJsonSave(sessionId, [createMessage('scheduled-after-delete')], 0);
    await Promise.resolve();

    expect(mocks.storage.writeFile).not.toHaveBeenCalled();
  });
});
