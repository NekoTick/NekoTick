import { getParentPath, getStorageAdapter, isAbsolutePath, joinPath } from '@/lib/storage/adapter';
import { normalizeContainedAssetPath } from './pathContainment';
import {
  hasInternalNoteAssetPathSegment,
  hasInternalNoteAssetUrlPathSegment,
} from './internalAssetPaths';

const EXPLICIT_URL_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const BACKSLASH_ESCAPED_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*\\+:/;
const CONTROL_OR_BIDI_PATTERN = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\uFFFD]/;
const MAX_LOCAL_ASSET_PATH_CHARS = 16 * 1024;

function getLocalAssetPath(assetPath: string): string {
  return assetPath.split(/[?#]/, 1)[0] ?? '';
}

function decodeLocalAssetPath(assetPath: string): string | null {
  try {
    return decodeURIComponent(assetPath);
  } catch {
    return null;
  }
}

function isSafeRelativeAssetPath(assetPath: string): boolean {
  if (!assetPath || assetPath.length > MAX_LOCAL_ASSET_PATH_CHARS) {
    return false;
  }

  const trimmed = assetPath.trim();
  return (
    trimmed === assetPath
    && trimmed.length > 0
    && !CONTROL_OR_BIDI_PATTERN.test(trimmed)
    && !trimmed.startsWith('\\')
    && !trimmed.startsWith('//')
    && !EXPLICIT_URL_SCHEME_PATTERN.test(trimmed)
    && !BACKSLASH_ESCAPED_SCHEME_PATTERN.test(trimmed)
    && !isAbsolutePath(trimmed)
    && !hasInternalNoteAssetUrlPathSegment(trimmed)
  );
}

function hasUnsafeCurrentNotePath(currentNotePath: string | undefined): boolean {
  return Boolean(
    currentNotePath
    && (currentNotePath.length > MAX_LOCAL_ASSET_PATH_CHARS || CONTROL_OR_BIDI_PATTERN.test(currentNotePath))
  );
}

function addNonInternalCandidate(candidates: string[], candidate: string | null): void {
  if (!candidate || hasInternalNoteAssetUrlPathSegment(candidate) || candidates.includes(candidate)) {
    return;
  }

  candidates.push(candidate);
}

export async function resolveNotesRootAssetPath(
  notesRootPath: string,
  assetPath: string,
  currentNotePath?: string,
): Promise<string> {
  const candidates = await resolveNotesRootAssetPathCandidates(notesRootPath, assetPath, currentNotePath);
  return candidates[0] ?? '';
}

export async function resolveExistingNotesRootAssetPath(
  notesRootPath: string,
  assetPath: string,
  currentNotePath?: string,
): Promise<string> {
  const candidates = await resolveNotesRootAssetPathCandidates(notesRootPath, assetPath, currentNotePath);
  if (candidates.length <= 1) {
    return candidates[0] ?? '';
  }

  const storage = getStorageAdapter();
  for (const candidate of candidates) {
    if (await storage.exists(candidate).catch(() => false)) {
      return candidate;
    }
  }

  return candidates[0] ?? '';
}

export async function resolveNotesRootAssetPathCandidates(
  notesRootPath: string,
  assetPath: string,
  currentNotePath?: string,
): Promise<string[]> {
  if (hasInternalNoteAssetPathSegment(currentNotePath) || hasUnsafeCurrentNotePath(currentNotePath)) {
    return [];
  }
  if (!assetPath || assetPath.length > MAX_LOCAL_ASSET_PATH_CHARS) {
    return [];
  }

  const encodedLocalAssetPath = getLocalAssetPath(assetPath);
  if (!isSafeRelativeAssetPath(encodedLocalAssetPath)) {
    return [];
  }
  const localAssetPath = decodeLocalAssetPath(encodedLocalAssetPath);
  if (!localAssetPath || !isSafeRelativeAssetPath(localAssetPath)) {
    return [];
  }

  const currentNoteDir = currentNotePath
    ? getParentPath(
        isAbsolutePath(currentNotePath)
          ? currentNotePath
          : await joinPath(notesRootPath, currentNotePath)
      )
    : null;
  const isAbsoluteExternalNote = Boolean(
    currentNotePath
    && isAbsolutePath(currentNotePath)
    && currentNoteDir
    && !normalizeContainedAssetPath(currentNotePath, notesRootPath)
  );
  const currentNoteAssetRoot = isAbsoluteExternalNote && currentNoteDir
    ? currentNoteDir
    : notesRootPath;

  if (localAssetPath.startsWith('./') || localAssetPath.startsWith('../')) {
    const candidate = normalizeContainedAssetPath(
      await joinPath(currentNoteDir ?? notesRootPath, localAssetPath),
      currentNoteAssetRoot,
    );
    return candidate && !hasInternalNoteAssetUrlPathSegment(candidate) ? [candidate] : [];
  }

  const candidates: string[] = [];

  if (currentNoteDir) {
    const noteRelativeCandidate = normalizeContainedAssetPath(
      await joinPath(currentNoteDir, localAssetPath),
      currentNoteAssetRoot,
    );
    addNonInternalCandidate(candidates, noteRelativeCandidate);
  }

  const notesRootAssetPath = normalizeContainedAssetPath(await joinPath(notesRootPath, localAssetPath), notesRootPath);
  addNonInternalCandidate(candidates, notesRootAssetPath);

  return candidates;
}

export async function joinPaths(...paths: string[]): Promise<string> {
  return joinPath(...paths);
}

export async function getDirname(path: string): Promise<string> {
  return getParentPath(path) || '/';
}
