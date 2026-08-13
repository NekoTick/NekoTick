import { describe, expect, it, vi } from 'vitest';
import { buildRequestHistory, measureRequestJsonLength, sanitizeHistory } from './requestContext';
import type { ChatMessage } from './types';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const content = overrides.content ?? '';
  const timestamp = overrides.timestamp ?? Date.now();
  return {
    id: overrides.id ?? 'm1',
    role: overrides.role ?? 'user',
    content,
    modelId: overrides.modelId ?? 'model-1',
    timestamp,
    ...(overrides.apiTranscript !== undefined ? { apiTranscript: overrides.apiTranscript } : {}),
    ...(overrides.imageSources !== undefined ? { imageSources: overrides.imageSources } : {}),
    ...(overrides.requestContext !== undefined ? { requestContext: overrides.requestContext } : {}),
    versions:
      overrides.versions ?? [{ content, createdAt: timestamp, kind: 'original' as const, subsequentMessages: [] }],
    currentVersionIndex: overrides.currentVersionIndex ?? 0,
  };
}

describe('requestContext', () => {
  it('measures JSON length without serializing the full value', () => {
    const value = [
      {
        role: 'assistant',
        content: 'quote " slash \\ newline \n emoji 😀 lone \uD800',
        reasoning_content: 'hidden',
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'web_search', arguments: '{"query":"x"}' },
        }],
      },
      undefined,
      null,
    ];
    const serialized = JSON.stringify(value);

    expect(measureRequestJsonLength(value, serialized.length + 1)).toBe(serialized.length);
    expect(measureRequestJsonLength(value, 16)).toBeGreaterThan(16);
  });

  it('prepends custom system prompt and time context when enabled', () => {
    const history = [
      createMessage({ role: 'user', content: 'hello there' }),
      createMessage({ role: 'assistant', content: 'hi' }),
    ];

    const result = buildRequestHistory({
      history,
      modelId: 'model-1',
      timezoneOffset: 8,
      includeTimeContext: true,
      customSystemPrompt: 'Always answer in Chinese',
    });

    const systemMessages = result.filter((msg) => msg.role === 'system');
    expect(systemMessages).toHaveLength(1);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('Always answer in Chinese');
    expect(result[0].content).toContain('Current Date/Time:');
    expect(result[1].content).toBe('hello there');
  });

  it('clips oversized merged system prompts to the request history budget', () => {
    const result = buildRequestHistory({
      history: [createMessage({ role: 'user', content: 'recent user message' })],
      modelId: 'model-1',
      timezoneOffset: 8,
      includeTimeContext: true,
      customSystemPrompt: 'x'.repeat(100_000),
    });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('system');
    expect(result[0].content.length).toBeLessThanOrEqual(24_000 - 48);
    expect(result[0].content).toContain('[Earlier content omitted]');
    expect(result[0].content).toContain('Current Date/Time:');
  });

  it('skips time context when includeTimeContext is false', () => {
    const history = [createMessage({ role: 'user', content: 'what time is it?' })];

    const result = buildRequestHistory({
      history,
      modelId: 'model-1',
      timezoneOffset: 8,
      includeTimeContext: false,
      customSystemPrompt: 'Reply shortly',
    });

    const systemMessages = result.filter((msg) => msg.role === 'system');
    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0].content).toBe('Reply shortly');
  });

  it('sanitizes markdown image tokens in history', () => {
    const history = [
      createMessage({ role: 'user', content: '![image](attachment://safe.png)\n\ndescribe it' }),
    ];

    const sanitized = sanitizeHistory(history);
    expect(sanitized[0].content).toBe('[Image]\n\ndescribe it');
  });

  it('keeps bounded request snapshots for later chat turns', () => {
    const history = [createMessage({
      role: 'user',
      content: '@notes.md\n\nSummarize this',
      requestContext: {
        text: 'Attached files:\n\n<attached_file name="notes.md">\nPrivate context\n</attached_file>\n\nSummarize this',
        imageSources: ['attachment://diagram.png'],
        attachmentSources: ['attachment://notes.md', 'attachment://diagram.png'],
      },
    })];

    const [sanitized] = sanitizeHistory(history);

    expect(sanitized.requestContext).toEqual(history[0].requestContext);
    expect(sanitized.content).toBe('@notes.md\n\nSummarize this');
  });

  it('drops oversized rich history context when falling back to visible text', () => {
    const result = buildRequestHistory({
      history: [createMessage({
        role: 'user',
        content: 'Visible request',
        requestContext: {
          text: 'Visible request',
          imageSources: [`data:image/png;base64,${'A'.repeat(32_000)}`],
        },
      })],
      modelId: 'model-1',
      timezoneOffset: 8,
      includeTimeContext: false,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe('Visible request');
    expect(result[0]?.requestContext).toBeUndefined();
  });

  it('sanitizes markdown and HTML image tokens in history', () => {
    const content = [
      'Look ![outer [nested]](<attachment://safe.png> "Title") and ![plain](data:image/png;base64,REAL "Title") and ![blocked](asset://localhost/image.png)',
      'Local ![file](file:///tmp/secret.png) and <img src="app-file://attachment/local.png" alt="local">',
      'Watch ![video](https://example.com/movie.mp4)',
      '```md',
      '![example](asset://code.png)',
      '```',
      String.raw`\![literal](asset://escaped.png)`,
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).toBe([
      'Look [Image] and [Image] and [Image]',
      'Local [Image] and [Image]',
      'Watch ![video](https://example.com/movie.mp4)',
      '```md',
      '![example](asset://code.png)',
      '```',
      String.raw`\![literal](asset://escaped.png)`,
    ].join('\n'));
  });

  it('does not leak overflow markdown image sources after the history scan budget is reached', () => {
    const content = [
      ...Array.from({ length: 2000 }, (_, index) => `![image ${index}](attachment://safe-${index}.png)`),
      'Tail ![secret](data:image/png;base64,SECRET) after',
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('data:image/png;base64,SECRET');
    expect(sanitized[0].content).not.toContain('![secret]');
    expect(sanitized[0].content).toContain('Tail [Image] after');
  });

  it('does not leak overflow markdown asset image sources after the history scan budget is reached', () => {
    const content = [
      ...Array.from({ length: 2000 }, (_, index) => `![image ${index}](attachment://safe-${index}.png)`),
      'Tail ![secret](asset://localhost/chat-inline-image/1) after',
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('asset://localhost/chat-inline-image/1');
    expect(sanitized[0].content).not.toContain('![secret]');
    expect(sanitized[0].content).toContain('Tail [Image] after');
  });

  it('keeps overflow markdown image examples inside history code spans', () => {
    const content = [
      ...Array.from({ length: 2000 }, (_, index) => `![image ${index}](attachment://safe-${index}.png)`),
      '`![example](attachment://docs/example.png)`',
      'Tail ![secret](attachment://secret.png) after',
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).toContain('`![example](attachment://docs/example.png)`');
    expect(sanitized[0].content).not.toContain('attachment://secret.png');
    expect(sanitized[0].content).toContain('Tail [Image] after');
  });

  it('scrubs overflow markdown image sources with even backslash prefixes', () => {
    const content = [
      ...Array.from({ length: 2000 }, (_, index) => `![image ${index}](attachment://safe-${index}.png)`),
      String.raw`Tail \\![secret](attachment://secret.png) after`,
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('attachment://secret.png');
    expect(sanitized[0].content).toContain(String.raw`Tail \\[Image] after`);
  });

  it('does not leak oversized markdown image targets after the history scan budget is reached', () => {
    const content = [
      ...Array.from({ length: 2000 }, (_, index) => `![image ${index}](attachment://safe-${index}.png)`),
      `Tail ![secret](<data:image/png;base64,${'A'.repeat(8 * 1024)}>) after`,
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('data:image');
    expect(sanitized[0].content).toContain('Tail [Image] after');
  });

  it('does not leak overflow markdown image sources with long labels after the history scan budget is reached', () => {
    const content = [
      ...Array.from({ length: 2000 }, (_, index) => `![image ${index}](attachment://safe-${index}.png)`),
      `Tail ![${'a'.repeat(2048)}](attachment://secret.png) after`,
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('attachment://secret.png');
    expect(sanitized[0].content).toContain('Tail [Image] after');
  });

  it('does not leak history image sources after repeated malformed labels exhaust the scrub scan budget', () => {
    const malformedPrefix = Array.from(
      { length: 5 },
      () => `![${'a'.repeat(1024 * 1024)}`,
    ).join('');
    const content = [
      ...Array.from({ length: 2000 }, (_, index) => `![image ${index}](attachment://safe-${index}.png)`),
      `${malformedPrefix}![secret](attachment://secret.png) after`,
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('attachment://secret.png');
    expect(sanitized[0].content).toContain('[Image]');
  });

  it('does not leak entity-encoded oversized markdown data image targets after the history scan budget is reached', () => {
    const content = [
      ...Array.from({ length: 2000 }, (_, index) => `![image ${index}](attachment://safe-${index}.png)`),
      `Tail ![secret](<data&colon;image&sol;png&semi;base64&comma;${'A'.repeat(8 * 1024)}>) after`,
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('data&colon;image&sol;');
    expect(sanitized[0].content).toContain('Tail [Image] after');
  });

  it('does not leak unterminated markdown data image targets after the history scan budget is reached', () => {
    const content = [
      ...Array.from({ length: 2000 }, (_, index) => `![image ${index}](attachment://safe-${index}.png)`),
      `Tail ![secret](<data:image/png;base64,${'A'.repeat(8 * 1024)}`,
      'after',
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('data:image');
    expect(sanitized[0].content).toContain('Tail [Image]');
    expect(sanitized[0].content).toContain('after');
  });

  it('does not leak malformed local markdown image sources below the token scan budget', () => {
    const content = [
      'Tail ![asset](asset://localhost/chat-inline-image/1',
      'Next ![blob](blob:https://vlaina.local/secret',
      'Local ![private](http://127.0.0.1:3000/secret.png',
      'Done',
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('asset://localhost/chat-inline-image/1');
    expect(sanitized[0].content).not.toContain('blob:https://vlaina.local/secret');
    expect(sanitized[0].content).not.toContain('http://127.0.0.1:3000/secret.png');
    expect(sanitized[0].content).toContain('Tail [Image]');
    expect(sanitized[0].content).toContain('Next [Image]');
    expect(sanitized[0].content).toContain('Local [Image]');
    expect(sanitized[0].content).toContain('Done');
  });

  it('does not leak malformed markdown image sources with escaped scheme punctuation', () => {
    const content = [
      String.raw`Tail ![asset](attachment\://secret.png`,
      String.raw`Next ![data](data\:image/png;base64,SECRET`,
      'Done',
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain(String.raw`attachment\://secret.png`);
    expect(sanitized[0].content).not.toContain(String.raw`data\:image/png;base64,SECRET`);
    expect(sanitized[0].content).toContain('Tail [Image]');
    expect(sanitized[0].content).toContain('Next [Image]');
    expect(sanitized[0].content).toContain('Done');
  });

  it('does not leak escaped malformed markdown image sources after the history scan budget is reached', () => {
    const content = [
      ...Array.from({ length: 2000 }, (_, index) => `![image ${index}](attachment://safe-${index}.png)`),
      String.raw`Tail ![secret](attachment\://secret.png after`,
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain(String.raw`attachment\://secret.png`);
    expect(sanitized[0].content).toContain('Tail [Image]');
  });

  it('does not leak overflow HTML image sources after the history scan budget is reached', () => {
    const content = [
      ...Array.from({ length: 4001 }, (_, index) => `<span data-index="${index}"></span>`),
      '<img src="attachment://secret.png" alt="secret">',
    ].join('');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('attachment://secret.png');
    expect(sanitized[0].content).not.toContain('<img');
    expect(sanitized[0].content).toContain('[Image]');
  });

  it('does not leak overflow HTML blob image sources after the history scan budget is reached', () => {
    const content = [
      ...Array.from({ length: 4001 }, (_, index) => `<span data-index="${index}"></span>`),
      '<img src="blob:https://vlaina.local/secret" alt="secret">',
    ].join('');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('blob:https://vlaina.local/secret');
    expect(sanitized[0].content).not.toContain('<img');
    expect(sanitized[0].content).toContain('[Image]');
  });

  it('does not leak overflow HTML local-network image sources after the history scan budget is reached', () => {
    const content = [
      ...Array.from({ length: 4001 }, (_, index) => `<span data-index="${index}"></span>`),
      '<img src="http://127.0.0.1:3000/secret.png" alt="secret">',
    ].join('');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('http://127.0.0.1:3000/secret.png');
    expect(sanitized[0].content).not.toContain('<img');
    expect(sanitized[0].content).toContain('[Image]');
  });

  it('does not leak overflow HTML image sources when earlier attributes contain angle brackets', () => {
    const content = [
      ...Array.from({ length: 4001 }, (_, index) => `<span data-index="${index}"></span>`),
      '<img alt="before > after" src="attachment://secret.png">',
    ].join('');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('attachment://secret.png');
    expect(sanitized[0].content).toContain('[Image]');
  });

  it('does not leak entity-encoded overflow HTML data image sources after the history scan budget is reached', () => {
    const content = [
      ...Array.from({ length: 4001 }, (_, index) => `<span data-index="${index}"></span>`),
      `<img src="data&colon;image&sol;png&semi;base64&comma;${'A'.repeat(8 * 1024)}" alt="secret">`,
    ].join('');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('data&colon;image&sol;');
    expect(sanitized[0].content).toContain('[Image]');
  });

  it('keeps overflow HTML image examples inside history code spans and fences', () => {
    const codeImage = '<img src="attachment://docs/example.png" alt="example">';
    const content = [
      ...Array.from({ length: 4001 }, (_, index) => `<span data-index="${index}"></span>`),
      `Inline \`${codeImage}\``,
      '```html',
      codeImage,
      '```',
      '<img src="attachment://secret.png" alt="secret">',
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).toContain(`Inline \`${codeImage}\``);
    expect(sanitized[0].content).toContain(['```html', codeImage, '```'].join('\n'));
    expect(sanitized[0].content).not.toContain('attachment://secret.png');
    expect(sanitized[0].content).toContain('[Image]');
  });

  it('does not scrub overflow HTML image tags only because a non-src attribute mentions data images', () => {
    const content = [
      ...Array.from({ length: 4001 }, (_, index) => `<span data-index="${index}"></span>`),
      '<img src="https://example.com/real.png" alt="data:image/png;base64,not-src">',
    ].join('');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).toContain('<img src="https://example.com/real.png" alt="data:image/png;base64,not-src">');
  });

  it('does not leak malformed local HTML image sources below the tag scan budget', () => {
    const content = [
      'Before <img src="asset://localhost/chat-inline-image/2"',
      'After <img src="blob:https://vlaina.local/secret"',
      'Local <img src="http://127.0.0.1:3000/secret.png"',
      'Done',
    ].join('\n');

    const sanitized = sanitizeHistory([createMessage({ role: 'user', content })]);

    expect(sanitized[0].content).not.toContain('asset://localhost/chat-inline-image/2');
    expect(sanitized[0].content).not.toContain('blob:https://vlaina.local/secret');
    expect(sanitized[0].content).not.toContain('http://127.0.0.1:3000/secret.png');
    expect(sanitized[0].content).toContain('Before [Image]');
    expect(sanitized[0].content).toContain('After [Image]');
    expect(sanitized[0].content).toContain('Local [Image]');
    expect(sanitized[0].content).toContain('Done');
  });

  it('sanitizes malformed structured history content at runtime', () => {
    const sanitized = sanitizeHistory([
      createMessage({
        role: 'user',
        content: [
          { type: 'text', text: 'Describe previous image' },
          { type: 'image_url', image_url: { url: 'attachment://safe.png' } },
          { type: 'image_url', image_url: { url: 'app-file://attachment/local.png' } },
        ] as never,
      }),
      createMessage({
        role: 'assistant',
        content: [
          { type: 'text', text: '<think>hidden</think>Visible answer' },
          { type: 'image_url', image_url: { url: 'file:///tmp/secret.png' } },
        ] as never,
      }),
    ]);

    expect(sanitized.map((message) => message.content)).toEqual([
      ['Describe previous image', '[Image]', '[Image]'].join('\n\n'),
      ['Visible answer', '[Image]'].join('\n\n'),
    ]);
  });

  it('does not serialize web search status metadata into model history', () => {
    const history = [
      createMessage({
        role: 'assistant',
        content: 'Final answer',
        webSearchStatuses: [{ phase: 'results', query: 'x' }],
      }),
    ];

    const sanitized = sanitizeHistory(history);
    expect(sanitized[0].content).toBe('Final answer');
  });

  it('treats legacy web search request text as ordinary history content', () => {
    const history = [
      createMessage({
        role: 'assistant',
        content: [
          'We need to search.',
          '<web_search_request>{"query":"catime","reason":"current info"}</web_search_request>',
          'Final answer',
        ].join('\n'),
      }),
    ];

    const sanitized = sanitizeHistory(history);
    expect(sanitized[0].content).toBe(history[0].content);
  });

  it('removes rendered thinking markup from fallback model history', () => {
    const history = [
      createMessage({
        role: 'assistant',
        content: '<think>private reasoning</think>Final answer',
      }),
    ];

    const sanitized = sanitizeHistory(history);
    expect(sanitized[0].content).toBe('Final answer');
  });

  it('removes UI-only assistant error messages from model history', () => {
    const history = [
      createMessage({ role: 'user', content: 'hello' }),
      createMessage({
        role: 'assistant',
        content: '<error type="AUTH_ERROR" code="401">Your sign-in session has expired. Please sign in again and try again.</error>',
      }),
      createMessage({ role: 'user', content: 'are you there?' }),
    ];

    const result = buildRequestHistory({
      history,
      modelId: 'model-1',
      timezoneOffset: 8,
      includeTimeContext: false,
    });

    expect(result.map((message) => message.content)).toEqual(['hello', 'are you there?']);
  });

  it('strips assistant error tags without dropping visible assistant content', () => {
    const sanitized = sanitizeHistory([
      createMessage({
        role: 'assistant',
        content: 'Partial answer<error type="NETWORK_ERROR" code="503">Request failed</error>',
      }),
    ]);

    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].content).toBe('Partial answer');
  });

  it('does not read older messages once the request history message budget is filled', () => {
    const oldMessage = createMessage({ id: 'old', role: 'user', content: 'old' });
    Object.defineProperty(oldMessage, 'content', {
      configurable: true,
      get() {
        throw new Error('old message content should not be read');
      },
    });
    const recentMessages = Array.from({ length: 32 }, (_, index) =>
      createMessage({ id: `recent-${index}`, role: 'user', content: `recent-${index}` })
    );

    const result = buildRequestHistory({
      history: [oldMessage, ...recentMessages],
      modelId: 'model-1',
      timezoneOffset: 8,
      includeTimeContext: false,
    });

    expect(result.map((message) => message.content)).toEqual(
      recentMessages.map((message) => message.content),
    );
  });

  it('compacts oversized hidden API transcripts instead of dropping reasoning content', () => {
    const result = buildRequestHistory({
      history: [
        createMessage({
          role: 'assistant',
          content: 'Visible answer',
          apiTranscript: [
            {
              role: 'assistant',
              content: null,
              reasoning_content: 'hidden plan',
              tool_calls: [{
                id: 'call-1',
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"x"}' },
              }],
            },
            {
              role: 'tool',
              tool_call_id: 'call-1',
              name: 'web_search',
              content: 'x'.repeat(30000),
            },
            {
              role: 'assistant',
              content: 'Final answer',
              reasoning_content: 'final hidden reasoning',
            },
          ],
        }),
      ],
      modelId: 'model-1',
      timezoneOffset: 8,
      includeTimeContext: false,
    });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Visible answer');
    expect(result[0].apiTranscript).toHaveLength(3);
    expect(result[0].apiTranscript?.[0]).toMatchObject({
      role: 'assistant',
      content: '',
      reasoning_content: 'hidden plan',
      tool_calls: expect.any(Array),
    });
    expect(result[0].apiTranscript?.[1]).toMatchObject({
      role: 'tool',
      tool_call_id: 'call-1',
      content: expect.stringContaining('[Earlier content omitted]'),
    });
    expect(result[0].apiTranscript?.[2]).toMatchObject({
      role: 'assistant',
      content: 'Final answer',
      reasoning_content: 'final hidden reasoning',
    });
    expect(JSON.stringify(result[0].apiTranscript).length).toBeLessThanOrEqual(6000);
  });

  it('builds request history transcript budgets without calling JSON.stringify', () => {
    const stringifySpy = vi.spyOn(JSON, 'stringify').mockImplementation(() => {
      throw new Error('JSON.stringify should not be used for request history budgeting');
    });

    try {
      const result = buildRequestHistory({
        history: [
          createMessage({
            role: 'assistant',
            content: 'Visible answer',
            apiTranscript: [
              {
                role: 'assistant',
                content: null,
                reasoning_content: 'hidden plan',
                tool_calls: [{
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'web_search', arguments: '{"query":"x"}' },
                }],
              },
              {
                role: 'tool',
                tool_call_id: 'call-1',
                name: 'web_search',
                content: 'x'.repeat(30000),
              },
              {
                role: 'assistant',
                content: 'Final answer',
                reasoning_content: 'final hidden reasoning',
              },
            ],
          }),
        ],
        modelId: 'model-1',
        timezoneOffset: 8,
        includeTimeContext: false,
      });

      expect(result).toHaveLength(1);
      expect(result[0].apiTranscript).toHaveLength(3);
      expect(result[0].apiTranscript?.[1]?.content).toContain('[Earlier content omitted]');
    } finally {
      stringifySpy.mockRestore();
    }
  });

  it('normalizes hidden API transcripts before request history budgeting reads them', () => {
    const oldestTranscriptMessage = { role: 'assistant' as const };
    Object.defineProperty(oldestTranscriptMessage, 'content', {
      configurable: true,
      get() {
        throw new Error('old transcript content should not be read');
      },
    });
    const transcript = [
      oldestTranscriptMessage,
      ...Array.from({ length: 79 }, (_, index) => ({
        role: 'assistant' as const,
        content: `transcript-${index}`,
      })),
    ];

    const result = buildRequestHistory({
      history: [
        createMessage({
          role: 'assistant',
          content: 'Visible answer',
          apiTranscript: transcript,
        }),
      ],
      modelId: 'model-1',
      timezoneOffset: 8,
      includeTimeContext: false,
    });

    expect(result[0]?.apiTranscript?.[0]?.content).toBe('transcript-15');
    expect(result[0]?.apiTranscript?.at(-1)?.content).toBe('transcript-78');
  });

  it('sanitizes local image references inside hidden API transcript text', () => {
    const result = buildRequestHistory({
      history: [
        createMessage({
          role: 'assistant',
          content: 'Visible answer',
          apiTranscript: [
            {
              role: 'assistant',
              content: 'Visible ![asset](asset://localhost/chat-inline-image/1',
              reasoning_content: 'Plan <img src="blob:https://vlaina.local/secret"',
            },
            {
              role: 'assistant',
              content: [
                { type: 'text', text: 'Part <img src="attachment://secret.png">' },
                { type: 'image_url', image_url: { url: 'https://example.com/safe.png' } },
              ],
            },
          ],
        }),
      ],
      modelId: 'model-1',
      timezoneOffset: 8,
      includeTimeContext: false,
    });

    const transcriptText = JSON.stringify(result[0]?.apiTranscript);
    expect(transcriptText).not.toContain('asset://localhost/chat-inline-image/1');
    expect(transcriptText).not.toContain('blob:https://vlaina.local/secret');
    expect(transcriptText).not.toContain('attachment://secret.png');
    expect(result[0]?.apiTranscript?.[0]?.content).toContain('Visible [Image]');
    expect(result[0]?.apiTranscript?.[0]?.reasoning_content).toContain('Plan [Image]');
    expect(result[0]?.apiTranscript?.[1]?.content).toEqual([
      { type: 'text', text: 'Part [Image]' },
      { type: 'image_url', image_url: { url: 'https://example.com/safe.png' } },
    ]);
  });

  it('moves active version transcripts to the bounded top-level request field', () => {
    const apiTranscript = [{ role: 'assistant' as const, content: 'version answer', reasoning_content: 'hidden' }];

    const result = buildRequestHistory({
      history: [
        createMessage({
          role: 'assistant',
          content: 'Version answer',
          versions: [{
            content: 'Version answer',
            createdAt: 1,
            kind: 'original',
            subsequentMessages: [],
            apiTranscript,
          }],
        }),
      ],
      modelId: 'model-1',
      timezoneOffset: 8,
      includeTimeContext: false,
    });

    expect(result[0]?.apiTranscript).toEqual(apiTranscript);
    expect(result[0]?.versions[0]?.apiTranscript).toBeUndefined();
  });

  it('does not leave orphan oversized version transcripts available for provider fallback replay', () => {
    const hugeTranscript = [{
      role: 'tool' as const,
      tool_call_id: 'call-1',
      content: 'x'.repeat(50000),
    }];

    const result = buildRequestHistory({
      history: [
        createMessage({
          role: 'assistant',
          content: 'Visible answer',
          versions: [{
            content: 'Visible answer',
            createdAt: 1,
            kind: 'original',
            subsequentMessages: [],
            apiTranscript: hugeTranscript,
          }],
        }),
      ],
      modelId: 'model-1',
      timezoneOffset: 8,
      includeTimeContext: false,
    });

    expect(result[0]?.apiTranscript).toBeUndefined();
    expect(result[0]?.versions[0]?.apiTranscript).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('x'.repeat(5000));
  });
});
