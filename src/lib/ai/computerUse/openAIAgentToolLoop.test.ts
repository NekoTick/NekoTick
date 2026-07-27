import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '@/lib/electron/bridge';
import { normalizeApiTranscriptMessages } from '@/lib/ai/apiTranscript';
import { AIErrorType } from '@/lib/ai/types';
import { extractOpenAIMessageFromJson } from '@/lib/ai/webSearch/openAIToolParsing';
import type { OpenAIStreamToolResult } from '@/lib/ai/webSearch/openAIToolTypes';
import { runOpenAIStreamResultAgentToolLoop } from './openAIAgentToolLoop';
import { extractComputerCommandStatuses } from './transcript';

function payload(message: Record<string, unknown>): OpenAIStreamToolResult {
  const result = extractOpenAIMessageFromJson({ choices: [{ message }] });
  return {
    content: result.reasoningContent
      ? `<think>${result.reasoningContent}</think>${result.content}`
      : result.content,
    assistantContent: result.content,
    reasoningContent: result.reasoningContent,
    toolCalls: result.toolCalls,
  };
}

function toolPayload(id = 'call-1'): OpenAIStreamToolResult {
  return payload({
    role: 'assistant',
    content: '',
    tool_calls: [{
      id,
      type: 'function',
      function: {
        name: 'run_command',
        arguments: JSON.stringify({
          command: 'printf ok',
          purpose: 'Print a test value',
        }),
      },
    }],
  });
}

function installComputerBridge(status: 'completed' | 'denied' = 'completed') {
  let eventHandler: ((event: { type: 'started' | 'output'; stream?: 'stdout' | 'stderr'; text?: string }) => void) | null = null;
  const startCommand = vi.fn(async () => {
    if (status === 'completed') {
      eventHandler?.({ type: 'started' });
      eventHandler?.({ type: 'output', stream: 'stdout', text: 'ok' });
    }
    return {
      status,
      command: 'printf ok',
      cwd: '/tmp/project',
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

describe('OpenAI computer operation tool loop', () => {
  afterEach(() => {
    delete (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop;
  });

  it('asks the desktop runtime to execute a tool and returns the result to the model', async () => {
    const { startCommand } = installComputerBridge();
    const requestResult = vi.fn()
      .mockResolvedValueOnce(toolPayload())
      .mockResolvedValueOnce(payload({ role: 'assistant', content: 'The command completed.' }));
    const onApiTranscript = vi.fn();
    const onCommandStatus = vi.fn();
    const onChunk = vi.fn();

    await expect(runOpenAIStreamResultAgentToolLoop({
      body: { model: 'test', messages: [{ role: 'user', content: 'Run it' }], stream: true },
      defaultCwd: '/tmp/project',
      onApiTranscript,
      onCommandStatus,
      onChunk,
      requestResult,
      webSearchEnabled: false,
    })).resolves.toBe('The command completed.');

    expect(startCommand).toHaveBeenCalledWith(expect.stringMatching(/^computer-/), {
      command: 'printf ok',
      cwd: '/tmp/project',
      purpose: 'Print a test value',
      timeoutSeconds: undefined,
      locale: expect.any(String),
    });
    expect(JSON.stringify(requestResult.mock.calls[0]?.[0])).not.toContain('/tmp/project');
    const secondRequest = requestResult.mock.calls[1]?.[0];
    expect(secondRequest.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', tool_calls: expect.any(Array) }),
      expect.objectContaining({ role: 'tool', tool_call_id: 'call-1' }),
    ]));
    expect(JSON.stringify(secondRequest)).not.toContain('private-after');
    const finalTranscript = onApiTranscript.mock.calls.at(-1)?.[0];
    expect(extractComputerCommandStatuses(finalTranscript, false)[0]).toMatchObject({
      phase: 'completed',
      command: 'printf ok',
      stdout: 'ok',
      exitCode: 0,
      fileChanges: [expect.objectContaining({ path: 'src/private-change.ts' })],
    });
    expect(onCommandStatus.mock.calls.map(([status]) => status.phase)).toEqual(
      expect.arrayContaining(['awaiting_approval', 'running', 'completed']),
    );
    expect(onChunk).toHaveBeenLastCalledWith('The command completed.');
  });

  it('does not repeatedly prompt for the exact command after the user denies it', async () => {
    const { startCommand } = installComputerBridge('denied');
    const requestResult = vi.fn()
      .mockResolvedValueOnce(toolPayload('call-1'))
      .mockResolvedValueOnce(toolPayload('call-2'))
      .mockResolvedValueOnce(payload({ role: 'assistant', content: 'The command was not run.' }));

    await expect(runOpenAIStreamResultAgentToolLoop({
      body: { model: 'test', messages: [{ role: 'user', content: 'Run it' }], stream: true },
      defaultCwd: '/tmp/project',
      onChunk: vi.fn(),
      requestResult,
      webSearchEnabled: false,
    })).resolves.toBe('The command was not run.');

    expect(startCommand).toHaveBeenCalledTimes(1);
    expect(String(requestResult.mock.calls[1]?.[0]?.messages?.at(-1)?.content)).not.toContain('/tmp/project');
    const thirdRequestMessages = requestResult.mock.calls[2]?.[0]?.messages as Array<Record<string, unknown>>;
    const toolResults = thirdRequestMessages.filter((message) => message.role === 'tool');
    expect(toolResults).toHaveLength(2);
    expect(String(toolResults[1]?.content)).toContain('already denied');
    expect(String(toolResults[1]?.content)).not.toContain('/tmp/project');
  });

  it('does not retry an empty model response after a local command status exists', async () => {
    installComputerBridge();
    const requestResult = vi.fn()
      .mockResolvedValueOnce(toolPayload())
      .mockResolvedValueOnce(payload({ role: 'assistant', content: '' }));

    await expect(runOpenAIStreamResultAgentToolLoop({
      body: { model: 'test', messages: [{ role: 'user', content: 'Run it' }], stream: true },
      defaultCwd: '/tmp/project',
      onChunk: vi.fn(),
      requestResult,
      webSearchEnabled: false,
    })).rejects.toMatchObject({ type: AIErrorType.INVALID_REQUEST });

    expect(requestResult).toHaveBeenCalledTimes(2);
  });

  it('persists the final cancelled tool result after the request signal aborts', async () => {
    const controller = new AbortController();
    let eventHandler: ((event: { type: 'started' | 'output'; stream?: 'stdout' | 'stderr'; text?: string }) => void) | null = null;
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
    const statusSnapshots: ReturnType<typeof extractComputerCommandStatuses>[] = [];

    await expect(runOpenAIStreamResultAgentToolLoop({
      body: { model: 'test', messages: [{ role: 'user', content: 'Run it' }], stream: true },
      defaultCwd: '/tmp/project',
      onApiTranscript: (messages) => {
        statusSnapshots.push(extractComputerCommandStatuses(
          normalizeApiTranscriptMessages(messages),
          false,
        ));
      },
      onChunk: vi.fn(),
      requestResult: vi.fn().mockResolvedValueOnce(toolPayload()),
      signal: controller.signal,
      webSearchEnabled: false,
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(statusSnapshots.at(-1)?.at(-1)).toMatchObject({ phase: 'cancelled' });
  });

  it('keeps each command in a batched tool response visible while it is processed', async () => {
    let eventHandler: ((event: { type: 'started' | 'output'; stream?: 'stdout' | 'stderr'; text?: string }) => void) | null = null;
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {
        startCommand: vi.fn(async (_requestId, request) => {
          eventHandler?.({ type: 'started' });
          return {
            status: 'completed' as const,
            command: request.command,
            cwd: request.cwd || '/tmp/project',
            exitCode: 0,
            stdout: `${request.command}\n`,
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
    const requestResult = vi.fn()
      .mockResolvedValueOnce(payload({
        role: 'assistant',
        content: '',
        tool_calls: ['printf one', 'printf two'].map((command, index) => ({
          id: `call-${index + 1}`,
          type: 'function',
          function: {
            name: 'run_command',
            arguments: JSON.stringify({ command, purpose: `Run command ${index + 1}` }),
          },
        })),
      }))
      .mockResolvedValueOnce(payload({ role: 'assistant', content: 'Both commands completed.' }));
    const statusSnapshots: ReturnType<typeof extractComputerCommandStatuses>[] = [];

    await runOpenAIStreamResultAgentToolLoop({
      body: { model: 'test', messages: [{ role: 'user', content: 'Run both' }], stream: true },
      defaultCwd: '/tmp/project',
      onApiTranscript: (messages) => {
        statusSnapshots.push(extractComputerCommandStatuses(
          normalizeApiTranscriptMessages(messages),
          true,
        ));
      },
      onChunk: vi.fn(),
      requestResult,
      webSearchEnabled: false,
    });

    expect(statusSnapshots.some((statuses) => statuses.length === 1)).toBe(true);
    expect(statusSnapshots.at(-1)?.map((status) => status.command)).toEqual([
      'printf one',
      'printf two',
    ]);
  });

  it('allows the model to answer after using the full sixteen-call budget', async () => {
    const { startCommand } = installComputerBridge();
    const requestResult = vi.fn()
      .mockResolvedValueOnce(payload({
        role: 'assistant',
        content: '',
        tool_calls: Array.from({ length: 16 }, (_, index) => ({
          id: `call-${index + 1}`,
          type: 'function',
          function: {
            name: 'run_command',
            arguments: JSON.stringify({
              command: `printf ${index + 1}`,
              purpose: `Run command ${index + 1}`,
            }),
          },
        })),
      }))
      .mockResolvedValueOnce(payload({ role: 'assistant', content: 'All allowed operations were handled.' }));

    await expect(runOpenAIStreamResultAgentToolLoop({
      body: { model: 'test', messages: [{ role: 'user', content: 'Run the batch' }], stream: true },
      defaultCwd: '/tmp/project',
      onChunk: vi.fn(),
      requestResult,
      webSearchEnabled: false,
    })).resolves.toBe('All allowed operations were handled.');

    expect(startCommand).toHaveBeenCalledTimes(6);
    expect(requestResult).toHaveBeenCalledTimes(2);
  });

  it('allows a final answer after eight sequential tool rounds', async () => {
    const { startCommand } = installComputerBridge();
    const requestResult = vi.fn();
    for (let index = 0; index < 8; index += 1) {
      requestResult.mockResolvedValueOnce(toolPayload(`call-${index + 1}`));
    }
    requestResult.mockResolvedValueOnce(payload({ role: 'assistant', content: 'The eight rounds are complete.' }));

    await expect(runOpenAIStreamResultAgentToolLoop({
      body: { model: 'test', messages: [{ role: 'user', content: 'Run every round' }], stream: true },
      defaultCwd: '/tmp/project',
      onChunk: vi.fn(),
      requestResult,
      webSearchEnabled: false,
    })).resolves.toBe('The eight rounds are complete.');

    expect(startCommand).toHaveBeenCalledTimes(6);
    expect(requestResult).toHaveBeenCalledTimes(9);
  });
});
