import { expect, test } from '@playwright/test';
import {
  CHAT_COMPOSER_TEXTAREA_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

test.describe('notes floating chat focus', () => {
  test('aligns the focused empty composer caret after the panel opens', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-floating-chat-focus');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        languagePreference: 'en',
        notesChatPanelCollapsed: true,
      }));
      await openMarkdownFixture(page, {
        filename: 'floating-chat-focus.md',
        content: '# Floating Chat Focus\n\nOpen the floating chat composer.',
      });

      await page.getByRole('button', { name: 'Right Chat' }).click();
      const textarea = page.locator(
        `[data-notes-chat-floating="true"] ${CHAT_COMPOSER_TEXTAREA_SELECTOR}`,
      );
      await expect(textarea).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => textarea.evaluate((element) => document.activeElement === element))
        .toBe(true);
      await expect(textarea).toHaveJSProperty('selectionStart', 0);

      await expect.poll(() => textarea.evaluate((element) => {
        const caret = document.querySelector<HTMLElement>('.native-caret-overlay');
        if (!caret) return Number.POSITIVE_INFINITY;

        const textareaRect = element.getBoundingClientRect();
        const caretRect = caret.getBoundingClientRect();
        const paddingLeft = Number.parseFloat(getComputedStyle(element).paddingLeft) || 0;
        return Math.abs(caretRect.left - textareaRect.left - paddingLeft);
      }), { timeout: 10_000 }).toBeLessThanOrEqual(2);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
