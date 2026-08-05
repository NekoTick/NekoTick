import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

test('keeps Base URL focus after closing a note link editor', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('settings-ai-channel-focus');

  try {
    await app.firstWindow();
    const [page] = await getOpenBridgePages(app, 1);
    await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
      languagePreference: 'en',
    }));
    await openMarkdownFixture(page, {
      filename: 'settings-ai-channel-focus.md',
      content: '[Existing link target](https://example.com/original) trailing text.',
    });
    const existingLink = page.locator(
      `${EDITOR_SELECTOR} a[href="https://example.com/original"]`,
      { hasText: 'Existing link target' },
    ).first();
    await existingLink.hover();
    const tooltip = page.locator('.link-tooltip-container:not(.hidden)').first();
    await expect(tooltip.locator('.link-tooltip-viewer')).toBeVisible({ timeout: 10_000 });
    await tooltip.locator('.link-tooltip-action-btn').nth(1).click();
    await expect(tooltip.locator('textarea')).toBeFocused({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0, { timeout: 5_000 });

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-settings', {
      detail: { tab: 'ai' },
    })));

    const settingsModal = page.locator('[data-settings-modal="true"]');
    await expect(settingsModal).toHaveAttribute('data-settings-active-tab', 'ai', {
      timeout: 10_000,
    });
    await page.locator('[data-settings-ai-action="new-channel"]').click();

    const baseUrlInput = page.locator('[data-settings-provider-field="api-host"]:visible');
    await expect(baseUrlInput).toBeVisible({ timeout: 10_000 });
    await expect(baseUrlInput).toBeFocused({ timeout: 10_000 });
    await expect(baseUrlInput).toHaveJSProperty('selectionStart', 0);
    await expect(baseUrlInput).toHaveJSProperty('selectionEnd', 0);
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});
