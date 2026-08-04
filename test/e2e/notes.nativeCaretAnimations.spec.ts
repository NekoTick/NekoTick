import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

const LIVE_EDITOR_SELECTOR = `${EDITOR_SELECTOR}:not(.toolbar-applied-preview-overlay):not([aria-hidden="true"])`;

async function waitForStableGeometry(locator: Locator) {
  await locator.evaluate((element) => new Promise<void>((resolve) => {
    let previous = '';
    let stableFrames = 0;
    const sample = () => {
      const rect = element.getBoundingClientRect();
      const current = `${rect.left.toFixed(2)}:${rect.top.toFixed(2)}:${rect.width.toFixed(2)}:${rect.height.toFixed(2)}`;
      stableFrames = current === previous ? stableFrames + 1 : 0;
      previous = current;
      if (stableFrames >= 8) {
        resolve();
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
}

async function expectCaretGeometryCurrent(input: Locator) {
  await expect(input).toBeFocused({ timeout: 10_000 });
  await waitForStableGeometry(input);
  const refreshDelta = await input.evaluate(() => {
    const before = document.querySelector<HTMLElement>('.native-caret-overlay')?.getBoundingClientRect();
    document.dispatchEvent(new Event('vlaina:native-caret-overlay-refresh'));
    const after = document.querySelector<HTMLElement>('.native-caret-overlay')?.getBoundingClientRect();
    if (!before || !after) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(before.left - after.left), Math.abs(before.top - after.top));
  });
  expect(refreshDelta).toBeLessThanOrEqual(1.5);
}

async function closeWithEscape(page: Page) {
  await page.keyboard.press('Escape');
}

test('keeps native caret geometry current after animated note controls open', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('notes-native-caret-animations');

  try {
    await app.firstWindow();
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
      languagePreference: 'en',
    }));
    await openMarkdownFixture(page, {
      filename: 'native-caret-animations.md',
      content: '[Existing link target](https://example.com/original) trailing text.',
    });

    await page.locator('[data-app-view-mode-switch="true"] button[aria-label="Search"]:visible').click();
    const globalSearch = page.locator('[role="dialog"] input[aria-label="Search"]:visible');
    await expectCaretGeometryCurrent(globalSearch);
    await closeWithEscape(page);

    await page.evaluate(() => window.dispatchEvent(new Event('editor-find-open')));
    const noteFind = page.locator('input[placeholder="Find"]:visible');
    await expectCaretGeometryCurrent(noteFind);
    await closeWithEscape(page);

    const existingLink = page.locator(
      `${LIVE_EDITOR_SELECTOR} a[href="https://example.com/original"]`,
      { hasText: 'Existing link target' },
    ).first();
    await existingLink.hover();
    const tooltip = page.locator('.link-tooltip-container:not(.hidden)').first();
    await expect(tooltip.locator('.link-tooltip-viewer')).toBeVisible({ timeout: 10_000 });
    await tooltip.locator('.link-tooltip-action-btn').nth(1).click();
    const linkInput = tooltip.locator('textarea');
    await expect(linkInput).toBeFocused({ timeout: 5_000 });
    await page.keyboard.press('ArrowRight');
    await expectCaretGeometryCurrent(linkInput);
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});
