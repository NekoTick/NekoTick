import { expect, test, type Page } from '@playwright/test';
import {
  CHAT_SCROLLABLE_SELECTOR,
  CHAT_SESSION_ROW_SELECTOR,
  CHAT_VIEW_SELECTOR,
  EDITOR_SELECTOR,
  FILE_TREE_FILE_SELECTOR,
  NOTE_COVER_CROPPER_SELECTOR,
  NOTES_SIDEBAR_SCROLL_ROOT_SELECTOR,
  cleanupIsolatedElectron,
  collectEditorDomMetrics,
  createChatFixture,
  createNotesRootFilesFixture,
  getChatSessionMessageStatus,
  getNoteContentCacheEntry,
  getOpenBridgePages,
  launchIsolatedElectron,
  measureChatScrollFrames,
  measureScrollFrames,
  openNotesRootInNotes,
  pruneNoteContentsCacheToOpenNotes,
  setAppViewMode,
  waitForChatSession,
} from './notesE2E';

function createPrefetchMarkdown(label: string): string {
  return [
    `# ${label} Prefetch Note`,
    '',
    `${label.toUpperCase()}_PREFETCH_SENTINEL first paragraph for hover prefetch.`,
    '',
    `${label} second paragraph keeps the note large enough to exercise a real markdown load.`,
    '',
    '- Prefetch bullet alpha',
    '- Prefetch bullet beta',
    '',
    `Final ${label} prefetch sentinel.`,
    '',
  ].join('\n');
}

function createLargePrefetchMarkdown(label: string, sectionCount = 260): string {
  const lines = [
    `# ${label} Large Prefetch Note`,
    '',
    `${label.toUpperCase()}_LARGE_PREFETCH_SENTINEL_START`,
    '',
  ];

  for (let index = 0; index < sectionCount; index += 1) {
    lines.push(
      `## ${label} Section ${index}`,
      '',
      [
        `${label} large prefetch paragraph ${index} keeps enough prose to exercise markdown parsing and layout.`,
        `It includes **bold ${index}**, _italic ${index}_, ==highlight ${index}==, \`code-${index}\`,`,
        `[link ${index}](https://example.com/prefetch/${index}), and #prefetch-${index}.`,
      ].join(' '),
      '',
      `> ${label} quote ${index} keeps blockquote rendering in the long note path.`,
      '',
      `- ${label} bullet ${index} alpha`,
      `- ${label} bullet ${index} beta`,
      `1. ${label} ordered ${index} alpha`,
      `2. ${label} ordered ${index} beta`,
      '',
    );

    if (index % 20 === 0) {
      lines.push(
        '| Column A | Column B |',
        '| --- | --- |',
        `| ${label} table ${index} alpha | ${label} table ${index} beta |`,
        '',
      );
    }
  }

  lines.push(`${label.toUpperCase()}_LARGE_PREFETCH_SENTINEL_END`, '');
  return lines.join('\n');
}

function createLargeChatMessages(label: string, messagePairs = 70) {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (let index = 0; index < messagePairs; index += 1) {
    messages.push({
      role: 'user',
      content: [
        `${label} user message ${index}`,
        `Please review the long-content prefetch scenario ${index}.`,
        `The prompt includes #chat-prefetch-${index} and https://example.com/chat/${index}.`,
      ].join('\n\n'),
    });
    messages.push({
      role: 'assistant',
      content: [
        `${label} assistant response ${index}`,
        '',
        `This long response checks **markdown ${index}**, \`inline-code-${index}\`, and list rendering.`,
        '',
        `- ${label} response bullet ${index} alpha`,
        `- ${label} response bullet ${index} beta`,
        '',
        index === messagePairs - 1
          ? `${label.toUpperCase()}_CHAT_LARGE_PREFETCH_SENTINEL_END`
          : `${label} intermediate response ${index}`,
      ].join('\n'),
    });
  }
  return messages;
}

async function measureScrollableFrames(
  page: Page,
  selector: string,
  frames = 45,
) {
  return page.evaluate(async ({ selector: scrollSelector, frames: frameCount }) => {
    const scrollRoot = document.querySelector<HTMLElement>(scrollSelector);
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

    const sorted = [...frameDeltas].sort((a, b) => a - b);
    const pick = (ratio: number) =>
      sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
    const avg = frameDeltas.reduce((sum, value) => sum + value, 0) / Math.max(1, frameDeltas.length);
    return {
      frames: frameCount,
      totalMs: Math.round(performance.now() - startedAt),
      avgFrameMs: Math.round(avg * 10) / 10,
      p95FrameMs: Math.round(pick(0.95) * 10) / 10,
      maxFrameMs: Math.round(Math.max(...frameDeltas) * 10) / 10,
      longFramesOver100: frameDeltas.filter((value) => value > 100).length,
      longFramesOver300: frameDeltas.filter((value) => value > 300).length,
      finalScrollTop: scrollRoot.scrollTop,
      maxScrollTop,
    };
  }, { selector, frames });
}

async function measureChatSidebarFrames(page: Page, frames = 45) {
  return page.evaluate(async (frameCount) => {
    const resolveScrollRoot = () => {
      const firstRow = document.querySelector<HTMLElement>('[data-chat-sidebar-session-row="true"]');
      for (
        let candidate = firstRow?.parentElement ?? null;
        candidate;
        candidate = candidate.parentElement
      ) {
        if (candidate.scrollHeight > candidate.clientHeight + 1) {
          return candidate;
        }
      }

      return Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-scroll-root="true"]'))
        .find((candidate) =>
          candidate.scrollHeight > candidate.clientHeight + 1 &&
          candidate.querySelector('[data-chat-sidebar-session-row="true"]')
        ) ?? null;
    };
    const scrollRoot = resolveScrollRoot();
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

    const sorted = [...frameDeltas].sort((a, b) => a - b);
    const pick = (ratio: number) =>
      sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
    const avg = frameDeltas.reduce((sum, value) => sum + value, 0) / Math.max(1, frameDeltas.length);
    return {
      frames: frameCount,
      totalMs: Math.round(performance.now() - startedAt),
      avgFrameMs: Math.round(avg * 10) / 10,
      p95FrameMs: Math.round(pick(0.95) * 10) / 10,
      maxFrameMs: Math.round(Math.max(...frameDeltas) * 10) / 10,
      longFramesOver100: frameDeltas.filter((value) => value > 100).length,
      longFramesOver300: frameDeltas.filter((value) => value > 300).length,
      finalScrollTop: scrollRoot.scrollTop,
      maxScrollTop,
      visibleRows: document.querySelectorAll('[data-chat-sidebar-session-row="true"]').length,
    };
  }, frames);
}

async function collectChatSidebarDiagnostics(page: Page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-chat-sidebar-session-row="true"]'));
    const scrollRoots = Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-scroll-root="true"]'))
      .map((element) => ({
        text: element.textContent?.trim().slice(0, 120) ?? '',
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        rowCount: element.querySelectorAll('[data-chat-sidebar-session-row="true"]').length,
      }));
    const firstRowAncestors = [];
    for (
      let candidate = rows[0]?.parentElement ?? null;
      candidate;
      candidate = candidate.parentElement
    ) {
      firstRowAncestors.push({
        tagName: candidate.tagName,
        dataSidebarScrollRoot: candidate.getAttribute('data-sidebar-scroll-root'),
        className: candidate.className,
        clientHeight: candidate.clientHeight,
        scrollHeight: candidate.scrollHeight,
      });
      if (firstRowAncestors.length >= 8) {
        break;
      }
    }
    const state = (window as any).__vlainaE2E.getChatState();
    return {
      stateSessionCount: state.sessions.length,
      rowCount: rows.length,
      firstRows: rows.map((row) => row.textContent?.trim().slice(0, 80) ?? '').slice(0, 8),
      scrollRoots,
      firstRowAncestors,
    };
  });
}

async function revealChatSidebarRow(page: Page, text: string) {
  const row = page.locator(CHAT_SESSION_ROW_SELECTOR, { hasText: text }).first();
  const scrollFractions = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];

  for (const fraction of scrollFractions) {
    await page.evaluate((nextFraction) => {
      const firstRow = document.querySelector<HTMLElement>('[data-chat-sidebar-session-row="true"]');
      let scrollRoot: HTMLElement | null = null;
      for (
        let candidate = firstRow?.parentElement ?? null;
        candidate;
        candidate = candidate.parentElement
      ) {
        if (candidate.scrollHeight > candidate.clientHeight + 1) {
          scrollRoot = candidate;
          break;
        }
      }
      scrollRoot ??= Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-scroll-root="true"]'))
        .find((candidate) =>
          candidate.scrollHeight > candidate.clientHeight + 1 &&
          candidate.querySelector('[data-chat-sidebar-session-row="true"]')
        ) ?? null;
      if (!scrollRoot) {
        return;
      }
      scrollRoot.scrollTop = Math.round((scrollRoot.scrollHeight - scrollRoot.clientHeight) * nextFraction);
    }, fraction);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (await row.isVisible()) {
      return row;
    }
  }

  await expect(row).toBeVisible({ timeout: 5_000 });
  return row;
}

test.describe('sidebar hover prefetch', () => {
  test.setTimeout(120_000);

  test('prefetches Notes file content on hover without switching the active note', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-hover-prefetch');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'notes-hover-prefetch',
        files: [
          { filename: 'active-prefetch.md', content: createPrefetchMarkdown('active') },
          {
            filename: 'target-prefetch.md',
            content: [
              '---',
              'vlaina_cover: "assets/hover-prefetch-cover.svg" x=50 y=50 height=220 scale=1',
              '---',
              '',
              createPrefetchMarkdown('target'),
            ].join('\n'),
          },
          {
            filename: 'assets/hover-prefetch-cover.svg',
            content: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#167c80"/></svg>',
          },
        ],
      });
      const activePath = 'active-prefetch.md';
      const targetPath = 'target-prefetch.md';

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Notes Hover Prefetch NotesRoot',
        minFileCount: 2,
      });

      await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'active-prefetch' }).first().click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('ACTIVE_PREFETCH_SENTINEL', {
        timeout: 30_000,
      });

      await pruneNoteContentsCacheToOpenNotes(page);
      expect(await getNoteContentCacheEntry(page, targetPath)).toMatchObject({
        hasEntry: false,
        currentNotePath: activePath,
      });

      const targetRow = page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'target-prefetch' }).first();
      await expect(targetRow).toBeVisible();
      const targetRowPoint = await targetRow.evaluate((element) => {
        const row = element.firstElementChild instanceof HTMLElement
          ? element.firstElementChild
          : element;
        const rect = row.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      });
      await page.mouse.move(targetRowPoint.x, targetRowPoint.y);
      await page.waitForTimeout(400);

      await expect.poll(() => getNoteContentCacheEntry(page, targetPath), { timeout: 10_000 }).toMatchObject({
        hasEntry: true,
        currentNotePath: activePath,
        contentPreview: expect.stringContaining('TARGET_PREFETCH_SENTINEL'),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('ACTIVE_PREFETCH_SENTINEL');
      await expect(page.locator(EDITOR_SELECTOR)).not.toContainText('TARGET_PREFETCH_SENTINEL');

      const clickStartedAt = Date.now();
      await targetRow.click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('TARGET_PREFETCH_SENTINEL', {
        timeout: 30_000,
      });
      await expect(page.locator(NOTE_COVER_CROPPER_SELECTOR)).toBeVisible({ timeout: 10_000 });
      const clickOpenMs = Date.now() - clickStartedAt;

      const finalCache = await getNoteContentCacheEntry(page, targetPath);
      console.info('[notes-hover-prefetch]', {
        clickOpenMs,
        finalCache,
      });

      expect(finalCache.currentNotePath).toBe(targetPath);
      expect(finalCache.hasEntry).toBe(true);
      expect(clickOpenMs).toBeLessThan(5_000);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('prefetches Chat session messages on hover without switching the active session', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-hover-prefetch');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      const fixture = await createChatFixture(page, {
        activeSessionIndex: 0,
        sessions: [
          {
            title: 'E2E Active Prefetch Chat',
            messages: [
              { role: 'user', content: 'Active prefetch prompt.' },
              { role: 'assistant', content: 'ACTIVE_CHAT_PREFETCH_SENTINEL rendered response.' },
            ],
          },
          {
            title: 'E2E Target Prefetch Chat',
            preloadMessages: false,
            messages: [
              { role: 'user', content: 'Target prefetch prompt.' },
              { role: 'assistant', content: 'TARGET_CHAT_PREFETCH_SENTINEL rendered response.' },
            ],
          },
        ],
      });
      const activeSessionId = fixture.sessionIds[0]!;
      const targetSessionId = fixture.sessionIds[1]!;

      await setAppViewMode(page, 'chat');
      await waitForChatSession(page, {
        sessionId: activeSessionId,
        minMessageCount: 2,
        sentinelText: 'ACTIVE_CHAT_PREFETCH_SENTINEL',
      });
      await expect(page.locator(CHAT_VIEW_SELECTOR)).not.toContainText('TARGET_CHAT_PREFETCH_SENTINEL');

      await expect.poll(() => getChatSessionMessageStatus(page, targetSessionId), { timeout: 10_000 }).toMatchObject({
        currentSessionId: activeSessionId,
        hasMessages: false,
        messageCount: 0,
      });

      const targetRow = page.locator(CHAT_SESSION_ROW_SELECTOR, { hasText: 'E2E Target Prefetch Chat' }).first();
      await expect(targetRow).toBeVisible();
      await targetRow.hover();

      await expect.poll(() => getChatSessionMessageStatus(page, targetSessionId), { timeout: 10_000 }).toMatchObject({
        currentSessionId: activeSessionId,
        hasMessages: true,
        messageCount: 2,
        lastContent: expect.stringContaining('TARGET_CHAT_PREFETCH_SENTINEL'),
      });

      await expect(page.locator(CHAT_VIEW_SELECTOR)).toContainText('ACTIVE_CHAT_PREFETCH_SENTINEL');
      await expect(page.locator(CHAT_VIEW_SELECTOR)).not.toContainText('TARGET_CHAT_PREFETCH_SENTINEL');

      const switchStartedAt = Date.now();
      await targetRow.click();
      await waitForChatSession(page, {
        sessionId: targetSessionId,
        minMessageCount: 2,
        sentinelText: 'TARGET_CHAT_PREFETCH_SENTINEL',
      });
      const switchMs = Date.now() - switchStartedAt;

      const finalStatus = await getChatSessionMessageStatus(page, targetSessionId);
      console.info('[chat-hover-prefetch]', {
        switchMs,
        finalStatus,
      });

      expect(finalStatus.currentSessionId).toBe(targetSessionId);
      expect(finalStatus.hasMessages).toBe(true);
      expect(switchMs).toBeLessThan(5_000);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps Notes hover prefetch responsive with many files and a large target note', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-hover-prefetch-large');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const activePath = '000-active-prefetch.md';
      const targetPath = '050-large-target-prefetch.md';
      const files = [
        { filename: activePath, content: createPrefetchMarkdown('active-large') },
        { filename: targetPath, content: createLargePrefetchMarkdown('target-large') },
        ...Array.from({ length: 88 }, (_, index) => ({
          filename: `${String(index + 1).padStart(3, '0')}-prefetch-filler-${index}.md`,
          content: createPrefetchMarkdown(`filler-${index}`),
        })),
      ];

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'notes-hover-prefetch-large',
        files,
      });

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Notes Hover Prefetch Large NotesRoot',
        minFileCount: 90,
      });

      const sidebarFramesBeforeOpen = await measureScrollableFrames(page, NOTES_SIDEBAR_SCROLL_ROOT_SELECTOR, 45);
      expect(sidebarFramesBeforeOpen).not.toBeNull();
      expect(sidebarFramesBeforeOpen?.maxScrollTop ?? 0).toBeGreaterThan(0);
      expect(sidebarFramesBeforeOpen?.p95FrameMs ?? 0).toBeLessThan(120);
      expect(sidebarFramesBeforeOpen?.longFramesOver300 ?? 0).toBeLessThanOrEqual(1);
      expect(sidebarFramesBeforeOpen?.maxFrameMs ?? 0).toBeLessThan(750);

      await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: '000-active-prefetch' }).first().click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('ACTIVE-LARGE_PREFETCH_SENTINEL', {
        timeout: 30_000,
      });

      await pruneNoteContentsCacheToOpenNotes(page);
      expect(await getNoteContentCacheEntry(page, targetPath)).toMatchObject({
        hasEntry: false,
        currentNotePath: activePath,
      });

      const targetRow = page.locator(FILE_TREE_FILE_SELECTOR, { hasText: '050-large-target-prefetch' }).first();
      await targetRow.scrollIntoViewIfNeeded();
      await expect(targetRow).toBeVisible();
      const hoverStartedAt = Date.now();
      await targetRow.hover();
      await expect.poll(() => getNoteContentCacheEntry(page, targetPath), { timeout: 10_000 }).toMatchObject({
        hasEntry: true,
        currentNotePath: activePath,
        contentPreview: expect.stringContaining('TARGET-LARGE_LARGE_PREFETCH_SENTINEL_START'),
      });
      const hoverPrefetchMs = Date.now() - hoverStartedAt;

      const clickStartedAt = Date.now();
      await targetRow.click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('TARGET-LARGE_LARGE_PREFETCH_SENTINEL_END', {
        timeout: 30_000,
      });
      const clickOpenMs = Date.now() - clickStartedAt;

      const editorDomMetrics = await collectEditorDomMetrics(page);
      const noteScrollFrames = await measureScrollFrames(page, 45);

      console.info('[notes-hover-prefetch-large]', {
        sidebarFramesBeforeOpen,
        hoverPrefetchMs,
        clickOpenMs,
        editorDomMetrics,
        noteScrollFrames,
      });

      expect(hoverPrefetchMs).toBeLessThan(5_000);
      expect(clickOpenMs).toBeLessThan(10_000);
      expect(editorDomMetrics.editorTextLength).toBeGreaterThan(50_000);
      expect(editorDomMetrics.renderedBlockCount).toBeGreaterThan(500);
      expect(noteScrollFrames?.p95FrameMs ?? 0).toBeLessThan(140);
      expect(noteScrollFrames?.maxFrameMs ?? 0).toBeLessThan(400);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps Chat hover prefetch responsive with many sessions and long messages', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-hover-prefetch-large');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const targetSessionIndex = 72;
      const sessions = Array.from({ length: 96 }, (_, index) => {
        if (index === 0) {
          return {
            title: 'E2E Active Large Prefetch Chat',
            messages: [
              { role: 'user' as const, content: 'Active large prefetch prompt.' },
              { role: 'assistant' as const, content: 'ACTIVE_CHAT_LARGE_PREFETCH_SENTINEL rendered response.' },
            ],
          };
        }
        if (index === targetSessionIndex) {
          return {
            title: 'E2E Target Large Prefetch Chat',
            preloadMessages: false,
            messages: createLargeChatMessages('target-large-chat'),
          };
        }
        return {
          title: `E2E Filler Large Prefetch Chat ${String(index).padStart(2, '0')}`,
          preloadMessages: false,
          messages: [
            { role: 'user' as const, content: `Filler prompt ${index}.` },
            { role: 'assistant' as const, content: `Filler response ${index}.` },
          ],
        };
      });
      const fixture = await createChatFixture(page, {
        activeSessionIndex: 0,
        sessions,
      });
      const activeSessionId = fixture.sessionIds[0]!;
      const targetSessionId = fixture.sessionIds[targetSessionIndex]!;

      await setAppViewMode(page, 'chat');
      await waitForChatSession(page, {
        sessionId: activeSessionId,
        minMessageCount: 2,
        sentinelText: 'ACTIVE_CHAT_LARGE_PREFETCH_SENTINEL',
      });
      await expect.poll(async () => page.evaluate(() =>
        (window as any).__vlainaE2E.getChatState().sessions.length
      ), { timeout: 10_000 }).toBe(96);
      await expect.poll(async () =>
        page.locator(CHAT_SESSION_ROW_SELECTOR).count()
      , { timeout: 10_000 }).toBeGreaterThan(0);

      const sidebarFramesBeforeSwitch = await measureChatSidebarFrames(page, 45);
      if (!sidebarFramesBeforeSwitch) {
        console.info('[chat-hover-prefetch-large-sidebar-debug]', await collectChatSidebarDiagnostics(page));
      }
      expect(sidebarFramesBeforeSwitch).not.toBeNull();
      expect(sidebarFramesBeforeSwitch?.maxScrollTop ?? 0).toBeGreaterThan(0);
      expect(sidebarFramesBeforeSwitch?.p95FrameMs ?? 0).toBeLessThan(120);
      expect(sidebarFramesBeforeSwitch?.maxFrameMs ?? 0).toBeLessThan(300);
      expect(sidebarFramesBeforeSwitch?.visibleRows ?? 0).toBeLessThan(96);

      await expect.poll(() => getChatSessionMessageStatus(page, targetSessionId), { timeout: 10_000 }).toMatchObject({
        currentSessionId: activeSessionId,
        hasMessages: false,
        messageCount: 0,
      });

      const targetRow = await revealChatSidebarRow(page, 'E2E Target Large Prefetch Chat');
      const hoverStartedAt = Date.now();
      await targetRow.hover();
      await expect.poll(() => getChatSessionMessageStatus(page, targetSessionId), { timeout: 10_000 }).toMatchObject({
        currentSessionId: activeSessionId,
        hasMessages: true,
        messageCount: 140,
        lastContent: expect.stringContaining('TARGET-LARGE-CHAT_CHAT_LARGE_PREFETCH_SENTINEL_END'),
      });
      const hoverPrefetchMs = Date.now() - hoverStartedAt;

      await expect(page.locator(CHAT_VIEW_SELECTOR)).toContainText('ACTIVE_CHAT_LARGE_PREFETCH_SENTINEL');
      await expect(page.locator(CHAT_VIEW_SELECTOR)).not.toContainText('TARGET-LARGE-CHAT_CHAT_LARGE_PREFETCH_SENTINEL_END');

      const switchStartedAt = Date.now();
      await targetRow.click();
      await waitForChatSession(page, {
        sessionId: targetSessionId,
        minMessageCount: 140,
        sentinelText: 'TARGET-LARGE-CHAT_CHAT_LARGE_PREFETCH_SENTINEL_END',
      });
      const switchMs = Date.now() - switchStartedAt;

      const chatScrollFrames = await measureChatScrollFrames(page, 45);
      const visibleMessageCount = await page.locator(CHAT_SCROLLABLE_SELECTOR).locator('[data-message-item="true"]').count();
      const finalStatus = await getChatSessionMessageStatus(page, targetSessionId);

      console.info('[chat-hover-prefetch-large]', {
        sidebarFramesBeforeSwitch,
        hoverPrefetchMs,
        switchMs,
        chatScrollFrames,
        visibleMessageCount,
        finalStatus,
      });

      expect(hoverPrefetchMs).toBeLessThan(5_000);
      expect(switchMs).toBeLessThan(10_000);
      expect(finalStatus.currentSessionId).toBe(targetSessionId);
      expect(finalStatus.hasMessages).toBe(true);
      expect(finalStatus.messageCount).toBe(140);
      expect(visibleMessageCount).toBeGreaterThan(0);
      expect(visibleMessageCount).toBeLessThan(140);
      expect(chatScrollFrames?.p95FrameMs ?? 0).toBeLessThan(140);
      expect(chatScrollFrames?.maxFrameMs ?? 0).toBeLessThan(400);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
