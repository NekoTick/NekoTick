export interface ElectronWindowApi {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<boolean>;
  close(): Promise<void>;
  confirmClose(): Promise<void>;
  isMaximized(): Promise<boolean>;
  setResizable(resizable: boolean): Promise<void>;
  setMaximizable(maximizable: boolean): Promise<void>;
  setMinSize(width: number, height: number): Promise<void>;
  setSize(width: number, height: number): Promise<void>;
  setThemeColors?(colors: {
    backgroundColor: string;
    titleBarOverlayColor: string;
    titleBarSymbolColor: string;
  }): Promise<boolean>;
  setTitleBarOverlayVisible?(visible: boolean): Promise<boolean>;
  center(): Promise<void>;
  getSize(): Promise<{ width: number; height: number }>;
  getLabel(): Promise<string | null>;
  focus(label: string): Promise<boolean>;
  toggleFullscreen(): Promise<boolean>;
  create(options?: Record<string, unknown>): Promise<void>;
  onCloseRequested(callback: () => void): () => void;
}

export interface ElectronShortcutsApi {
  onOpenMarkdownFile(callback: () => void): () => void;
}

export interface ElectronShellApi {
  openExternal(url: string): Promise<void>;
  openPath(filePath: string): Promise<void>;
  trashItem(filePath: string): Promise<void>;
  revealItem(filePath: string): Promise<void>;
}

export interface ElectronDialogApi {
  open(options?: Record<string, unknown>): Promise<string | string[] | null>;
  save(options?: Record<string, unknown>): Promise<string | null>;
  message(
    message: string,
    options?: { title?: string; kind?: 'info' | 'warning' | 'error' }
  ): Promise<void>;
  confirm(
    message: string,
    options?: { title?: string; kind?: 'info' | 'warning' | 'error' }
  ): Promise<boolean>;
}

export interface ElectronClipboardApi {
  writeText(text: string): Promise<void>;
  writeImage?(dataUrl: string): Promise<void>;
}

export interface ElectronMediaApi {
  capturePage(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<string>;
  resolveVideoUrl(url: string): Promise<{
    resolvedUrl: string;
    source: 'unchanged' | 'fallback' | 'bilibili';
    bvid?: string;
    aid?: number | null;
    cid?: number | null;
    page?: number | null;
    error?: string;
    stage?: string;
    timeoutFired?: boolean;
    durationMs?: number;
  }>;
  diagnoseUrl(url: string): Promise<{
    url: string;
    proxy: string;
    proxyConfig: {
      proxyServer: string;
      proxyRules: string;
      source: string;
    } | null;
  }>;
}

export interface ElectronAppApi {
  getVersion(): Promise<string>;
  setLanguage?(language: string): Promise<boolean>;
  findMarkdownGitRoot?(filePath: string): Promise<string | null>;
  onOpenMarkdownFile?(callback: (filePath: string) => void): () => void;
  reportStartupReady?(): void;
  getErrorLogInfo?(): Promise<{
    logsDir: string;
    currentLogFilePath: string;
  }>;
  openErrorLogFolder?(): Promise<void>;
  reportRendererError?(details: {
    source?: string;
    type?: string;
    name?: string;
    message?: string;
    stack?: string;
    componentStack?: string;
    error?: unknown;
    reactVersion?: string;
    buildMode?: string;
    isDev?: boolean;
    isProd?: boolean;
  }): Promise<{
    logsDir: string;
    currentLogFilePath: string;
    logFilePath: string | null;
  }>;
}

export type ElectronGitChangeStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'conflicted';

export interface ElectronGitChange {
  path: string;
  previousPath: string | null;
  indexStatus: string;
  workTreeStatus: string;
  status: ElectronGitChangeStatus;
  staged: boolean;
  unstaged: boolean;
}

export interface ElectronGitStatus {
  rootPath: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  remoteUrl: string | null;
  remoteConfigured: boolean;
  remoteProtocolSupported: boolean;
  changes: ElectronGitChange[];
}

export interface ElectronGitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  authoredAt: string;
}

export interface ElectronGitApi {
  status(rootPath: string): Promise<ElectronGitStatus | null>;
  fetch(rootPath: string): Promise<ElectronGitStatus>;
  workingDiff(rootPath: string, filePaths: string[]): Promise<string>;
  history(rootPath: string, limit?: number): Promise<ElectronGitCommit[]>;
  commitDiff(rootPath: string, hash: string): Promise<string>;
  commit(
    rootPath: string,
    options: { message: string; paths: string[] }
  ): Promise<ElectronGitStatus>;
  pull(rootPath: string): Promise<ElectronGitStatus>;
  push(rootPath: string): Promise<ElectronGitStatus>;
}

export interface ElectronUpdatePolicy {
  distribution: 'direct' | 'microsoft-store';
  checkEnabled: boolean;
  backgroundDownloadEnabled: boolean;
  localInstallerEnabled: boolean;
  externalDownloadEnabled: boolean;
  cleanupDownloadedUpdatesEnabled: boolean;
}

export interface ElectronUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  downloadUrl: string;
  releaseUrl: string;
  platformAssetName: string;
  platformAssetSha256?: string;
  hasPlatformAsset: boolean;
  releaseNotes: string;
  publishedAt: string;
  updatePolicy?: ElectronUpdatePolicy;
}

export interface ElectronUpdateApi {
  check(): Promise<ElectronUpdateInfo>;
  getPolicy(): Promise<ElectronUpdatePolicy>;
  download(updateInfo: ElectronUpdateInfo): Promise<{
    filePath: string;
    fileName: string;
    downloadedAt: string;
    sizeBytes: number;
  }>;
  openDownloaded(updateInfo: ElectronUpdateInfo): Promise<void>;
  deleteDownloaded(updateInfoOrFilePath: ElectronUpdateInfo | string): Promise<void>;
}

export interface ElectronExportApi {
  htmlToPdf(html: string, options?: {
    title?: string;
    pageSize?: 'A4' | 'Letter';
    landscape?: boolean;
  }): Promise<Uint8Array>;
}

export interface ElectronAIProviderHttpApi {
  startRequest(
    requestId: string,
    request: {
      url: string;
      method: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: string;
      bodyBase64?: string;
    }
  ): Promise<{
    status: number;
    statusText: string;
    headers: Array<[string, string]>;
  }>;
  cancelRequest(requestId: string): Promise<void>;
  onRequestChunk(requestId: string, callback: (chunk: number[]) => void): () => void;
  onRequestDone(requestId: string, callback: () => void): () => void;
  onRequestError(requestId: string, callback: (payload: { message: string }) => void): () => void;
}

export interface ElectronWebSearchApi {
  search(query: string, options?: {
    category?: string;
    timeRange?: string;
    limit?: number;
  }, requestId?: string): Promise<{
    query: string;
    results: Array<{
      title: string;
      url: string;
      snippet: string;
      publishedAt: string | null;
      source: string | null;
      thumbnail: string | null;
    }>;
  }>;
  read(url: string, options?: { contentLimit?: number; retries?: number }, requestId?: string): Promise<{
    title: string;
    summary: string;
    siteName: string;
    finalUrl: string;
    content: string;
    charCount: number;
  }>;
  readBatch(urls: string[], options?: { contentLimit?: number; retries?: number }, requestId?: string): Promise<Array<{
    url: string;
    ok: boolean;
    page?: {
      title: string;
      summary: string;
      siteName: string;
      finalUrl: string;
      content: string;
      charCount: number;
    };
    error?: string;
    code?: string;
  }>>;
  cancelRequest(requestId: string): Promise<boolean>;
}

export interface ElectronComputerCommandResult {
  status: 'completed' | 'failed' | 'denied' | 'cancelled' | 'timed_out';
  command: string;
  cwd: string;
  exitCode?: number | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
  truncated?: boolean;
  durationMs?: number;
  fileChanges?: Array<{
    path: string;
    kind: 'added' | 'modified' | 'deleted';
    additions: number;
    deletions: number;
    patch: string;
    truncated?: boolean;
  }>;
  fileChangesTruncated?: boolean;
}

export interface ElectronComputerCommandApproval {
  id: string;
  command: string;
  cwd: string;
  createdAt: number;
}

export interface ElectronComputerApi {
  startCommand(requestId: string, request: {
    command: string;
    cwd?: string;
    purpose?: string;
    timeoutSeconds?: number;
    locale?: string;
  }): Promise<ElectronComputerCommandResult>;
  cancelCommand(requestId: string): Promise<boolean>;
  respondToApproval(
    requestId: string,
    decision: 'run_once' | 'always' | 'cancel',
  ): Promise<boolean>;
  listApprovals(): Promise<ElectronComputerCommandApproval[]>;
  revokeApproval(approvalId: string): Promise<boolean>;
  clearApprovals(): Promise<boolean>;
  onCommandEvent(
    requestId: string,
    callback: (event: {
      type: 'approval_requested' | 'started' | 'output';
      stream?: 'stdout' | 'stderr';
      text?: string;
      command?: string;
      cwd?: string;
      purpose?: string;
      timeoutSeconds?: number;
      risk?: 'standard' | 'elevated';
      canAlwaysAllow?: boolean;
    }) => void,
  ): () => void;
}

export interface ElectronDragDropApi {
  getPathForFile(file: File): string;
  authorizePath(filePath: string): Promise<{
    name: string;
    path: string;
    isDirectory: boolean;
    isFile: boolean;
    size?: number;
    modifiedAt?: number;
  }>;
}

export interface ElectronFsApi {
  readBinaryFile(filePath: string, maxBytes?: number): Promise<Uint8Array>;
  readTextFile(filePath: string, maxBytes?: number): Promise<string>;
  writeBinaryFile(filePath: string, bytes: Uint8Array): Promise<void>;
  writeTextFile(
    filePath: string,
    content: string,
    options?: { recursive?: boolean; append?: boolean }
  ): Promise<void>;
  writeTextFileIfUnchanged(
    filePath: string,
    expectedContent: string | null,
    content: string
  ): Promise<boolean>;
  exists(filePath: string): Promise<boolean>;
  mkdir(filePath: string, recursive?: boolean): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
  deleteDir(filePath: string, recursive?: boolean): Promise<void>;
  listDir(filePath: string, maxEntries?: number): Promise<Array<{
    name: string;
    path: string;
    isDirectory: boolean;
    isFile: boolean;
  }>>;
  rename(oldPath: string, newPath: string): Promise<void>;
  copyFile(sourcePath: string, targetPath: string): Promise<void>;
  stat(filePath: string): Promise<{
    name: string;
    path: string;
    isDirectory: boolean;
    isFile: boolean;
    size?: number;
    createdAt?: number;
    modifiedAt?: number;
  } | null>;
  watch(
    filePath: string,
    callback: (payload: {
      type:
        | { remove: { kind: string } }
        | { create: { kind: string } }
        | { modify: { kind: string; mode?: string } };
      paths: string[];
    }) => void | Promise<void>,
    options?: { recursive?: boolean }
  ): Promise<() => Promise<void>>;
}

export interface ElectronPathApi {
  join(...segments: string[]): Promise<string>;
  appDataDir(): Promise<string>;
  homeDir(): Promise<string>;
  toFileUrl(filePath: string): Promise<string>;
}

export interface ElectronSecretsApi {
  getAIProviderSecrets(providerIds: string[]): Promise<Record<string, string>>;
  setAIProviderSecret(providerId: string, apiKey: string): Promise<void>;
  deleteAIProviderSecret(providerId: string): Promise<void>;
}

export interface ElectronAccountApi {
  getSessionStatus(): Promise<{
    connected: boolean;
    provider: string | null;
    username: string | null;
    primaryEmail: string | null;
    avatarUrl: string | null;
    membershipTier: string | null;
    membershipName: string | null;
    sessionInvalidated?: boolean;
    persistent?: boolean;
    budget?: {
      active?: unknown;
      usedPercent?: unknown;
      remainingPercent?: unknown;
      status?: unknown;
    } | null;
  }>;
  startAuth(provider: string): Promise<{
    success: boolean;
    provider: string | null;
    username: string | null;
    primaryEmail: string | null;
    avatarUrl: string | null;
    persistent?: boolean;
    error: string | null;
  }>;
  cancelAuth?(): Promise<boolean>;
  requestEmailCode(email: string, locale?: string): Promise<boolean>;
  verifyEmailCode(email: string, code: string): Promise<{
    success: boolean;
    provider: string | null;
    username: string | null;
    primaryEmail: string | null;
    avatarUrl: string | null;
    persistent?: boolean;
    error: string | null;
  }>;
  disconnect(): Promise<void>;
  createBillingCheckout(tier: string): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }>;
  submitFeedback(message: string): Promise<{
    success: boolean;
    error?: string;
  }>;
  getManagedModels(): Promise<Record<string, unknown>>;
  getManagedModelsVersion(): Promise<Record<string, unknown>>;
  getManagedBudget(): Promise<Record<string, unknown>>;
  reportManagedClientDiagnostic(body: Record<string, unknown>): Promise<Record<string, unknown>>;
  managedChatCompletion(body: object, requestId?: string): Promise<Record<string, unknown>>;
  cancelManagedChatCompletion(requestId: string): Promise<void>;
  managedImageGeneration(body: object, requestId?: string): Promise<Record<string, unknown>>;
  cancelManagedImageGeneration(requestId: string): Promise<void>;
  managedImageEdit(payload: { bodyBase64: string; headers: Record<string, string> }, requestId?: string): Promise<Record<string, unknown>>;
  cancelManagedImageEdit(requestId: string): Promise<void>;
  startManagedChatCompletionStream(requestId: string, body: Record<string, unknown>): Promise<void>;
  cancelManagedChatCompletionStream(requestId: string): Promise<void>;
  onManagedStreamChunk(
    requestId: string,
    callback: (payload: string | { delta: string }) => void
  ): () => void;
  onManagedStreamDone(
    requestId: string,
    callback: (payload: { content: string }) => void
  ): () => void;
  onManagedStreamError(
    requestId: string,
    callback: (payload: { message: string; statusCode?: number; errorCode?: string }) => void
  ): () => void;
}

export interface DesktopApi {
  platform: 'electron';
  getPlatform(): Promise<'electron'>;
  window: ElectronWindowApi;
  shortcuts: ElectronShortcutsApi;
  shell: ElectronShellApi;
  clipboard: ElectronClipboardApi;
  media?: ElectronMediaApi;
  app?: ElectronAppApi;
  git?: ElectronGitApi;
  update?: ElectronUpdateApi;
  export: ElectronExportApi;
  aiProvider: ElectronAIProviderHttpApi;
  computer?: ElectronComputerApi;
  webSearch?: ElectronWebSearchApi;
  dragDrop: ElectronDragDropApi;
  dialog: ElectronDialogApi;
  fs: ElectronFsApi;
  path: ElectronPathApi;
  secrets: ElectronSecretsApi;
  account: ElectronAccountApi;
}

export function getElectronBridge(): DesktopApi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.vlainaDesktop ?? null;
}

export function isElectronRuntime(): boolean {
  return getElectronBridge()?.platform === 'electron';
}
