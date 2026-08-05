import { normalizeNotePathKey } from '@/lib/notes/displayName';
import { getParentPath } from './pathOperations';

function normalizeMovePath(path: string) {
  return normalizeNotePathKey(path) ?? path;
}

function hasCurrentParent(sourcePath: string, targetFolderPath: string) {
  return Boolean(sourcePath) && getParentPath(sourcePath) === targetFolderPath;
}

export function isCurrentParentMoveTarget(sourcePath: string, targetFolderPath: string): boolean {
  return hasCurrentParent(normalizeMovePath(sourcePath), normalizeMovePath(targetFolderPath));
}

export function isInvalidMoveTarget(sourcePath: string, targetFolderPath: string): boolean {
  const normalizedSourcePath = normalizeMovePath(sourcePath);
  const normalizedTargetFolderPath = normalizeMovePath(targetFolderPath);

  if (hasCurrentParent(normalizedSourcePath, normalizedTargetFolderPath)) {
    return true;
  }

  if (!normalizedSourcePath || !normalizedTargetFolderPath) {
    return false;
  }

  return (
    normalizedSourcePath === normalizedTargetFolderPath ||
    normalizedTargetFolderPath.startsWith(`${normalizedSourcePath}/`)
  );
}
