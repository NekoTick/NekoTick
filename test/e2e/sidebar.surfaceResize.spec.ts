import { expect, test } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  getOpenBridgePages,
  installReferenceTyporaTheme,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

test.describe('sidebar surface resize', () => {
  test('repaints the full Notes sidebar after a native height increase', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('sidebar-surface-height-resize');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await openMarkdownFixture(page, {
        filename: 'sidebar-surface-height-resize.md',
        content: '# Sidebar resize\n\nThe sidebar surface should reach the window bottom.',
      });
      const importedTheme = await installReferenceTyporaTheme(page, 'phycat-sky.css');
      expect(importedTheme.skipped).not.toBe(true);

      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(929, 600);
      });
      await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(600);

      const sidebar = page.locator('[data-shell-sidebar-width-scope="true"] aside').first();
      await page.locator('.sidebar-user-header').hover();
      await page.locator('.sidebar-user-header-collapse').click();
      await expect(sidebar).toHaveAttribute('data-shell-sidebar-peek', 'true');
      await expect(sidebar).toHaveAttribute('data-open', 'false');
      await page.getByRole('button', { name: /Toggle sidebar|切换侧边栏/i }).click();
      await expect(sidebar).toHaveAttribute('data-shell-sidebar-docked', 'true');

      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(929, 1029);
      });
      await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(1029);
      await page.evaluate(async () => {
        for (let frame = 0; frame < 4; frame += 1) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      });

      const geometry = await page.evaluate(() => {
        const selectors = [
          '[data-shell-sidebar-layout="true"]',
          'aside[data-shell-sidebar-docked="true"]',
          '[data-sidebar-surface="true"]',
          '[data-sidebar-capsule-panel="true"]',
        ];
        return {
          innerHeight: window.innerHeight,
          rects: selectors.map((selector) => {
            const element = Array.from(document.querySelectorAll<HTMLElement>(selector))
              .find((candidate) => candidate.getBoundingClientRect().height > 0);
            const rect = element?.getBoundingClientRect();
            return {
              selector,
              bottom: rect?.bottom ?? null,
              top: rect?.top ?? null,
            };
          }),
        };
      });

      for (const rect of geometry.rects) {
        expect(rect.bottom, rect.selector).not.toBeNull();
        const expectedBottom = rect.selector.includes('capsule')
          ? geometry.innerHeight - 8
          : geometry.innerHeight;
        expect(rect.bottom, rect.selector).toBeCloseTo(expectedBottom, 0);
      }

      const bottomPixel = await app.evaluate(async ({ BrowserWindow }) => {
        const browserWindow = BrowserWindow.getAllWindows()[0];
        if (!browserWindow) return null;
        const image = await browserWindow.webContents.capturePage();
        const { width, height } = image.getSize();
        const bitmap = image.toBitmap();
        const x = Math.round(width * 0.15);
        const y = height - 20;
        const offset = (y * width + x) * 4;
        return Array.from(bitmap.subarray(offset, offset + 4));
      });

      expect(bottomPixel).not.toBeNull();
      expect(Math.min(...bottomPixel!.slice(0, 3))).toBeGreaterThan(180);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('repaints large chat panels after a native height increase', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-panel-height-resize');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        languagePreference: 'en',
        notesChatPanelCollapsed: false,
      }));
      await openMarkdownFixture(page, {
        filename: 'chat-panel-height-resize.md',
        content: '# Chat panel resize\n\nLarge chat panels should repaint after resizing.',
      });
      const dockedPanel = page.locator('[data-notes-chat-panel="true"]');
      await expect(dockedPanel).toBeVisible({ timeout: 30_000 });

      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(929, 600);
      });
      await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(600);
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(929, 1029);
      });
      await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(1029);
      await page.evaluate(async () => {
        for (let frame = 0; frame < 4; frame += 1) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      });

      const dockedGeometry = await page.evaluate(() => {
        const motionPanel = document.querySelector<HTMLElement>('[data-notes-chat-panel-motion="true"]');
        const chatPanel = document.querySelector<HTMLElement>('[data-notes-chat-panel="true"]');
        return {
          innerHeight: window.innerHeight,
          motionBottom: motionPanel?.getBoundingClientRect().bottom ?? null,
          panelBottom: chatPanel?.getBoundingClientRect().bottom ?? null,
        };
      });
      expect(dockedGeometry.motionBottom).toBeCloseTo(dockedGeometry.innerHeight, 0);
      expect(dockedGeometry.panelBottom).toBeCloseTo(dockedGeometry.innerHeight, 0);

      const dockedBottomPixel = await app.evaluate(async ({ BrowserWindow }) => {
        const browserWindow = BrowserWindow.getAllWindows()[0];
        if (!browserWindow) return null;
        const image = await browserWindow.webContents.capturePage();
        const { width, height } = image.getSize();
        const bitmap = image.toBitmap();
        const offset = ((height - 20) * width + (width - 160)) * 4;
        return Array.from(bitmap.subarray(offset, offset + 4));
      });
      expect(dockedBottomPixel).not.toBeNull();
      expect(Math.min(...dockedBottomPixel!.slice(0, 3))).toBeGreaterThan(180);

      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        notesChatPanelCollapsed: true,
      }));
      await expect(dockedPanel).toHaveCount(0, { timeout: 10_000 });
      const editor = page.locator('.milkdown .ProseMirror[contenteditable="true"]');
      await editor.click();
      await page.keyboard.press('Control+L');
      const floatingPanel = page.locator('[data-notes-chat-floating="true"]');
      await expect(floatingPanel).toBeVisible({ timeout: 10_000 });
      await expect(floatingPanel).not.toHaveClass(/transform-gpu|will-change-transform/);

      await floatingPanel.getByRole('button', { name: 'Open Chat sidebar' }).click();
      const embeddedSidebar = floatingPanel.getByRole('dialog', { name: 'Chat' });
      await expect(embeddedSidebar).toBeVisible({ timeout: 10_000 });
      await expect(embeddedSidebar).not.toHaveClass(/transform-gpu|will-change-transform/);
      const floatingGeometry = await floatingPanel.evaluate((element) => {
        const panelRect = element.getBoundingClientRect();
        const dialogRect = element.querySelector<HTMLElement>('[role="dialog"]')?.getBoundingClientRect();
        return {
          dialogBottom: dialogRect?.bottom ?? null,
          panelBottom: panelRect.bottom,
          viewportBottom: window.innerHeight,
        };
      });
      expect(floatingGeometry.panelBottom).toBeLessThan(floatingGeometry.viewportBottom);
      expect(Math.abs(floatingGeometry.dialogBottom! - floatingGeometry.panelBottom)).toBeLessThanOrEqual(1);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
