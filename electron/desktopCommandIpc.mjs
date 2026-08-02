import { stat } from 'node:fs/promises';
import {
  assertDesktopCommandAllowed,
  buildDesktopCommandEnvironment,
  getDesktopCommandShell,
  normalizeDesktopCommandRequest,
} from './desktopCommandPolicy.mjs';
import {
  assertDesktopCommandSandboxAvailable,
  runDesktopCommandProcess,
} from './desktopCommandProcess.mjs';
import {
  captureDesktopCommandSnapshot,
  compareDesktopCommandSnapshots,
} from './desktopCommandChanges.mjs';
import { assertAuthorizedFsPath } from './fsAccess.mjs';
import {
  isProtectedCodexConfigPath,
  isProtectedDesktopCommandWorkspacePath,
  isProtectedDesktopCommandWorkspaceRealPath,
  isProtectedFsAccessPath,
  isSameOrChildPath,
  resolveRealFsAccessPath,
} from './fsAccessPathPolicy.mjs';

const MAX_ACTIVE_DESKTOP_COMMANDS = 4;
const activeDesktopCommands = new Map();

function abortActiveDesktopCommands(reason) {
  for (const active of activeDesktopCommands.values()) {
    active.controller.abort(reason);
  }
}

function safeSend(sender, channel, payload) {
  if (!sender || sender.isDestroyed?.()) return false;
  try {
    sender.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}

function requestApproval(active, channel, request) {
  return new Promise((resolve) => {
    if (active.controller.signal.aborted) {
      resolve('cancel');
      return;
    }
    let settled = false;
    const finish = (decision) => {
      if (settled) return false;
      settled = true;
      active.controller.signal.removeEventListener('abort', abort);
      active.approval = null;
      resolve(decision);
      return true;
    };
    const abort = () => finish('cancel');
    active.approval = {
      respond: finish,
    };
    active.controller.signal.addEventListener('abort', abort, { once: true });
    if (!safeSend(active.sender, channel, {
      type: 'approval_requested',
      command: request.command,
      cwd: request.cwd,
      workspaceRoot: request.workspaceRoot,
      purpose: request.purpose,
      timeoutSeconds: Math.round(request.timeoutMs / 1000),
    })) {
      finish('cancel');
    }
  });
}

function removeActiveCommand(requestId, controller) {
  if (activeDesktopCommands.get(requestId)?.controller === controller) {
    activeDesktopCommands.delete(requestId);
  }
}

export function registerDesktopCommandIpc({
  app,
  handleIpc,
  requireSafeIpcRequestId,
  isProtectedPath = isProtectedFsAccessPath,
  runProcess = runDesktopCommandProcess,
  captureSnapshot = captureDesktopCommandSnapshot,
  compareSnapshots = compareDesktopCommandSnapshots,
  assertSandboxAvailable = assertDesktopCommandSandboxAvailable,
  assertWorkspaceAuthorized = assertAuthorizedFsPath,
  isProtectedWorkspace,
}) {
  app.on?.('before-quit', () => abortActiveDesktopCommands('app_quit'));

  handleIpc('desktop:computer-command:approve', async (event, rawRequestId, decision) => {
    const requestId = requireSafeIpcRequestId(rawRequestId, 'Computer command request id');
    if (decision !== 'run_once' && decision !== 'cancel') {
      throw new Error('Invalid computer command approval decision.');
    }
    const active = activeDesktopCommands.get(requestId);
    if (!active || active.sender !== event.sender || !active.approval) return false;
    return active.approval.respond(decision);
  });

  handleIpc('desktop:computer-command:start', async (event, rawRequestId, rawRequest) => {
    const requestId = requireSafeIpcRequestId(rawRequestId, 'Computer command request id');
    if (activeDesktopCommands.has(requestId)) {
      throw new Error('A computer command with this request id is already active.');
    }
    if (activeDesktopCommands.size >= MAX_ACTIVE_DESKTOP_COMMANDS) {
      throw new Error('Too many computer commands are active.');
    }

    const normalizedRequest = normalizeDesktopCommandRequest(rawRequest);
    assertDesktopCommandAllowed(normalizedRequest.command);
    const sandboxExecutable = assertSandboxAvailable();
    const protectedWorkspaceOptions = {
      homePath: app.getPath('home'),
      userDataPath: app.getPath('userData'),
    };
    const workspaceIsProtected = isProtectedWorkspace ?? ((candidatePath) => (
      isProtectedDesktopCommandWorkspacePath(candidatePath, protectedWorkspaceOptions)
    ));
    if (workspaceIsProtected(normalizedRequest.workspaceRoot)) {
      throw new Error('Active workspace contains protected desktop data.');
    }
    if (isProtectedCodexConfigPath(normalizedRequest.cwd, { homePath: app.getPath('home') })) {
      throw new Error('Command working directory is protected from computer operations.');
    }
    const controller = new AbortController();
    const sender = event.sender;
    const channel = `desktop:computer-command:${requestId}:event`;
    const abortOnSenderDestroyed = () => controller.abort();
    sender.once?.('destroyed', abortOnSenderDestroyed);
    const active = { controller, sender, approval: null };
    activeDesktopCommands.set(requestId, active);

    try {
      try {
        await assertWorkspaceAuthorized(normalizedRequest.workspaceRoot);
      } catch {
        throw new Error('Active workspace is not authorized for computer operations.');
      }
      if (await isProtectedPath(normalizedRequest.workspaceRoot) || await isProtectedPath(normalizedRequest.cwd)) {
        throw new Error('Command working directory is reserved for internal desktop storage.');
      }
      let realWorkspaceRoot;
      let realCwd;
      try {
        realWorkspaceRoot = await resolveRealFsAccessPath(normalizedRequest.workspaceRoot);
        realCwd = await resolveRealFsAccessPath(normalizedRequest.cwd);
      } catch {
        throw new Error('Command working directory is unavailable.');
      }
      if (!isSameOrChildPath(realWorkspaceRoot, realCwd)) {
        throw new Error('Command working directory must stay inside the active workspace.');
      }
      if (await isProtectedPath(realWorkspaceRoot) || await isProtectedPath(realCwd)) {
        throw new Error('Command working directory is reserved for internal desktop storage.');
      }
      const realWorkspaceIsProtected = isProtectedWorkspace
        ? workspaceIsProtected(realWorkspaceRoot)
        : await isProtectedDesktopCommandWorkspaceRealPath(
            realWorkspaceRoot,
            protectedWorkspaceOptions,
          );
      if (realWorkspaceIsProtected) {
        throw new Error('Active workspace contains protected desktop data.');
      }
      if (isProtectedCodexConfigPath(realCwd, { homePath: app.getPath('home') })) {
        throw new Error('Command working directory is protected from computer operations.');
      }
      try {
        await assertWorkspaceAuthorized(realWorkspaceRoot);
      } catch {
        throw new Error('Active workspace is not authorized for computer operations.');
      }
      let info;
      try {
        const workspaceInfo = await stat(realWorkspaceRoot);
        info = await stat(realCwd);
        if (!workspaceInfo.isDirectory()) {
          throw new Error('invalid workspace');
        }
      } catch {
        throw new Error('Command working directory is unavailable.');
      }
      if (!info.isDirectory()) {
        throw new Error('Command working directory must be a directory.');
      }
      const request = {
        ...normalizedRequest,
        cwd: realCwd,
        sandboxExecutable,
        sandboxRoot: realWorkspaceRoot,
        workspaceRoot: realWorkspaceRoot,
      };

      const decision = await requestApproval(active, channel, request);
      if (controller.signal.aborted) {
        return { status: 'cancelled', command: request.command, cwd: request.cwd };
      }
      if (decision !== 'run_once') {
        return { status: 'denied', command: request.command, cwd: request.cwd };
      }

      let beforeSnapshot = null;
      try {
        beforeSnapshot = await captureSnapshot(request.workspaceRoot);
      } catch {}
      if (controller.signal.aborted) {
        return { status: 'cancelled', command: request.command, cwd: request.cwd };
      }

      safeSend(sender, channel, { type: 'started' });
      const shell = getDesktopCommandShell();
      const result = await runProcess({
        ...request,
        env: buildDesktopCommandEnvironment(),
        shell: shell.shell,
        shellArgs: shell.args,
      }, {
        signal: controller.signal,
        onOutput: ({ stream, text }) => {
          safeSend(sender, channel, { type: 'output', stream, text });
        },
      });
      let fileChanges = [];
      let fileChangesTruncated = false;
      if (beforeSnapshot) {
        try {
          const afterSnapshot = await captureSnapshot(request.workspaceRoot);
          const compared = compareSnapshots(beforeSnapshot, afterSnapshot);
          fileChanges = compared.changes;
          fileChangesTruncated = compared.truncated;
        } catch {
          fileChangesTruncated = true;
        }
      }
      return {
        ...result,
        command: request.command,
        cwd: request.cwd,
        ...(fileChanges.length > 0 ? { fileChanges } : {}),
        ...(fileChangesTruncated ? { fileChangesTruncated: true } : {}),
      };
    } finally {
      sender.removeListener?.('destroyed', abortOnSenderDestroyed);
      removeActiveCommand(requestId, controller);
    }
  });

  handleIpc('desktop:computer-command:cancel', async (event, rawRequestId) => {
    const requestId = requireSafeIpcRequestId(rawRequestId, 'Computer command request id');
    const active = activeDesktopCommands.get(requestId);
    if (!active || active.sender !== event.sender) return false;
    active.controller.abort();
    return true;
  });
}

export function resetDesktopCommandsForTests() {
  abortActiveDesktopCommands('test_reset');
  activeDesktopCommands.clear();
}
