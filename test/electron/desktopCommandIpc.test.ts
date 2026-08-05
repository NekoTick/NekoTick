import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, realpath, rm, symlink, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  registerDesktopCommandIpc,
  resetDesktopCommandsForTests,
} from '../../electron/desktopCommandIpc.mjs';

function safeId(value: unknown): string {
  const id = typeof value === 'string' ? value : '';
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(id)) throw new Error('unsafe id');
  return id;
}

describe('desktop command ipc', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'vlaina-command-ipc-')));
    resetDesktopCommandsForTests();
  });

  afterEach(async () => {
    resetDesktopCommandsForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  function registerHarness(options: {
    decision?: 'run_once' | 'cancel';
    isProtectedPath?: (candidatePath: string) => Promise<boolean>;
    runProcess?: (...args: any[]) => Promise<Record<string, unknown>>;
    captureSnapshot?: (...args: any[]) => Promise<unknown>;
    compareSnapshots?: (...args: any[]) => { changes: unknown[]; truncated: boolean };
    assertWorkspaceAuthorized?: (candidatePath: string) => Promise<string>;
  } = {}) {
    const handlers = new Map<string, (...args: any[]) => unknown>();
    const runProcess = vi.fn(options.runProcess ?? (async (_request, runtimeOptions) => {
      runtimeOptions.onOutput({ stream: 'stdout', text: 'done\n' });
      return {
        status: 'completed',
        exitCode: 0,
        signal: null,
        stdout: 'done\n',
        stderr: '',
        truncated: false,
        durationMs: 5,
      };
    }));
    const app = { getPath: () => tempDir, on: vi.fn() };
    registerDesktopCommandIpc({
      app,
      handleIpc: (channel, handler) => handlers.set(channel, handler),
      isProtectedPath: options.isProtectedPath ?? (async () => false),
      requireSafeIpcRequestId: safeId,
      runProcess,
      captureSnapshot: options.captureSnapshot,
      compareSnapshots: options.compareSnapshots,
      assertSandboxAvailable: () => '/usr/bin/bwrap',
      assertWorkspaceAuthorized: options.assertWorkspaceAuthorized ?? (async (candidatePath) => candidatePath),
      isProtectedWorkspace: () => false,
    });
    const createSender = (decision: 'run_once' | 'cancel' | null = options.decision ?? 'run_once') => {
      const activeSender = {
        isDestroyed: () => false,
        once: vi.fn(),
        removeListener: vi.fn(),
        send: vi.fn((channel: string, payload: { type?: string }) => {
          if (payload?.type === 'approval_requested' && decision) {
            const requestId = channel.split(':').at(-2) || '';
            queueMicrotask(() => {
              void handlers.get('desktop:computer-command:approve')?.(
                { sender: activeSender },
                requestId,
                decision,
              );
            });
          }
        }),
      };
      return activeSender;
    };
    return { app, createSender, handlers, runProcess };
  }

  it('requires renderer approval and does not run a denied command', async () => {
    const { createSender, handlers, runProcess } = registerHarness({ decision: 'cancel' });
    const activeSender = createSender();
    const result = await handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-1',
      { command: 'echo safe', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Check output', locale: 'zh-CN' },
    );

    expect(result).toMatchObject({ status: 'denied', command: 'echo safe', cwd: tempDir });
    expect(runProcess).not.toHaveBeenCalled();
    expect(activeSender.send).toHaveBeenCalledWith(
      'desktop:computer-command:request-1:event',
      expect.objectContaining({
        type: 'approval_requested',
        command: 'echo safe',
        cwd: tempDir,
        workspaceRoot: tempDir,
        purpose: 'Check output',
      }),
    );
  });

  it('runs the frozen approved command and streams bounded events to its sender', async () => {
    const { createSender, handlers, runProcess } = registerHarness();
    const activeSender = createSender();
    const result = await handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-2',
      { command: 'printf ok', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Print output' },
    );

    expect(result).toMatchObject({ status: 'completed', command: 'printf ok', cwd: tempDir });
    expect(runProcess).toHaveBeenCalledWith(expect.objectContaining({
      command: 'printf ok',
      cwd: tempDir,
      env: expect.objectContaining({ NO_COLOR: '1', FORCE_COLOR: '0' }),
    }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(activeSender.send).toHaveBeenCalledWith(
      'desktop:computer-command:request-2:event',
      { type: 'started' },
    );
    expect(activeSender.send).toHaveBeenCalledWith(
      'desktop:computer-command:request-2:event',
      { type: 'output', stream: 'stdout', text: 'done\n' },
    );
  });

  it('keeps always-run state out of privileged IPC', async () => {
    const { createSender, handlers, runProcess } = registerHarness();
    const activeSender = createSender(null);
    const running = handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-always',
      { command: 'pnpm install', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Install project dependencies' },
    );
    await vi.waitFor(() => expect(activeSender.send).toHaveBeenCalledWith(
      'desktop:computer-command:request-always:event',
      expect.objectContaining({ type: 'approval_requested' }),
    ));

    await expect(handlers.get('desktop:computer-command:approve')?.(
      { sender: activeSender },
      'request-always',
      'always',
    )).rejects.toThrow('Invalid computer command approval decision.');
    expect(runProcess).not.toHaveBeenCalled();
    await expect(handlers.get('desktop:computer-command:approve')?.(
      { sender: activeSender },
      'request-always',
      'cancel',
    )).resolves.toBe(true);
    await expect(running).resolves.toMatchObject({ status: 'denied' });
  });

  it('accepts approval responses only from the renderer that owns the request', async () => {
    const { createSender, handlers, runProcess } = registerHarness();
    const owner = createSender(null);
    const stranger = createSender(null);
    const running = handlers.get('desktop:computer-command:start')?.(
      { sender: owner },
      'request-owner-approval',
      { command: 'uname -a', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Inspect the system' },
    );
    await vi.waitFor(() => {
      expect(owner.send).toHaveBeenCalledWith(
        'desktop:computer-command:request-owner-approval:event',
        expect.objectContaining({ type: 'approval_requested' }),
      );
    });

    await expect(handlers.get('desktop:computer-command:approve')?.(
      { sender: stranger },
      'request-owner-approval',
      'run_once',
    )).resolves.toBe(false);
    expect(runProcess).not.toHaveBeenCalled();
    await expect(handlers.get('desktop:computer-command:approve')?.(
      { sender: owner },
      'request-owner-approval',
      'run_once',
    )).resolves.toBe(true);
    await expect(running).resolves.toMatchObject({ status: 'completed' });
  });

  it('returns locally captured file changes after an approved command', async () => {
    const commandCwd = path.join(tempDir, 'packages', 'app');
    await mkdir(commandCwd, { recursive: true });
    const captureSnapshot = vi.fn()
      .mockResolvedValueOnce({ version: 'before' })
      .mockResolvedValueOnce({ version: 'after' });
    const compareSnapshots = vi.fn(() => ({
      changes: [{
        path: 'src/app.ts',
        kind: 'modified',
        additions: 1,
        deletions: 1,
        patch: '@@ -1,1 +1,1 @@\n-old\n+new',
      }],
      truncated: false,
    }));
    const { createSender, handlers } = registerHarness({ captureSnapshot, compareSnapshots });

    const result = await handlers.get('desktop:computer-command:start')?.(
      { sender: createSender() },
      'request-changes',
      { command: 'printf ok', cwd: commandCwd, workspaceRoot: tempDir, purpose: 'Update a sibling file' },
    );

    expect(captureSnapshot).toHaveBeenCalledTimes(2);
    expect(captureSnapshot).toHaveBeenNthCalledWith(1, tempDir);
    expect(captureSnapshot).toHaveBeenNthCalledWith(2, tempDir);
    expect(compareSnapshots).toHaveBeenCalledWith({ version: 'before' }, { version: 'after' });
    expect(result).toMatchObject({
      fileChanges: [expect.objectContaining({ path: 'src/app.ts', additions: 1, deletions: 1 })],
    });
  });

  it('does not start an approved command if cancellation arrives during the initial snapshot', async () => {
    let releaseSnapshot: () => void = () => {};
    const snapshot = new Promise((resolve) => {
      releaseSnapshot = () => resolve({ files: new Map(), truncated: false });
    });
    const captureSnapshot = vi.fn(() => snapshot);
    const { createSender, handlers, runProcess } = registerHarness({ captureSnapshot });
    const activeSender = createSender();
    const running = handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-snapshot-cancel',
      { command: 'printf unsafe', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Wait for the snapshot' },
    );
    await vi.waitFor(() => expect(captureSnapshot).toHaveBeenCalledTimes(1));

    await expect(handlers.get('desktop:computer-command:cancel')?.(
      { sender: activeSender },
      'request-snapshot-cancel',
    )).resolves.toBe(true);
    releaseSnapshot();

    await expect(running).resolves.toMatchObject({ status: 'cancelled' });
    expect(runProcess).not.toHaveBeenCalled();
  });

  it('rejects missing working directories before showing approval', async () => {
    const { createSender, handlers, runProcess } = registerHarness();
    const activeSender = createSender();

    await expect(handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-3',
      { command: 'echo no', cwd: path.join(tempDir, 'missing'), workspaceRoot: tempDir, purpose: 'Check a missing directory' },
    )).rejects.toThrow('Command working directory is unavailable.');
    expect(activeSender.send).not.toHaveBeenCalled();
    expect(runProcess).not.toHaveBeenCalled();
  });

  it('rejects renderer-supplied workspaces that the user did not authorize', async () => {
    const assertWorkspaceAuthorized = vi.fn(async () => {
      throw new Error('not authorized');
    });
    const { createSender, handlers, runProcess } = registerHarness({ assertWorkspaceAuthorized });
    const activeSender = createSender();

    await expect(handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-unauthorized-workspace',
      { command: 'pwd', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Inspect the workspace' },
    )).rejects.toThrow('Active workspace is not authorized for computer operations.');

    expect(assertWorkspaceAuthorized).toHaveBeenCalledWith(tempDir);
    expect(activeSender.send).not.toHaveBeenCalled();
    expect(runProcess).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === 'win32')('reauthorizes a workspace after resolving its symlink target', async () => {
    const authorizedDir = path.join(tempDir, 'authorized');
    const unauthorizedDir = path.join(tempDir, 'unauthorized');
    const workspaceLink = path.join(tempDir, 'workspace');
    await mkdir(authorizedDir);
    await mkdir(unauthorizedDir);
    await symlink(authorizedDir, workspaceLink);
    const assertWorkspaceAuthorized = vi.fn(async (candidatePath: string) => {
      if (candidatePath === workspaceLink) {
        await unlink(workspaceLink);
        await symlink(unauthorizedDir, workspaceLink);
        return candidatePath;
      }
      if (candidatePath === unauthorizedDir) {
        throw new Error('not authorized');
      }
      return candidatePath;
    });
    const { createSender, handlers, runProcess } = registerHarness({ assertWorkspaceAuthorized });
    const activeSender = createSender();

    await expect(handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-workspace-symlink-race',
      { command: 'pwd', cwd: workspaceLink, workspaceRoot: workspaceLink, purpose: 'Inspect the workspace' },
    )).rejects.toThrow('Active workspace is not authorized for computer operations.');

    expect(assertWorkspaceAuthorized).toHaveBeenNthCalledWith(1, workspaceLink);
    expect(assertWorkspaceAuthorized).toHaveBeenNthCalledWith(2, unauthorizedDir);
    expect(activeSender.send).not.toHaveBeenCalled();
    expect(runProcess).not.toHaveBeenCalled();
  });

  it('rejects Codex configuration access before showing approval', async () => {
    const codexDir = path.join(tempDir, '.codex');
    await mkdir(codexDir);
    const { createSender, handlers, runProcess } = registerHarness();
    const activeSender = createSender();

    await expect(handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-codex-cwd',
      { command: 'pwd', cwd: codexDir, workspaceRoot: tempDir, purpose: 'Inspect Codex configuration' },
    )).rejects.toThrow('protected from computer operations');
    await expect(handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-codex-command',
      { command: 'type %USERPROFILE%\\.codex\\config.toml', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Read Codex configuration' },
    )).rejects.toThrow('protected Codex configuration');

    expect(activeSender.send).not.toHaveBeenCalled();
    expect(runProcess).not.toHaveBeenCalled();
  });

  it('rejects detached commands before showing approval', async () => {
    const { createSender, handlers, runProcess } = registerHarness();
    const activeSender = createSender();

    await expect(handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-background',
      { command: 'sleep 10 &', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Start a background process' },
    )).rejects.toThrow('background commands');

    expect(activeSender.send).not.toHaveBeenCalled();
    expect(runProcess).not.toHaveBeenCalled();
  });

  it('reserves request ids before asynchronous path checks', async () => {
    let releasePathCheck: () => void = () => {};
    const pathCheck = new Promise<void>((resolve) => {
      releasePathCheck = resolve;
    });
    const isProtectedPath = vi.fn(async () => {
      await pathCheck;
      return false;
    });
    const { createSender, handlers } = registerHarness({ isProtectedPath });
    const activeSender = createSender();
    const first = handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-race',
      { command: 'echo first', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Check the first request' },
    );

    await vi.waitFor(() => expect(isProtectedPath).toHaveBeenCalledTimes(1));
    await expect(handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-race',
      { command: 'echo second', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Check the second request' },
    )).rejects.toThrow('already active');

    releasePathCheck();
    await expect(first).resolves.toMatchObject({ status: 'completed' });
  });

  it('enforces the concurrency limit while path checks are pending', async () => {
    let releasePathChecks: () => void = () => {};
    const pathChecks = new Promise<void>((resolve) => {
      releasePathChecks = resolve;
    });
    const isProtectedPath = vi.fn(async () => {
      await pathChecks;
      return false;
    });
    const { createSender, handlers } = registerHarness({ isProtectedPath });
    const activeSender = createSender();
    const running = Array.from({ length: 4 }, (_, index) => (
      handlers.get('desktop:computer-command:start')?.(
        { sender: activeSender },
        `request-limit-${index}`,
        { command: `echo ${index}`, cwd: tempDir, workspaceRoot: tempDir, purpose: `Check request ${index}` },
      )
    ));

    await vi.waitFor(() => expect(isProtectedPath).toHaveBeenCalledTimes(4));
    await expect(handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-limit-4',
      { command: 'echo blocked', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Exceed the command limit' },
    )).rejects.toThrow('Too many computer commands are active');

    releasePathChecks();
    await expect(Promise.all(running)).resolves.toHaveLength(4);
  });

  it.skipIf(process.platform === 'win32')('blocks working-directory symlinks that resolve into protected storage', async () => {
    const protectedDir = path.join(tempDir, 'protected');
    const linkedDir = path.join(tempDir, 'workspace-link');
    await mkdir(protectedDir);
    await symlink(protectedDir, linkedDir);
    const isProtectedPath = vi.fn(async (candidatePath: string) => path.basename(candidatePath) === 'protected');
    const { createSender, handlers, runProcess } = registerHarness({ isProtectedPath });
    const activeSender = createSender();

    await expect(handlers.get('desktop:computer-command:start')?.(
      { sender: activeSender },
      'request-symlink',
      { command: 'pwd', cwd: linkedDir, workspaceRoot: tempDir, purpose: 'Print the working directory' },
    )).rejects.toThrow('reserved for internal desktop storage');

    expect(isProtectedPath).toHaveBeenCalledWith(linkedDir);
    expect(isProtectedPath).toHaveBeenCalledWith(protectedDir);
    expect(activeSender.send).not.toHaveBeenCalled();
    expect(runProcess).not.toHaveBeenCalled();
  });

  it('cancels only commands owned by the requesting renderer', async () => {
    const started = new Promise<void>((resolve) => {
      void mkdir(path.join(tempDir, 'ready')).then(() => resolve());
    });
    await started;
    let observedSignal: AbortSignal | null = null;
    const { createSender, handlers } = registerHarness({
      runProcess: async (_request, runtimeOptions) => {
        observedSignal = runtimeOptions.signal;
        return await new Promise((resolve) => {
          runtimeOptions.signal.addEventListener('abort', () => resolve({
            status: 'cancelled',
            exitCode: null,
            signal: null,
            stdout: '',
            stderr: '',
            truncated: false,
            durationMs: 1,
          }), { once: true });
        });
      },
    });
    const owner = createSender();
    const stranger = createSender();
    const running = handlers.get('desktop:computer-command:start')?.(
      { sender: owner },
      'request-4',
      { command: 'sleep 10', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Wait for cancellation' },
    );
    await vi.waitFor(() => expect(observedSignal).not.toBeNull());

    await expect(handlers.get('desktop:computer-command:cancel')?.(
      { sender: stranger },
      'request-4',
    )).resolves.toBe(false);
    expect(observedSignal?.aborted).toBe(false);
    await expect(handlers.get('desktop:computer-command:cancel')?.(
      { sender: owner },
      'request-4',
    )).resolves.toBe(true);
    await expect(running).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('cancels active commands when the desktop app quits', async () => {
    let observedSignal: AbortSignal | null = null;
    const { app, createSender, handlers } = registerHarness({
      runProcess: async (_request, runtimeOptions) => {
        observedSignal = runtimeOptions.signal;
        return await new Promise((resolve) => {
          runtimeOptions.signal.addEventListener('abort', () => resolve({
            status: 'cancelled',
            exitCode: null,
            signal: null,
            stdout: '',
            stderr: '',
            truncated: false,
            durationMs: 1,
          }), { once: true });
        });
      },
    });
    const running = handlers.get('desktop:computer-command:start')?.(
      { sender: createSender() },
      'request-app-quit',
      { command: 'sleep 10', cwd: tempDir, workspaceRoot: tempDir, purpose: 'Wait for app shutdown' },
    );
    await vi.waitFor(() => expect(observedSignal).not.toBeNull());

    const beforeQuit = app.on.mock.calls.find(([event]) => event === 'before-quit')?.[1];
    beforeQuit?.();

    expect(observedSignal?.aborted).toBe(true);
    expect(observedSignal?.reason).toBe('app_quit');
    await expect(running).resolves.toMatchObject({ status: 'cancelled' });
  });
});
