import {
  isProtectedAppDataPath,
  isProtectedCodexConfigPath,
  isProtectedDesktopCommandWorkspacePath,
  isProtectedDesktopCommandWorkspaceRealPath,
  isProtectedFsAccessPath,
  isProtectedGitMetadataPath,
  isUserDataFsAccessPath,
  MAX_AUTHORIZED_FS_PATH_CHARS,
  normalizeFsPathForAccess,
  normalizeFsPathKey,
  resolveRealFsAccessPath,
} from './fsAccessPathPolicy.mjs';
import {
  addAuthorizedFsPathKey,
  canRenameAuthorizedRoot,
  ensureAuthorizedFsPathsLoaded,
  isAuthorizedFsPathKey,
  isAuthorizedFsWatchPathKey,
  MAX_AUTHORIZED_FS_PATH_ENTRIES,
  resetAuthorizedFsPathsForTests,
  updateAuthorizedRootRename,
  writeAuthorizedFsPaths,
} from './fsAccessAuthorizationStore.mjs';

export {
  canRenameAuthorizedRoot,
  isAuthorizedFsPathKey,
  isAuthorizedFsWatchPathKey,
  isProtectedAppDataPath,
  isProtectedCodexConfigPath,
  isProtectedDesktopCommandWorkspacePath,
  isProtectedDesktopCommandWorkspaceRealPath,
  isProtectedGitMetadataPath,
  MAX_AUTHORIZED_FS_PATH_CHARS,
  MAX_AUTHORIZED_FS_PATH_ENTRIES,
  normalizeFsPathForAccess,
  normalizeFsPathKey,
  resetAuthorizedFsPathsForTests,
  updateAuthorizedRootRename,
};

async function resolveSafeFsAccessPath(filePath) {
  const resolvedPath = normalizeFsPathForAccess(filePath);
  await ensureAuthorizedFsPathsLoaded();
  if (await isProtectedFsAccessPath(resolvedPath)) {
    throw new Error(`File path is reserved for internal desktop storage: ${resolvedPath}`);
  }

  const realAccessPath = await resolveRealFsAccessPath(resolvedPath);
  if (await isProtectedFsAccessPath(realAccessPath)) {
    throw new Error(`File path is reserved for internal desktop storage: ${resolvedPath}`);
  }

  return { resolvedPath, realAccessPath };
}

export async function assertSafeFsAccessPath(filePath) {
  return (await resolveSafeFsAccessPath(filePath)).resolvedPath;
}

export async function assertAuthorizedFsPath(filePath) {
  const { resolvedPath, realAccessPath } = await resolveSafeFsAccessPath(filePath);
  if (await isUserDataFsAccessPath(resolvedPath, realAccessPath)) {
    return resolvedPath;
  }

  const pathKey = normalizeFsPathKey(realAccessPath);
  if (!isAuthorizedFsPathKey(pathKey)) {
    throw new Error(`File path is not authorized for desktop access: ${resolvedPath}`);
  }

  return resolvedPath;
}

export async function assertAuthorizedFsWatchPath(filePath) {
  const { resolvedPath, realAccessPath } = await resolveSafeFsAccessPath(filePath);
  if (await isUserDataFsAccessPath(resolvedPath, realAccessPath)) {
    return resolvedPath;
  }

  const pathKey = normalizeFsPathKey(realAccessPath);
  if (!isAuthorizedFsWatchPathKey(pathKey)) {
    throw new Error(`File path is not authorized for desktop watch access: ${resolvedPath}`);
  }

  return resolvedPath;
}

export async function authorizeFsPath(filePath, kind) {
  const resolvedPath = normalizeFsPathForAccess(filePath);
  await ensureAuthorizedFsPathsLoaded();
  if (await isProtectedFsAccessPath(resolvedPath)) {
    throw new Error(`File path is reserved for internal desktop storage: ${resolvedPath}`);
  }

  const realAccessPath = await resolveRealFsAccessPath(resolvedPath);
  if (await isProtectedFsAccessPath(realAccessPath)) {
    throw new Error(`File path is reserved for internal desktop storage: ${resolvedPath}`);
  }
  const pathKey = normalizeFsPathKey(resolvedPath);
  const realPathKey = normalizeFsPathKey(realAccessPath);

  addAuthorizedFsPathKey(kind, pathKey);
  addAuthorizedFsPathKey(kind, realPathKey);

  await writeAuthorizedFsPaths();
  return resolvedPath;
}

export async function assertAuthorizedFsRenameTarget(sourcePath, targetPath) {
  const resolvedSourcePath = normalizeFsPathForAccess(sourcePath);
  const resolvedTargetPath = normalizeFsPathForAccess(targetPath);
  if (canRenameAuthorizedRoot(resolvedSourcePath, resolvedTargetPath)) {
    if (await isProtectedFsAccessPath(resolvedTargetPath)) {
      throw new Error(`File path is reserved for internal desktop storage: ${resolvedTargetPath}`);
    }

    const realTargetPath = await resolveRealFsAccessPath(resolvedTargetPath);
    if (await isProtectedFsAccessPath(realTargetPath)) {
      throw new Error(`File path is reserved for internal desktop storage: ${resolvedTargetPath}`);
    }
    return resolvedTargetPath;
  }

  return assertAuthorizedFsPath(resolvedTargetPath);
}
