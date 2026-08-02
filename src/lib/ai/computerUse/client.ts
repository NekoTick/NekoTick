import { getElectronBridge, type ElectronComputerCommandResult } from '@/lib/electron/bridge';
import { buildComputerCommandStatus } from './toolResult';
import type {
  ComputerCommandStatus,
  ComputerToolCall,
  ComputerToolRuntimeOptions,
  ParsedComputerCommandArguments,
} from './types';
import { MAX_COMPUTER_COMMAND_STATUS_OUTPUT_CHARS } from './toolLimits';
import {
  clearComputerCommandApproval,
  isComputerCommandAlwaysRunApproved,
  publishComputerCommandApproval,
} from './approvalState';

const STATUS_OUTPUT_FLUSH_MS = 100;

function createAbortError(): DOMException {
  return new DOMException('The computer operation was cancelled.', 'AbortError');
}

function phaseFromResult(result: ElectronComputerCommandResult): ComputerCommandStatus['phase'] {
  return result.status;
}

function appendBoundedOutput(current: string, next: string): string {
  const combined = current + next;
  return combined.length <= MAX_COMPUTER_COMMAND_STATUS_OUTPUT_CHARS
    ? combined
    : combined.slice(-MAX_COMPUTER_COMMAND_STATUS_OUTPUT_CHARS);
}

export async function runDesktopComputerCommand(
  toolCall: ComputerToolCall,
  args: ParsedComputerCommandArguments,
  options: ComputerToolRuntimeOptions,
): Promise<ComputerCommandStatus> {
  const bridge = getElectronBridge();
  const computer = bridge?.computer;
  if (!computer) {
    return buildComputerCommandStatus(toolCall.id, 'failed', args, {
      cwd: args.cwd || '',
      stderr: 'Computer operations are available only in the desktop app.',
    });
  }
  const workspaceRoot = options.defaultCwd?.trim() || '';
  if (!workspaceRoot) {
    return buildComputerCommandStatus(toolCall.id, 'failed', args, {
      cwd: args.cwd || '',
      stderr: 'Computer operations require an active local workspace.',
    });
  }
  if (options.signal?.aborted) throw createAbortError();

  const requestId = `computer-${crypto.randomUUID()}`;
  let stdout = '';
  let stderr = '';
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let latestPhase: ComputerCommandStatus['phase'] = 'awaiting_approval';
  let settled = false;
  const cwd = args.cwd || options.defaultCwd || '';
  const emit = (phase = latestPhase) => {
    latestPhase = phase;
    options.onCommandStatus?.(buildComputerCommandStatus(toolCall.id, phase, args, {
      cwd: phase === 'awaiting_approval' ? args.cwd || '' : cwd,
      stdout,
      stderr,
    }));
  };
  const clearScheduledFlush = () => {
    if (flushTimer !== null) clearTimeout(flushTimer);
    flushTimer = null;
  };
  const flush = () => {
    if (flushTimer === null) return;
    clearScheduledFlush();
    emit();
  };
  const scheduleFlush = () => {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(flush, STATUS_OUTPUT_FLUSH_MS);
  };
  const disposeEvent = computer.onCommandEvent(requestId, (event) => {
    if (event.type === 'approval_requested') {
      if (
        typeof event.command === 'string' &&
        typeof event.cwd === 'string' &&
        typeof event.workspaceRoot === 'string' &&
        typeof event.purpose === 'string' &&
        typeof event.timeoutSeconds === 'number'
      ) {
        const approval = {
          sessionId: options.approvalContext?.sessionId ?? '',
          messageId: options.approvalContext?.messageId ?? '',
          commandId: toolCall.id,
          command: event.command,
          cwd: event.cwd,
          workspaceRoot: event.workspaceRoot,
          purpose: event.purpose,
          timeoutSeconds: event.timeoutSeconds,
        };
        const publishApproval = () => {
          if (!settled && !options.signal?.aborted) {
            publishComputerCommandApproval(requestId, approval);
          }
        };
        if (isComputerCommandAlwaysRunApproved(approval)) {
          void computer.respondToApproval(requestId, 'run_once').then((accepted) => {
            if (!accepted) publishApproval();
          }, publishApproval);
        } else {
          publishApproval();
        }
      }
      return;
    }
    if (event.type === 'started') {
      flush();
      emit('running');
      return;
    }
    if (event.type !== 'output' || typeof event.text !== 'string') return;
    if (event.stream === 'stderr') stderr = appendBoundedOutput(stderr, event.text);
    else stdout = appendBoundedOutput(stdout, event.text);
    scheduleFlush();
  });
  const abort = () => {
    void computer.cancelCommand(requestId).catch(() => undefined);
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  emit('awaiting_approval');

  try {
    let result: ElectronComputerCommandResult;
    try {
      result = await computer.startCommand(requestId, {
        command: args.command,
        cwd: cwd || undefined,
        workspaceRoot,
        purpose: args.purpose,
        timeoutSeconds: args.timeoutSeconds,
        locale: typeof document === 'undefined' ? undefined : document.documentElement.lang,
      });
    } catch {
      if (options.signal?.aborted) {
        clearScheduledFlush();
        options.onCommandStatus?.(buildComputerCommandStatus(toolCall.id, 'cancelled', args, {
          cwd: latestPhase === 'awaiting_approval' ? args.cwd || '' : cwd,
          stdout,
          stderr,
        }));
        throw createAbortError();
      }
      const failed = buildComputerCommandStatus(toolCall.id, 'failed', args, {
        cwd: latestPhase === 'awaiting_approval' ? args.cwd || '' : cwd,
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}Computer operation failed.`,
      });
      options.onCommandStatus?.(failed);
      return failed;
    }

    if (options.signal?.aborted || result.status === 'cancelled') clearScheduledFlush();
    else flush();
    const finalStatus = buildComputerCommandStatus(
      toolCall.id,
      phaseFromResult(result),
      args,
      latestPhase === 'awaiting_approval'
        ? { ...result, cwd: args.cwd || '' }
        : result,
    );
    options.onCommandStatus?.(finalStatus);

    if (options.signal?.aborted) throw createAbortError();
    return finalStatus;
  } finally {
    settled = true;
    clearComputerCommandApproval(requestId);
    clearScheduledFlush();
    options.signal?.removeEventListener('abort', abort);
    disposeEvent();
  }
}
