import { describe, expect, it } from 'vitest'

import {
  MAX_API_TRANSCRIPT_STRING_CHARS,
  normalizeApiTranscriptMessage,
  normalizeApiTranscriptMessages,
  normalizeApiTranscriptMessagesForProviderReplay,
} from './apiTranscript'

describe('apiTranscript normalization', () => {
  it('limits content parts per transcript message', () => {
    const content = Array.from({ length: 80 }, (_, index) => ({
      type: 'text',
      text: `part-${index}`,
    }))

    const message = normalizeApiTranscriptMessage({
      role: 'user',
      content,
    })

    expect(message?.content).toHaveLength(64)
    expect(Array.isArray(message?.content) ? message.content.at(-1) : null).toEqual({
      type: 'text',
      text: 'part-63',
    })
  })

  it('limits tool calls per transcript message', () => {
    const message = normalizeApiTranscriptMessage({
      role: 'assistant',
      content: '',
      tool_calls: Array.from({ length: 40 }, (_, index) => ({
        id: `call-${index}`,
        type: 'function',
        function: {
          name: 'web_search',
          arguments: `{"query":"${index}"}`,
        },
      })),
    })

    expect(message?.tool_calls).toHaveLength(32)
    expect(message?.tool_calls?.at(-1)?.id).toBe('call-31')
  })

  it('limits transcript messages from the newest entries', () => {
    const transcript = normalizeApiTranscriptMessages(
      Array.from({ length: 80 }, (_, index) => ({
        role: 'user',
        content: `message-${index}`,
      })),
    )

    expect(transcript).toHaveLength(64)
    expect(transcript?.[0]?.content).toBe('message-16')
    expect(transcript?.at(-1)?.content).toBe('message-79')
  })

  it('rejects non-string roles without coercion', () => {
    const role = {
      toString: () => {
        throw new Error('role should not be coerced')
      },
    }

    expect(normalizeApiTranscriptMessage({ role, content: 'hello' })).toBeNull()
  })

  it('preserves complete tool call segments', () => {
    const transcript = normalizeApiTranscriptMessages([
      {
        role: 'assistant',
        content: null,
        reasoning_content: 'Need search',
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'web_search', arguments: '{"query":"vlaina"}' },
        }],
      },
      {
        role: 'tool',
        tool_call_id: 'call-1',
        name: 'web_search',
        content: 'Search result',
      },
      {
        role: 'assistant',
        content: 'Final answer',
      },
    ])

    expect(transcript).toEqual([
      {
        role: 'assistant',
        content: '',
        reasoning_content: 'Need search',
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'web_search', arguments: '{"query":"vlaina"}' },
        }],
      },
      {
        role: 'tool',
        tool_call_id: 'call-1',
        name: 'web_search',
        content: 'Search result',
      },
      {
        role: 'assistant',
        content: 'Final answer',
      },
    ])
  })

  it('drops orphan tool messages and incomplete assistant tool calls', () => {
    const transcript = normalizeApiTranscriptMessages([
      {
        role: 'tool',
        tool_call_id: 'missing-call',
        name: 'web_search',
        content: 'orphan result',
      },
      {
        role: 'assistant',
        content: '',
        reasoning_content: 'Need both tools',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'web_search', arguments: '{"query":"one"}' },
          },
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'web_search', arguments: '{"query":"two"}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call-1',
        name: 'web_search',
        content: 'partial result',
      },
      {
        role: 'assistant',
        content: 'Visible answer',
      },
    ])

    expect(transcript).toEqual([
      {
        role: 'assistant',
        content: '',
        reasoning_content: 'Need both tools',
      },
      {
        role: 'assistant',
        content: 'Visible answer',
      },
    ])
  })

  it('drops unsafe image URLs from transcript content parts', () => {
    const message = normalizeApiTranscriptMessage({
      role: 'user',
      content: [
        { type: 'text', text: 'inspect these images' },
        { type: 'image_url', image_url: { url: 'https://example.com/safe.png', detail: 'low' } },
        { type: 'image_url', image_url: { url: '.vlaina/assets/secret.png' } },
        { type: 'image_url', image_url: { url: 'docs/.git/secret.png' } },
        { type: 'image_url', image_url: { url: 'https://user:pass@example.com/secret.png' } },
        { type: 'image_url', image_url: { url: 'http://127.0.0.1:3000/secret.png', detail: 'high' } },
        { type: 'image_url', image_url: { url: 'file:///tmp/secret.png' } },
        { type: 'image_url', image_url: { url: 'attachment://safe.png' } },
        { type: 'image_url', image_url: { url: 'attachment://..%2Fsecret.png' } },
        { type: 'image_url', image_url: { url: 'app-file://attachment/local.png' } },
        { type: 'image_url', image_url: { url: 'data:image/svg+xml;base64,PHN2Zz4=' } },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,aGk=' } },
      ],
    })

    expect(message?.content).toEqual([
      { type: 'text', text: 'inspect these images' },
      { type: 'image_url', image_url: { url: 'https://example.com/safe.png', detail: 'low' } },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aGk=' } },
    ])
  })

  it('uses empty content when a required transcript message contains only unsafe images', () => {
    const message = normalizeApiTranscriptMessage({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'http://192.168.1.5/secret.png' } },
      ],
    })

    expect(message).toEqual({ role: 'user', content: '' })
  })

  it('removes local file changes only from provider replay transcripts', () => {
    const content = JSON.stringify({
      kind: 'vlaina-computer-command',
      version: 1,
      phase: 'completed',
      command: 'printf ok',
      cwd: '/tmp/project',
      fileChanges: [{
        path: 'src/private.ts',
        kind: 'modified',
        additions: 1,
        deletions: 1,
        patch: '+private-value',
      }],
      fileChangesTruncated: true,
    })
    const transcript = [{
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call-1',
        type: 'function',
        function: { name: 'run_command', arguments: '{}' },
      }],
    }, {
      role: 'tool',
      tool_call_id: 'call-1',
      name: 'run_command',
      content,
    }]

    expect(normalizeApiTranscriptMessages(transcript)?.[1]?.content).toBe(content)
    const replayContent = normalizeApiTranscriptMessagesForProviderReplay(transcript)?.[1]?.content
    expect(String(replayContent)).not.toContain('fileChanges')
    expect(String(replayContent)).not.toContain('private-value')
    expect(String(replayContent)).toContain('printf ok')
  })

  it('removes local file changes before clipping oversized provider replay results', () => {
    const privatePatch = `private-${'x'.repeat(MAX_API_TRANSCRIPT_STRING_CHARS)}`
    const transcript = [{
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call-1',
        type: 'function',
        function: { name: 'run_command', arguments: '{}' },
      }],
    }, {
      role: 'tool',
      tool_call_id: 'call-1',
      name: 'run_command',
      content: JSON.stringify({
        kind: 'vlaina-computer-command',
        version: 1,
        phase: 'completed',
        fileChanges: [{
          path: 'src/private.ts',
          kind: 'modified',
          additions: 1,
          deletions: 1,
          patch: privatePatch,
        }],
        command: 'printf ok',
        cwd: '/tmp/project',
      }),
    }]

    const replayContent = normalizeApiTranscriptMessagesForProviderReplay(transcript)?.[1]?.content
    expect(String(replayContent)).not.toContain('fileChanges')
    expect(String(replayContent)).not.toContain('private-')
    expect(String(replayContent)).toContain('printf ok')
  })

  it('fails closed for malformed local command results during provider replay', () => {
    const transcript = [{
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call-1',
        type: 'function',
        function: { name: 'run_command', arguments: '{}' },
      }],
    }, {
      role: 'tool',
      tool_call_id: 'call-1',
      name: 'run_command',
      content: '{"kind":"vlaina-computer-command","fileChanges":[{"patch":"private-value"}',
    }]

    const replayContent = normalizeApiTranscriptMessagesForProviderReplay(transcript)?.[1]?.content
    expect(String(replayContent)).not.toContain('fileChanges')
    expect(String(replayContent)).not.toContain('private-value')
    expect(String(replayContent)).toContain('could not be safely replayed')
  })
})
