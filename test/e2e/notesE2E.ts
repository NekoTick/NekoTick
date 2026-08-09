import { expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const EDITOR_SELECTOR = '.milkdown .ProseMirror[contenteditable="true"]';
export const SELECTED_BLOCK_SELECTOR = `${EDITOR_SELECTOR} .editor-block-selected`;
export const BLOCK_CONTROLS_SELECTOR = '.editor-block-controls.visible';
export const NOTE_SCROLL_ROOT_SELECTOR = '[data-note-scroll-root="true"]';
export const NOTE_SOURCE_FALLBACK_SELECTOR = '[data-note-source-fallback="true"]';
export const NOTE_COVER_REGION_SELECTOR = '[data-note-cover-region="true"]';
export const NOTE_COVER_CROPPER_SELECTOR = '[data-testid="cover-cropper"]';
export const NOTE_COVER_IMAGE_SELECTOR = `${NOTE_COVER_CROPPER_SELECTOR} > img`;
export const NOTES_VIEW_SELECTOR = '[data-notes-view-mode="true"]';
export const NOTES_SIDEBAR_SCROLL_ROOT_SELECTOR = '[data-notes-sidebar-scroll-root="true"]';
export const FILE_TREE_PRIMARY_SELECTOR = '[data-file-tree-primary="true"]';
export const FILE_TREE_FILE_SELECTOR = '[data-file-tree-kind="file"]';
export const CHAT_VIEW_SELECTOR = '[data-chat-view-mode="full"]';
export const GRAPH_VIEW_SELECTOR = '[data-graph-view-mode="true"]';
export const CHAT_SCROLLABLE_SELECTOR = '[data-chat-scrollable="true"]';
export const CHAT_SESSION_ROW_SELECTOR = '[data-chat-sidebar-session-row="true"]';
export const CHAT_MESSAGE_SELECTOR = '[data-message-item="true"]';
export const CHAT_COMPOSER_TEXTAREA_SELECTOR = '[data-chat-input="true"] textarea';
export const CHAT_MESSAGE_ACTION_SELECTOR = '[data-chat-message-action]';
export const CHAT_MESSAGE_EDITOR_SELECTOR = '[data-chat-message-editor="true"]';
export const CHAT_IMAGE_VIEWER_SURFACE_SELECTOR = '[data-chat-image-viewer-surface="true"]';
export const CHAT_IMAGE_VIEWER_CONTROL_SELECTOR = '[data-chat-image-viewer-control="true"]';
export const NOTE_IMAGE_BLOCK_SELECTOR = `${EDITOR_SELECTOR} .image-block-container`;
export const NOTE_IMAGE_TOOLBAR_SELECTOR = `${NOTE_IMAGE_BLOCK_SELECTOR} .image-toolbar`;
export const NOTE_IMAGE_CROPPER_TOOLBAR_SELECTOR = `${NOTE_IMAGE_BLOCK_SELECTOR} .image-cropper-toolbar`;
export const E2E_DEV_SERVER_PORT = Number.parseInt(process.env.VLAINA_E2E_PORT ?? '3100', 10);
export const E2E_DEV_SERVER_URL = `http://127.0.0.1:${Number.isFinite(E2E_DEV_SERVER_PORT) ? E2E_DEV_SERVER_PORT : 3100}`;

export type ImportedMarkdownThemeInstallResult = {
  themeDirectoryPath: string;
  themeId: string;
  themeName: string;
  skipped?: boolean;
  skipReason?: string;
};

export type NoteSelectableBlock = {
  text: string;
  rangeText: string;
  tagName: string;
  from: number;
  to: number;
};

export type ChatFixtureSession = {
  title: string;
  preloadMessages?: boolean;
  messages: Array<{
    id?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    modelId?: string;
    imageSources?: string[];
    versions?: Array<{
      content: string;
      kind?: 'original' | 'regeneration' | 'edit';
      createdAt?: number;
    }>;
    currentVersionIndex?: number;
  }>;
};

export async function waitForE2EBridge(page: Page) {
  await page.waitForFunction(() => Boolean((window as any).__vlainaE2E));
  await page.evaluate(() => (window as any).__vlainaE2E.waitForUnifiedLoaded());
}

export async function getOpenBridgePages(app: ElectronApplication, count: number): Promise<Page[]> {
  await expect.poll(() => app.windows().filter((page) => !page.isClosed()).length).toBeGreaterThanOrEqual(count);
  const pages = app.windows().filter((page) => !page.isClosed()).slice(0, count);
  await Promise.all(pages.map(waitForE2EBridge));
  return pages;
}

type LaunchIsolatedElectronOptions = {
  args?: string[];
  envOverrides?: Record<string, string>;
};

function isLaunchIsolatedElectronOptions(
  value: LaunchIsolatedElectronOptions | Record<string, string>,
): value is LaunchIsolatedElectronOptions {
  return Array.isArray((value as LaunchIsolatedElectronOptions).args) ||
    typeof (value as LaunchIsolatedElectronOptions).envOverrides === 'object';
}

export async function launchIsolatedElectron(
  label: string,
  optionsOrEnvOverrides: LaunchIsolatedElectronOptions | Record<string, string> = {},
): Promise<{
  app: ElectronApplication;
  userDataRoot: string;
  userDataDir: string;
}> {
  const options = isLaunchIsolatedElectronOptions(optionsOrEnvOverrides)
    ? optionsOrEnvOverrides
    : {};
  const envOverrides = isLaunchIsolatedElectronOptions(optionsOrEnvOverrides)
    ? optionsOrEnvOverrides.envOverrides ?? {}
    : optionsOrEnvOverrides;
  const safeLabel = label.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const userDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), `vlaina-${safeLabel}-e2e-`));
  const userDataDir = path.join(userDataRoot, 'user-data');

  const app = await electron.launch({
    args: ['.', ...(options.args ?? [])],
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: `${E2E_DEV_SERVER_URL}?e2e=1`,
      VLAINA_USER_DATA_DIR: userDataDir,
      APP_API_BASE_URL: 'http://127.0.0.1:9',
      APP_UPDATE_MANIFEST_URL: 'http://127.0.0.1:9/latest',
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      ALL_PROXY: '',
      http_proxy: '',
      https_proxy: '',
      all_proxy: '',
      ...envOverrides,
    },
  });

  return { app, userDataRoot, userDataDir };
}

export async function closeElectron(app: ElectronApplication): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  await Promise.race([
    app.close().finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }),
    new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        app.process()?.kill('SIGKILL');
        resolve();
      }, 5000);
    }),
  ]).catch(() => {
    app.process()?.kill('SIGKILL');
  });
}

export async function cleanupIsolatedElectron(app: ElectronApplication, userDataRoot: string): Promise<void> {
  await closeElectron(app);
  await fs.rm(userDataRoot, { recursive: true, force: true }).catch(() => {});
}

export async function openMarkdownFixture(
  page: Page,
  input: {
    filename: string;
    content: string;
  }
): Promise<{
  notePath: string;
  notesRootPath: string;
  storeOpenMs: number;
  openActionWallMs: number;
}> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await waitForE2EBridge(page);
      const fixtureInput = {
        ...input,
        filename: attempt === 0
          ? input.filename
          : input.filename.replace(/\.md$/i, `-${attempt}.md`),
      };
      const { notePath, notesRootPath } = await page.evaluate((fixture) =>
        (window as any).__vlainaE2E.createNotesFixture(fixture), fixtureInput);

      const openStartedAt = Date.now();
      const openTiming = await page.evaluate((pathToOpen) =>
        (window as any).__vlainaE2E.openAbsoluteNoteWithTiming(pathToOpen), notePath);
      const openActionWallMs = Date.now() - openStartedAt;

      await expect.poll(async () => page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror[contenteditable="true"]');
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks();
        const state = (window as any).__vlainaE2E.getNotesState();
        return {
          currentNotePath: state.currentNote?.path ?? null,
          editorNotePath: (window as any).__vlainaE2E.getCurrentEditorNotePath(),
          hasEditor: Boolean(editor),
          textLength: editor?.textContent?.trim().length ?? 0,
          selectableCount: blocks.length,
          hasSourceFallback: Boolean(document.querySelector('[data-note-source-fallback="true"]')),
        };
      }), { timeout: 30_000 }).toMatchObject({
        currentNotePath: notePath,
        editorNotePath: notePath,
        hasEditor: true,
        hasSourceFallback: false,
        selectableCount: expect.any(Number),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(NOTE_SOURCE_FALLBACK_SELECTOR)).toHaveCount(0);
      await waitForEditorAnimationFrame(page);
      if (input.content.trim().length > 0) {
        await waitForStableSelectableBlockCount(page, {
          timeoutMs: 10_000,
          minCount: 1,
        });
      }

      return {
        notePath,
        notesRootPath,
        storeOpenMs: Math.round(openTiming.totalMs),
        openActionWallMs,
      };
    } catch (error) {
      lastError = error;
      const state = await page.evaluate(() => ({
        hasEditor: Boolean(document.querySelector('.milkdown .ProseMirror[contenteditable="true"]')),
        hasSourceFallback: Boolean(document.querySelector('[data-note-source-fallback="true"]')),
      })).catch(() => ({ hasEditor: false, hasSourceFallback: false }));

      const message = error instanceof Error ? error.message : String(error);
      const canRetryDestroyedContext = message.includes('Execution context was destroyed');
      if (
        attempt === 2 ||
        (!canRetryDestroyedContext && (!state.hasSourceFallback || state.hasEditor))
      ) {
        throw error;
      }
    }
  }

  throw lastError;
}

export async function openAbsoluteNote(
  page: Page,
  notePath: string,
): Promise<{
  storeOpenMs: number;
  openActionWallMs: number;
  currentNoteContentLength: number;
  currentNotePath: string | null;
}> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const openStartedAt = Date.now();
      const openTiming = await page.evaluate((pathToOpen) =>
        (window as any).__vlainaE2E.openAbsoluteNoteWithTiming(pathToOpen), notePath);
      const openActionWallMs = Date.now() - openStartedAt;

      await expect.poll(async () => page.evaluate((expectedPath) => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror[contenteditable="true"]');
        const state = (window as any).__vlainaE2E.getNotesState();
        return {
          currentNotePath: state.currentNote?.path ?? null,
          editorNotePath: (window as any).__vlainaE2E.getCurrentEditorNotePath(),
          hasEditor: Boolean(editor),
          hasSourceFallback: Boolean(document.querySelector('[data-note-source-fallback="true"]')),
          selectableCount: (window as any).__vlainaE2E.getNoteSelectableBlocks().length,
          expectedPath,
        };
      }, notePath), { timeout: 30_000 }).toMatchObject({
        currentNotePath: notePath,
        editorNotePath: notePath,
        hasEditor: true,
        hasSourceFallback: false,
        selectableCount: expect.any(Number),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(NOTE_SOURCE_FALLBACK_SELECTOR)).toHaveCount(0);

      return {
        storeOpenMs: Math.round(openTiming.totalMs),
        openActionWallMs,
        currentNoteContentLength: openTiming.currentNoteContentLength,
        currentNotePath: openTiming.currentNotePath,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const canRetryDestroyedContext = message.includes('Execution context was destroyed');
      if (attempt === 2 || !canRetryDestroyedContext) {
        throw error;
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
      await waitForE2EBridge(page).catch(() => {});
    }
  }

  throw lastError;
}

export async function setAppViewMode(page: Page, mode: 'notes' | 'chat' | 'graph'): Promise<void> {
  await page.evaluate((nextMode) => (window as any).__vlainaE2E.setAppViewMode(nextMode), mode);
  if (mode === 'notes') {
    await expect(page.locator(NOTES_VIEW_SELECTOR)).toBeVisible({ timeout: 30_000 });
  } else if (mode === 'chat') {
    await expect(page.locator(CHAT_VIEW_SELECTOR)).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.locator(GRAPH_VIEW_SELECTOR)).toBeVisible({ timeout: 30_000 });
  }
}

export async function createNotesRootFilesFixture(
  page: Page,
  input: {
    name?: string;
    files: Array<{ filename: string; content: string }>;
  },
): Promise<{ notesRootPath: string; notePaths: string[] }> {
  return page.evaluate((fixture) => (window as any).__vlainaE2E.createNotesRootFilesFixture(fixture), input);
}

export async function openNotesRootInNotes(
  page: Page,
  input: {
    notesRootPath: string;
    name?: string;
    minFileCount?: number;
  },
): Promise<void> {
  await setAppViewMode(page, 'notes');
  await page.evaluate(
    ({ notesRootPath, name }) => (window as any).__vlainaE2E.openNotesRoot(notesRootPath, name),
    { notesRootPath: input.notesRootPath, name: input.name },
  );
  await expect.poll(async () => page.evaluate(() => {
    const notesRootState = (window as any).__vlainaE2E.getNotesRootState();
    return {
      currentNotesRootPath: notesRootState.currentNotesRoot?.path ?? null,
      fileCount: document.querySelectorAll('[data-file-tree-kind="file"]').length,
      hasFileTree: Boolean(document.querySelector('[data-file-tree-primary="true"]')),
    };
  }), { timeout: 30_000 }).toMatchObject({
    currentNotesRootPath: input.notesRootPath,
    fileCount: expect.any(Number),
  });
  await expect.poll(async () => page.locator(FILE_TREE_FILE_SELECTOR).count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(input.minFileCount ?? 1);
}

export async function createChatFixture(
  page: Page,
  input: {
    sessions: ChatFixtureSession[];
    activeSessionIndex?: number;
  },
): Promise<{ sessionIds: string[]; activeSessionId: string | null }> {
  return page.evaluate((fixture) => (window as any).__vlainaE2E.createChatFixture(fixture), input);
}

export async function createChatModelFixture(
  page: Page,
  input: {
    providerName?: string;
    apiHost?: string;
    apiModelId?: string;
    modelName?: string;
  } = {},
): Promise<{ providerId: string; modelId: string }> {
  const providerId = await page.evaluate((providerInput) =>
    (window as any).__vlainaE2E.addProvider({
      name: providerInput.providerName ?? 'E2E Local Provider',
      apiHost: providerInput.apiHost ?? 'http://127.0.0.1:9/v1',
      apiKey: 'e2e-key',
      enabled: true,
      endpointTypeCheckedAt: Date.now(),
    }), input);
  const modelId = await page.evaluate((modelInput) =>
    (window as any).__vlainaE2E.addModel({
      providerId: modelInput.providerId,
      apiModelId: modelInput.apiModelId ?? 'e2e-local-model',
      name: modelInput.modelName ?? 'E2E Local Model',
      enabled: true,
      selected: true,
    }), { ...input, providerId });
  return { providerId, modelId };
}

export async function getNoteContentCacheEntry(page: Page, notePath: string): Promise<{
  hasEntry: boolean;
  contentLength: number;
  contentPreview: string;
  freshUntil: number | null;
  modifiedAt: number | null;
  currentNotePath: string | null;
  openTabPaths: string[];
  cacheKeys: string[];
}> {
  return page.evaluate((pathToInspect) => (window as any).__vlainaE2E.getNoteContentCacheEntry(pathToInspect), notePath);
}

export async function pruneNoteContentsCacheToOpenNotes(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__vlainaE2E.pruneNoteContentsCacheToOpenNotes());
}

export async function installReferenceTyporaTheme(
  page: Page,
  cssFilename = 'phycat-sky.css',
): Promise<ImportedMarkdownThemeInstallResult> {
  const themeDirectoryPath = await page.evaluate(() =>
    (window as any).__vlainaE2E.getImportedMarkdownThemesDirectoryPath()
  );
  const referenceRoot = path.join(process.cwd(), '.reference', 'typora-theme-phycat');
  const referenceCssPath = path.join(referenceRoot, cssFilename);
  const hasReferenceCss = await fs.access(referenceCssPath).then(() => true, () => false);
  if (!hasReferenceCss) {
    return {
      themeDirectoryPath,
      themeId: 'default',
      themeName: 'default',
      skipped: true,
      skipReason: `Missing reference Typora theme ${referenceCssPath}`,
    };
  }

  await fs.mkdir(themeDirectoryPath, { recursive: true });
  await fs.copyFile(
    referenceCssPath,
    path.join(themeDirectoryPath, cssFilename),
  );
  await fs.cp(
    path.join(referenceRoot, 'phycat'),
    path.join(themeDirectoryPath, 'phycat'),
    { recursive: true },
  ).catch(() => undefined);

  const syncResult = await page.evaluate(() =>
    (window as any).__vlainaE2E.syncImportedMarkdownThemesFromDirectory()
  );
  const theme = syncResult.themes.find((candidate: { sourcePath?: string | null; name: string }) =>
    candidate.sourcePath?.replace(/\\/g, '/').endsWith(`/${cssFilename}`) ||
    candidate.name === cssFilename.replace(/\.css$/i, '')
  );

  if (!theme) {
    throw new Error([
      `Could not sync reference Typora theme ${cssFilename}`,
      `themeDirectoryPath=${themeDirectoryPath}`,
      `syncResult=${JSON.stringify(syncResult)}`,
    ].join('\n'));
  }

  await page.evaluate((themeId) =>
    (window as any).__vlainaE2E.setMarkdownImportedThemeId(themeId), theme.id);
  await expect.poll(() => page.evaluate((themeId) => ({
    rootTheme: document.documentElement.getAttribute('data-vlaina-imported-app-theme'),
    markdownStyle: Boolean(document.head.querySelector(
      `style[data-vlaina-imported-markdown-theme="true"]#vlaina-imported-markdown-theme-${CSS.escape(themeId)}`
    )),
    postBridgeStyle: Boolean(document.head.querySelector(
      `style[data-vlaina-imported-markdown-theme-post-bridge="true"]#vlaina-imported-markdown-theme-post-bridge-${CSS.escape(themeId)}`
    )),
  }), theme.id), { timeout: 30_000 }).toMatchObject({
    rootTheme: theme.id,
    markdownStyle: true,
    postBridgeStyle: true,
  });

  return {
    themeDirectoryPath,
    themeId: theme.id,
    themeName: theme.name,
  };
}

export async function getChatSessionMessageStatus(page: Page, sessionId: string): Promise<{
  currentSessionId: string | null;
  hasMessages: boolean;
  messageCount: number;
  firstContent: string;
  lastContent: string;
}> {
  return page.evaluate((targetSessionId) => {
    const state = (window as any).__vlainaE2E.getChatState();
    const messages = state.messages[targetSessionId] ?? [];
    return {
      currentSessionId: state.currentSessionId,
      hasMessages: Object.prototype.hasOwnProperty.call(state.messages, targetSessionId),
      messageCount: messages.length,
      firstContent: messages[0]?.content ?? '',
      lastContent: messages[messages.length - 1]?.content ?? '',
    };
  }, sessionId);
}

export async function waitForChatSession(
  page: Page,
  input: {
    sessionId: string;
    minMessageCount?: number;
    sentinelText?: string;
  },
): Promise<void> {
  await expect.poll(async () => page.evaluate(({ sessionId, sentinelText }) => {
    const state = (window as any).__vlainaE2E.getChatState();
    const messages = state.messages[sessionId] ?? [];
    const visibleText = document.querySelector('[data-chat-view-mode="full"]')?.textContent ?? '';
    return {
      currentSessionId: state.currentSessionId,
      messageCount: messages.length,
      hasSentinel: sentinelText ? visibleText.includes(sentinelText) : true,
      visibleMessageCount: document.querySelectorAll('[data-message-item="true"]').length,
    };
  }, input), { timeout: 30_000 }).toMatchObject({
    currentSessionId: input.sessionId,
    messageCount: expect.any(Number),
    hasSentinel: true,
  });
  if (typeof input.minMessageCount === 'number') {
    await expect.poll(async () => page.evaluate((sessionId) => {
      const state = (window as any).__vlainaE2E.getChatState();
      return state.messages[sessionId]?.length ?? 0;
    }, input.sessionId), { timeout: 30_000 }).toBeGreaterThanOrEqual(input.minMessageCount);
  }
}

export async function measureChatScrollFrames(page: Page, frames = 45) {
  return page.evaluate(async (frameCount) => {
    const scrollRoot = document.querySelector<HTMLElement>('[data-chat-scrollable="true"]');
    if (!scrollRoot || scrollRoot.scrollHeight <= scrollRoot.clientHeight) {
      return null;
    }

    const frameDeltas: number[] = [];
    scrollRoot.scrollTop = 0;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const startedAt = performance.now();
    let lastFrameAt = startedAt;
    const maxScrollTop = scrollRoot.scrollHeight - scrollRoot.clientHeight;
    for (let index = 1; index <= frameCount; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now();
      frameDeltas.push(now - lastFrameAt);
      scrollRoot.scrollTop = Math.round((maxScrollTop * index) / frameCount);
      lastFrameAt = now;
    }

    const totalMs = performance.now() - startedAt;
    const sortedDeltas = [...frameDeltas].sort((a, b) => a - b);
    const pick = (ratio: number) =>
      sortedDeltas[Math.min(sortedDeltas.length - 1, Math.max(0, Math.ceil(sortedDeltas.length * ratio) - 1))] ?? 0;
    const avg = frameDeltas.reduce((sum, value) => sum + value, 0) / Math.max(1, frameDeltas.length);
    return {
      frames: frameCount,
      totalMs: Math.round(totalMs),
      avgFrameMs: Math.round(avg * 10) / 10,
      p95FrameMs: Math.round(pick(0.95) * 10) / 10,
      maxFrameMs: Math.round(Math.max(...frameDeltas) * 10) / 10,
      finalScrollTop: scrollRoot.scrollTop,
      maxScrollTop,
      visibleMessageCount: document.querySelectorAll('[data-message-item="true"]').length,
    };
  }, frames);
}

export async function collectLayoutSmokeMetrics(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const documentElement = document.documentElement;
    const body = document.body;
    const selectors = [
      '[data-notes-view-mode="true"]',
      '[data-chat-view-mode="full"]',
      '[data-notes-sidebar-scroll-root="true"]',
      '[data-chat-scrollable="true"]',
      '.milkdown .ProseMirror[contenteditable="true"]',
      '[data-chat-input="true"]',
    ];
    const surfaces = selectors.flatMap((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return [{
        selector,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        visible: style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0,
      }];
    });
    const visibleTextOverflow = Array.from(document.querySelectorAll<HTMLElement>('button, [data-file-tree-kind="file"], [data-chat-sidebar-session-row="true"]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0 &&
          (element.scrollWidth - element.clientWidth > 2 || element.scrollHeight - element.clientHeight > 4);
      })
      .slice(0, 10)
      .map((element) => ({
        tagName: element.tagName,
        text: element.textContent?.trim().slice(0, 80) ?? '',
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }));

    return {
      viewportWidth,
      viewportHeight,
      documentScrollWidth: documentElement.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      hasHorizontalDocumentOverflow:
        documentElement.scrollWidth > viewportWidth + 2 ||
        body.scrollWidth > viewportWidth + 2,
      surfaces,
      visibleTextOverflow,
    };
  });
}

export async function getBlankAreaDragTarget(page: Page, text: string) {
  return page.evaluate(async (targetText) => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror[contenteditable="true"]');
    const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
    if (!editor || !scrollRoot) {
      return null;
    }

    const block = Array.from(editor.querySelectorAll<HTMLElement>('p,li,blockquote,pre,table,h1,h2,h3,h4,h5,h6'))
      .find((element) => element.textContent?.includes(targetText));
    if (!block) {
      return null;
    }

    block.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const rect = block.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const scrollRootRect = scrollRoot.getBoundingClientRect();
    const contentRoot = editor.closest('[data-note-content-root="true"]');
    const visibleTop = Math.max(rect.top, scrollRootRect.top + 24);
    const visibleBottom = Math.min(rect.bottom, scrollRootRect.bottom - 24);
    const startY = visibleTop + Math.max(12, (visibleBottom - visibleTop) * 0.35);
    const startCandidates = [
      editorRect.right + 72,
      editorRect.right + 48,
      editorRect.right + 24,
      editorRect.right + 8,
      scrollRootRect.right - 24,
    ]
      .map((x) => Math.min(scrollRootRect.right - 24, Math.max(scrollRootRect.left + 24, x)))
      .filter((x, index, values) => values.findIndex((value) => Math.abs(value - x) < 0.5) === index);
    const startX = startCandidates.find((x) => {
      const candidateHit = document.elementFromPoint(x, startY);
      return candidateHit instanceof Node &&
        !editor.contains(candidateHit) &&
        (candidateHit === scrollRoot || Boolean(contentRoot?.contains(candidateHit)));
    }) ?? startCandidates[0] ?? Math.min(scrollRootRect.right - 24, editorRect.right + 72);
    const blockBodyX = rect.left + Math.min(
      Math.max(96, rect.width * 0.45),
      Math.max(24, rect.width - 24),
    );
    const hit = document.elementFromPoint(startX, startY);
    return {
      startX,
      startY,
      endX: Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, blockBodyX)),
      endY: Math.min(scrollRootRect.bottom - 24, startY + 180),
      hitInsideEditor: hit instanceof Node && editor.contains(hit),
      hitTagName: hit instanceof HTMLElement ? hit.tagName : null,
      blockTagName: block.tagName,
      blockText: block.textContent?.trim().slice(0, 120) ?? '',
    };
  }, text);
}

export async function getSelectableBlocks(page: Page): Promise<NoteSelectableBlock[]> {
  return page.evaluate(() => (window as any).__vlainaE2E.getNoteSelectableBlocks());
}

export async function waitForStableSelectableBlockCount(
  page: Page,
  options: {
    timeoutMs?: number;
    stableFrames?: number;
    stableMs?: number;
    minCount?: number;
  } = {},
): Promise<number> {
  const result = await page.evaluate(async ({ timeoutMs, stableFrames, stableMs, minCount }) => {
    const bridge = (window as any).__vlainaE2E;
    if (!bridge?.getNoteSelectableBlocks) {
      return {
        ok: false,
        reason: 'e2e-bridge-missing',
        count: 0,
        samples: [] as Array<{ atMs: number; count: number }>,
      };
    }

    const startedAt = performance.now();
    let lastCount = bridge.getNoteSelectableBlocks().length;
    let stableStartedAt = startedAt;
    let consecutiveStableFrames = 0;
    const samples: Array<{ atMs: number; count: number }> = [{
      atMs: 0,
      count: lastCount,
    }];

    while (performance.now() - startedAt < timeoutMs) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now();
      const count = bridge.getNoteSelectableBlocks().length;
      samples.push({
        atMs: Math.round(now - startedAt),
        count,
      });

      if (count === lastCount) {
        consecutiveStableFrames += 1;
      } else {
        lastCount = count;
        stableStartedAt = now;
        consecutiveStableFrames = 0;
      }

      if (
        count >= minCount &&
        consecutiveStableFrames >= stableFrames &&
        now - stableStartedAt >= stableMs
      ) {
        return {
          ok: true,
          reason: null,
          count,
          samples: samples.slice(-12),
        };
      }
    }

    return {
      ok: false,
      reason: lastCount < minCount ? 'below-min-count' : 'timeout',
      count: lastCount,
      samples: samples.slice(-20),
    };
  }, {
    timeoutMs: options.timeoutMs ?? 5_000,
    stableFrames: options.stableFrames ?? 8,
    stableMs: options.stableMs ?? 250,
    minCount: options.minCount ?? 0,
  });

  expect(result.ok, `Selectable block count did not stabilize: ${JSON.stringify(result)}`).toBe(true);
  return result.count;
}

export async function clearSelectedNoteBlocks(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__vlainaE2E.selectNoteBlocksByText([]));
}

export async function selectNoteBlocksByText(page: Page, texts: string[]): Promise<number> {
  return page.evaluate((expectedTexts) => (window as any).__vlainaE2E.selectNoteBlocksByText(expectedTexts), texts);
}

export async function selectNoteBlocksByIndexes(page: Page, indexes: number[]): Promise<number> {
  return page.evaluate((targetIndexes) => (window as any).__vlainaE2E.selectNoteBlocksByIndexes(targetIndexes), indexes);
}

export async function scrollNoteToTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror[contenteditable="true"]');
    const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
    if (scrollRoot) {
      scrollRoot.scrollTop = 0;
    }
  });
}

export async function scrollElementIntoViewByText(page: Page, selector: string, text: string): Promise<void> {
  await page.evaluate(({ selector: targetSelector, text: expectedText }) => {
    const element = Array.from(document.querySelectorAll<HTMLElement>(targetSelector))
      .find((candidate) => candidate.textContent?.includes(expectedText));
    element?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, { selector, text });
}

export async function collectEditorDomMetrics(page: Page) {
  return page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror[contenteditable="true"]');
    const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
    const editorModelTextLength = (window as any).__vlainaE2E.getEditorSelectionSummary()?.docTextLength ?? 0;
    const blockElements = Array.from(editor?.querySelectorAll<HTMLElement>(
      'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,table,div[data-type="callout"],div[data-type="toc"],.frontmatter-block-container,div[data-type="math-block"],div[data-type="mermaid"],div[data-type="video"],div.image-block-container,[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]'
    ) ?? []);
    const countsBySelector = {
      headings: editor?.querySelectorAll('h1,h2,h3,h4,h5,h6').length ?? 0,
      paragraphs: editor?.querySelectorAll('p').length ?? 0,
      markdownBlankLines: editor?.querySelectorAll('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]').length ?? 0,
      blockquotes: editor?.querySelectorAll('blockquote').length ?? 0,
      callouts: editor?.querySelectorAll('div[data-type="callout"]').length ?? 0,
      bulletItems: editor?.querySelectorAll('ul > li').length ?? 0,
      orderedItems: editor?.querySelectorAll('ol > li').length ?? 0,
      taskItems: editor?.querySelectorAll('li[data-item-type="task"]').length ?? 0,
      tables: editor?.querySelectorAll('table').length ?? 0,
      codeBlocks: editor?.querySelectorAll('.code-block-container, pre[data-language], pre.code-block-wrapper').length ?? 0,
      frontmatter: editor?.querySelectorAll('.frontmatter-block-container, div[data-type="frontmatter"]').length ?? 0,
      mathBlocks: editor?.querySelectorAll('div[data-type="math-block"]').length ?? 0,
      mathInline: editor?.querySelectorAll('span[data-type="math-inline"]').length ?? 0,
      mermaid: editor?.querySelectorAll('div[data-type="mermaid"]').length ?? 0,
      video: editor?.querySelectorAll('div[data-type="video"]').length ?? 0,
      toc: editor?.querySelectorAll('div[data-type="toc"]').length ?? 0,
      footnoteRefs: editor?.querySelectorAll('sup.footnote-ref').length ?? 0,
      footnoteDefs: editor?.querySelectorAll('div.footnote-def').length ?? 0,
      images: editor?.querySelectorAll('.image-block-container, img.md-image, img.image-embed').length ?? 0,
      highlights: editor?.querySelectorAll('mark.highlight, mark').length ?? 0,
      superscript: editor?.querySelectorAll('sup.superscript, sup').length ?? 0,
      subscript: editor?.querySelectorAll('sub.subscript, sub').length ?? 0,
      abbr: editor?.querySelectorAll('abbr.abbr, abbr').length ?? 0,
      tags: editor?.querySelectorAll('[data-editor-tag-token="true"]').length ?? 0,
      autolinks: editor?.querySelectorAll('a.autolink').length ?? 0,
      explicitLinks: editor?.querySelectorAll('a[href]').length ?? 0,
      definitionTerms: editor?.querySelectorAll('.editor-dl-term, dt.definition-term').length ?? 0,
      definitionDescs: editor?.querySelectorAll('.editor-dl-desc, dd.definition-desc').length ?? 0,
      horizontalRules: editor?.querySelectorAll('[data-type="hr"], hr').length ?? 0,
      sourceFallback: document.querySelectorAll('[data-note-source-fallback="true"]').length,
    };

    return {
      editorTextLength: Math.max(editor?.textContent?.length ?? 0, editorModelTextLength),
      editorChildCount: editor?.children.length ?? 0,
      renderedBlockCount: blockElements.length,
      virtualizedPlaceholderCount: editor?.querySelectorAll('.editor-virtual-block-placeholder').length ?? 0,
      selectableBlockCount: (window as any).__vlainaE2E.getNoteSelectableBlocks().length,
      scrollHeight: scrollRoot?.scrollHeight ?? 0,
      clientHeight: scrollRoot?.clientHeight ?? 0,
      countsBySelector,
    };
  });
}

export async function collectEditorVisibilityProblems(page: Page, limit = 50) {
  return page.evaluate(({ editorSelector, maxProblems }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) {
      return [{ selector: editorSelector, text: '', reason: 'editor-missing' }];
    }

    const textSelectors = [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'li', 'blockquote', 'td', 'th', 'pre', 'code',
      'strong', 'em', 's', 'del', 'mark', 'u', 'sup', 'sub',
      'a', 'abbr', 'span[data-type]', '[data-editor-tag-token="true"]',
      '.frontmatter-block-container',
      'div[data-type="callout"]',
      'div[data-type="toc"]',
      'div[data-type="math-block"]',
      'div[data-type="mermaid"]',
      'div[data-type="video"]',
      'div.footnote-def',
    ].join(',');

    const isTransparentColor = (value: string) =>
      value === 'transparent' ||
      /^rgba?\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(value.trim());

    const isInternalInvisiblePlaceholder = (element: HTMLElement, rawText: string) => {
      const compactText = rawText.replace(/[\s\u200B\u200C\uFEFF]/g, '');
      return compactText === '\u2800' && Boolean(element.closest('li.editor-list-gap-placeholder-item'));
    };

    const blockDisplayValues = new Set(['block', 'flow-root', 'flex', 'grid', 'list-item', 'table', 'table-row', 'table-cell']);
    const isInternalBlankLine = (element: HTMLElement) =>
      element.matches('p.editor-editable-markdown-blank-line') ||
      element.matches('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]') ||
      (element.tagName === 'P' && (element.textContent ?? '').trim() === '⠀');

    return Array.from(editor.querySelectorAll<HTMLElement>(textSelectors))
      .flatMap((element) => {
        if (element.closest('div[data-type="toc"]')) return [];
        const rawText = element.textContent ?? '';
        if (isInternalInvisiblePlaceholder(element, rawText)) return [];
        if (isInternalBlankLine(element)) return [];
        const text = rawText.replace(/\s+/g, ' ').trim();
        if (!text) return [];
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const hasVisibleTextRect = Array.from(element.getClientRects())
          .some((clientRect) => clientRect.width >= 1 && clientRect.height >= 1);
        const reasons: string[] = [];

        if (style.display === 'none') reasons.push('display-none');
        if (style.visibility === 'hidden' || style.visibility === 'collapse') reasons.push('visibility-hidden');
        if (Number.parseFloat(style.opacity || '1') <= 0.01) reasons.push('opacity-zero');
        if (isTransparentColor(style.color)) reasons.push('transparent-text');
        if (blockDisplayValues.has(style.display) && !hasVisibleTextRect && (rect.width < 1 || rect.height < 1)) {
          reasons.push('zero-geometry');
        }

        return reasons.length > 0
          ? [{
              selector: element.tagName.toLowerCase(),
              text: text.slice(0, 120),
              reason: reasons.join(','),
            }]
          : [];
      })
      .slice(0, maxProblems);
  }, { editorSelector: EDITOR_SELECTOR, maxProblems: limit });
}

function isNavigationContextError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Execution context was destroyed') ||
    message.includes('Cannot find context with specified id') ||
    message.includes('Most likely because of a navigation');
}

export async function waitForEditorAnimationFrame(page: Page): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      return;
    } catch (error) {
      lastError = error;
      if (page.isClosed() || !isNavigationContextError(error) || attempt === 2) {
        throw error;
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
      await waitForE2EBridge(page).catch(() => undefined);
    }
  }
  throw lastError;
}

export type MainThreadFrameProbeResult = {
  frameCount: number;
  longFramesOver50: number;
  longFramesOver100: number;
  longTaskCount: number;
  maxFrameMs: number;
  maxLongTaskMs: number;
  p95FrameMs: number;
};

export async function startMainThreadFrameProbe(page: Page, key = '__vlainaMainThreadFrameProbe'): Promise<void> {
  await page.evaluate((probeKey) => {
    const win = window as any;
    const previousProbe = win[probeKey];
    if (previousProbe?.frameId) {
      cancelAnimationFrame(previousProbe.frameId);
    }
    previousProbe?.observer?.disconnect?.();

    const probe = {
      frameDeltas: [] as number[],
      frameId: 0,
      lastFrameAt: performance.now(),
      longTasks: [] as number[],
      observer: null as PerformanceObserver | null,
      stopped: false,
    };

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            probe.longTasks.push(entry.duration);
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
        probe.observer = observer;
      } catch {
      }
    }

    const tick = (now: number) => {
      probe.frameDeltas.push(now - probe.lastFrameAt);
      probe.lastFrameAt = now;
      if (!probe.stopped) {
        probe.frameId = requestAnimationFrame(tick);
      }
    };

    probe.frameId = requestAnimationFrame(tick);
    win[probeKey] = probe;
  }, key);
}

export async function stopMainThreadFrameProbe(page: Page, key = '__vlainaMainThreadFrameProbe'): Promise<MainThreadFrameProbeResult> {
  return page.evaluate((probeKey) => {
    const win = window as any;
    const probe = win[probeKey];
    if (!probe) {
      return {
        frameCount: 0,
        longFramesOver50: 0,
        longFramesOver100: 0,
        longTaskCount: 0,
        maxFrameMs: 0,
        maxLongTaskMs: 0,
        p95FrameMs: 0,
      };
    }

    probe.stopped = true;
    if (probe.frameId) {
      cancelAnimationFrame(probe.frameId);
    }
    probe.observer?.disconnect?.();
    delete win[probeKey];

    const frameDeltas = Array.isArray(probe.frameDeltas) ? probe.frameDeltas as number[] : [];
    const longTasks = Array.isArray(probe.longTasks) ? probe.longTasks as number[] : [];
    const sortedFrames = [...frameDeltas].sort((a, b) => a - b);
    const pick = (ratio: number) =>
      sortedFrames[Math.min(sortedFrames.length - 1, Math.max(0, Math.ceil(sortedFrames.length * ratio) - 1))] ?? 0;

    return {
      frameCount: frameDeltas.length,
      longFramesOver50: frameDeltas.filter((value) => value > 50).length,
      longFramesOver100: frameDeltas.filter((value) => value > 100).length,
      longTaskCount: longTasks.length,
      maxFrameMs: Math.round((Math.max(0, ...frameDeltas)) * 10) / 10,
      maxLongTaskMs: Math.round((Math.max(0, ...longTasks)) * 10) / 10,
      p95FrameMs: Math.round(pick(0.95) * 10) / 10,
    };
  }, key);
}

export async function measureScrollFrames(page: Page, frames = 45) {
  return page.evaluate(async (frameCount) => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror[contenteditable="true"]');
    const scrollRoot = editor?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
    if (!scrollRoot || scrollRoot.scrollHeight <= scrollRoot.clientHeight) {
      return null;
    }

    const frameDeltas: number[] = [];
    scrollRoot.scrollTop = 0;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const startedAt = performance.now();
    let lastFrameAt = startedAt;
    const maxScrollTop = scrollRoot.scrollHeight - scrollRoot.clientHeight;
    for (let index = 1; index <= frameCount; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now();
      frameDeltas.push(now - lastFrameAt);
      scrollRoot.scrollTop = Math.round((maxScrollTop * index) / frameCount);
      lastFrameAt = now;
    }
    const totalMs = performance.now() - startedAt;
    const sortedDeltas = [...frameDeltas].sort((a, b) => a - b);
    const pick = (ratio: number) =>
      sortedDeltas[Math.min(sortedDeltas.length - 1, Math.max(0, Math.ceil(sortedDeltas.length * ratio) - 1))] ?? 0;
    const avg = frameDeltas.reduce((sum, value) => sum + value, 0) / Math.max(1, frameDeltas.length);

    return {
      frames: frameCount,
      totalMs: Math.round(totalMs),
      avgFrameMs: Math.round(avg * 10) / 10,
      p95FrameMs: Math.round(pick(0.95) * 10) / 10,
      maxFrameMs: Math.round(Math.max(...frameDeltas) * 10) / 10,
      finalScrollTop: scrollRoot.scrollTop,
      maxScrollTop,
    };
  }, frames);
}

export async function measureRepeatedBlockScan(page: Page, iterations = 20) {
  return page.evaluate((scanIterations) => {
    const samples: number[] = [];
    let blockCount = 0;
    for (let index = 0; index < scanIterations; index += 1) {
      const startedAt = performance.now();
      const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks();
      samples.push(performance.now() - startedAt);
      blockCount = blocks.length;
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const pick = (ratio: number) =>
      sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
    const avg = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length);
    return {
      iterations: scanIterations,
      blockCount,
      minMs: Math.round((sorted[0] ?? 0) * 10) / 10,
      avgMs: Math.round(avg * 10) / 10,
      p50Ms: Math.round(pick(0.5) * 10) / 10,
      p95Ms: Math.round(pick(0.95) * 10) / 10,
      maxMs: Math.round((sorted[sorted.length - 1] ?? 0) * 10) / 10,
    };
  }, iterations);
}
