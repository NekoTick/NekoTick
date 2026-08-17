import { resolveNotesRootAssetPathCandidates } from '@/lib/assets/core/paths';
import { getStorageAdapter } from '@/lib/storage/adapter';
import { findExportMarkdownAssetSourceTokensWithOptions } from '@/components/Notes/features/Export/noteExportMarkdownAssetTokens';
import { resolveObsidianImagePath } from '@/lib/notes/markdown/obsidianImagePath';
import { readNoteMetadataFromMarkdown, updateNoteMetadataInMarkdown } from '../../frontmatter';
import type { FileTreeNode, NoteCoverMetadata, NotesStore } from '../../types';
import {
  collectNoteContentScanPaths,
  MAX_SEARCHABLE_NOTE_BYTES,
} from '../../slices/featureSliceContentUtils';
import { resolveNotesRootRelativeFullPath } from './notesRootPathContainment';

const MAX_RENAME_SCAN_CHARS = 8 * 1024 * 1024;
const MAX_RENAME_IMAGE_TOKENS_PER_NOTE = 2000;
const RENAME_READ_BATCH_SIZE = 8;
const RENAME_SOURCE_BATCH_SIZE = 8;

export interface ImageReferenceContentUpdate {
  path: string;
  documentPath?: string;
  baselineContent: string;
  content: string;
}

function getPathComparisonKey(path: string) {
  const normalized = path.replace(/\\/g, '/');
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
    ? normalized.toLowerCase()
    : normalized;
}

function getRelativeImagePath(imagePath: string, notePath: string) {
  const imageSegments = imagePath.replace(/\\/g, '/').split('/').filter(Boolean);
  const noteSegments = notePath.replace(/\\/g, '/').split('/').filter(Boolean);
  noteSegments.pop();

  let shared = 0;
  while (
    shared < noteSegments.length
    && shared < imageSegments.length
    && noteSegments[shared] === imageSegments[shared]
  ) {
    shared += 1;
  }

  return [
    ...Array.from({ length: noteSegments.length - shared }, () => '..'),
    ...imageSegments.slice(shared),
  ].join('/') || imageSegments.at(-1) || imagePath;
}

function encodeReferencePath(path: string) {
  return path.split('/').map((segment) => (
    segment === '..' || segment === '.' ? segment : encodeURIComponent(segment)
  )).join('/');
}

async function sourceTargetsImage(
  notesPath: string,
  notePath: string,
  source: string,
  targetFullPathKey: string,
) {
  const storage = getStorageAdapter();
  const candidates = await resolveNotesRootAssetPathCandidates(notesPath, source, notePath);
  const targetIndex = candidates.findIndex(
    (candidate) => getPathComparisonKey(candidate) === targetFullPathKey,
  );
  if (targetIndex < 0) return false;

  for (const earlierCandidate of candidates.slice(0, targetIndex)) {
    if (await storage.exists(earlierCandidate).catch(() => false)) return false;
  }
  return true;
}

async function rewriteNoteContent(
  notesPath: string,
  notePath: string,
  content: string,
  oldImageFullPathKey: string,
  newImagePath: string,
  metadataCover: NoteCoverMetadata | undefined,
  rootNodes: readonly FileTreeNode[],
  oldImagePath: string,
) {
  const tokens = findExportMarkdownAssetSourceTokensWithOptions(content, {
    maxTokens: MAX_RENAME_IMAGE_TOKENS_PER_NOTE + 1,
  });
  if (tokens.length > MAX_RENAME_IMAGE_TOKENS_PER_NOTE) {
    throw new Error(`Too many image references in ${notePath} to rename safely.`);
  }

  const matches: boolean[] = [];
  for (let index = 0; index < tokens.length; index += RENAME_SOURCE_BATCH_SIZE) {
    const batch = tokens.slice(index, index + RENAME_SOURCE_BATCH_SIZE);
    matches.push(...await Promise.all(batch.map(async (token) => {
      const obsidianPath = token.obsidianEmbed
        ? resolveObsidianImagePath(token.lookupSrc ?? token.src, rootNodes, notePath)
        : null;
      if (obsidianPath) {
        return getPathComparisonKey(obsidianPath) === getPathComparisonKey(oldImagePath);
      }
      return sourceTargetsImage(
        notesPath,
        notePath,
        token.lookupSrc ?? token.src,
        oldImageFullPathKey,
      );
    })));
  }
  const relativeReference = getRelativeImagePath(newImagePath, notePath);
  const encodedReference = encodeReferencePath(relativeReference);
  let nextContent = content;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (!matches[index]) continue;
    const token = tokens[index];
    if (!token) continue;
    const replacement = token.obsidianEmbed ? relativeReference : encodedReference;
    nextContent = `${nextContent.slice(0, token.start)}${replacement}${nextContent.slice(token.end)}`;
  }

  const parsedCover = readNoteMetadataFromMarkdown(content).cover;
  const cover = parsedCover ? { ...metadataCover, ...parsedCover } : metadataCover;
  if (
    cover?.assetPath
    && await sourceTargetsImage(notesPath, notePath, cover.assetPath, oldImageFullPathKey)
  ) {
    nextContent = updateNoteMetadataInMarkdown(nextContent, {
      cover: { ...cover, assetPath: getRelativeImagePath(newImagePath, notePath) },
    }).content;
  }

  return nextContent;
}

export async function collectImageReferenceContentUpdates(input: Pick<
  NotesStore,
  'notesPath' | 'rootFolder' | 'currentNote' | 'noteContentsCache' | 'noteMetadata'
> & { oldImagePath: string; newImagePath: string }): Promise<ImageReferenceContentUpdate[]> {
  if (!input.notesPath || !input.rootFolder) return [];

  const storage = getStorageAdapter();
  const { fullPath } = await resolveNotesRootRelativeFullPath(input.notesPath, input.oldImagePath);
  const oldImageFullPathKey = getPathComparisonKey(fullPath);
  const notePaths = collectNoteContentScanPaths(
    input.rootFolder.children,
    input.notesPath,
    () => true,
  );
  const updates: ImageReferenceContentUpdate[] = [];
  let scannedChars = 0;
  const currentNote = input.currentNote;
  const currentNotePathKey = currentNote ? getPathComparisonKey(currentNote.path) : null;

  for (let index = 0; index < notePaths.length; index += RENAME_READ_BATCH_SIZE) {
    const batch = notePaths.slice(index, index + RENAME_READ_BATCH_SIZE);
    const loaded = await Promise.all(batch.map(async (note) => {
      const isCurrentNote = currentNote != null && (
        currentNotePathKey === getPathComparisonKey(note.path)
        || currentNotePathKey === getPathComparisonKey(note.fullPath)
      );
      const relativeCache = input.noteContentsCache.get(note.path);
      const absoluteCache = input.noteContentsCache.get(note.fullPath);
      const documentPath = isCurrentNote
        ? currentNote.path
        : relativeCache
          ? note.path
          : absoluteCache
            ? note.fullPath
            : note.path;
      const cached = isCurrentNote
        ? currentNote.content
        : relativeCache?.content ?? absoluteCache?.content;
      const content = cached ?? await storage.readFile(note.fullPath, MAX_SEARCHABLE_NOTE_BYTES);
      return { note, documentPath, content };
    }));

    for (const { note, documentPath, content } of loaded) {
      if (scannedChars + content.length > MAX_RENAME_SCAN_CHARS) {
        throw new Error('The notes folder is too large to update image references safely.');
      }
      scannedChars += content.length;
      const nextContent = await rewriteNoteContent(
        input.notesPath,
        note.path,
        content,
        oldImageFullPathKey,
        input.newImagePath,
        input.noteMetadata?.notes[note.path]?.cover,
        input.rootFolder.children,
        input.oldImagePath,
      );
      if (nextContent !== content) {
        updates.push({
          path: note.path,
          ...(documentPath !== note.path ? { documentPath } : {}),
          baselineContent: content,
          content: nextContent,
        });
      }
    }
  }

  return updates;
}
