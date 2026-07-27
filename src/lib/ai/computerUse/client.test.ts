import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '@/lib/electron/bridge';
import { runDesktopComputerCommand } from './client';
import type { ComputerCommandStatus, ComputerToolCall } from './types';
import {
  getPendingComputerCommandApprovalsSnapshot,
  resetComputerCommandApprovalsForTests,
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
      purpose: string;
      timeoutSeconds: number;
      risk: 'standard';
      canAlwaysAllow: boolean;
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
        purpose: 'Inspect the system',
        timeoutSeconds: 600,
        risk: 'standard',
        canAlwaysAllow: true,
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
          canAlwaysAllow: true,
        }),
      ]);
    });
    finishCommand({ status: 'denied', command: 'uname -a', cwd: '/tmp/project' });
    await running;

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
});
