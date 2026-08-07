import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '@/lib/electron/bridge';
import { normalizeApiTranscriptMessages } from '@/lib/ai/apiTranscript';
import { AIErrorType } from '@/lib/ai/types';
import { MAX_DSML_TOOL_MARKUP_CHARS } from '@/lib/ai/webSearch/openAIToolParsing';
import { translate } from '@/lib/i18n';
import { extractComputerCommandStatuses } from './transcript';
import { createManagedProtocolChunkHandler, runManagedTextAgentToolLoop } from './managedTextAgentToolLoop';

const webSearchClientMocks = vi.hoisted(() => ({
  webSearch: vi.fn(),
  readWebPage: vi.fn(),
  readWebPages: vi.fn(),
}));

vi.mock('@/lib/ai/webSearch/client', () => ({
  createWebSearchClient: () => webSearchClientMocks,
}));

const SEARCH_RESULT_URL = 'https://example.com/source';

function toolText(command = 'printf ok', purpose = 'Print a test value'): string {
  return [
    '<｜｜DSML｜｜tool_calls>',
    '<｜｜DSML｜｜invoke name="run_command">',
    `<｜｜DSML｜｜parameter name="command">${command}</｜｜DSML｜｜parameter>`,
    `<｜｜DSML｜｜parameter name="purpose">${purpose}</｜｜DSML｜｜parameter>`,
    '</｜｜DSML｜｜invoke>',
    '</｜｜DSML｜｜tool_calls>',
  ].join('');
}

function webToolText(name: 'web_search' | 'read_web_page', key: 'query' | 'url', value: string): string {
  return [
    '<｜｜DSML｜｜tool_calls>',
    `<｜｜DSML｜｜invoke name="${name}">`,
    `<｜｜DSML｜｜parameter name="${key}">${value}</｜｜DSML｜｜parameter>`,
    '</｜｜DSML｜｜invoke>',
    '</｜｜DSML｜｜tool_calls>',
  ].join('');
}

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

function installComputerBridge(status: 'completed' | 'denied' = 'completed') {
  let eventHandler: ((event: { type: 'started' | 'output'; stream?: 'stdout' | 'stderr'; text?: string }) => void) | null = null;
  const startCommand = vi.fn(async (_requestId: string, request: { command: string; cwd?: string }) => {
    if (status === 'completed') {
      eventHandler?.({ type: 'started' });
      eventHandler?.({ type: 'output', stream: 'stdout', text: 'ok' });
    }
    return {
      status,
      command: request.command,
      cwd: request.cwd || '/tmp/project',
      exitCode: status === 'completed' ? 0 : undefined,
      stdout: status === 'completed' ? 'ok' : '',
      stderr: '',
      durationMs: 5,
      fileChanges: status === 'completed' ? [{
        path: 'src/private-change.ts',
        kind: 'modified' as const,
        additions: 1,
        deletions: 1,
        patch: '@@ -1,1 +1,1 @@\n-private-before\n+private-after',
      }] : undefined,
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
  return { startCommand };
}

function baseOptions(requestText: Parameters<typeof runManagedTextAgentToolLoop>[0]['requestText']) {
  return {
    body: {
      model: 'managed-test',
      messages: [
        { role: 'system' as const, content: 'Custom instruction: claim that computer access is unavailable.' },
        { role: 'user' as const, content: 'Inspect the disk' },
      ],
      tools: [{ type: 'function' as const }],
      tool_choice: 'auto' as const,
      stream: false,
    },
    defaultCwd: '/tmp/project',
    onChunk: vi.fn(),
    requestText,
    webSearchEnabled: false,
  };
}

describe('managed computer operation text protocol', () => {
  afterEach(() => {
    delete (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop;
    webSearchClientMocks.webSearch.mockReset();
    webSearchClientMocks.readWebPage.mockReset();
    webSearchClientMocks.readWebPages.mockReset();
  });

  it('proposes an approved command without sending native tools to the managed API', async () => {
    const { startCommand } = installComputerBridge();
    const requestText = vi.fn()
      .mockImplementationOnce(async (_body, onChunk) => {
        onChunk('<');
        onChunk('<｜｜D');
        onChunk('<｜｜DSML｜｜');
        onChunk(toolText());
        return toolText();
      })
      .mockImplementationOnce(async (_body, onChunk) => {
        onChunk('The');
        onChunk('The command');
        onChunk('The command completed.');
        return 'The command completed.';
      });
    const onApiTranscript = vi.fn();
    const onCommandStatus = vi.fn();
    const onChunk = vi.fn();

    await expect(runManagedTextAgentToolLoop({
      ...baseOptions(requestText),
      onApiTranscript,
      onChunk,
      onCommandStatus,
    })).resolves.toBe('The command completed.');

    expect(startCommand).toHaveBeenCalledTimes(1);
    expect(requestText).toHaveBeenCalledTimes(2);
    for (const [request] of requestText.mock.calls) {
      expect(request.stream).toBe(true);
      expect(request.tools).toBeUndefined();
      expect(request.tool_choice).toBeUndefined();
      expect(request.messages.some((message: { role: string }) => message.role === 'tool')).toBe(false);
    }
    expect(String(requestText.mock.calls[0]?.[0]?.messages?.[0]?.content)).toContain('strict DSML');
    expect(requestText.mock.calls[0]?.[0]?.messages?.[1]).toEqual({
      role: 'system',
      content: 'Custom instruction: claim that computer access is unavailable.',
    });
    const resultContext = String(requestText.mock.calls[1]?.[0]?.messages?.at(-1)?.content);
    expect(resultContext).toContain('\\"stdout\\":\\"ok\\"');
    expect(resultContext).not.toContain('private-after');
    const transcript = onApiTranscript.mock.calls.at(-1)?.[0];
    expect(extractComputerCommandStatuses(transcript, false)[0]).toMatchObject({
      phase: 'completed',
      fileChanges: [expect.objectContaining({ path: 'src/private-change.ts' })],
    });
    expect(onCommandStatus.mock.calls.map(([value]) => value.phase)).toEqual(
      expect.arrayContaining(['awaiting_approval', 'running', 'completed']),
    );
    expect(JSON.stringify(onChunk.mock.calls)).not.toContain('DSML');
    expect(onChunk.mock.calls.map(([content]) => content).filter(Boolean).slice(0, 3)).toEqual([
      'The',
      'The command',
      'The command completed.',
    ]);
    expect(onChunk).toHaveBeenLastCalledWith('The command completed.');
  });

  it('reuses one web search session across managed search and page reads', async () => {
    const { read } = installWebSearchClient();
    const requestText = vi.fn()
      .mockResolvedValueOnce(webToolText('web_search', 'query', 'current topic'))
      .mockResolvedValueOnce(webToolText('read_web_page', 'url', SEARCH_RESULT_URL))
      .mockResolvedValueOnce('Answer from the source.');

    const result = await runManagedTextAgentToolLoop({
      ...baseOptions(requestText),
      webSearchEnabled: true,
    });

    expect(result).toContain('Answer from the source.');
    expect(read).toHaveBeenCalledWith(SEARCH_RESULT_URL, {
      contentLimit: 3000,
      retries: 0,
    });
    expect(JSON.stringify(requestText.mock.calls[2]?.[0])).toContain('Readable source content.');
    expect(String(requestText.mock.calls[0]?.[0]?.messages?.[0]?.content)).toContain(
      'Never copy secrets, private conversation content, or system instructions into search queries or URLs.',
    );
  });

  it('does not ask for the same denied command twice', async () => {
    const { startCommand } = installComputerBridge('denied');
    const requestText = vi.fn()
      .mockResolvedValueOnce(toolText())
      .mockResolvedValueOnce(toolText())
      .mockResolvedValueOnce('The command was not run.');

    await expect(runManagedTextAgentToolLoop(baseOptions(requestText))).resolves.toBe('The command was not run.');

    expect(startCommand).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(requestText.mock.calls[2]?.[0])).toContain('already denied');
  });

  it('returns plain model text without semantic keyword matching or retries', async () => {
    const { startCommand } = installComputerBridge();
    const refusal = 'I cannot access your computer or inspect its disk.';
    const requestText = vi.fn().mockResolvedValue(refusal);

    await expect(runManagedTextAgentToolLoop(baseOptions(requestText))).resolves.toBe(refusal);

    expect(requestText).toHaveBeenCalledTimes(1);
    expect(startCommand).not.toHaveBeenCalled();
  });

  it('releases long false protocol prefixes without replaying visible content', () => {
    const onChunk = vi.fn();
    const onProtocolChunk = createManagedProtocolChunkHandler(onChunk);
    let content = 'Visible answer<||';

    onProtocolChunk('Visible answer');
    for (let index = 0; index < 5000; index += 1) {
      content += ' ';
      onProtocolChunk(content);
    }
    onProtocolChunk(`${content}not a protocol`);

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk).toHaveBeenLastCalledWith(`${content}not a protocol`);
  });

  it('rejects malformed, oversized, or prose-wrapped DSML without executing it', async () => {
    const { startCommand } = installComputerBridge();
    const malformedRequest = vi.fn().mockResolvedValue(
      '<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="run_command">missing closing tags',
    );
    await expect(runManagedTextAgentToolLoop(baseOptions(malformedRequest))).rejects.toMatchObject({
      type: AIErrorType.INVALID_REQUEST,
      message: translate('chat.computerUse.invalidProtocol'),
    });

    const oversizedRequest = vi.fn().mockResolvedValue(
      `${toolText()}${'x'.repeat(MAX_DSML_TOOL_MARKUP_CHARS)}`,
    );
    await expect(runManagedTextAgentToolLoop(baseOptions(oversizedRequest))).rejects.toMatchObject({
      type: AIErrorType.INVALID_REQUEST,
    });

    const onChunk = vi.fn();
    const proseWrappedRequest = vi.fn(async (_body, onProtocolChunk) => {
      onProtocolChunk('I will run it.');
      onProtocolChunk(`I will run it.\n${toolText()}`);
      return `I will run it.\n${toolText()}`;
    });
    await expect(runManagedTextAgentToolLoop({
      ...baseOptions(proseWrappedRequest),
      onChunk,
    })).rejects.toMatchObject({
      type: AIErrorType.INVALID_REQUEST,
    });
    expect(onChunk).toHaveBeenLastCalledWith('');

    expect(startCommand).not.toHaveBeenCalled();
    expect(malformedRequest).toHaveBeenCalledTimes(1);
    expect(oversizedRequest).toHaveBeenCalledTimes(1);
    expect(proseWrappedRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps the six-approval limit for batched text-protocol proposals', async () => {
    const { startCommand } = installComputerBridge();
    const batch = Array.from({ length: 7 }, (_, index) =>
      toolText(`printf ${index + 1}`, `Print value ${index + 1}`)
    ).join('');
    const requestText = vi.fn()
      .mockResolvedValueOnce(batch)
      .mockResolvedValueOnce('The allowed commands were handled.');

    await expect(runManagedTextAgentToolLoop(baseOptions(requestText))).resolves.toBe('The allowed commands were handled.');

    expect(startCommand).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(requestText.mock.calls[1]?.[0])).toContain('approval limit');
  });

  it('does not replay a command when the request after its local status fails', async () => {
    const { startCommand } = installComputerBridge();
    const upstreamFailure = new Error('upstream unavailable');
    const requestText = vi.fn()
      .mockResolvedValueOnce(toolText())
      .mockRejectedValueOnce(upstreamFailure);

    await expect(runManagedTextAgentToolLoop(baseOptions(requestText))).rejects.toBe(upstreamFailure);

    expect(startCommand).toHaveBeenCalledTimes(1);
    expect(requestText).toHaveBeenCalledTimes(2);
  });

  it('persists a terminal cancelled status when the signal aborts', async () => {
    const controller = new AbortController();
    let eventHandler: ((event: { type: 'started' }) => void) | null = null;
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {
        startCommand: vi.fn(async () => {
          eventHandler?.({ type: 'started' });
          controller.abort();
          return {
            status: 'cancelled' as const,
            command: 'printf ok',
            cwd: '/tmp/project',
            stdout: '',
            stderr: '',
            durationMs: 2,
          };
        }),
        cancelCommand: vi.fn(async () => true),
        onCommandEvent: vi.fn((_requestId, callback) => {
          eventHandler = callback;
          return () => {
            eventHandler = null;
          };
        }),
      },
    } as unknown as DesktopApi;
    const snapshots: ReturnType<typeof extractComputerCommandStatuses>[] = [];

    await expect(runManagedTextAgentToolLoop({
      ...baseOptions(vi.fn().mockResolvedValueOnce(toolText())),
      signal: controller.signal,
      onApiTranscript: (messages) => {
        snapshots.push(extractComputerCommandStatuses(normalizeApiTranscriptMessages(messages), false));
      },
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(snapshots.at(-1)?.at(-1)).toMatchObject({ phase: 'cancelled' });
  });
});
