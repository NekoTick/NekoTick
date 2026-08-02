import { afterEach, describe, expect, it } from 'vitest';
import type { DesktopApi } from '@/lib/electron/bridge';
import {
    isComputerCommandAlwaysRunApproved,
    publishComputerCommandApproval,
    resetComputerCommandApprovalsForTests,
    respondToComputerCommandApproval,
} from './computerUse/approvalState';
import { aliasSessionId, clearSessionIdAliases, resolveSessionIdAlias } from './sessionIdAliases';
import { RequestManager } from './requestManager';

describe('RequestManager', () => {
  afterEach(() => {
    clearSessionIdAliases();
    resetComputerCommandApprovalsForTests();
    delete (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop;
  });

  it('transfers a controller from the original session id after an alias is already registered', () => {
    const manager = new RequestManager();
    const controller = manager.start('temp-session-1');

    aliasSessionId('temp-session-1', 'session-1');
    manager.transfer('temp-session-1', 'session-1');

    expect(manager.isGenerating('session-1')).toBe(true);
    expect(manager.isGenerating('temp-session-1')).toBe(true);

    manager.abort('session-1');

    expect(controller.signal.aborted).toBe(true);
    expect(manager.isGenerating('session-1')).toBe(false);
  });

  it('clears an alias when a transferred request finishes after it was aborted through the promoted id', () => {
    const manager = new RequestManager();
    const controller = manager.start('temp-session-1');

    aliasSessionId('temp-session-1', 'session-1');
    manager.transfer('temp-session-1', 'session-1');
    manager.abort('session-1');
    manager.finish('temp-session-1', controller);

    expect(resolveSessionIdAlias('temp-session-1')).toBe('temp-session-1');
    expect(manager.isGenerating('temp-session-1')).toBe(false);
  });

  it('clears aliases that resolve to a promoted session when aborting the promoted id', () => {
    const manager = new RequestManager();
    const controller = manager.start('temp-session-1');

    aliasSessionId('temp-session-1', 'session-1');
    manager.transfer('temp-session-1', 'session-1');
    manager.abort('session-1');

    expect(controller.signal.aborted).toBe(true);
    expect(resolveSessionIdAlias('temp-session-1')).toBe('temp-session-1');
    expect(manager.isGenerating('temp-session-1')).toBe(false);
  });

  it('keeps aliases for an active controller when a superseded transferred request finishes', () => {
    const manager = new RequestManager();
    const firstController = manager.start('temp-session-1');

    aliasSessionId('temp-session-1', 'session-1');
    manager.transfer('temp-session-1', 'session-1');
    const secondController = manager.start('session-1');

    expect(firstController.signal.aborted).toBe(true);
    expect(manager.isCurrent('session-1', secondController)).toBe(true);
    expect(manager.isCurrent('temp-session-1', secondController)).toBe(true);

    manager.finish('temp-session-1', firstController);

    expect(resolveSessionIdAlias('temp-session-1')).toBe('session-1');
    expect(manager.isCurrent('session-1', secondController)).toBe(true);
    expect(manager.isCurrent('temp-session-1', secondController)).toBe(true);
    expect(secondController.signal.aborted).toBe(false);
  });

  it('aborts only requests that started with computer access', () => {
    const manager = new RequestManager();
    const computerController = manager.start('computer-session', { computerUse: true });
    const regularController = manager.start('regular-session');

    manager.abortComputerUse();

    expect(computerController.signal.aborted).toBe(true);
    expect(manager.isGenerating('computer-session')).toBe(false);
    expect(regularController.signal.aborted).toBe(false);
    expect(manager.isGenerating('regular-session')).toBe(true);
    manager.abort('regular-session');
  });

  it('clears always-run approvals when computer access is revoked', async () => {
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {
        respondToApproval: async () => true,
      },
    } as unknown as DesktopApi;
    const approval = {
      sessionId: 'session-1',
      messageId: 'assistant-1',
      commandId: 'command-1',
      command: 'uname -a',
      cwd: '/tmp/project',
      workspaceRoot: '/tmp/project',
      purpose: 'Inspect the system',
      timeoutSeconds: 600,
    };
    publishComputerCommandApproval('approval-1', approval);
    await respondToComputerCommandApproval('approval-1', 'always');
    expect(isComputerCommandAlwaysRunApproved(approval)).toBe(true);

    new RequestManager().abortComputerUse();

    expect(isComputerCommandAlwaysRunApproved(approval)).toBe(false);
  });

  it('does not restore an always-run approval after computer access is revoked', async () => {
    let resolveApproval: (accepted: boolean) => void = () => undefined;
    const approvalResponse = new Promise<boolean>((resolve) => {
      resolveApproval = resolve;
    });
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {
        respondToApproval: () => approvalResponse,
      },
    } as unknown as DesktopApi;
    const approval = {
      sessionId: 'session-1',
      messageId: 'assistant-1',
      commandId: 'command-1',
      command: 'uname -a',
      cwd: '/tmp/project',
      workspaceRoot: '/tmp/project',
      purpose: 'Inspect the system',
      timeoutSeconds: 600,
    };
    publishComputerCommandApproval('approval-1', approval);
    const responding = respondToComputerCommandApproval('approval-1', 'always');

    new RequestManager().abortComputerUse();
    resolveApproval(true);
    await responding;

    expect(isComputerCommandAlwaysRunApproved(approval)).toBe(false);
  });
});
