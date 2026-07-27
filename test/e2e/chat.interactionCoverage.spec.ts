import { expect, test, type Page } from '@playwright/test';
import {
  CHAT_COMPOSER_TEXTAREA_SELECTOR,
  CHAT_MESSAGE_ACTION_SELECTOR,
  CHAT_MESSAGE_EDITOR_SELECTOR,
  CHAT_MESSAGE_SELECTOR,
  CHAT_SESSION_ROW_SELECTOR,
  CHAT_VIEW_SELECTOR,
  cleanupIsolatedElectron,
  createChatFixture,
  createChatModelFixture,
  createNotesRootFilesFixture,
  getChatSessionMessageStatus,
  getOpenBridgePages,
  launchIsolatedElectron,
  openNotesRootInNotes,
  setAppViewMode,
  waitForChatSession,
} from './notesE2E';

const SIDEBAR_MENU_LAYER_SELECTOR = '[data-sidebar-context-menu-layer="true"]';

async function getChatState(page: Page) {
  return page.evaluate(() => (window as any).__vlainaE2E.getChatState());
}

async function openSessionContextMenu(page: Page, title: string) {
  const row = page.locator(CHAT_SESSION_ROW_SELECTOR, { hasText: title }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click({ button: 'right' });
  await expect(page.locator(SIDEBAR_MENU_LAYER_SELECTOR)).toBeVisible({ timeout: 10_000 });
}

test.describe('chat interaction coverage', () => {
  test.setTimeout(120_000);

  test('covers sidebar new chat, rename, pin, delete, and lazy session hydration', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-sidebar-coverage');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      const fixture = await createChatFixture(page, {
        activeSessionIndex: 0,
        sessions: [
          {
            title: 'E2E Sidebar Alpha',
            messages: [
              { role: 'user', content: 'Alpha prompt sentinel.' },
              { role: 'assistant', content: 'ALPHA_CHAT_SENTINEL response.' },
            ],
          },
          {
            title: 'E2E Rename Beta',
            messages: [
              { role: 'user', content: 'Rename target prompt.' },
              { role: 'assistant', content: 'Rename target response.' },
            ],
          },
          {
            title: 'E2E Lazy Gamma',
            preloadMessages: false,
            messages: [
              { role: 'user', content: 'Lazy prompt sentinel.' },
              { role: 'assistant', content: 'LAZY_CHAT_SENTINEL loaded from disk.' },
            ],
          },
          {
            title: 'E2E Delete Delta',
            messages: [
              { role: 'user', content: 'Delete target prompt.' },
              { role: 'assistant', content: 'Delete target response.' },
            ],
          },
        ],
      });

      await setAppViewMode(page, 'chat');
      await expect(page.locator(CHAT_VIEW_SELECTOR)).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(CHAT_SESSION_ROW_SELECTOR, { hasText: 'E2E Sidebar Alpha' })).toBeVisible();

      const lazyBefore = await getChatSessionMessageStatus(page, fixture.sessionIds[2]!);
      expect(lazyBefore.hasMessages).toBe(false);

      await page.locator(CHAT_SESSION_ROW_SELECTOR, { hasText: 'E2E Lazy Gamma' }).first().click();
      await waitForChatSession(page, {
        sessionId: fixture.sessionIds[2]!,
        minMessageCount: 2,
        sentinelText: 'LAZY_CHAT_SENTINEL',
      });
      const lazyAfter = await getChatSessionMessageStatus(page, fixture.sessionIds[2]!);
      expect(lazyAfter.hasMessages).toBe(true);
      expect(lazyAfter.lastContent).toContain('LAZY_CHAT_SENTINEL');

      const newChatStartedAt = Date.now();
      await page.locator('[data-chat-sidebar-action="new-chat"]').click();
      await expect.poll(async () => {
        const state = await getChatState(page);
        return state.currentSessionId;
      }, { timeout: 10_000 }).toBeNull();
      await expect.poll(async () => page.evaluate((selector) => {
        const textarea = document.querySelector<HTMLTextAreaElement>(selector);
        return document.activeElement === textarea;
      }, CHAT_COMPOSER_TEXTAREA_SELECTOR), { timeout: 10_000 }).toBe(true);
      expect(Date.now() - newChatStartedAt).toBeLessThan(5_000);

      const betaRow = page.locator(CHAT_SESSION_ROW_SELECTOR, { hasText: 'E2E Rename Beta' }).first();
      await betaRow.dblclick();
      const renameInput = betaRow.locator('textarea').first();
      await expect(renameInput).toBeVisible({ timeout: 10_000 });
      await renameInput.fill('E2E Renamed Beta');
      await page.keyboard.press('Enter');
      await expect(page.locator(CHAT_SESSION_ROW_SELECTOR, { hasText: 'E2E Renamed Beta' })).toBeVisible({
        timeout: 10_000,
      });
      await expect.poll(async () => {
        const state = await getChatState(page);
        return state.sessions.find((session: { id: string }) => session.id === fixture.sessionIds[1])?.title;
      }, { timeout: 10_000 }).toBe('E2E Renamed Beta');

      await openSessionContextMenu(page, 'E2E Renamed Beta');
      await page.locator(`${SIDEBAR_MENU_LAYER_SELECTOR} [data-sidebar-context-menu-item="pin"]`).click();
      await expect.poll(async () => {
        const state = await getChatState(page);
        return state.sessions.find((session: { id: string }) => session.id === fixture.sessionIds[1])?.isPinned;
      }, { timeout: 10_000 }).toBe(true);

      await openSessionContextMenu(page, 'E2E Delete Delta');
      await page.locator(`${SIDEBAR_MENU_LAYER_SELECTOR} [data-sidebar-context-menu-item="delete"]`).click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[role="dialog"] [data-dialog-action="confirm"]').click();
      await expect(page.locator(CHAT_SESSION_ROW_SELECTOR, { hasText: 'E2E Delete Delta' })).toHaveCount(0, {
        timeout: 10_000,
      });
      await expect.poll(async () => {
        const state = await getChatState(page);
        return state.sessions.some((session: { id: string }) => session.id === fixture.sessionIds[3]);
      }, { timeout: 10_000 }).toBe(false);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('covers composer actions, multiline submit, generated session, and prompt history', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-composer-coverage');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await createChatModelFixture(page, {
        providerName: 'E2E Composer Provider',
        apiModelId: 'e2e-composer-model',
      });
      const notesFixture = await createNotesRootFilesFixture(page, {
        name: 'chat-composer-coverage',
        files: [{ filename: 'Mention Target.md', content: 'Mention target body.' }],
      });
      await openNotesRootInNotes(page, {
        notesRootPath: notesFixture.notesRootPath,
        name: 'Chat Composer Coverage NotesRoot',
      });

      await setAppViewMode(page, 'chat');
      const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR);
      await expect(textarea).toBeVisible({ timeout: 30_000 });

      await page.locator('[data-chat-input-action="open-actions"]').click();
      await page.locator('[data-chat-input-action="enable-web-search"]').click();
      await expect(page.locator('[data-chat-input-action="disable-web-search"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-chat-input-action="disable-web-search"]').click();
      await expect(page.locator('[data-chat-input-action="disable-web-search"]')).toHaveCount(0);

      await textarea.fill('');
      await page.locator('[data-chat-input-action="open-actions"]').click();
      await page.locator('[data-chat-input-action="mention"]').click();
      await expect(textarea).toHaveValue('@');

      const sentPrompt = 'E2E composer first line\nE2E composer second line';
      await textarea.fill('E2E composer first line');
      await textarea.press('Shift+Enter');
      await textarea.type('E2E composer second line');
      await expect(textarea).toHaveValue(sentPrompt);

      const submitStartedAt = Date.now();
      await textarea.press('Enter');
      await expect(textarea).toHaveValue('', { timeout: 10_000 });
      await expect.poll(async () => {
        const state = await getChatState(page);
        const sessionId = state.currentSessionId;
        const messages = sessionId ? state.messages[sessionId] ?? [] : [];
        const userMessages = messages.filter((message: { role: string }) => message.role === 'user');
        return {
          hasSession: Boolean(sessionId),
          messageCount: messages.length,
          lastUserContent: userMessages[userMessages.length - 1]?.content ?? '',
        };
      }, { timeout: 30_000 }).toMatchObject({
        hasSession: true,
        messageCount: expect.any(Number),
        lastUserContent: sentPrompt,
      });
      expect(Date.now() - submitStartedAt).toBeLessThan(10_000);

      await expect(page.locator(CHAT_MESSAGE_SELECTOR, { hasText: 'E2E composer first line' })).toBeVisible({
        timeout: 30_000,
      });
      await textarea.press('ArrowUp');
      await expect(textarea).toHaveValue(sentPrompt, { timeout: 10_000 });
      await textarea.press('ArrowDown');
      await expect(textarea).toHaveValue('', { timeout: 10_000 });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('covers message toolbar copy, version navigation, and user edit flow', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-message-toolbar-coverage');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { modelId } = await createChatModelFixture(page, {
        providerName: 'E2E Toolbar Provider',
        apiModelId: 'e2e-toolbar-model',
      });

      const fixture = await createChatFixture(page, {
        sessions: [
          {
            title: 'E2E Toolbar Chat',
            messages: [
              {
                id: 'e2e-user-versioned',
                role: 'user',
                modelId,
                content: 'Edited user prompt visible',
                versions: [
                  { content: 'Original user prompt', kind: 'original' },
                  { content: 'Edited user prompt visible', kind: 'edit' },
                ],
                currentVersionIndex: 1,
              },
              {
                id: 'e2e-assistant-versioned',
                role: 'assistant',
                modelId,
                content: 'Regenerated assistant visible',
                versions: [
                  { content: 'Original assistant answer', kind: 'original' },
                  { content: 'Regenerated assistant visible', kind: 'regeneration' },
                ],
                currentVersionIndex: 1,
              },
            ],
          },
        ],
      });

      await setAppViewMode(page, 'chat');
      await waitForChatSession(page, {
        sessionId: fixture.sessionIds[0]!,
        minMessageCount: 2,
        sentinelText: 'Regenerated assistant visible',
      });

      const assistantMessage = page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
        hasText: 'Regenerated assistant visible',
      }).first();
      await assistantMessage.hover();
      await assistantMessage.locator(`${CHAT_MESSAGE_ACTION_SELECTOR}[data-chat-message-action="copy"]`).click();
      await assistantMessage.getByLabel('Previous message version').click();
      await expect(page.locator(CHAT_VIEW_SELECTOR)).toContainText('Original assistant answer', { timeout: 10_000 });
      await expect.poll(async () => {
        const state = await getChatState(page);
        return state.messages[fixture.sessionIds[0]!]?.find((message: { id: string }) =>
          message.id === 'e2e-assistant-versioned'
        )?.currentVersionIndex;
      }, { timeout: 10_000 }).toBe(0);
      await page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
        hasText: 'Original assistant answer',
      }).first().getByLabel('Next message version').click();
      await expect(page.locator(CHAT_VIEW_SELECTOR)).toContainText('Regenerated assistant visible', { timeout: 10_000 });

      const regenerateStartedAt = Date.now();
      const regeneratedAssistantMessage = page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
        hasText: 'Regenerated assistant visible',
      }).first();
      await regeneratedAssistantMessage.hover();
      await regeneratedAssistantMessage
        .locator(`${CHAT_MESSAGE_ACTION_SELECTOR}[data-chat-message-action="regenerate"]`)
        .click();
      await expect.poll(async () => {
        const state = await getChatState(page);
        const assistant = state.messages[fixture.sessionIds[0]!]?.find((message: { id: string }) =>
          message.id === 'e2e-assistant-versioned'
        );
        return {
          currentVersionIndex: assistant?.currentVersionIndex,
          versionCount: assistant?.versions?.length ?? 0,
        };
      }, { timeout: 30_000 }).toMatchObject({
        currentVersionIndex: 2,
        versionCount: 3,
      });
      expect(Date.now() - regenerateStartedAt).toBeLessThan(10_000);

      const userMessage = page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="user"]`, {
        hasText: 'Edited user prompt visible',
      }).first();
      await userMessage.hover();
      await userMessage.locator(`${CHAT_MESSAGE_ACTION_SELECTOR}[data-chat-message-action="copy"]`).click();
      await userMessage.locator(`${CHAT_MESSAGE_ACTION_SELECTOR}[data-chat-message-action="edit"]`).click();

      const editor = page.locator(CHAT_MESSAGE_EDITOR_SELECTOR);
      await expect(editor).toBeVisible({ timeout: 10_000 });
      await editor.locator('textarea').fill('Edited from E2E toolbar');
      await editor.locator('[data-chat-message-editor-action="save"]').click();
      await expect(editor).toHaveCount(0, { timeout: 10_000 });
      await expect(page.locator(CHAT_VIEW_SELECTOR)).toContainText('Edited from E2E toolbar', { timeout: 10_000 });
      await expect.poll(async () => {
        const state = await getChatState(page);
        return state.messages[fixture.sessionIds[0]!]?.find((message: { id: string }) =>
          message.id === 'e2e-user-versioned'
        )?.content;
      }, { timeout: 10_000 }).toBe('Edited from E2E toolbar');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
