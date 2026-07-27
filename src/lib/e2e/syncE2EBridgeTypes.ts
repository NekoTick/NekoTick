import type { ManagedBudgetStatus } from '@/lib/ai/managedService';
import type { ChatMessage, ChatSession, MessageVersion } from '@/lib/ai/types';
import type { UnifiedData } from '@/lib/storage/unifiedStorageTypes';
import type { NotesState } from '@/stores/notes/types';
import { useManagedAIStore } from '@/stores/useManagedAIStore';
import type { NotesRootInfo } from '@/stores/useNotesRootStore';
import type { ChatE2EMockRequest, ChatE2EMockResponse } from './chatE2EMock';

export interface EditorSelectionSummary {
  from: number;
  to: number;
  empty: boolean;
  selectedText: string;
  docTextLength: number;
}

export interface EditorDispatchProfileSummary {
  decorationPropTotalMs: number;
  dispatchCount: number;
  docChangedCount: number;
  insertedTextLength: number;
  maxDispatchMs: number;
  pluginApplyTotalMs: number;
  p95DispatchMs: number;
  totalDispatchMs: number;
  totalProfileMs: number;
  totalStepCount: number;
  updateStateCount: number;
  updateStateMaxMs: number;
  updateStateP95Ms: number;
  updateStateTotalMs: number;
  updateStateInnerCount: number;
  updateStateInnerMaxMs: number;
  updateStateInnerP95Ms: number;
  updateStateInnerTotalMs: number;
  slowestPluginApplies: Array<{
    count: number;
    key: string;
    maxMs: number;
    p95Ms: number;
    totalMs: number;
  }>;
  slowestDispatches: Array<{
    docChanged: boolean;
    durationMs: number;
    insertedTextLength: number;
    selectionSet: boolean;
    stepCount: number;
  }>;
  slowestDecorationProps: Array<{
    count: number;
    key: string;
    maxMs: number;
    p95Ms: number;
    totalMs: number;
  }>;
}

export interface E2EBridge {
  waitForUnifiedLoaded(): Promise<void>;
  getUnifiedData(): UnifiedData;
  reloadUnified(): Promise<void>;
  flushUnifiedSave(): Promise<void>;
  addProvider(input: {
    name: string;
    apiHost?: string;
    apiKey?: string;
    enabled?: boolean;
    endpointType?: 'openai' | 'anthropic';
    endpointTypeCheckedAt?: number;
  }): Promise<string>;
  addModel(input: {
    providerId: string;
    apiModelId?: string;
    name?: string;
    enabled?: boolean;
    selected?: boolean;
    endpointType?: 'openai' | 'anthropic';
    endpointTypeCheckedAt?: number;
  }): Promise<string>;
  setProviderFetchedModels(providerId: string, modelIds: string[]): Promise<void>;
  deleteProvider(id: string): Promise<void>;
  prepareChatWebSearchE2E(): Promise<{ providerId: string; modelId: string }>;
  setChatWebSearchEnabled(enabled: boolean): Promise<void>;
  enqueueChatMockResponse(response: ChatE2EMockResponse): Promise<void>;
  getChatMockRequests(): ChatE2EMockRequest[];
  getChatMockPendingRequestIds(): string[];
  resolveChatMockPendingRequest(requestId?: string, response?: ChatE2EMockResponse): Promise<boolean>;
  getChatState(): {
    currentSessionId: string | null;
    webSearchEnabled: boolean;
    generating: boolean;
    sessions: ChatSession[];
    messages: Record<string, ChatMessage[]>;
  };
  setTimezone(offset: number, city: string): Promise<void>;
  setMarkdownLineNumbers(showLineNumbers: boolean): Promise<void>;
  setMarkdownBodyLineNumbers(showLineNumbers: boolean): Promise<void>;
  getImportedMarkdownThemesDirectoryPath(): Promise<string>;
  syncImportedMarkdownThemesFromDirectory(): Promise<{
    directoryPath: string;
    themes: import('@/lib/markdown/theme-compatibility/types').ImportedMarkdownThemeMetadata[];
    activeThemeId: string | null;
  }>;
  setMarkdownImportedThemeId(importedThemeId: string | null): Promise<void>;
  createWindow(options?: { viewMode?: 'notes' | 'chat' | null }): Promise<void>;
  createNotesFixture(input?: { filename?: string; content?: string }): Promise<{
    notesRootPath: string;
    notePath: string;
  }>;
  createNotesRootFixture(input?: { name?: string; filename?: string; content?: string }): Promise<{
    notesRootPath: string;
    notePath: string;
  }>;
  createNotesRootFilesFixture(input: {
    name?: string;
    files: Array<{
      filename: string;
      content: string;
    }>;
  }): Promise<{
    notesRootPath: string;
    notePaths: string[];
  }>;
  createChatFixture(input: {
    sessions: Array<{
      title: string;
      preloadMessages?: boolean;
      messages: Array<{
        id?: string;
        role: ChatMessage['role'];
        content: string;
        modelId?: string;
        imageSources?: string[];
        apiTranscript?: ChatMessage['apiTranscript'];
        versions?: Array<{
          content: string;
          kind?: MessageVersion['kind'];
          createdAt?: number;
        }>;
        currentVersionIndex?: number;
      }>;
    }>;
    activeSessionIndex?: number;
  }): Promise<{
    sessionIds: string[];
    activeSessionId: string | null;
  }>;
  switchChatSession(id: string): Promise<void>;
  setAppViewMode(mode: 'notes' | 'chat' | 'graph'): Promise<void>;
  initializeNotesRootStore(): Promise<void>;
  openNotesRoot(path: string, name?: string): Promise<boolean>;
  closeNotesRoot(): Promise<boolean>;
  getNotesRootState(): {
    currentNotesRoot: NotesRootInfo | null;
    recentNotesRoots: NotesRootInfo[];
    error: string | null;
    isLoading: boolean;
  };
  removeRecentNotesRoot(id: string): Promise<boolean>;
  readNotesRootConfig(path: string): Promise<unknown>;
  openAbsoluteNote(path: string): Promise<void>;
  openAbsoluteNoteWithTiming(path: string): Promise<{
    totalMs: number;
    currentNoteContentLength: number;
    currentNotePath: string | null;
  }>;
  getNoteSelectableBlocks(): Array<{
    text: string;
    rangeText: string;
    tagName: string;
    className: string;
    dataset: Record<string, string>;
    rect: { left: number; top: number; width: number; height: number };
    from: number;
    to: number;
  }>;
  selectEditorTextByText(text: string, anchorText?: string): Promise<{
    selected: boolean;
    from: number | null;
    to: number | null;
    selectedText: string;
    timings?: Record<string, number>;
  }>;
  getEditorSelectionSummary(): EditorSelectionSummary | null;
  getEditorPositionAtPoint(clientX: number, clientY: number): number | null;
  getEditorTextRange(text: string, anchorText?: string): { from: number; to: number } | null;
  getCurrentEditorNotePath(): string | null;
  getEditorHistoryDepth(): { undo: number; redo: number } | null;
  focusEditorAtPoint(clientX: number, clientY: number): boolean;
  setEditorSelectionRange(from: number, to?: number): Promise<EditorSelectionSummary | null>;
  focusCurrentEditor(): Promise<boolean>;
  focusCurrentEditorAtEnd(): Promise<boolean>;
  startEditorDispatchProfile(): boolean;
  stopEditorDispatchProfile(): EditorDispatchProfileSummary | null;
  editorTextHasMark(text: string, markName: string, anchorText?: string): boolean;
  getEditorToolbarDebugState(): {
    selection: EditorSelectionSummary | null;
    activeElement: {
      tagName: string;
      className: string;
      isEditor: boolean;
    } | null;
    toolbarState: {
      isVisible: boolean;
      subMenu: string | null;
      copied: boolean;
    } | null;
    toolbarDom: {
      exists: boolean;
      className: string;
      text: string;
      rect: { x: number; y: number; width: number; height: number } | null;
    };
  };
  writeClipboardText(text: string): Promise<void>;
  flushCurrentEditorMarkdown(): Promise<boolean>;
  selectNoteBlocksByText(texts: string[]): Promise<number>;
  selectNoteBlocksByIndexes(indexes: number[]): Promise<number>;
  measureGrowingBlockSelectionByIndexCounts(counts: number[]): Promise<{
    selectableCount: number;
    collectTargetsMs: number;
    results: Array<{
      requestedCount: number;
      selectedStateCount: number;
      selectedDomCount: number;
      lineFillCount: number;
      dispatchMs: number;
      firstFrameMs: number;
      secondFrameMs: number;
      totalMs: number;
    }>;
  }>;
  getNotesState(): Pick<NotesState, 'currentNote' | 'isDirty' | 'error' | 'openTabs'>;
  getNotesTreeMetrics(): {
    folders: number;
    files: number;
    metadataEntries: number;
    expandedFolders: string[];
    isLoading: boolean;
    rootFolderPath: string | null;
    rootFolderReferenceVersion: number;
  };
  getNoteContentCacheEntry(path: string): {
    hasEntry: boolean;
    contentLength: number;
    contentPreview: string;
    freshUntil: number | null;
    modifiedAt: number | null;
    currentNotePath: string | null;
    openTabPaths: string[];
    cacheKeys: string[];
  };
  pruneNoteContentsCacheToOpenNotes(): void;
  getNotesPreferences(): Pick<NotesState, 'noteIconSize' | 'recentNotes'>;
  getStarredState(): Pick<
    NotesState,
    'notesPath' | 'starredEntries' | 'starredNotes' | 'starredFolders' | 'starredLoaded'
  >;
  loadStarred(notesRootPath: string): Promise<void>;
  toggleStarred(path: string): Promise<void>;
  removeStarredEntry(id: string): Promise<void>;
  updateCurrentNoteContent(content: string): Promise<void>;
  saveCurrentNote(): Promise<void>;
  syncCurrentNoteFromDisk(options?: { force?: boolean }): Promise<string>;
  applyExternalPathDeletion(path: string): Promise<void>;
  setGlobalNoteIconSize(size: number): Promise<void>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  getUIState(): {
    fontSize: number;
    languagePreference: string;
    sidebarWidth: number;
    imageStorageMode: string;
    imageSubfolderName: string;
    imageNotesRootSubfolderName: string;
    imageFilenameFormat: string;
    notesChatPanelCollapsed: boolean;
    colorMode: 'system' | 'light' | 'dark';
  };
  setUIPreferences(input: {
    fontSize?: number;
    languagePreference?: string;
    sidebarWidth?: number;
    imageStorageMode?: 'notesRoot' | 'notesRootSubfolder' | 'currentFolder' | 'subfolder';
    imageSubfolderName?: string;
    notesChatPanelCollapsed?: boolean;
    colorMode?: 'system' | 'light' | 'dark';
  }): Promise<void>;
  getManagedBudgetState(): Pick<
    ReturnType<typeof useManagedAIStore.getState>,
    'budget' | 'lastBudgetSyncAt' | 'budgetError' | 'isRefreshingBudget'
  >;
  applyManagedBudgetSnapshot(budget: ManagedBudgetStatus): Promise<void>;
  clearManagedBudget(): Promise<void>;
}
