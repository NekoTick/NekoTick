import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTheme } from 'next-themes';
import { OverlayScrollArea } from '@/components/ui/overlay-scroll-area';
import { CoverImage } from '@/components/Notes/features/Cover/components/CoverImage/CoverImage';
import { resolveCoverAssetUrl } from '@/components/Notes/features/Cover/utils/resolveCoverAssetUrl';
import { READONLY_MARKDOWN_REHYPE_PLUGINS } from '@/components/common/markdown/markdownPipeline';
import { readonlyMarkdownUrlTransform } from '@/components/common/markdown/urlTransform';
import { HeroIconHeader } from '@/components/common/HeroIconHeader';
import { NoteToolbarActions } from '@/components/Notes/features/Editor/NoteToolbarActions';
import { EDITOR_LAYOUT_CLASS } from '@/lib/layout';
import { cn } from '@/lib/utils';
import { normalizeColorModePreference } from '@/lib/theme/colorModeSync';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import {
  selectMarkdownImportedThemeId,
  selectMarkdownTypewriterModeEnabled,
} from '@/stores/unified/settings/markdownSettings';
import { readNoteMetadataFromMarkdown } from '@/stores/notes/frontmatter';
import { resolveEffectiveNotesRootPath } from '@/stores/notes/effectiveNotesRootPath';
import { findStarredEntryByPath } from '@/stores/notes/starred';
import type { NotesSplitDirection } from './notesSplitLayout';
import type { EditorViewportPoint } from '@/components/Notes/features/Editor/utils/focusEditorAtPoint';
import { useImportedMarkdownThemePlatform } from '@/components/markdown-theme/useImportedMarkdownThemePlatform';
import { useEffectiveImportedMarkdownThemeId } from '@/components/markdown-theme/markdownThemePreview';
import {
  resolveMarkdownThemeRuntimeColorScheme,
  resolveMarkdownThemeViewport,
  resolveTyporaRuntimePlatformClasses,
} from '@/components/Notes/features/Editor/markdownThemeRuntime';
import { getNotesSplitPaneBorderClass } from './notesSplitPaneBorders';
import { NotesSplitPaneChrome } from './NotesSplitPaneChrome';
import {
  SPLIT_PREVIEW_REMARK_PLUGINS,
  createSplitPreviewMarkdownComponents,
  prepareSplitPreviewMarkdown,
} from './NotesSplitPreviewMarkdown';
import '@/components/common/markdown/markdownSurface.css';
import type { NoteCoverMetadata, NoteMetadataEntry } from '@/stores/notes/types';
export { NotesSplitDropOverlay } from './NotesSplitDropOverlay';
export { NotesSplitPaneChrome } from './NotesSplitPaneChrome';

interface NotesSplitPreviewPaneProps {
  content: string;
  direction?: NotesSplitDirection;
  interactive?: boolean;
  path: string;
  title: string;
  onActivate: (point?: EditorViewportPoint) => void | Promise<void>;
  onClose: () => void;
  showChrome?: boolean;
  onPaneDragPointerDown?: (event: ReactPointerEvent<HTMLDivElement>, sourceLeafId: string) => void;
  sourceLeafId?: string;
}

const DEFAULT_ICON_SIZE = 60;
const noopUpdateCover = () => {};
const PREVIEW_TEXT_BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, blockquote';
const MAX_PREVIEW_CONTENT_ANCHOR_LENGTH = 512;

function getPreviewTextOffsetAtPoint(element: HTMLElement, clientX: number, clientY: number): number | undefined {
  const caretRange = document.caretRangeFromPoint?.(clientX, clientY);
  if (!caretRange || !element.contains(caretRange.startContainer)) {
    return undefined;
  }

  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(element);
  prefixRange.setEnd(caretRange.startContainer, caretRange.startOffset);
  return prefixRange.toString().length;
}

function getMetadataEntryForPath(
  path: string,
  metadata: { notes?: Record<string, NoteMetadataEntry | undefined> } | null | undefined,
): NoteMetadataEntry | undefined {
  const notes = metadata?.notes;
  if (!notes || !Object.prototype.hasOwnProperty.call(notes, path)) {
    return undefined;
  }

  return notes[path];
}

function normalizeCover(cover: NoteCoverMetadata | undefined): {
  url: string | null;
  positionX: number;
  positionY: number;
  height?: number;
  scale: number;
} {
  return {
    url: cover?.assetPath ?? null,
    positionX: cover?.positionX ?? 50,
    positionY: cover?.positionY ?? 50,
    height: cover?.height,
    scale: cover?.scale ?? 1,
  };
}

export function NotesSplitPreviewPane({
  content,
  direction,
  interactive = true,
  path,
  title,
  onActivate,
  onClose,
  showChrome = true,
  onPaneDragPointerDown,
  sourceLeafId,
}: NotesSplitPreviewPaneProps) {
  const notesPath = useNotesStore(s => s.notesPath);
  const starredEntries = useNotesStore(s => s.starredEntries);
  const toggleStarred = useNotesStore(s => s.toggleStarred);
  const defaultIconSize = useNotesStore(s => ('noteIconSize' in s ? s.noteIconSize : DEFAULT_ICON_SIZE));
  const selectedMarkdownThemeId = useUnifiedStore(selectMarkdownImportedThemeId);
  const importedMarkdownThemeId = useEffectiveImportedMarkdownThemeId(selectedMarkdownThemeId);
  const typewriterMode = useUnifiedStore(selectMarkdownTypewriterModeEnabled);
  const appColorModePreference = useUnifiedStore((state) => state.data.settings.ui?.colorMode);
  const { resolvedTheme } = useTheme();
  const normalizedAppColorMode = normalizeColorModePreference(appColorModePreference);
  const appMarkdownThemeColorScheme = normalizedAppColorMode === 'system'
    ? (resolvedTheme === 'dark' ? 'dark' : 'light')
    : normalizedAppColorMode;
  const importedMarkdownThemePlatform = useImportedMarkdownThemePlatform(importedMarkdownThemeId);
  const [markdownThemeViewport, setMarkdownThemeViewport] = useState(() =>
    resolveMarkdownThemeViewport(typeof window === 'undefined' ? 1024 : window.innerWidth)
  );
  const metadataEntry = useNotesStore(
    useCallback((state) => getMetadataEntryForPath(path, state.noteMetadata), [path])
  );
  const fallbackMetadata = useMemo(() => (
    metadataEntry ? undefined : readNoteMetadataFromMarkdown(content)
  ), [content, metadataEntry]);
  const noteMetadata = metadataEntry ?? fallbackMetadata;
  const previewMarkdown = useMemo(() => prepareSplitPreviewMarkdown(content), [content]);
  const cover = normalizeCover(noteMetadata?.cover);
  const iconSize = noteMetadata?.iconSize ?? defaultIconSize ?? DEFAULT_ICON_SIZE;
  const notesRootPath = resolveEffectiveNotesRootPath({
    notesPath,
    currentNotePath: path,
  });
  const loadImage = useCallback((src: string) => {
    return resolveCoverAssetUrl({
      assetPath: src,
      notesRootPath,
      currentNotePath: path,
      replayAnimated: true,
    });
  }, [notesRootPath, path]);
  const markdownComponents = useMemo(() => createSplitPreviewMarkdownComponents(loadImage), [loadImage]);
  const typoraRuntimePlatformClasses = useMemo(() => (
    importedMarkdownThemePlatform === 'typora'
      ? resolveTyporaRuntimePlatformClasses().join(' ')
      : ''
  ), [importedMarkdownThemePlatform]);
  const markdownThemeRuntimeColorScheme = useMemo(() => (
    resolveMarkdownThemeRuntimeColorScheme({
      importedThemeId: importedMarkdownThemeId,
      importedThemePlatform: importedMarkdownThemePlatform,
      appColorScheme: appMarkdownThemeColorScheme,
    })
  ), [
    appMarkdownThemeColorScheme,
    importedMarkdownThemeId,
    importedMarkdownThemePlatform,
  ]);
  const starred = Boolean(findStarredEntryByPath(starredEntries, 'note', path, notesPath));

  useEffect(() => {
    const updateViewport = () => {
      setMarkdownThemeViewport(resolveMarkdownThemeViewport(window.innerWidth));
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  return (
    <section
      data-notes-split-preview-pane={interactive ? 'true' : undefined}
      data-notes-block-drop-target={interactive ? 'true' : undefined}
      data-notes-split-leaf-path={path}
      className={cn(
        'relative flex h-full w-full min-h-0 min-w-0 flex-col bg-[var(--vlaina-bg-primary)]',
        direction ? getNotesSplitPaneBorderClass(direction) : null,
        'border-[var(--vlaina-color-border-shell)]'
      )}
      onClick={(event) => {
        if (!interactive) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest('button')) return;
        const previewContent = target.closest<HTMLElement>('[data-notes-split-preview-content="true"]');
        if (!previewContent) return;
        const previewRect = previewContent.getBoundingClientRect();
        const textBlock = target.closest<HTMLElement>(PREVIEW_TEXT_BLOCK_SELECTOR);
        const blockText = textBlock?.textContent?.trim() ?? '';
        const contentAnchorText = blockText.length <= MAX_PREVIEW_CONTENT_ANCHOR_LENGTH
          ? blockText
          : '';
        const rawTextOffset = textBlock
          ? getPreviewTextOffsetAtPoint(textBlock, event.clientX, event.clientY)
          : undefined;
        const blockLeadingWhitespace = textBlock?.textContent?.length
          ? textBlock.textContent.length - textBlock.textContent.trimStart().length
          : 0;
        onActivate({
          clientX: event.clientX,
          clientY: event.clientY,
          contentOffset: {
            left: event.clientX - previewRect.left,
            top: event.clientY - previewRect.top,
          },
          contentAnchor: contentAnchorText
            ? {
                text: contentAnchorText,
                textOffset: rawTextOffset === undefined
                  ? undefined
                  : Math.max(0, rawTextOffset - blockLeadingWhitespace),
              }
            : undefined,
        });
      }}
    >
      {showChrome ? (
        <NotesSplitPaneChrome
          path={path}
          sourceLeafId={sourceLeafId}
          title={title}
          onDragPointerDown={onPaneDragPointerDown}
          actions={(
            <NoteToolbarActions
              currentNotePath={path}
              currentNoteTitle={title}
              getCurrentNoteContent={() => content}
              notesPath={notesPath}
              starred={starred}
              toggleStarred={toggleStarred}
              currentNoteMetadata={noteMetadata}
              buttonClassName="h-7 w-7"
              forceShowChat
              onOpenChat={() => onActivate()}
            />
          )}
          onClose={onClose}
        />
      ) : null}

      <OverlayScrollArea
        className="min-h-0 flex-1"
        viewportClassName="flex flex-col items-center relative"
        scrollbarVariant="compact"
        data-note-cover-viewport="true"
      >
        {cover.url ? (
          <CoverImage
            url={cover.url}
            positionX={cover.positionX}
            positionY={cover.positionY}
            height={cover.height}
            scale={cover.scale}
            readOnly
            onUpdate={noopUpdateCover}
            notesRootPath={notesRootPath}
            currentNotePath={path}
          />
        ) : null}

        <HeroIconHeader
          id={`notes-split-preview:${path}`}
          className={EDITOR_LAYOUT_CLASS}
          icon={noteMetadata?.icon ?? null}
          onIconChange={() => undefined}
          iconSize={iconSize}
          coverUrl={cover.url}
          coverLayoutActive={Boolean(cover.url)}
          imageLoader={loadImage}
          readOnly
          title={title}
          titleClassName="!text-[length:var(--vlaina-note-title-compact-font-size)] !leading-[var(--vlaina-note-title-compact-line-height)] !py-[var(--vlaina-note-title-padding-y)]"
        />

        <div
          className={cn(
            'milkdown-editor',
            !importedMarkdownThemeId && 'theme-vlaina',
            importedMarkdownThemeId && 'theme-external-markdown',
            importedMarkdownThemePlatform === 'typora' && 'theme-typora typora-export typora-export-content typora-node',
            typoraRuntimePlatformClasses,
            importedMarkdownThemePlatform === 'obsidian' && 'theme-obsidian',
            markdownThemeRuntimeColorScheme.colorScheme === 'dark' && 'theme-dark',
            markdownThemeRuntimeColorScheme.colorScheme === 'light' && 'theme-light',
            'is-live-preview',
            'max',
            'is-readable-line-width',
            markdownThemeViewport === 'mobile' && 'is-mobile',
            markdownThemeViewport === 'tablet' && 'is-tablet',
            markdownThemeViewport === 'desktop' && 'is-desktop',
            typewriterMode && 'ty-on-typewriter-mode',
            EDITOR_LAYOUT_CLASS
          )}
          data-markdown-theme-root="true"
          data-markdown-theme-platform={importedMarkdownThemeId ? importedMarkdownThemePlatform ?? 'external' : 'vlaina'}
          data-markdown-compat={importedMarkdownThemeId ? 'external' : 'native'}
          data-markdown-compat-layer={importedMarkdownThemeId ? 'external' : 'native'}
          data-markdown-imported-theme={importedMarkdownThemeId ?? undefined}
          data-markdown-theme-color-scheme={markdownThemeRuntimeColorScheme.colorScheme}
          data-markdown-theme-color-scheme-mode={markdownThemeRuntimeColorScheme.mode}
          data-theme={markdownThemeRuntimeColorScheme.colorScheme}
        >
          <div
            id="write"
            data-notes-split-preview-content="true"
            className="markdown-surface pb-[var(--vlaina-space-48px)]"
          >
            <ReactMarkdown
              components={markdownComponents}
              remarkPlugins={SPLIT_PREVIEW_REMARK_PLUGINS}
              rehypePlugins={READONLY_MARKDOWN_REHYPE_PLUGINS}
              urlTransform={readonlyMarkdownUrlTransform}
            >
              {previewMarkdown}
            </ReactMarkdown>
          </div>
        </div>
      </OverlayScrollArea>
    </section>
  );
}
