import { getNoteTitleFromPath } from '@/lib/notes/displayName';
import { getNoteTags, getNoteWikiLinkReferences } from '@/lib/notes/noteTextAnalysis';
import type { NotesStore } from '../types';
import {
  MAX_ALL_TAGS,
  MAX_BACKLINK_RESULTS,
  MAX_BACKLINK_SCAN_CHARS,
  MAX_BACKLINK_SCAN_ENTRIES,
  MAX_BACKLINK_TARGET_TITLE_CHARS,
  MAX_SEARCHABLE_NOTE_BYTES,
  MAX_TAG_CACHE_SCAN_CHARS,
  MAX_TAG_CACHE_SCAN_ENTRIES,
  isSafeStoredNotePath,
} from './featureSliceContentUtils';

export function getBacklinksFromCache(
  noteContentsCache: NotesStore['noteContentsCache'],
  notePath: string,
): { path: string; name: string; context: string }[] {
  if (!isSafeStoredNotePath(notePath)) {
    return [];
  }

  const results: { path: string; name: string; context: string }[] = [];
  const noteName = getNoteTitleFromPath(notePath).toLowerCase();
  if (noteName.length > MAX_BACKLINK_TARGET_TITLE_CHARS) {
    return [];
  }

  let scannedEntries = 0;
  let scannedChars = 0;
  for (const [path, entry] of noteContentsCache) {
    if (
      results.length >= MAX_BACKLINK_RESULTS ||
      scannedEntries >= MAX_BACKLINK_SCAN_ENTRIES ||
      scannedChars >= MAX_BACKLINK_SCAN_CHARS
    ) {
      break;
    }
    if (!isSafeStoredNotePath(path)) continue;

    const content = entry.content;
    if (content.length > MAX_SEARCHABLE_NOTE_BYTES) continue;
    if (scannedChars + content.length > MAX_BACKLINK_SCAN_CHARS) break;
    scannedEntries += 1;
    scannedChars += content.length;

    if (path === notePath || !content.includes('[[')) continue;
    const references = getNoteWikiLinkReferences(entry, content);
    const directReference = references.find(
      (reference) => !reference.aliased && reference.target.toLowerCase() === noteName,
    );
    const reference = directReference ?? references.find(
      (candidate) => candidate.target.toLowerCase() === noteName,
    );
    if (reference) {
      const start = Math.max(0, reference.from - 50);
      const end = Math.min(content.length, reference.to + 50);
      let context = content.substring(start, end).replace(/\n/g, ' ').trim();
      if (start > 0) context = '...' + context;
      if (end < content.length) context = context + '...';

      const fileName = getNoteTitleFromPath(path);
      results.push({ path, name: fileName, context });
    }
  }

  return results;
}

export function getAllTagsFromCache(
  noteContentsCache: NotesStore['noteContentsCache'],
): { tag: string; count: number }[] {
  const tagCounts = new Map<string, number>();
  let scannedEntries = 0;
  let scannedChars = 0;

  for (const [path, entry] of noteContentsCache) {
    if (
      scannedEntries >= MAX_TAG_CACHE_SCAN_ENTRIES ||
      scannedChars >= MAX_TAG_CACHE_SCAN_CHARS
    ) {
      break;
    }
    if (!isSafeStoredNotePath(path)) continue;

    const content = entry.content;
    if (content.length > MAX_SEARCHABLE_NOTE_BYTES) continue;
    if (scannedChars + content.length > MAX_TAG_CACHE_SCAN_CHARS) break;
    scannedEntries += 1;
    scannedChars += content.length;

    for (const tag of getNoteTags(entry, content)) {
      if (tagCounts.size >= MAX_ALL_TAGS && !tagCounts.has(tag)) {
        continue;
      }

      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}
