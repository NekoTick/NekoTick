import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  assertDesktopCommandSandboxAvailable,
  runDesktopCommandProcess,
  MAX_DESKTOP_COMMAND_OUTPUT_BYTES,
} from '../../electron/desktopCommandProcess.mjs';

const isWindows = process.platform === 'win32';

function request(command: string, timeoutMs = 5000) {
  return {
    command,
    cwd: process.cwd(),
    env: { PATH: process.env.PATH || '', HOME: process.env.HOME || '', NO_COLOR: '1' },
    shell: '/bin/sh',
    shellArgs: ['-c'],
    timeoutMs,
  };
}

describe.skipIf(isWindows)('desktop command process', () => {
  it('captures stdout, stderr, exit code, and duration', async () => {
    const result = await runDesktopCommandProcess(request("printf 'out'; printf 'err' >&2"), { disableSandbox: true });

    expect(result).toMatchObject({
      status: 'completed',
      exitCode: 0,
      stdout: 'out',
      stderr: 'err',
      truncated: false,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('bounds large process output returned to the model', async () => {
    const result = await runDesktopCommandProcess(request('yes x | head -c 70000'), { disableSandbox: true });

    expect(result.status).toBe('completed');
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(MAX_DESKTOP_COMMAND_OUTPUT_BYTES);
    expect(result.truncated).toBe(true);
  });

  it('terminates the process group when the request is cancelled', async () => {
    const controller = new AbortController();
    const startedAt = Date.now();
    const running = runDesktopCommandProcess(request('sleep 10', 15_000), {
      disableSandbox: true,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 30);

    await expect(running).resolves.toMatchObject({ status: 'cancelled' });
    expect(Date.now() - startedAt).toBeLessThan(3000);
  });

  it('terminates commands that exceed their timeout', async () => {
    const startedAt = Date.now();
    await expect(runDesktopCommandProcess(request('sleep 10', 30), { disableSandbox: true })).resolves.toMatchObject({
      status: 'timed_out',
    });
    expect(Date.now() - startedAt).toBeLessThan(3000);
  });

  it('keeps a background child under the command timeout', async () => {
    const result = await runDesktopCommandProcess(request(
      'sleep 10 >/dev/null 2>&1 & echo $!',
      30,
    ), { disableSandbox: true });
    const childPid = Number.parseInt(result.stdout.trim(), 10);

    expect(result.status).toBe('timed_out');
    expect(childPid).toBeGreaterThan(0);
    await vi.waitFor(() => {
      expect(() => process.kill(childPid, 0)).toThrow();
    }, { timeout: 2000 });
  });

  it('cleans the process group when the shell exits before its child', async () => {
    const result = await runDesktopCommandProcess(request(
      'sleep 10 >/dev/null 2>&1 & echo $!; exit 0',
    ), { disableSandbox: true });
    const childPid = Number.parseInt(result.stdout.trim(), 10);

    expect(result.status).toBe('completed');
    expect(childPid).toBeGreaterThan(0);
    await vi.waitFor(() => {
      expect(() => process.kill(childPid, 0)).toThrow();
    }, { timeout: 2000 });
  });
});

describe('desktop command process Windows termination', () => {
  it('uses the fixed System32 taskkill path instead of PATH lookup', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdout: PassThrough;
      stderr: PassThrough;
    };
    child.pid = 123;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const killer = { unref: vi.fn() };
    const spawnImpl = vi.fn()
      .mockReturnValueOnce(child)
      .mockReturnValueOnce(killer);
    const controller = new AbortController();
    const running = runDesktopCommandProcess({
      ...request('echo ok'),
      shell: 'C:\\Windows\\System32\\cmd.exe',
      shellArgs: ['/d', '/s', '/c'],
    }, {
      platform: 'win32',
      disableSandbox: true,
      signal: controller.signal,
      spawnImpl,
    });

    controller.abort();
    child.emit('close', null, 'SIGTERM');

    await expect(running).resolves.toMatchObject({ status: 'cancelled' });
    expect(spawnImpl).toHaveBeenNthCalledWith(
      2,
      'C:\\Windows\\System32\\taskkill.exe',
      ['/pid', '123', '/t', '/f'],
      { stdio: 'ignore', windowsHide: true },
    );
  });
});

describe.skipIf(isWindows)('desktop command process app shutdown', () => {
  it('force-kills the process group immediately when the app quits', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.pid = 456;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue(child);
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const controller = new AbortController();
    const running = runDesktopCommandProcess(request('sleep 10'), {
      platform: 'linux',
      disableSandbox: true,
      signal: controller.signal,
      spawnImpl,
    });

    controller.abort('app_quit');
    child.emit('close', null, 'SIGKILL');

    await expect(running).resolves.toMatchObject({ status: 'cancelled' });
    expect(kill).toHaveBeenCalledWith(-456, 'SIGKILL');
    kill.mockRestore();
  });
});

describe.skipIf(isWindows)('desktop command process cleanup', () => {
  it('force-kills remaining process-group members immediately after the shell closes', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.pid = 457;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const running = runDesktopCommandProcess(request('true'), {
      platform: 'linux',
      disableSandbox: true,
      spawnImpl: vi.fn().mockReturnValue(child),
    });

    child.emit('close', 0, null);

    await expect(running).resolves.toMatchObject({ status: 'completed' });
    expect(kill).toHaveBeenCalledWith(-457, 'SIGKILL');
    kill.mockRestore();
  });
});

describe('desktop command process sandbox', () => {
  it('fails closed when no supported sandbox exists', () => {
    expect(() => assertDesktopCommandSandboxAvailable({
      platform: 'win32',
      accessImpl: vi.fn(),
    })).toThrow('secure command sandbox is unavailable');
    expect(() => assertDesktopCommandSandboxAvailable({
      platform: 'linux',
      accessImpl: vi.fn(() => { throw new Error('missing'); }),
    })).toThrow('Bubblewrap sandbox is unavailable');
  });

  it('launches Linux commands inside a network-isolated workspace bind', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.pid = 789;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue(child);
    const workspaceRoot = process.cwd();
    const running = runDesktopCommandProcess({
      ...request('pwd'),
      sandboxExecutable: '/usr/bin/bwrap',
      sandboxRoot: workspaceRoot,
    }, {
      platform: 'linux',
      spawnImpl,
      existsImpl: (candidatePath: string) => ['/usr', '/bin', '/lib', '/etc'].includes(candidatePath),
    });
    child.emit('close', 0, null);

    await expect(running).resolves.toMatchObject({ status: 'completed' });
    const [executable, args, options] = spawnImpl.mock.calls[0];
    expect(executable).toBe('/usr/bin/bwrap');
    expect(args).toEqual(expect.arrayContaining([
      '--unshare-all',
      '--bind', workspaceRoot, workspaceRoot,
      '--ro-bind', path.join(workspaceRoot, '.git'), path.join(workspaceRoot, '.git'),
      '--chdir', workspaceRoot,
      '--setenv', 'HOME', '/tmp/vlaina-home',
    ]));
    expect(args).not.toEqual(expect.arrayContaining(['--ro-bind', '/etc', '/etc']));
    expect(args.at(-3)).toBe('/bin/sh');
    expect(args.at(-2)).toBe('-c');
    expect(options.env.HOME).toBe('/tmp/vlaina-home');
    expect(options.env.PATH).toBe('/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin');
    expect(options.env.PATH).not.toContain('.codex');
    expect(options.env.USER).toBe('vlaina');
    expect(options.env.LOGNAME).toBe('vlaina');
  });

  it('removes an empty Git metadata mount point created for the sandbox', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'vlaina-command-sandbox-'));
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.pid = 790;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue(child);

    try {
      const running = runDesktopCommandProcess({
        ...request('pwd'),
        cwd: workspaceRoot,
        sandboxExecutable: '/usr/bin/bwrap',
        sandboxRoot: workspaceRoot,
      }, { platform: 'linux', spawnImpl });

      expect((await stat(path.join(workspaceRoot, '.git'))).isDirectory()).toBe(true);
      child.emit('close', 0, null);
      await expect(running).resolves.toMatchObject({ status: 'completed' });
      await expect(stat(path.join(workspaceRoot, '.git'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('protects an internal separate Git directory before launching the sandbox', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'vlaina-command-sandbox-'));
    const gitFile = path.join(workspaceRoot, '.git');
    const gitDirectory = path.join(workspaceRoot, '.repo');
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.pid = 791;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue(child);

    try {
      await mkdir(gitDirectory);
      await writeFile(gitFile, 'gitdir: .repo\n');
      const running = runDesktopCommandProcess({
        ...request('pwd'),
        cwd: workspaceRoot,
        sandboxExecutable: '/usr/bin/bwrap',
        sandboxRoot: workspaceRoot,
      }, { platform: 'linux', spawnImpl });
      child.emit('close', 0, null);

      await expect(running).resolves.toMatchObject({ status: 'completed' });
      const args = spawnImpl.mock.calls[0][1];
      const gitFileMount = args.findIndex((value: string, index: number) => (
        value === '--ro-bind' && args[index + 1] === gitFile
      ));
      const gitDirectoryMount = args.findIndex((value: string, index: number) => (
        value === '--ro-bind' && args[index + 1] === gitDirectory
      ));
      expect(args.slice(gitFileMount, gitFileMount + 3)).toEqual(['--ro-bind', gitFile, gitFile]);
      expect(args.slice(gitDirectoryMount, gitDirectoryMount + 3)).toEqual([
        '--ro-bind', gitDirectory, gitDirectory,
      ]);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('rejects symbolic Git metadata before launching the sandbox', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'vlaina-command-sandbox-'));
    await symlink('.', path.join(workspaceRoot, '.git'));
    const spawnImpl = vi.fn();

    try {
      await expect(runDesktopCommandProcess({
        ...request('pwd'),
        cwd: workspaceRoot,
        sandboxExecutable: '/usr/bin/bwrap',
        sandboxRoot: workspaceRoot,
      }, { platform: 'linux', spawnImpl })).resolves.toMatchObject({
        status: 'failed',
        stderr: 'Workspace Git metadata cannot be safely protected.',
      });
      expect(spawnImpl).not.toHaveBeenCalled();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('rejects a symbolic internal separate Git directory before launching the sandbox', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'vlaina-command-sandbox-'));
    const spawnImpl = vi.fn();

    try {
      await mkdir(path.join(workspaceRoot, '.repo'));
      await symlink('.repo', path.join(workspaceRoot, '.repo-link'));
      await writeFile(path.join(workspaceRoot, '.git'), 'gitdir: .repo-link\n');
      await expect(runDesktopCommandProcess({
        ...request('pwd'),
        cwd: workspaceRoot,
        sandboxExecutable: '/usr/bin/bwrap',
        sandboxRoot: workspaceRoot,
      }, { platform: 'linux', spawnImpl })).resolves.toMatchObject({
        status: 'failed',
        stderr: 'Workspace Git metadata cannot be safely protected.',
      });
      expect(spawnImpl).not.toHaveBeenCalled();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform !== 'linux' || !existsSync('/usr/bin/bwrap'))(
    'keeps Git metadata read-only while persisting ordinary workspace changes',
    async () => {
      const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'vlaina-command-sandbox-'));
      try {
        const result = await runDesktopCommandProcess({
          ...request('if printf protected > .git/config 2>/dev/null; then exit 40; fi; printf allowed > result.txt'),
          cwd: workspaceRoot,
          sandboxExecutable: '/usr/bin/bwrap',
          sandboxRoot: workspaceRoot,
        }, { platform: 'linux' });

        expect(result.status, result.stderr).toBe('completed');
        await expect(readFile(path.join(workspaceRoot, 'result.txt'), 'utf8')).resolves.toBe('allowed');
        await expect(stat(path.join(workspaceRoot, '.git'))).rejects.toMatchObject({ code: 'ENOENT' });
      } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform !== 'linux' || !existsSync('/usr/bin/bwrap'))(
    'keeps an internal separate Git directory read-only while persisting ordinary workspace changes',
    async () => {
      const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'vlaina-command-sandbox-'));
      const gitFile = path.join(workspaceRoot, '.git');
      const gitConfig = path.join(workspaceRoot, '.repo', 'config');
      try {
        await mkdir(path.dirname(gitConfig));
        await writeFile(gitFile, 'gitdir: .repo\n');
        await writeFile(gitConfig, 'protected');
        const result = await runDesktopCommandProcess({
          ...request(
            "if { printf changed > .git; } 2>/dev/null; then exit 40; fi; "
              + "if { printf changed > .repo/config; } 2>/dev/null; then exit 41; fi; "
              + 'printf allowed > result.txt',
          ),
          cwd: workspaceRoot,
          sandboxExecutable: '/usr/bin/bwrap',
          sandboxRoot: workspaceRoot,
        }, { platform: 'linux' });

        expect(result.status, result.stderr).toBe('completed');
        await expect(readFile(gitFile, 'utf8')).resolves.toBe('gitdir: .repo\n');
        await expect(readFile(gitConfig, 'utf8')).resolves.toBe('protected');
        await expect(readFile(path.join(workspaceRoot, 'result.txt'), 'utf8')).resolves.toBe('allowed');
      } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
      }
    },
  );
});
