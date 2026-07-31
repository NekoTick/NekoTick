import { expect, test, type Page } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  waitForE2EBridge,
} from './notesE2E';

const SETTINGS_MODAL_SELECTOR = '[data-settings-modal="true"]';
type SettingsTab = 'markdown' | 'appearance' | 'language' | 'ai' | 'about';
const RESPONSIVE_SETTINGS_TABS: SettingsTab[] = ['markdown', 'appearance', 'language', 'ai', 'about'];

async function openSettings(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('open-settings'));
  });
  await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toBeVisible({ timeout: 30_000 });
}

async function openSettingsTab(page: Page, tab: SettingsTab) {
  await page.locator(`[data-settings-tab="${tab}"]`).click();
  await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toHaveAttribute('data-settings-active-tab', tab, {
    timeout: 10_000,
  });
  await expect(page.locator(`[data-settings-tab-panel="${tab}"]`)).toBeVisible({ timeout: 10_000 });
}

async function collectSettingsLayoutMetrics(page: Page, tab: SettingsTab) {
  return page.evaluate(({ modalSelector, activeTab }) => {
    const toRect = (element: Element | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    const isVisibleElement = (element: HTMLElement) => {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (Number(style.opacity) === 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const modal = document.querySelector<HTMLElement>(modalSelector);
    const panel = document.querySelector<HTMLElement>(`[data-settings-tab-panel="${activeTab}"]`);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const documentScrollWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    );

    const horizontalOverflowElements = modal
      ? Array.from(modal.querySelectorAll<HTMLElement>('*'))
          .filter((element) => {
            if (!isVisibleElement(element)) return false;
            const rect = element.getBoundingClientRect();
            return rect.left < -1 || rect.right > viewportWidth + 1;
          })
          .slice(0, 8)
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            className: String(element.getAttribute('class') || '').slice(0, 180),
            dataSettingsItem: element.getAttribute('data-settings-item'),
            dataSettingsSection: element.getAttribute('data-settings-section'),
            dataSettingsControl: element.getAttribute('data-settings-control'),
            rect: toRect(element),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          }))
      : [];

    return {
      viewportWidth,
      viewportHeight,
      documentScrollWidth,
      modal: toRect(modal),
      panel: toRect(panel),
      horizontalOverflowElements,
    };
  }, { modalSelector: SETTINGS_MODAL_SELECTOR, activeTab: tab });
}

async function expectSettingsTabFitsSmallViewport(page: Page, tab: SettingsTab) {
  const metrics = await collectSettingsLayoutMetrics(page, tab);
  console.info(`[settings-small-${tab}]`, metrics);

  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.modal).not.toBeNull();
  expect(metrics.panel).not.toBeNull();
  expect(metrics.modal!.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.modal!.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.modal!.top).toBeGreaterThanOrEqual(-1);
  expect(metrics.modal!.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.panel!.width).toBeGreaterThan(280);
  expect(metrics.panel!.height).toBeGreaterThan(40);
  expect(metrics.horizontalOverflowElements).toEqual([]);
}

async function getUnifiedData(page: Page) {
  return page.evaluate(() => (window as any).__vlainaE2E.getUnifiedData());
}

async function getUIState(page: Page) {
  return page.evaluate(() => (window as any).__vlainaE2E.getUIState());
}

async function clickAndExpectMarkdownSetting(
  page: Page,
  selector: string,
  reader: (data: any) => boolean,
) {
  const before = await getUnifiedData(page).then(reader);
  await page.locator(selector).click();
  await expect.poll(async () => getUnifiedData(page).then(reader), { timeout: 10_000 }).toBe(!before);
}

async function dragRangeInput(page: Page, selector: string, fromRatio: number, toRatio: number) {
  const slider = page.locator(selector);
  const box = await slider.boundingBox();
  if (!box) {
    throw new Error(`Range input not visible: ${selector}`);
  }

  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * fromRatio, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * toRatio, y, { steps: 8 });
  await page.mouse.up();
}

test.describe('settings modal interaction coverage', () => {
  test.setTimeout(120_000);

  test('opens and safely closes settings with the keyboard shortcut', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('settings-keyboard-shortcut');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      await page.keyboard.press('Control+,');
      await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toBeVisible({ timeout: 30_000 });
      await openSettingsTab(page, 'markdown');
      await clickAndExpectMarkdownSetting(
        page,
        '[data-settings-control="markdown-typewriter-mode"]',
        (data) => data.settings.markdown.typewriterMode === true,
      );
      await openSettingsTab(page, 'ai');
      await page.locator('[data-settings-control="ai-system-prompt"]').fill('E2E shortcut prompt');

      await page.keyboard.press('Control+,');
      await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toHaveCount(0, { timeout: 10_000 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForE2EBridge(page);
      await expect.poll(async () => {
        const data = await getUnifiedData(page);
        return {
          typewriterMode: data.settings.markdown.typewriterMode,
          systemPrompt: data.ai.customSystemPrompt,
        };
      }, { timeout: 10_000 }).toEqual({
        typewriterMode: true,
        systemPrompt: 'E2E shortcut prompt',
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('traps keyboard focus and restores the previous focused control on close', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('settings-focus-lifecycle');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.evaluate(() => {
        const opener = document.createElement('button');
        opener.id = 'settings-focus-opener';
        opener.textContent = 'Open settings focus fixture';
        document.body.appendChild(opener);
        opener.focus();
        window.dispatchEvent(new CustomEvent('open-settings'));
      });

      const modal = page.locator(SETTINGS_MODAL_SELECTOR);
      await expect(modal).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => page.evaluate(() =>
        document.activeElement?.getAttribute('data-settings-modal')
      )).toBe('true');

      await page.keyboard.press('Shift+Tab');
      await expect.poll(() => page.evaluate(() =>
        document.activeElement?.closest('[data-settings-modal="true"]') !== null
      )).toBe(true);

      for (let index = 0; index < 12; index += 1) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() =>
          document.activeElement?.closest('[data-settings-modal="true"]') !== null
        )).toBe(true);
      }

      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0, { timeout: 10_000 });
      await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? null))
        .toBe('settings-focus-opener');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('drives core settings tabs through the real modal UI', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('settings-interaction-coverage');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      await openSettings(page);
      await openSettingsTab(page, 'markdown');

      await clickAndExpectMarkdownSetting(
        page,
        '[data-settings-control="markdown-typewriter-mode"]',
        (data) => data.settings.markdown.typewriterMode === true,
      );
      await clickAndExpectMarkdownSetting(
        page,
        '[data-settings-control="markdown-body-line-numbers"]',
        (data) => data.settings.markdown.body?.showLineNumbers === true,
      );
      await clickAndExpectMarkdownSetting(
        page,
        '[data-settings-control="markdown-code-block-line-numbers"]',
        (data) => data.settings.markdown.codeBlock?.showLineNumbers === true,
      );

      await page.locator('[data-settings-control="image-storage-location"]').click();
      await page.locator('[data-settings-image-storage-mode="notesRootSubfolder"]').click();
      const notesRootSubfolderNameInput = page.locator('[data-settings-control="image-notes-root-subfolder-name"]');
      await expect(notesRootSubfolderNameInput).toBeVisible({
        timeout: 10_000,
      });
      await notesRootSubfolderNameInput.click();
      await expect.poll(async () => notesRootSubfolderNameInput.evaluate((element) => {
        const input = element as HTMLInputElement;
        return {
          value: input.value,
          selectionStart: input.selectionStart,
          selectionEnd: input.selectionEnd,
        };
      }), { timeout: 10_000 }).toEqual({
        value: 'assets',
        selectionStart: 0,
        selectionEnd: 'assets'.length,
      });
      await page.keyboard.press('Backspace');
      await expect(notesRootSubfolderNameInput).toHaveValue('');
      await page.keyboard.press('Tab');
      await expect(notesRootSubfolderNameInput).toHaveValue('assets');
      await notesRootSubfolderNameInput.fill('e2e-notes-root-assets');
      await page.locator('[data-settings-control="image-filename-format"]').click();
      await page.locator('[data-settings-image-filename-format="sequence"]').click();
      await expect.poll(() => getUIState(page), { timeout: 10_000 }).toMatchObject({
        imageStorageMode: 'notesRootSubfolder',
        imageNotesRootSubfolderName: 'e2e-notes-root-assets',
        imageFilenameFormat: 'sequence',
      });

      await openSettingsTab(page, 'appearance');
      const initialFontSize = await getUIState(page).then((state) => state.fontSize);
      await dragRangeInput(page, '[data-settings-control="appearance-font-size"]', 0.35, 0.8);
      await expect.poll(async () => getUIState(page).then((state) => state.fontSize), { timeout: 10_000 })
        .toBeGreaterThan(initialFontSize);

      await page.locator('[data-settings-color-mode="dark"]').click();
      await expect.poll(async () => {
        const data = await getUnifiedData(page);
        return data.settings.ui?.colorMode;
      }, { timeout: 10_000 }).toBe('dark');
      await expect.poll(async () => page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      ), { timeout: 10_000 }).toBe(true);

      await openSettingsTab(page, 'language');
      await page.locator('[data-settings-language-option="zh-CN"]').click();
      await expect.poll(async () => getUIState(page).then((state) => state.languagePreference), {
        timeout: 10_000,
      }).toBe('zh-CN');
      await expect.poll(async () => page.evaluate(() => document.documentElement.lang), {
        timeout: 10_000,
      }).toBe('zh-CN');

      await openSettingsTab(page, 'ai');
      await page.locator('[data-settings-ai-action="new-channel"]').first().click();
      await expect(page.locator('[data-settings-provider-field="name"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-settings-provider-field="name"]').fill('E2E Settings Channel');
      await page.locator('[data-settings-provider-field="api-host"]').fill('https://e2e-settings.invalid/v1');
      await page.locator('[data-settings-provider-field="api-key"]').fill('sk-e2e-settings-key');
      await page.locator('[data-settings-provider-action="toggle-api-key"]').click();
      await expect(page.locator('[data-settings-provider-field="api-key"]')).toHaveValue('sk-e2e-••••••-key');
      await page.locator('[data-settings-provider-action="toggle-api-key"]').click();
      await expect(page.locator('[data-settings-provider-field="api-key"]')).toHaveValue('sk-e2e-settings-key');
      await page.locator('[data-settings-provider-action="copy-api-key"]').click();
      await expect(page.locator('[data-settings-provider-action="copy-api-key"]')).toHaveAttribute(
        'data-copied',
        'true',
        { timeout: 10_000 },
      );

      await expect.poll(async () => {
        const data = await getUnifiedData(page);
        return data.ai.providers.find((provider: { id: string; name: string }) =>
          provider.id !== 'vlaina-managed' && provider.name === 'E2E Settings Channel'
        );
      }, { timeout: 10_000 }).toMatchObject({
        name: 'E2E Settings Channel',
        apiHost: 'https://e2e-settings.invalid/v1',
        apiKey: 'sk-e2e-settings-key',
        enabled: true,
      });

      const quickAddModelInput = page.locator('[data-settings-provider-action="quick-add-model"]');
      await quickAddModelInput.fill('e2e-manual-model');
      await quickAddModelInput.press('Enter');
      await expect.poll(async () => {
        const data = await getUnifiedData(page);
        return data.ai.models.some((model: { apiModelId: string }) =>
          model.apiModelId === 'e2e-manual-model'
        );
      }, { timeout: 10_000 }).toBe(true);

      const channelEnabledSwitch = page.locator('[data-settings-control="ai-channel-enabled"]').first();
      await channelEnabledSwitch.click();
      await expect.poll(async () => {
        const data = await getUnifiedData(page);
        return data.ai.providers.find((provider: { id: string; name: string }) =>
          provider.id !== 'vlaina-managed' && provider.name === 'E2E Settings Channel'
        )?.enabled;
      }, { timeout: 10_000 }).toBe(false);

      await page.locator('[data-settings-action="close"]').click();
      await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toHaveCount(0, { timeout: 10_000 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForE2EBridge(page);

      await expect.poll(() => getUIState(page), { timeout: 10_000 }).toMatchObject({
        imageStorageMode: 'notesRootSubfolder',
        imageNotesRootSubfolderName: 'e2e-notes-root-assets',
        imageFilenameFormat: 'sequence',
        languagePreference: 'zh-CN',
      });
      await expect.poll(async () => {
        const data = await getUnifiedData(page);
        return {
          colorMode: data.settings.ui?.colorMode,
          codeLineNumbers: data.settings.markdown.codeBlock?.showLineNumbers,
          bodyLineNumbers: data.settings.markdown.body?.showLineNumbers,
          typewriterMode: data.settings.markdown.typewriterMode,
          provider: data.ai.providers.find((provider: { name: string }) =>
            provider.name === 'E2E Settings Channel'
          ),
          hasModel: data.ai.models.some((model: { apiModelId: string }) =>
            model.apiModelId === 'e2e-manual-model'
          ),
        };
      }, { timeout: 10_000 }).toMatchObject({
        colorMode: 'dark',
        codeLineNumbers: true,
        bodyLineNumbers: true,
        typewriterMode: true,
        provider: {
          apiHost: 'https://e2e-settings.invalid/v1',
          apiKey: 'sk-e2e-settings-key',
          enabled: false,
        },
        hasModel: true,
      });
      await expect.poll(async () => getUIState(page).then((state) => state.fontSize), { timeout: 10_000 })
        .toBeGreaterThan(initialFontSize);

      await openSettings(page);
      await openSettingsTab(page, 'ai');

      const channelCard = page.locator('[data-settings-ai-channel-card]').filter({ hasText: 'E2E Settings Channel' });
      await channelCard.hover();
      await channelCard.locator('[data-settings-ai-action="delete-channel"]').click();
      await expect(page.locator('[data-dialog-action="cancel"]')).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-dialog-action="cancel"]')).toHaveCount(0);
      await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toBeVisible();
      await expect.poll(async () => {
        const data = await getUnifiedData(page);
        return data.ai.providers.some((provider: { id: string; name: string }) =>
          provider.id !== 'vlaina-managed' && provider.name === 'E2E Settings Channel'
        );
      }, { timeout: 10_000 }).toBe(true);

      await channelCard.hover();
      await channelCard.locator('[data-settings-ai-action="delete-channel"]').click();
      await page.locator('[data-dialog-action="confirm"]').click();
      await expect.poll(async () => {
        const data = await getUnifiedData(page);
        return data.ai.providers.some((provider: { id: string; name: string }) =>
          provider.id !== 'vlaina-managed' && provider.name === 'E2E Settings Channel'
        );
      }, { timeout: 10_000 }).toBe(false);

      await page.locator('[data-settings-ai-action="new-channel"]').first().click();
      await page.locator('[data-settings-provider-field="api-host"]').fill('http://127.0.0.1:11434/v1');
      const keylessChannelCard = page.locator('[data-settings-ai-channel-card][data-active="true"]');
      await keylessChannelCard.hover();
      await keylessChannelCard.locator('[data-settings-ai-action="delete-channel"]').click();
      await expect(page.locator('[data-dialog-action="cancel"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-dialog-action="cancel"]').click();
      await expect.poll(async () => {
        const data = await getUnifiedData(page);
        return data.ai.providers.some((provider: { apiHost: string }) =>
          provider.apiHost === 'http://127.0.0.1:11434/v1'
        );
      }, { timeout: 10_000 }).toBe(true);
      await keylessChannelCard.hover();
      await keylessChannelCard.locator('[data-settings-ai-action="delete-channel"]').click();
      await page.locator('[data-dialog-action="confirm"]').click();

      await page.locator('[data-settings-ai-action="new-channel"]').first().click();
      await page.locator('[data-settings-provider-field="api-key"]').fill('sk-draft-only-key');
      const draftKeyChannelCard = page.locator('[data-settings-ai-channel-card][data-active="true"]');
      await draftKeyChannelCard.hover();
      await draftKeyChannelCard.locator('[data-settings-ai-action="delete-channel"]').click();
      await expect(page.locator('[data-dialog-action="confirm"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-dialog-action="confirm"]').click();

      await page.locator('[data-settings-ai-action="new-channel"]').first().click();
      await expect.poll(async () => {
        const data = await getUnifiedData(page);
        return data.ai.providers.filter((provider: { id: string }) => provider.id !== 'vlaina-managed').length;
      }, { timeout: 10_000 }).toBe(1);
      await page.keyboard.press('Escape');
      await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toHaveCount(0, { timeout: 10_000 });
      await expect.poll(async () => {
        const data = await getUnifiedData(page);
        return data.ai.providers.filter((provider: { id: string }) => provider.id !== 'vlaina-managed').length;
      }, { timeout: 10_000 }).toBe(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('dismisses model suggestions with Escape without closing settings', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('settings-model-suggestion-escape');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.evaluate(async () => {
        const bridge = (window as any).__vlainaE2E;
        const providerId = await bridge.addProvider({
          name: 'Suggestion Provider',
          apiHost: 'https://settings-models.example.invalid/v1',
          apiKey: 'sk-randomized-e2e-key',
        });
        await bridge.setProviderFetchedModels(providerId, [
          'gpt-4o-mini',
          'gemini-2.5-flash',
        ]);
      });

      await openSettings(page);
      await openSettingsTab(page, 'ai');

      const quickAdd = page.locator('[data-settings-provider-action="quick-add-model"]');
      await quickAdd.fill('gm');
      await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 });
      await expect(quickAdd).toHaveAttribute('aria-expanded', 'true');

      await quickAdd.press('Escape');

      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(quickAdd).toBeFocused();
      await expect(quickAdd).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toBeVisible();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps every settings tab usable at the minimum desktop window size', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('settings-small-window-layout');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 800, height: 600 });

      await openSettings(page);

      for (const tab of RESPONSIVE_SETTINGS_TABS) {
        await openSettingsTab(page, tab);
        await expectSettingsTabFitsSmallViewport(page, tab);
      }

      await openSettingsTab(page, 'ai');
      await page.locator('[data-settings-ai-action="new-channel"]').first().click();
      await expect(page.locator('[data-settings-provider-field="name"]')).toBeVisible({ timeout: 10_000 });
      await expectSettingsTabFitsSmallViewport(page, 'ai');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
