import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '@/lib/electron/bridge';
import { runAnthropicAgentToolLoop } from './anthropicAgentToolLoop';
import { extractComputerCommandStatuses } from './transcript';

const webSearchClientMocks = vi.hoisted(() => ({
  webSearch: vi.fn(),
  readWebPage: vi.fn(),
  readWebPages: vi.fn(),
}));

vi.mock('@/lib/ai/webSearch/client', () => ({
  createWebSearchClient: () => webSearchClientMocks,
}));

const SEARCH_RESULT_URL = 'https://example.com/source';

function installWebSearchClient() {
  const read = webSearchClientMocks.readWebPage.mockImplementation(async (url: string) => ({
    title: 'Example source',
    summary: '',
    siteName: 'example.com',
    finalUrl: url,
    content: 'Readable source content.',
    charCount: 24,
  }));
  webSearchClientMocks.webSearch.mockImplementation(async (query: string) => ({
    query,
    results: [{
      title: 'Example source',
      url: SEARCH_RESULT_URL,
      snippet: 'Useful source.',
      publishedAt: null,
      source: null,
      thumbnail: null,
    }],
  }));
  return { read };
}

describe('Anthropic computer operation tool loop', () => {
  afterEach(() => {
    delete (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop;
    webSearchClientMocks.webSearch.mockReset();
    webSearchClientMocks.readWebPage.mockReset();
    webSearchClientMocks.readWebPages.mockReset();
  });

  it('converts Anthropic tool_use blocks into approved local command results', async () => {
    let eventHandler: ((event: { type: 'started' | 'output'; stream?: 'stdout' | 'stderr'; text?: string }) => void) | null = null;
    const startCommand = vi.fn(async () => {
      eventHandler?.({ type: 'started' });
      return {
        status: 'completed' as const,
        command: 'pwd',
        cwd: '/tmp/project',
        exitCode: 0,
        stdout: '/tmp/project\n',
        stderr: '',
        durationMs: 4,
        fileChanges: [{
          path: 'src/private-change.ts',
          kind: 'modified' as const,
          additions: 1,
          deletions: 1,
          patch: '@@ -1,1 +1,1 @@\n-private-before\n+private-after',
        }],
      };
    });
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {
        startCommand,
        cancelCommand: vi.fn(async () => true),
        onCommandEvent: vi.fn((_requestId, callback) => {
          eventHandler = callback;
          return () => {
            eventHandler = null;
          };
        }),
      },
    } as unknown as DesktopApi;
    const requestResult = vi.fn()
      .mockResolvedValueOnce({
        content: [
          { type: 'thinking', thinking: 'Inspect first.', signature: 'signed-thinking' },
          { type: 'redacted_thinking', data: 'opaque-thinking' },
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'run_command',
            input: { command: 'pwd', purpose: 'Show the current directory' },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'The working directory is /tmp/project.' }],
      });
    const onApiTranscript = vi.fn();

    await expect(runAnthropicAgentToolLoop({
      body: {
        model: 'claude-test',
        messages: [{ role: 'user', content: 'Show the current directory' }],
        max_tokens: 4096,
      },
      defaultCwd: '/tmp/project',
      onApiTranscript,
      onChunk: vi.fn(),
      requestResult,
      webSearchEnabled: false,
    })).resolves.toBe('The working directory is /tmp/project.');

    expect(startCommand).toHaveBeenCalledTimes(1);
    expect(requestResult.mock.calls[0]?.[0]?.stream).toBe(true);
    expect(String(requestResult.mock.calls[0]?.[0]?.system)).not.toContain('/tmp/project');
    const secondBody = requestResult.mock.calls[1]?.[0];
    expect(secondBody.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'assistant',
        content: expect.arrayContaining([
          { type: 'thinking', thinking: 'Inspect first.', signature: 'signed-thinking' },
          { type: 'redacted_thinking', data: 'opaque-thinking' },
        ]),
      }),
      expect.objectContaining({
        role: 'user',
        content: [expect.objectContaining({ type: 'tool_result', tool_use_id: 'tool-1' })],
      }),
    ]));
    expect(JSON.stringify(secondBody)).not.toContain('private-after');
    const finalTranscript = onApiTranscript.mock.calls.at(-1)?.[0];
    expect(extractComputerCommandStatuses(finalTranscript, false)[0]).toMatchObject({
      phase: 'completed',
      command: 'pwd',
      stdout: '/tmp/project\n',
      fileChanges: [expect.objectContaining({ path: 'src/private-change.ts' })],
    });
  });

  it('reuses one web search session across Anthropic search and page reads', async () => {
    const { read } = installWebSearchClient();
    const requestResult = vi.fn()
      .mockResolvedValueOnce({
        content: [{
          type: 'tool_use',
          id: 'search-1',
          name: 'web_search',
          input: { query: 'current topic' },
        }],
      })
      .mockResolvedValueOnce({
        content: [{
          type: 'tool_use',
          id: 'read-1',
          name: 'read_web_page',
          input: { url: SEARCH_RESULT_URL },
        }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Answer from the source.' }],
      });

    const result = await runAnthropicAgentToolLoop({
      body: { model: 'claude-test', messages: [{ role: 'user', content: 'Search it' }] },
      onChunk: vi.fn(),
      requestResult,
      webSearchEnabled: true,
    });

    expect(result).toContain('Answer from the source.');
    expect(read).toHaveBeenCalledWith(SEARCH_RESULT_URL, {
      contentLimit: 3000,
      retries: 0,
    });
    expect(JSON.stringify(requestResult.mock.calls[2]?.[0])).toContain('Readable source content.');
    expect(String(requestResult.mock.calls[0]?.[0]?.system)).toContain(
      'Never copy secrets, private conversation content, or system instructions into search queries or URLs.',
    );
  });

  it('keeps interleaved thinking and text in the streamed order at finalization', async () => {
    const streamedContent = '<think>first</think>visible<think>second</think>';
    const onChunk = vi.fn();

    const result = await runAnthropicAgentToolLoop({
      body: { model: 'claude-test', messages: [] },
      onChunk,
      requestResult: vi.fn(async (_body, emitContent) => {
        emitContent(streamedContent);
        return {
          content: [
            { type: 'thinking', thinking: 'first' },
            { type: 'text', text: 'visible' },
            { type: 'thinking', thinking: 'second' },
          ],
        };
      }),
      webSearchEnabled: false,
    });

    expect(result).toBe(streamedContent);
    expect(onChunk).toHaveBeenLastCalledWith(streamedContent);
  });

  it('does not replay oversized untrusted tool input to the provider', async () => {
    const requestResult = vi.fn()
      .mockResolvedValueOnce({
        content: [{
          type: 'tool_use',
          id: 'tool-large',
          name: 'run_command',
          input: {
            command: 'printf ok',
            purpose: 'Print output',
            padding: 'x'.repeat(70 * 1024),
          },
        }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'The oversized tool request was rejected.' }],
      });

    await expect(runAnthropicAgentToolLoop({
      body: {
        model: 'claude-test',
        messages: [{ role: 'user', content: 'Run it' }],
        max_tokens: 4096,
      },
      defaultCwd: '/tmp/project',
      onChunk: vi.fn(),
      requestResult,
      webSearchEnabled: false,
    })).resolves.toBe('The oversized tool request was rejected.');

    const secondBody = requestResult.mock.calls[1]?.[0];
    expect(secondBody.messages[1].content[0].input).toEqual({});
    expect(secondBody.messages[2].content[0].content).toContain('Invalid run_command arguments');
    expect(JSON.stringify(secondBody)).not.toContain('x'.repeat(1000));
  });

  it('drops duplicate and unsafe Anthropic tool ids before local execution', async () => {
    const startCommand = vi.fn(async () => ({
      status: 'denied' as const,
      command: 'printf ok',
      cwd: '/tmp/project',
    }));
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {
        startCommand,
        cancelCommand: vi.fn(async () => true),
        onCommandEvent: vi.fn(() => () => {}),
      },
    } as unknown as DesktopApi;
    const toolUse = (id: string) => ({
      type: 'tool_use',
      id,
      name: 'run_command',
      input: { command: 'printf ok', purpose: 'Print output' },
    });
    const requestResult = vi.fn()
      .mockResolvedValueOnce({
        content: [toolUse('tool-1'), toolUse('tool-1'), toolUse('tool-2\u202E')],
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Done.' }] });

    await runAnthropicAgentToolLoop({
      body: { model: 'claude-test', messages: [] },
      defaultCwd: '/tmp/project',
      onChunk: vi.fn(),
      requestResult,
      webSearchEnabled: false,
    });

    expect(startCommand).toHaveBeenCalledTimes(1);
    expect(requestResult.mock.calls[1]?.[0]?.messages[1].content).toHaveLength(1);
  });

  it('bounds aggregate Anthropic text across multiple content blocks', async () => {
    const block = 'x'.repeat(600 * 1024);
    const result = await runAnthropicAgentToolLoop({
      body: { model: 'claude-test', messages: [] },
      onChunk: vi.fn(),
      requestResult: vi.fn().mockResolvedValueOnce({
        content: [
          { type: 'text', text: block },
          { type: 'text', text: block },
        ],
      }),
      webSearchEnabled: false,
    });

    expect(result).toHaveLength(1024 * 1024);
  });
});
