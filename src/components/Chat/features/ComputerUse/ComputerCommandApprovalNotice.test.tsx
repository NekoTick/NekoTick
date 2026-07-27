import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DesktopApi } from '@/lib/electron/bridge';
import {
  publishComputerCommandApproval,
  resetComputerCommandApprovalsForTests,
} from '@/lib/ai/computerUse/approvalState';
import { aliasSessionId, clearSessionIdAliases } from '@/lib/ai/sessionIdAliases';
import { ComputerCommandApprovalNotice } from './ComputerCommandApprovalNotice';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('ComputerCommandApprovalNotice', () => {
  const respondToApproval = vi.fn(async () => true);

  beforeEach(() => {
    act(() => resetComputerCommandApprovalsForTests());
    clearSessionIdAliases();
    respondToApproval.mockClear();
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: { respondToApproval },
    } as unknown as DesktopApi;
  });

  afterEach(() => {
    act(() => resetComputerCommandApprovalsForTests());
    clearSessionIdAliases();
    delete (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop;
  });

  it('submits an exact persistent approval choice to the desktop bridge', async () => {
    act(() => {
      publishComputerCommandApproval('approval-1', {
        sessionId: 'session-1',
        messageId: 'assistant-1',
        commandId: 'command-1',
        command: 'uname -a',
        cwd: '/tmp/project',
        purpose: 'Inspect the system',
        timeoutSeconds: 600,
        risk: 'standard',
        canAlwaysAllow: true,
      });
    });
    render(<ComputerCommandApprovalNotice sessionId="session-1" />);

    const alwaysRunButton = screen.getByRole('button', { name: 'chat.computerUse.alwaysRun' });
    expect(fireEvent.mouseDown(alwaysRunButton)).toBe(false);
    expect(fireEvent.mouseDown(screen.getByText('uname -a'))).toBe(true);

    await act(async () => {
      fireEvent.click(alwaysRunButton);
    });

    await waitFor(() => {
      expect(respondToApproval).toHaveBeenCalledWith('approval-1', 'always');
      expect(screen.queryByLabelText('chat.computerUse')).not.toBeInTheDocument();
    });
  });

  it('disables persistent approval for commands rejected by the main-process policy', () => {
    act(() => {
      publishComputerCommandApproval('approval-2', {
        sessionId: 'session-1',
        messageId: 'assistant-1',
        commandId: 'command-2',
        command: 'rm -rf ./cache',
        cwd: '/tmp/project',
        purpose: 'Clear generated files',
        timeoutSeconds: 600,
        risk: 'elevated',
        canAlwaysAllow: false,
      });
    });
    render(<ComputerCommandApprovalNotice sessionId="session-1" />);

    expect(screen.getByRole('button', { name: 'chat.computerUse.alwaysRun' })).toBeDisabled();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('rm -rf ./cache')).toBeInTheDocument();
    expect(screen.getByText('chat.computerUse.purpose: Clear generated files')).toBeInTheDocument();
    expect(screen.getByText('chat.computerUse.workingDirectory: /tmp/project')).toBeInTheDocument();
  });

  it('advances directly to the next queued approval', async () => {
    act(() => {
      publishComputerCommandApproval('approval-first', {
        sessionId: 'session-1',
        messageId: 'assistant-1',
        commandId: 'command-1',
        command: 'uname -a',
        cwd: '/tmp/project',
        purpose: 'Inspect the system',
        timeoutSeconds: 600,
        risk: 'standard',
        canAlwaysAllow: true,
      });
      publishComputerCommandApproval('approval-second', {
        sessionId: 'session-1',
        messageId: 'assistant-1',
        commandId: 'command-2',
        command: 'df -h',
        cwd: '/tmp/project',
        purpose: 'Inspect disk usage',
        timeoutSeconds: 600,
        risk: 'standard',
        canAlwaysAllow: true,
      });
    });
    render(<ComputerCommandApprovalNotice sessionId="session-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'chat.computerUse.runOnce' }));

    await waitFor(() => {
      expect(respondToApproval).toHaveBeenCalledWith('approval-first', 'run_once');
      expect(screen.getByRole('button', { name: 'chat.computerUse.runOnce' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => {
      expect(respondToApproval).toHaveBeenLastCalledWith('approval-second', 'cancel');
      expect(screen.queryByLabelText('chat.computerUse')).not.toBeInTheDocument();
    });
  });

  it('does not expose an approval from another chat session', () => {
    act(() => {
      publishComputerCommandApproval('approval-other', {
        sessionId: 'session-2',
        messageId: 'assistant-2',
        commandId: 'command-2',
        command: 'uname -a',
        cwd: '/tmp/project',
        purpose: 'Inspect the system',
        timeoutSeconds: 600,
        risk: 'standard',
        canAlwaysAllow: true,
      });
    });

    render(<ComputerCommandApprovalNotice sessionId="session-1" />);

    expect(screen.queryByLabelText('chat.computerUse')).not.toBeInTheDocument();
  });

  it('keeps an approval visible after its temporary chat is promoted', () => {
    act(() => {
      publishComputerCommandApproval('approval-promoted', {
        sessionId: 'temp-session-1',
        messageId: 'assistant-1',
        commandId: 'command-1',
        command: 'pwd',
        cwd: '/tmp/project',
        purpose: 'Inspect the working directory',
        timeoutSeconds: 600,
        risk: 'standard',
        canAlwaysAllow: true,
      });
      aliasSessionId('temp-session-1', 'session-1');
    });

    render(<ComputerCommandApprovalNotice sessionId="session-1" />);

    expect(screen.getByText('pwd')).toBeInTheDocument();
  });
});
