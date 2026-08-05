import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '@/lib/electron/bridge';
import { runDesktopComputerCommand } from './client';
import type { ComputerCommandStatus, ComputerToolCall } from './types';
import {
  getPendingComputerCommandApprovalsSnapshot,
  publishComputerCommandApproval,
  resetComputerCommandApprovalsForTests,
  respondToComputerCommandApproval,
} from './approvalState';

const toolCall: ComputerToolCall = {
  id: 'call-1',
  type: 'function',
  function: {
    name: 'run_command',
    arguments: JSON.stringify({ command: 'sleep 10', purpose: 'Wait briefly' }),
  },
};

describe('desktop computer command client', () => {
  afterEach(() => {
    resetComputerCommandApprovalsForTests();
    delete (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop;
  });

  it('publishes and clears renderer approval requests around command execution', async () => {
    let eventHandler: ((event: {
      type: 'approval_requested';
      command: string;
      cwd: string;
      workspaceRoot: string;
      purpose: string;
      timeoutSeconds: number;
    }) => void) | null = null;
    let finishCommand: (result: {
      status: 'denied';
      command: string;
      cwd: string;
    }) => void = () => undefined;
    const startCommand = vi.fn(async () => {
      eventHandler?.({
        type: 'approval_requested',
        command: 'uname -a',
        cwd: '/tmp/project',
        workspaceRoot: '/tmp/project',
        purpose: 'Inspect the system',
        timeoutSeconds: 600,
      });
      return await new Promise<{
        status: 'denied';
        command: string;
        cwd: string;
      }>((resolve) => {
        finishCommand = resolve;
      });
    });
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {
        startCommand,
        cancelCommand: vi.fn(async () => true),
        respondToApproval: vi.fn(async () => true),
        onCommandEvent: vi.fn((_requestId, callback) => {
          eventHandler = callback as typeof eventHandler;
          return () => undefined;
        }),
      },
    } as unknown as DesktopApi;

    const running = runDesktopComputerCommand({
      ...toolCall,
      function: {
        ...toolCall.function,
        arguments: JSON.stringify({ command: 'uname -a', purpose: 'Inspect the system' }),
      },
    }, {
      command: 'uname -a',
      purpose: 'Inspect the system',
    }, {
      approvalContext: {
        sessionId: 'session-1',
        messageId: 'assistant-1',
      },
      defaultCwd: '/tmp/project',
    });

    await vi.waitFor(() => {
      expect(getPendingComputerCommandApprovalsSnapshot()).toEqual([
        expect.objectContaining({
          sessionId: 'session-1',
          messageId: 'assistant-1',
          commandId: 'call-1',
          command: 'uname -a',
        }),
      ]);
    });
    finishCommand({ status: 'denied', command: 'uname -a', cwd: '/tmp/project' });
    await running;

    expect(startCommand).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      workspaceRoot: '/tmp/project',
    }));
    expect(getPendingComputerCommandApprovalsSnapshot()).toEqual([]);
  });

  it('automatically reuses an exact always-run approval in the same chat session', async () => {
    let eventHandler: ((event: {
      type: 'approval_requested';
      command: string;
      cwd: string;
      workspaceRoot: string;
      purpose: string;
      timeoutSeconds: number;
    }) => void) | null = null;
    const respondToApproval = vi.fn(async () => true);
    const startCommand = vi.fn(async () => {
      eventHandler?.({
        type: 'approval_requested',
        command: 'uname -a',
        cwd: '/tmp/project',
        workspaceRoot: '/tmp/project',
        purpose: 'Inspect the system',
        timeoutSeconds: 600,
      });
      return {
        status: 'completed' as const,
        command: 'uname -a',
        cwd: '/tmp/project',
      };
    });
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {
        startCommand,
        cancelCommand: vi.fn(async () => true),
        respondToApproval,
        onCommandEvent: vi.fn((_requestId, callback) => {
          eventHandler = callback as typeof eventHandler;
          return () => undefined;
        }),
      },
    } as unknown as DesktopApi;
    publishComputerCommandApproval('seed-approval', {
      sessionId: 'session-1',
      messageId: 'assistant-1',
      commandId: 'seed-command',
      command: 'uname -a',
      cwd: '/tmp/project',
      workspaceRoot: '/tmp/project',
      purpose: 'Inspect the system',
      timeoutSeconds: 600,
    });
    await respondToComputerCommandApproval('seed-approval', 'always');
    respondToApproval.mockClear();

    const result = await runDesktopComputerCommand(toolCall, {
      command: 'uname -a',
      purpose: 'Inspect the system',
    }, {
      approvalContext: {
        sessionId: 'session-1',
        messageId: 'assistant-2',
      },
      defaultCwd: '/tmp/project',
    });

    await vi.waitFor(() => {
      expect(respondToApproval).toHaveBeenCalledWith(expect.any(String), 'run_once');
    });
    expect(result.phase).toBe('completed');
    expect(getPendingComputerCommandApprovalsSnapshot()).toEqual([]);
  });

  it('records a final cancelled status before aborting the agent loop', async () => {
    const controller = new AbortController();
    let eventHandler: ((event: { type: 'started' | 'output' }) => void) | null = null;
    const dispose = vi.fn();
    const cancelCommand = vi.fn(async () => true);
    const startCommand = vi.fn(async () => {
      eventHandler?.({ type: 'started' });
      controller.abort();
      return {
        status: 'cancelled' as const,
        command: 'sleep 10',
        cwd: '/tmp/project',
        stdout: '',
        stderr: '',
        durationMs: 5,
      };
    });
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {
        startCommand,
        cancelCommand,
        onCommandEvent: vi.fn((_requestId, callback) => {
          eventHandler = callback;
          return dispose;
        }),
      },
    } as unknown as DesktopApi;
    const statuses: ComputerCommandStatus[] = [];

    await expect(runDesktopComputerCommand(toolCall, {
      command: 'sleep 10',
      purpose: 'Wait briefly',
    }, {
      defaultCwd: '/tmp/project',
      signal: controller.signal,
      onCommandStatus: (status) => statuses.push(status),
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(cancelCommand).toHaveBeenCalledTimes(1);
    expect(statuses.some((status) => status.phase === 'running')).toBe(true);
    expect(statuses.at(-1)).toMatchObject({
      phase: 'cancelled',
      command: 'sleep 10',
      cwd: '/tmp/project',
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('does not expose desktop IPC failure details in command results', async () => {
    const error = new Error('fake-local-secret-value');
    Object.defineProperty(error, 'message', {
      get: () => { throw new Error('hostile message getter'); },
    });
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {
        startCommand: vi.fn(async () => { throw error; }),
        cancelCommand: vi.fn(async () => true),
        onCommandEvent: vi.fn(() => () => undefined),
      },
    } as unknown as DesktopApi;

    const result = await runDesktopComputerCommand(toolCall, {
      command: 'sleep 10',
      purpose: 'Wait briefly',
    }, { defaultCwd: '/tmp/project' });

    expect(result.phase).toBe('failed');
    expect(result.stderr).toBe('Computer operation failed.');
    expect(JSON.stringify(result)).not.toContain('fake-local-secret-value');
  });
});
