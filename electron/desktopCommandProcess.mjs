import { spawn } from 'node:child_process';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import {
  assertDesktopCommandSandboxAvailable,
  buildManagedShellCommand,
  buildSandboxedDesktopCommandLaunch,
} from './desktopCommandSandbox.mjs';

export { assertDesktopCommandSandboxAvailable };

export const MAX_DESKTOP_COMMAND_OUTPUT_BYTES = 64 * 1024;
const FORCE_KILL_DELAY_MS = 1500;

function appendBoundedBuffer(current, chunk) {
  const combined = Buffer.concat([current, chunk]);
  if (combined.byteLength <= MAX_DESKTOP_COMMAND_OUTPUT_BYTES) {
    return { buffer: combined, truncated: false };
  }
  return {
    buffer: combined.subarray(combined.byteLength - MAX_DESKTOP_COMMAND_OUTPUT_BYTES),
    truncated: true,
  };
}

function killWindowsProcessTree(pid, shell, spawnImpl) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    const taskkill = path.win32.join(path.win32.dirname(shell), 'taskkill.exe');
    const killer = spawnImpl(taskkill, ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.unref?.();
  } catch {}
}

function killPosixProcessTree(child, signal) {
  const pid = child.pid;
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(-pid, signal);
      return;
    } catch {}
  }
  try {
    child.kill(signal);
  } catch {}
}

function stopProcessTree(child, platform, shell, spawnImpl, force = false) {
  if (platform === 'win32') {
    killWindowsProcessTree(child.pid, shell, spawnImpl);
    return () => {};
  }

  if (force) {
    killPosixProcessTree(child, 'SIGKILL');
    return () => {};
  }

  killPosixProcessTree(child, 'SIGTERM');
  const timer = setTimeout(() => {
    killPosixProcessTree(child, 'SIGKILL');
  }, FORCE_KILL_DELAY_MS);
  timer.unref?.();
  return () => clearTimeout(timer);
}

export function runDesktopCommandProcess(request, options = {}) {
  const platform = options.platform ?? process.platform;
  const spawnImpl = options.spawnImpl ?? spawn;
  const startedAt = Date.now();
  let child;
  let cleanupSandbox = () => {};

  try {
    const launch = options.disableSandbox === true
      ? {
          args: [...request.shellArgs, buildManagedShellCommand(request.command, platform)],
          command: request.shell,
          env: request.env,
          cleanup: cleanupSandbox,
        }
      : buildSandboxedDesktopCommandLaunch(request, platform, options);
    cleanupSandbox = launch.cleanup;
    child = spawnImpl(launch.command, launch.args, {
      cwd: request.cwd,
      env: launch.env,
      detached: platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (error) {
    cleanupSandbox();
    return Promise.resolve({
      status: 'failed',
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Failed to start command.',
      truncated: false,
      durationMs: Date.now() - startedAt,
    });
  }

  return new Promise((resolve) => {
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let stdoutBuffer = Buffer.alloc(0);
    let stderrBuffer = Buffer.alloc(0);
    let outputTruncated = false;
    let forwardedStdoutBytes = 0;
    let forwardedStderrBytes = 0;
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let clearForcedKill = () => {};

    const appendOutput = (stream, value) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const current = stream === 'stdout' ? stdoutBuffer : stderrBuffer;
      const next = appendBoundedBuffer(current, chunk);
      outputTruncated ||= next.truncated;
      if (stream === 'stdout') stdoutBuffer = next.buffer;
      else stderrBuffer = next.buffer;
      const decoder = stream === 'stdout' ? stdoutDecoder : stderrDecoder;
      const forwardedBytes = stream === 'stdout' ? forwardedStdoutBytes : forwardedStderrBytes;
      const remainingBytes = Math.max(0, MAX_DESKTOP_COMMAND_OUTPUT_BYTES - forwardedBytes);
      const forwardedChunk = remainingBytes > 0 ? chunk.subarray(0, remainingBytes) : Buffer.alloc(0);
      if (stream === 'stdout') forwardedStdoutBytes += forwardedChunk.byteLength;
      else forwardedStderrBytes += forwardedChunk.byteLength;
      const text = decoder.write(forwardedChunk);
      if (text) options.onOutput?.({ stream, text });
    };

    const stop = (reason, force = false) => {
      if (settled || cancelled || timedOut) return;
      cancelled = reason === 'cancelled';
      timedOut = reason === 'timed_out';
      clearForcedKill = stopProcessTree(child, platform, request.shell, spawnImpl, force);
    };

    const abort = () => stop('cancelled', options.signal?.reason === 'app_quit');
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const timeout = setTimeout(() => stop('timed_out'), request.timeoutMs);
    timeout.unref?.();

    child.stdout?.on('data', (chunk) => appendOutput('stdout', chunk));
    child.stderr?.on('data', (chunk) => appendOutput('stderr', chunk));
    child.once('error', (error) => {
      appendOutput('stderr', Buffer.from(error instanceof Error ? error.message : 'Command failed.'));
    });
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!cancelled && !timedOut) clearForcedKill();
      if (!cancelled && !timedOut && platform !== 'win32') {
        stopProcessTree(child, platform, request.shell, spawnImpl, true);
      }
      cleanupSandbox();
      options.signal?.removeEventListener('abort', abort);
      stdoutDecoder.end();
      stderrDecoder.end();
      const stdout = stdoutBuffer.toString('utf8');
      const stderr = stderrBuffer.toString('utf8');
      resolve({
        status: timedOut
          ? 'timed_out'
          : cancelled
            ? 'cancelled'
            : exitCode === 0
              ? 'completed'
              : 'failed',
        exitCode: typeof exitCode === 'number' ? exitCode : null,
        signal: typeof signal === 'string' ? signal : null,
        stdout,
        stderr,
        truncated: outputTruncated,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}
