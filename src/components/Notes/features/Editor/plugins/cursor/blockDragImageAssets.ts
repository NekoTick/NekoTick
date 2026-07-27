import { getBaseName, getStorageAdapter } from '@/lib/storage/adapter';
import type { StorageAdapter } from '@/lib/storage/adapter';
import { getMimeType, isImageFilename } from '@/lib/assets/core/naming';
import { toBlobPart } from '@/lib/blobPart';
import { useNotesStore } from '@/stores/useNotesStore';
import { resolveEffectiveNotesRootPath } from '@/stores/notes/effectiveNotesRootPath';
import type { UploadResult } from '@/lib/assets/types';
import {
  getImageSourceBase,
  resolveImageSourcePathCandidates,
} from '../image-block/utils/imageSourcePath';
import {
  isMarkdownLineInContainer,
  parseMarkdownContainerFenceCloseLine,
  parseMarkdownContainerFenceLine,
  type MarkdownContainerState,
} from '@/lib/notes/markdown/markdownFenceProtectedLines';

const MAX_DRAGGED_IMAGE_ASSET_BYTES = 50 * 1024 * 1024;

type ImageAssetStorage = Pick<StorageAdapter, 'exists' | 'readBinaryFile' | 'stat'>;

export interface RemapDraggedMarkdownImageAssetsDeps {
  notesPath: string;
  storage: ImageAssetStorage;
  uploadAsset: (file: File, currentNotePath?: string) => Promise<UploadResult>;
  resolveCandidates?: typeof resolveImageSourcePathCandidates;
  createFile?: (bytes: Uint8Array, filename: string, mimeType: string, lastModified?: number) => File;
}

export interface RemapDraggedMarkdownImageAssetsInput {
  markdown: string | null;
  sourceNotePath: string;
  targetNotePath: string;
}

function createDefaultFile(bytes: Uint8Array, filename: string, mimeType: string, lastModified?: number): File {
  return new File([toBlobPart(bytes)], filename, {
    type: mimeType,
    lastModified,
  });
}

function getDefaultDeps(sourceNotePath: string): RemapDraggedMarkdownImageAssetsDeps {
  const state = useNotesStore.getState();
  return {
    notesPath: resolveEffectiveNotesRootPath({
      notesPath: state.notesPath,
      currentNotePath: sourceNotePath,
    }),
    storage: getStorageAdapter(),
    uploadAsset: state.uploadAsset,
  };
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function appendOriginalSourceSuffix(source: string, uploadedPath: string): string {
  const trimmed = source.trim();
  const base = getImageSourceBase(trimmed);
  return `${uploadedPath}${trimmed.slice(base.length)}`;
}

function formatMarkdownDestination(path: string): string {
  return /[\s()]/.test(path) ? `<${path}>` : path;
}

function parseMarkdownDestination(value: string): { start: number; end: number; source: string } | null {
  const start = value.search(/\S/);
  if (start < 0) return null;

  if (value[start] === '<') {
    const end = value.indexOf('>', start + 1);
    return end > start + 1
      ? { start: start + 1, end, source: value.slice(start + 1, end) }
      : null;
  }

  const rest = value.slice(start);
  const match = rest.match(/^[^\s]+/);
  if (!match) return null;
  return {
    start,
    end: start + match[0].length,
    source: match[0],
  };
}

async function replaceAsync(
  value: string,
  pattern: RegExp,
  replacer: (match: RegExpMatchArray) => Promise<string>,
): Promise<string> {
  const parts: string[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    parts.push(value.slice(lastIndex, index));
    parts.push(await replacer(match));
    lastIndex = index + match[0].length;
  }

  parts.push(value.slice(lastIndex));
  return parts.join('');
}

async function rewriteMarkdownSegments(
  markdown: string,
  rewriteSegment: (segment: string) => Promise<string>,
): Promise<string> {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let segment: string[] = [];
  let fence: (MarkdownContainerState & { marker: string; length: number }) | null = null;

  const flushSegment = async () => {
    if (segment.length === 0) return;
    output.push(await rewriteSegment(segment.join('\n')));
    segment = [];
  };

  for (const line of lines) {
    if (fence) {
      if (isMarkdownLineInContainer(line, fence)) {
        output.push(line);
        if (parseMarkdownContainerFenceCloseLine(line, fence)) {
          fence = null;
        }
        continue;
      }
      fence = null;
    }

    const opening = parseMarkdownContainerFenceLine(line);
    if (opening && (opening.marker !== '`' || line.indexOf('`', opening.infoStart) === -1)) {
      await flushSegment();
      fence = {
        blockquoteDepth: opening.blockquoteDepth,
        containerIndent: opening.containerIndent,
        marker: opening.marker,
        length: opening.length,
      };
      output.push(line);
    } else {
      segment.push(line);
    }
  }

  await flushSegment();
  return output.join('\n');
}

export async function remapDraggedMarkdownImageAssets(
  input: RemapDraggedMarkdownImageAssetsInput,
  deps: RemapDraggedMarkdownImageAssetsDeps = getDefaultDeps(input.sourceNotePath),
): Promise<string | null> {
  const { markdown, sourceNotePath, targetNotePath } = input;
  if (!markdown?.trim() || sourceNotePath === targetNotePath) return markdown;

  const resolveCandidates = deps.resolveCandidates ?? resolveImageSourcePathCandidates;
  const createFile = deps.createFile ?? createDefaultFile;
  const copiedSources = new Map<string, Promise<string | null>>();

  const copySource = (source: string): Promise<string | null> => {
    const trimmed = source.trim();
    if (!trimmed) return Promise.resolve(null);

    const existing = copiedSources.get(trimmed);
    if (existing) return existing;

    const copyPromise = (async () => {
      const candidates = await resolveCandidates({
        rawSrc: trimmed,
        notesPath: deps.notesPath,
        currentNotePath: sourceNotePath,
      });

      for (const candidate of candidates) {
        if (!isImageFilename(candidate) || !await deps.storage.exists(candidate).catch(() => false)) {
          continue;
        }

        const info = await deps.storage.stat(candidate).catch(() => null);
        if (info?.isDirectory || info?.isFile === false) continue;
        if (typeof info?.size === 'number' && info.size > MAX_DRAGGED_IMAGE_ASSET_BYTES) continue;

        const bytes = await deps.storage.readBinaryFile(candidate, MAX_DRAGGED_IMAGE_ASSET_BYTES).catch(() => null);
        if (!bytes || bytes.byteLength > MAX_DRAGGED_IMAGE_ASSET_BYTES) continue;

        const filename = getBaseName(candidate) || 'image.png';
        const file = createFile(bytes, filename, getMimeType(filename), info?.modifiedAt);
        const uploaded = await deps.uploadAsset(file, targetNotePath).catch(() => null);
        return uploaded?.success && uploaded.path
          ? appendOriginalSourceSuffix(trimmed, uploaded.path)
          : null;
      }

      return null;
    })();

    copiedSources.set(trimmed, copyPromise);
    return copyPromise;
  };

  const rewriteSegment = async (segment: string) => {
    let next = await replaceAsync(
      segment,
      /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([\s\S]*?)(\2)([^>]*>)/gi,
      async (match) => {
        const source = decodeHtmlAttribute(match[3] ?? '');
        const copied = await copySource(source);
        return copied
          ? `${match[1]}${match[2]}${escapeHtmlAttribute(copied)}${match[4]}${match[5]}`
          : match[0];
      },
    );

    next = await replaceAsync(
      next,
      /(<img\b[^>]*?\bsrc\s*=\s*)([^\s"'=<>`]+)([^>]*>)/gi,
      async (match) => {
        const copied = await copySource(match[2] ?? '');
        return copied ? `${match[1]}${escapeHtmlAttribute(copied)}${match[3]}` : match[0];
      },
    );

    return replaceAsync(
      next,
      /!\[((?:\\.|[^\]\\])*)\]\(([^)\n]*)\)/g,
      async (match) => {
        const destination = match[2] ?? '';
        const parsed = parseMarkdownDestination(destination);
        if (!parsed) return match[0];

        const copied = await copySource(parsed.source);
        if (!copied) return match[0];

        const rewrittenDestination = [
          destination.slice(0, parsed.start),
          formatMarkdownDestination(copied),
          destination.slice(parsed.end),
        ].join('');
        return `![${match[1] ?? ''}](${rewrittenDestination})`;
      },
    );
  };

  return rewriteMarkdownSegments(markdown, rewriteSegment);
}
