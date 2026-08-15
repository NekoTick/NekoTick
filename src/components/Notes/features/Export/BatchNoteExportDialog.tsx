import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { useI18n } from '@/lib/i18n';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { normalizeUserFacingErrorMessage } from '@/lib/i18n/userFacingErrors';
import { useToastStore } from '@/stores/useToastStore';
import { useUIStore } from '@/stores/uiSlice';
import { useGraphUIStore } from '@/components/Graph/store/useGraphUIStore';
import { hasNativeFileShare } from '@/lib/nativeFileShare';
import { getElectronBridge } from '@/lib/electron/bridge';
import { openDialog } from '@/lib/storage/dialog';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import type { GlobalSearchResult } from '@/components/layout/sidebar/globalSearchResults';
import type { NoteExportFormat } from './noteExportTypes';
import { BATCH_EXPORT_FORMATS, MAX_BATCH_NOTE_CHARS, collectBatchExportSources } from './batchNoteExportModel';
import { getBatchExportTitle, isMarkdownExportFile, readBatchWorkspaceNote, type BatchExportSource } from './batchNoteExportModel';
import { runBatchNoteExports } from './batchNoteExportRunner';
import { BatchNoteExportDialogView } from './BatchNoteExportDialogView';

interface BatchNoteExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentNotePath: string | null | undefined;
  currentNoteTitle: string;
  getCurrentNoteContent: () => string;
  notesPath: string;
}

const BATCH_EXPORT_CONCURRENCY = 4;

export function BatchNoteExportDialog({
  open,
  onOpenChange,
  currentNotePath,
  currentNoteTitle,
  getCurrentNoteContent,
  notesPath,
}: BatchNoteExportDialogProps) {
  const { t } = useI18n();
  const addToast = useToastStore((state) => state.addToast);
  const setAppViewMode = useUIStore((state) => state.setAppViewMode);
  const setGraphMode = useGraphUIStore((state) => state.setMode);
  const setGraphSelectedPath = useGraphUIStore((state) => state.setSelectedPath);
  const rootFolder = useNotesStore((state) => state.rootFolder);
  const getDisplayName = useNotesStore((state) => state.getDisplayName);
  const [externalSources, setExternalSources] = useState<BatchExportSource[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<NoteExportFormat>('docx');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ completed: 0, total: 0 });
  const [isDragActive, setIsDragActive] = useState(false);
  const [query, setQuery] = useState('');
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null);
  const noteContentsCache = useNotesStore((state) => state.noteContentsCache);
  const noteContentsCacheRevision = useNotesStore((state) => state.noteContentsCacheRevision);
  const currentNote = useNotesStore((state) => state.currentNote);
  const prefetchNote = useNotesStore((state) => state.prefetchNote);
  const cancelPrefetchNote = useNotesStore((state) => state.cancelPrefetchNote);

  const workspaceSources = useMemo(() => {
    const next = collectBatchExportSources(rootFolder?.children ?? []);
    if (currentNotePath && !next.some((source) => source.path === currentNotePath)) {
      next.unshift({ id: `root:${currentNotePath}`, name: currentNoteTitle, path: currentNotePath });
    }
    return next;
  }, [currentNotePath, currentNoteTitle, rootFolder]);
  const sources = useMemo(() => {
    const byId = new Map(workspaceSources.map((source) => [source.id, source]));
    for (const source of externalSources) byId.set(source.id, source);
    return Array.from(byId.values());
  }, [externalSources, workspaceSources]);
  const visibleSources = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return sources;
    return sources.filter((source) => (
      source.name.toLocaleLowerCase().includes(normalizedQuery)
      || source.path.toLocaleLowerCase().includes(normalizedQuery)
    ));
  }, [query, sources]);
  const formatOptions = useMemo(
    () => BATCH_EXPORT_FORMATS.filter((format) => format.value !== 'pdf' || !hasNativeFileShare()),
    [],
  );

  const previewSource = useMemo(
    () => visibleSources.find((source) => source.id === previewSourceId) ?? visibleSources[0] ?? null,
    [previewSourceId, visibleSources],
  );
  const previewContent = useMemo(() => {
    if (!previewSource) return '';
    if (previewSource.external) return previewSource.content ?? '';
    if (previewSource.path === currentNote?.path) return currentNote.content;
    return noteContentsCache.get(previewSource.path)?.content ?? '';
  }, [currentNote, noteContentsCache, noteContentsCacheRevision, previewSource]);
  const previewResult = useMemo<GlobalSearchResult | null>(() => {
    if (!previewSource) return null;
    return {
      id: `batch-export:${previewSource.id}`,
      kind: 'notes',
      note: {
        id: previewSource.id,
        path: previewSource.path,
        name: previewSource.name,
        preview: '',
        isExternal: previewSource.external,
        matchIndex: 0,
        matchKind: 'name',
        contentSnippet: null,
        contentMatchOrdinal: null,
      },
      subtitle: '',
      title: previewSource.name,
    };
  }, [previewSource]);

  useEffect(() => {
    if (!open || !previewSource || previewSource.external || previewSource.path === currentNote?.path) return;
    if (noteContentsCache.has(previewSource.path)) return;
    void prefetchNote(previewSource.path);
    return () => cancelPrefetchNote(previewSource.path);
  }, [cancelPrefetchNote, currentNote?.path, noteContentsCache, noteContentsCacheRevision, open, prefetchNote, previewSource]);

  useEffect(() => {
    if (!open) return;
    setExternalSources([]);
    setSelectedIds(new Set(currentNotePath ? [`root:${currentNotePath}`] : []));
    setFormat('docx');
    setQuery('');
    setPreviewSourceId(currentNotePath ? `root:${currentNotePath}` : null);
    setExportProgress({ completed: 0, total: 0 });
  }, [currentNotePath, open]);

  const addExternalFiles = useCallback(async (files: FileList | File[]) => {
    const markdownFiles = Array.from(files).filter(isMarkdownExportFile);
    if (markdownFiles.length === 0) return;
    const additions: BatchExportSource[] = [];
    for (const file of markdownFiles) {
      const content = await file.text();
      if (content.length > MAX_BATCH_NOTE_CHARS) continue;
      const id = `external:${file.name}:${file.lastModified}:${file.size}`;
      additions.push({ id, name: file.name, path: file.name, content, external: true });
    }
    if (additions.length === 0) return;
    setExternalSources((current) => {
      const existing = new Set(current.map((source) => source.id));
      return [...current, ...additions.filter((source) => !existing.has(source.id))];
    });
    setSelectedIds((current) => {
      const next = new Set(current);
      additions.forEach((source) => next.add(source.id));
      return next;
    });
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = visibleSources.length > 0 && visibleSources.every((source) => next.has(source.id));
      visibleSources.forEach((source) => {
        if (allSelected) next.delete(source.id); else next.add(source.id);
      });
      return next;
    });
  }, [visibleSources]);

  const handleOpenGraph = useCallback((path: string) => {
    setGraphMode('local');
    setGraphSelectedPath(path);
    setAppViewMode('graph');
    onOpenChange(false);
  }, [onOpenChange, setAppViewMode, setGraphMode, setGraphSelectedPath]);

  const handleExport = useCallback(async () => {
    const selectedSources = sources.filter((source) => selectedIds.has(source.id));
    if (selectedSources.length === 0) return;
    setExportProgress({ completed: 0, total: selectedSources.length });
    setIsExporting(true);
    try {
      const isDesktop = Boolean(getElectronBridge());
      const desktopOutputDirectory = isDesktop
        ? await openDialog({ directory: true, title: t('notes.export') })
        : null;
      if (isDesktop && typeof desktopOutputDirectory !== 'string') return;
      const completed = await runBatchNoteExports({
        sources: selectedSources,
        formats: [format],
        notesPath,
        outputDirectory: typeof desktopOutputDirectory === 'string' ? desktopOutputDirectory : null,
        concurrency: hasNativeFileShare() ? 1 : BATCH_EXPORT_CONCURRENCY,
        getContent: async (source) => {
          const state = useNotesStore.getState();
          return source.external
            ? source.content ?? ''
            : source.path === currentNotePath
              ? getCurrentNoteContent()
              : state.noteContentsCache.get(source.path)?.content ?? await readBatchWorkspaceNote(source.path, notesPath);
        },
        getTitle: (source) => source.external
          ? getBatchExportTitle(source.name)
          : source.path === currentNotePath
            ? currentNoteTitle
            : getDisplayName(source.path),
        onProgress: (completedCount, total) => setExportProgress({ completed: completedCount, total }),
      });
      if (completed) {
        if (isDesktop) addToast(t('notes.batchExported', { count: selectedSources.length }), 'success');
        onOpenChange(false);
      }
    } catch (error) {
      addToast(normalizeUserFacingErrorMessage(error, 'notes.exportFailed'), 'error', themeUiFeedbackTokens.errorToastDurationMs);
    } finally {
      setIsExporting(false);
      setExportProgress({ completed: 0, total: 0 });
    }
  }, [addToast, currentNotePath, currentNoteTitle, format, getCurrentNoteContent, getDisplayName, notesPath, onOpenChange, selectedIds, sources, t]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  }, []);
  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target) setIsDragActive(false);
  }, []);
  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    void addExternalFiles(event.dataTransfer.files);
  }, [addExternalFiles]);

  return (
    <BatchNoteExportDialogView
      open={open}
      onOpenChange={onOpenChange}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      query={query}
      setQuery={setQuery}
      isExporting={isExporting}
      exportProgress={exportProgress}
      isDragActive={isDragActive}
      selectedCount={selectedIds.size}
      allVisibleSelected={visibleSources.length > 0 && visibleSources.every((source) => selectedIds.has(source.id))}
      someVisibleSelected={visibleSources.some((source) => selectedIds.has(source.id))}
      visibleSources={visibleSources}
      selectedIds={selectedIds}
      notesPath={notesPath}
      previewResult={previewResult}
      previewContent={previewContent}
      onPreviewSourceChange={setPreviewSourceId}
      onOpenGraph={handleOpenGraph}
      format={format}
      formatOptions={formatOptions}
      toggleAllVisible={toggleAllVisible}
      toggleSelected={toggleSelected}
      setFormat={setFormat}
      addExternalFiles={addExternalFiles}
      handleExport={handleExport}
    />
  );
}
