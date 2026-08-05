import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
} from 'node:fs';
import path from 'node:path';

const LINUX_SANDBOX_EXECUTABLES = ['/usr/bin/bwrap', '/bin/bwrap'];
const LINUX_READ_ONLY_SYSTEM_PATHS = ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/nix/store'];
const MAX_GIT_FILE_BYTES = 4096;
const SANDBOX_HOME = '/tmp/vlaina-home';
const SANDBOX_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const SANDBOX_USER = 'vlaina';

export function assertDesktopCommandSandboxAvailable({
  accessImpl = accessSync,
  platform = process.platform,
} = {}) {
  if (platform !== 'linux') {
    throw new Error('Computer commands are disabled because a secure command sandbox is unavailable on this platform.');
  }
  for (const executable of LINUX_SANDBOX_EXECUTABLES) {
    try {
      accessImpl(executable, constants.X_OK);
      return executable;
    } catch {}
  }
  throw new Error('Computer commands are disabled because the Bubblewrap sandbox is unavailable.');
}

export function buildManagedShellCommand(command, platform) {
  if (platform === 'win32') return command;
  return `${command}\n__vlaina_command_status=$?\nwait\nexit "$__vlaina_command_status"`;
}

function isSameOrChildPath(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function appendSandboxParentDirectories(args, sandboxRoot, mountedSystemPaths) {
  const parents = [];
  let current = path.dirname(sandboxRoot);
  while (current !== path.dirname(current)) {
    parents.push(current);
    current = path.dirname(current);
  }
  for (const parent of parents.reverse()) {
    const alreadyMounted = parent === '/dev'
      || parent === '/proc'
      || parent === '/tmp'
      || mountedSystemPaths.some((systemPath) => isSameOrChildPath(systemPath, parent));
    if (!alreadyMounted) args.push('--dir', parent);
  }
}

function resolveProtectedGitPaths(gitPath, info, sandboxRoot, {
  lstatImpl,
  readFileImpl,
  realpathImpl,
}) {
  if (info.isDirectory()) return [gitPath];
  if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size > MAX_GIT_FILE_BYTES) {
    throw new Error('Workspace Git metadata cannot be safely protected.');
  }

  let content;
  try {
    content = readFileImpl(gitPath, 'utf8');
  } catch {
    throw new Error('Workspace Git metadata cannot be safely protected.');
  }
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_GIT_FILE_BYTES) {
    throw new Error('Workspace Git metadata cannot be safely protected.');
  }

  const line = content.endsWith('\n') ? content.slice(0, -1).replace(/\r$/, '') : content;
  const match = /^gitdir:[ \t]+([^\r\n]+)$/i.exec(line);
  const rawTarget = match?.[1] ?? '';
  if (!rawTarget || rawTarget !== rawTarget.trim()) {
    throw new Error('Workspace Git metadata cannot be safely protected.');
  }

  const targetPath = path.resolve(path.dirname(gitPath), rawTarget);
  if (!isSameOrChildPath(sandboxRoot, targetPath)) {
    return [gitPath];
  }

  let realTargetPath;
  let targetInfo;
  try {
    realTargetPath = realpathImpl(targetPath);
    targetInfo = lstatImpl(realTargetPath);
  } catch {
    throw new Error('Workspace Git metadata cannot be safely protected.');
  }
  if (
    realTargetPath !== targetPath
    || !isSameOrChildPath(sandboxRoot, realTargetPath)
    || !targetInfo.isDirectory()
  ) {
    throw new Error('Workspace Git metadata cannot be safely protected.');
  }

  return [gitPath, realTargetPath];
}

function protectSandboxGitMetadata(sandboxRoot, {
  lstatImpl = lstatSync,
  mkdirImpl = mkdirSync,
  readFileImpl = readFileSync,
  realpathImpl = realpathSync,
  rmdirImpl = rmdirSync,
} = {}) {
  const gitPath = path.join(sandboxRoot, '.git');
  let info;
  let createdInfo = null;
  try {
    info = lstatImpl(gitPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    try {
      mkdirImpl(gitPath, { mode: 0o700 });
      info = lstatImpl(gitPath);
      createdInfo = { dev: info.dev, ino: info.ino };
    } catch (mkdirError) {
      if (mkdirError?.code !== 'EEXIST') throw mkdirError;
      info = lstatImpl(gitPath);
    }
  }

  let gitPaths;
  try {
    gitPaths = resolveProtectedGitPaths(gitPath, info, sandboxRoot, {
      lstatImpl,
      readFileImpl,
      realpathImpl,
    });
  } catch (error) {
    if (createdInfo) {
      try {
        rmdirImpl(gitPath);
      } catch {}
    }
    throw error;
  }

  return {
    cleanup() {
      if (!createdInfo) return;
      try {
        const currentInfo = lstatImpl(gitPath);
        if (
          currentInfo.isDirectory()
          && currentInfo.dev === createdInfo.dev
          && currentInfo.ino === createdInfo.ino
        ) {
          rmdirImpl(gitPath);
        }
      } catch {}
    },
    gitPaths,
  };
}

export function buildSandboxedDesktopCommandLaunch(request, platform, options = {}) {
  if (platform !== 'linux' || !LINUX_SANDBOX_EXECUTABLES.includes(request.sandboxExecutable)) {
    throw new Error('Computer commands require an approved secure sandbox executable.');
  }
  const sandboxRoot = path.resolve(request.sandboxRoot);
  const cwd = path.resolve(request.cwd);
  if (!path.isAbsolute(request.sandboxRoot) || !isSameOrChildPath(sandboxRoot, cwd)) {
    throw new Error('Command working directory must stay inside the sandbox workspace.');
  }

  const args = [
    '--die-with-parent',
    '--new-session',
    '--unshare-all',
    '--cap-drop',
    'ALL',
  ];
  const mountedSystemPaths = [];
  for (const systemPath of LINUX_READ_ONLY_SYSTEM_PATHS) {
    if (options.existsImpl?.(systemPath) ?? existsSync(systemPath)) {
      args.push('--ro-bind', systemPath, systemPath);
      mountedSystemPaths.push(systemPath);
    }
  }
  args.push('--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp');
  appendSandboxParentDirectories(args, sandboxRoot, mountedSystemPaths);
  const gitMetadata = protectSandboxGitMetadata(sandboxRoot, options);
  args.push('--bind', sandboxRoot, sandboxRoot);
  for (const gitPath of gitMetadata.gitPaths) {
    args.push('--ro-bind', gitPath, gitPath);
  }
  args.push(
    '--dir', SANDBOX_HOME,
    '--chdir', cwd,
    '--setenv', 'HOME', SANDBOX_HOME,
    '--setenv', 'TMPDIR', '/tmp',
    '--setenv', 'XDG_CACHE_HOME', '/tmp/.cache',
    '--setenv', 'XDG_CONFIG_HOME', '/tmp/.config',
    '--setenv', 'XDG_DATA_HOME', '/tmp/.local/share',
    '--setenv', 'XDG_STATE_HOME', '/tmp/.local/state',
    '--setenv', 'PATH', SANDBOX_PATH,
    '--setenv', 'USER', SANDBOX_USER,
    '--setenv', 'LOGNAME', SANDBOX_USER,
    '--setenv', 'USERNAME', SANDBOX_USER,
    '--setenv', 'SHELL', '/bin/sh',
    '--',
    request.shell,
    ...request.shellArgs,
    buildManagedShellCommand(request.command, platform),
  );
  return {
    args,
    cleanup: gitMetadata.cleanup,
    command: request.sandboxExecutable,
    env: {
      ...request.env,
      HOME: SANDBOX_HOME,
      TMPDIR: '/tmp',
      XDG_CACHE_HOME: '/tmp/.cache',
      XDG_CONFIG_HOME: '/tmp/.config',
      XDG_DATA_HOME: '/tmp/.local/share',
      XDG_STATE_HOME: '/tmp/.local/state',
      PATH: SANDBOX_PATH,
      USER: SANDBOX_USER,
      LOGNAME: SANDBOX_USER,
      USERNAME: SANDBOX_USER,
      SHELL: '/bin/sh',
    },
  };
}
