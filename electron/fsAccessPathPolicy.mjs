import electron from 'electron';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { app } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.dirname(__dirname);

export const MAX_AUTHORIZED_FS_PATH_CHARS = 8192;

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`A non-empty ${label} is required.`);
  }

  if (value.length > MAX_AUTHORIZED_FS_PATH_CHARS) {
    throw new Error(`The ${label} is too long for desktop access.`);
  }

  if (!value.trim()) {
    throw new Error(`A non-empty ${label} is required.`);
  }

  return value;
}

function requireFilePath(value) {
  return requireNonEmptyString(value, 'file path');
}

export function normalizeFsPathForAccess(filePath) {
  return path.resolve(requireFilePath(filePath));
}

export function normalizeFsPathKey(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function isSameOrChildPath(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isMissingFsPathError(error) {
  return Boolean(error && typeof error === 'object' && (error.code === 'ENOENT' || error.code === 'ENOTDIR'));
}

export async function resolveRealFsAccessPath(resolvedPath) {
  const unresolvedParts = [];
  let cursor = resolvedPath;

  for (;;) {
    try {
      const realBasePath = await realpath(cursor);
      return unresolvedParts.length > 0
        ? path.resolve(realBasePath, ...unresolvedParts.reverse())
        : realBasePath;
    } catch (error) {
      if (!isMissingFsPathError(error)) {
        throw error;
      }

      const parentPath = path.dirname(cursor);
      if (parentPath === cursor) {
        return resolvedPath;
      }

      unresolvedParts.push(path.basename(cursor));
      cursor = parentPath;
    }
  }
}

export function getDevelopmentUserDataOverridePath() {
  if (app.isPackaged) {
    return null;
  }

  const overridePath = process.env.VLAINA_USER_DATA_DIR?.trim();
  return overridePath ? path.resolve(overridePath) : null;
}

export function getDevelopmentRepoUserDataRootPath(candidatePath) {
  if (app.isPackaged) {
    return null;
  }

  const resolvedCandidatePath = normalizeFsPathForAccess(candidatePath);
  const tempRootPath = path.join(repoRoot, 'temp');
  const relativePath = path.relative(tempRootPath, resolvedCandidatePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  const [firstSegment] = relativePath.split(path.sep);
  if (!/^electron-user-data-(?:\d+|dev)$/.test(firstSegment ?? '')) {
    return null;
  }

  return path.join(tempRootPath, firstSegment);
}

export function getUserDataAccessRootPaths() {
  const paths = [];

  try {
    paths.push(normalizeFsPathForAccess(app.getPath('userData')));
  } catch {}

  const overridePath = getDevelopmentUserDataOverridePath();
  if (overridePath) {
    paths.push(overridePath);
  }

  const seen = new Set();
  const uniquePaths = [];
  for (const entry of paths) {
    const key = normalizeFsPathKey(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniquePaths.push(entry);
  }

  return uniquePaths;
}

export function isProtectedAppDataPath(candidatePath, userDataPath = app.getPath('userData')) {
  const candidateKey = normalizeFsPathKey(candidatePath);
  const protectedRoots = [path.join(userDataPath, '.vlaina', 'app', 'secrets')]
    .map((protectedPath) => normalizeFsPathKey(protectedPath));
  const protectedFiles = [
    path.join(userDataPath, '.vlaina', 'app', 'account', 'profile.json'),
    path.join(userDataPath, '.vlaina', 'app', 'permissions', 'filesystem.json'),
  ].map((protectedPath) => normalizeFsPathKey(protectedPath));

  return (
    protectedRoots.some((protectedRoot) => isSameOrChildPath(protectedRoot, candidateKey)) ||
    protectedFiles.includes(candidateKey)
  );
}

export function isProtectedCodexConfigPath(
  candidatePath,
  { homePath, codexHome = process.env.CODEX_HOME, platform = process.platform } = {},
) {
  const pathImpl = platform === 'win32' ? path.win32 : path.posix;
  const normalize = (value) => {
    const resolved = pathImpl.resolve(value);
    return platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  let resolvedHomePath = homePath;
  if (typeof resolvedHomePath !== 'string') {
    try {
      resolvedHomePath = app.getPath('home');
    } catch {
      resolvedHomePath = null;
    }
  }
  const protectedRoots = [];
  if (typeof resolvedHomePath === 'string' && pathImpl.isAbsolute(resolvedHomePath)) {
    protectedRoots.push(pathImpl.join(resolvedHomePath, '.codex'));
  }
  if (typeof codexHome === 'string' && pathImpl.isAbsolute(codexHome)) {
    protectedRoots.push(codexHome);
  }
  if (typeof candidatePath !== 'string') return false;
  const candidate = normalize(candidatePath);
  return protectedRoots.some((rootPath) => {
    const root = normalize(rootPath);
    const relative = pathImpl.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !pathImpl.isAbsolute(relative));
  });
}

export function isProtectedGitMetadataPath(
  candidatePath,
  { platform = process.platform } = {},
) {
  if (typeof candidatePath !== 'string') return false;
  const pathImpl = platform === 'win32' ? path.win32 : path.posix;
  const segments = pathImpl.resolve(candidatePath).split(pathImpl.sep);
  return segments.some((segment) => (
    platform === 'win32' ? segment.toLowerCase() === '.git' : segment === '.git'
  ));
}

function getDesktopCommandProtectedRootPaths(options, pathImpl) {
  const roots = [];
  const { codexHome = process.env.CODEX_HOME, homePath, userDataPath } = options;
  if (typeof homePath === 'string' && pathImpl.isAbsolute(homePath)) {
    roots.push(pathImpl.join(homePath, '.codex'));
  }
  if (typeof codexHome === 'string' && pathImpl.isAbsolute(codexHome)) roots.push(codexHome);
  if (typeof userDataPath === 'string' && pathImpl.isAbsolute(userDataPath)) roots.push(userDataPath);
  return roots;
}

export function isProtectedDesktopCommandWorkspacePath(candidatePath, options = {}) {
  if (typeof candidatePath !== 'string') return true;
  const platform = options.platform ?? process.platform;
  const pathImpl = platform === 'win32' ? path.win32 : path.posix;
  const configuredCodexHome = options.codexHome ?? process.env.CODEX_HOME;
  if (typeof configuredCodexHome === 'string' && configuredCodexHome.trim() && !pathImpl.isAbsolute(configuredCodexHome)) return true;
  const normalize = (value) => {
    const resolved = pathImpl.resolve(value);
    return platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  const workspaceRoot = normalize(candidatePath);
  const protectedRoots = getDesktopCommandProtectedRootPaths(options, pathImpl);
  return protectedRoots.some((rootPath) => {
    const protectedRoot = normalize(rootPath);
    const workspaceToProtected = pathImpl.relative(workspaceRoot, protectedRoot);
    const protectedToWorkspace = pathImpl.relative(protectedRoot, workspaceRoot);
    const containsProtectedRoot = workspaceToProtected === ''
      || (!workspaceToProtected.startsWith('..') && !pathImpl.isAbsolute(workspaceToProtected));
    const isInsideProtectedRoot = protectedToWorkspace === ''
      || (!protectedToWorkspace.startsWith('..') && !pathImpl.isAbsolute(protectedToWorkspace));
    return containsProtectedRoot || isInsideProtectedRoot;
  });
}

export async function isProtectedDesktopCommandWorkspaceRealPath(candidatePath, options = {}) {
  if (isProtectedDesktopCommandWorkspacePath(candidatePath, options)) return true;
  const platform = options.platform ?? process.platform;
  if (platform !== process.platform) return true;

  const pathImpl = platform === 'win32' ? path.win32 : path.posix;
  const protectedRoots = getDesktopCommandProtectedRootPaths(options, pathImpl);
  for (const protectedRoot of protectedRoots) {
    const realProtectedRoot = await resolveRealFsAccessPath(protectedRoot).catch(() => null);
    if (!realProtectedRoot || isProtectedDesktopCommandWorkspacePath(
      candidatePath,
      { codexHome: realProtectedRoot, platform },
    )) {
      return true;
    }
  }
  return false;
}

export async function isProtectedFsAccessPath(candidatePath) {
  if (isProtectedCodexConfigPath(candidatePath) || isProtectedGitMetadataPath(candidatePath)) {
    return true;
  }
  const userDataPaths = getUserDataAccessRootPaths();
  const developmentRepoUserDataRootPath = getDevelopmentRepoUserDataRootPath(candidatePath);
  if (developmentRepoUserDataRootPath) {
    userDataPaths.push(developmentRepoUserDataRootPath);
  }

  for (const userDataPath of userDataPaths) {
    if (isProtectedAppDataPath(candidatePath, userDataPath)) {
      return true;
    }

    const realUserDataPath = await resolveRealFsAccessPath(userDataPath).catch(() => null);
    if (realUserDataPath && isProtectedAppDataPath(candidatePath, realUserDataPath)) {
      return true;
    }
  }

  return false;
}

export async function isUserDataFsAccessPath(resolvedPath, realAccessPath) {
  const resolvedPathKey = normalizeFsPathKey(resolvedPath);
  const realAccessPathKey = normalizeFsPathKey(realAccessPath);
  const paths = getUserDataAccessRootPaths();
  const developmentRepoUserDataRootPath = getDevelopmentRepoUserDataRootPath(resolvedPath);
  if (developmentRepoUserDataRootPath) {
    paths.push(developmentRepoUserDataRootPath);
  }

  const seen = new Set();
  for (const userDataPath of paths) {
    const userDataPathKey = normalizeFsPathKey(userDataPath);
    if (seen.has(userDataPathKey)) {
      continue;
    }
    seen.add(userDataPathKey);

    const realUserDataPath = await resolveRealFsAccessPath(userDataPath).catch(() => null);
    const realUserDataPathKey = realUserDataPath ? normalizeFsPathKey(realUserDataPath) : userDataPathKey;

    if (
      isSameOrChildPath(userDataPathKey, resolvedPathKey) &&
      isSameOrChildPath(realUserDataPathKey, realAccessPathKey)
    ) {
      return true;
    }
  }

  return false;
}
