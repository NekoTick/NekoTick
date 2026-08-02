import { expect, test } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  createChatFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

type ResizeHandleRect = {
  left: number;
  right: number;
  width: number;
};

type DockedChatResizeMetrics = {
  sidebarHandle: ResizeHandleRect;
  chatHandle: ResizeHandleRect;
  gap: number;
  notesView: ResizeHandleRect;
  panel: ResizeHandleRect;
  viewportWidth: number;
};

test.describe('notes docked chat resize', () => {
  test('keeps docked chat resizing intact and animates collapse to the right', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-docked-chat-resize-safe-gap');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1024, height: 760 });
      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        languagePreference: 'en',
        sidebarWidth: 400,
        notesChatPanelCollapsed: true,
      }));
      await createChatFixture(page, {
        sessions: [
          {
            title: 'Docked Resize Chat',
            messages: [
              { role: 'user', content: 'Keep the docked chat open.' },
              { role: 'assistant', content: 'Docked resize sentinel.' },
            ],
          },
        ],
      });
      await openMarkdownFixture(page, {
        filename: 'docked-chat-resize.md',
        content: '# Docked Chat Resize\n\nResize the docked AI panel.',
      });
      await page.evaluate(() => {
        window.localStorage.setItem('vlaina_notes_chat_panel_width_v2', '760');
      });
      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        sidebarWidth: 400,
        notesChatPanelCollapsed: false,
      }));
      await expect(page.locator('[data-notes-chat-panel="true"]')).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => page.evaluate(() => {
        const motionPanel = document.querySelector<HTMLElement>('[data-notes-chat-panel-motion="true"]');
        if (!motionPanel) return false;
        const transform = new DOMMatrixReadOnly(getComputedStyle(motionPanel).transform);
        return Math.abs(transform.m41) < 1;
      })).toBe(true);

      const metrics = await page.evaluate((): DockedChatResizeMetrics => {
        const panel = document.querySelector<HTMLElement>('[data-notes-chat-panel="true"]')?.parentElement;
        const notesView = document.querySelector<HTMLElement>('[data-notes-view-mode="true"]');
        const handles = Array
          .from(document.querySelectorAll<HTMLElement>('.cursor-col-resize'))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return { element, rect };
          })
          .filter(({ rect }) => rect.width > 0 && rect.height > 0)
          .sort((left, right) => left.rect.left - right.rect.left);

        if (!panel || !notesView || handles.length < 2) {
          throw new Error('Docked chat resize elements were not rendered');
        }

        const readRect = (element: Element): ResizeHandleRect => {
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
          };
        };

        const sidebarHandle = handles[0]!.element;
        const chatHandle = handles[handles.length - 1]!.element;
        const start = chatHandle.getBoundingClientRect();
        const targetX = 300;

        chatHandle.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          clientX: start.left + start.width / 2,
          clientY: start.top + start.height / 2,
        }));
        document.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          clientX: targetX,
          clientY: start.top + start.height / 2,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 0,
          clientX: targetX,
          clientY: start.top + start.height / 2,
        }));

        const sidebarRect = readRect(sidebarHandle);
        const chatRect = readRect(chatHandle);

        return {
          sidebarHandle: sidebarRect,
          chatHandle: chatRect,
          gap: chatRect.left - sidebarRect.right,
          notesView: readRect(notesView),
          panel: readRect(panel),
          viewportWidth: window.innerWidth,
        };
      });

      expect(metrics.viewportWidth).toBe(1024);
      expect(metrics.notesView.left).toBeGreaterThanOrEqual(399);
      expect(metrics.chatHandle.left).toBeGreaterThan(metrics.sidebarHandle.right);
      expect(metrics.gap).toBeGreaterThanOrEqual(22);
      expect(metrics.panel.left).toBeGreaterThanOrEqual(metrics.notesView.left + 32);

      const beforeSecondDrag = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('[data-notes-chat-panel="true"]')?.parentElement;
        const handles = Array
          .from(document.querySelectorAll<HTMLElement>('.cursor-col-resize'))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
          })
          .filter((rect) => rect.width > 0)
          .sort((left, right) => left.left - right.left);
        const chatHandle = handles[handles.length - 1];
        if (!panel || !chatHandle) {
          throw new Error('Docked chat handle was not available for the second drag');
        }
        const panelRect = panel.getBoundingClientRect();
        return {
          sidebarWidth: (window as any).__vlainaE2E.getUIState().sidebarWidth,
          panelWidth: panelRect.width,
          chatHandle,
        };
      });

      await page.mouse.move(
        (beforeSecondDrag.chatHandle.left + beforeSecondDrag.chatHandle.right) / 2,
        (beforeSecondDrag.chatHandle.top + beforeSecondDrag.chatHandle.bottom) / 2,
      );
      await page.mouse.down();
      await page.mouse.move(beforeSecondDrag.chatHandle.right + 80, beforeSecondDrag.chatHandle.top + 20);
      await page.mouse.up();

      const afterSecondDrag = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('[data-notes-chat-panel="true"]')?.parentElement;
        if (!panel) {
          throw new Error('Docked chat panel was not available after the second drag');
        }
        const panelRect = panel.getBoundingClientRect();
        return {
          sidebarWidth: (window as any).__vlainaE2E.getUIState().sidebarWidth,
          panelWidth: panelRect.width,
        };
      });

      expect(afterSecondDrag.sidebarWidth).toBe(beforeSecondDrag.sidebarWidth);
      expect(afterSecondDrag.panelWidth).toBeLessThan(beforeSecondDrag.panelWidth);

      const collapseSamples = await page
        .locator('[data-notes-chat-panel="true"] [aria-label="Close Chat panel"]')
        .evaluate(async (button) => {
          const motionPanel = document.querySelector<HTMLElement>('[data-notes-chat-panel-motion="true"]');
          const content = document.querySelector<HTMLElement>('[data-notes-split-drop-root="true"]');
          if (!motionPanel || !content) {
            throw new Error('Docked chat collapse elements were not rendered');
          }

          let previousFrameTime = performance.now();
          const capture = () => {
            const now = performance.now();
            const motionRect = motionPanel.getBoundingClientRect();
            const sample = {
              connected: motionPanel.isConnected,
              panelWidth: motionRect.width,
              translateX: motionPanel.isConnected
                ? new DOMMatrixReadOnly(getComputedStyle(motionPanel).transform).m41
                : null,
              contentWidth: content.getBoundingClientRect().width,
              inert: motionPanel.inert,
              chatViewCount: document.querySelectorAll(
                '[data-notes-view-mode="true"] [data-chat-view-mode="embedded"]',
              ).length,
              frameGap: now - previousFrameTime,
            };
            previousFrameTime = now;
            return sample;
          };

          const samples = [capture()];
          button.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
          }));
          for (let frame = 0; frame < 24; frame += 1) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            samples.push(capture());
          }
          return samples;
        });

      const initialCollapseSample = collapseSamples[0]!;
      expect(new Set(collapseSamples.map(({ contentWidth }) => Math.round(contentWidth))).size)
        .toBeLessThanOrEqual(2);
      expect(collapseSamples.some(({ connected, translateX }) =>
        connected
        && translateX !== null
        && translateX > 1
        && translateX < initialCollapseSample.panelWidth - 1
      )).toBe(true);
      expect(collapseSamples.every(({ chatViewCount }) => chatViewCount === 1)).toBe(true);
      expect(collapseSamples
        .filter(({ connected, translateX }) => connected && translateX !== null && translateX > 1)
        .every(({ inert }) => inert)).toBe(true);
      expect(Math.max(...collapseSamples.slice(1).map(({ frameGap }) => frameGap))).toBeLessThan(100);
      await expect(page.locator('[data-notes-chat-panel-motion="true"]')).toHaveCount(0);

      const floatingOpenSamples = await page.getByRole('button', { name: 'Right Chat' }).first()
        .evaluate(async (button) => {
          const capture = () => {
            const panel = document.querySelector<HTMLElement>('[data-notes-chat-floating="true"]');
            return {
              connected: Boolean(panel),
              panelWidth: panel?.getBoundingClientRect().width ?? null,
              translateX: panel
                ? new DOMMatrixReadOnly(getComputedStyle(panel).transform).m41
                : null,
            };
          };

          const samples = [capture()];
          button.click();
          for (let frame = 0; frame < 24; frame += 1) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            samples.push(capture());
          }
          return samples;
        });

      expect(floatingOpenSamples[0]?.connected).toBe(false);
      expect(floatingOpenSamples.some(({ connected, panelWidth, translateX }) =>
        connected
        && panelWidth !== null
        && translateX !== null
        && translateX > 1
        && translateX < panelWidth - 1
      )).toBe(true);
      const floatingChat = page.locator('[data-notes-chat-floating="true"]');
      await expect(floatingChat).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => floatingChat.evaluate((element) =>
        new DOMMatrixReadOnly(getComputedStyle(element).transform).m41
      )).toBeLessThan(1);

      const floatingCloseSamples = await floatingChat
        .getByRole('button', { name: 'Close Chat panel' })
        .evaluate(async (button) => {
          const panel = button.closest<HTMLElement>('[data-notes-chat-floating="true"]');
          if (!panel) throw new Error('Floating chat panel was not rendered');

          const capture = () => ({
            connected: panel.isConnected,
            panelWidth: panel.getBoundingClientRect().width,
            translateX: new DOMMatrixReadOnly(getComputedStyle(panel).transform).m41,
            inert: panel.inert,
            chatViewCount: document.querySelectorAll(
              '[data-notes-view-mode="true"] [data-chat-view-mode="embedded"]',
            ).length,
          });

          const samples = [capture()];
          button.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
          }));
          for (let frame = 0; frame < 24; frame += 1) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            samples.push(capture());
          }
          return samples;
        });

      expect(floatingCloseSamples.some(({ translateX, panelWidth }) =>
        translateX > 1 && translateX < panelWidth - 1
      )).toBe(true);
      expect(floatingCloseSamples.slice(1).every(({ connected, inert }) => !connected || inert)).toBe(true);
      expect(floatingCloseSamples.every(({ chatViewCount }) => chatViewCount === 1)).toBe(true);
      await expect(floatingChat).toHaveCount(0);

      await page.getByRole('button', { name: 'Right Chat' }).first().click();
      await expect(floatingChat).toBeVisible({ timeout: 30_000 });
      const expandSamples = await floatingChat
        .getByRole('button', { name: 'Right Chat' })
        .evaluate(async (button) => {
          const content = document.querySelector<HTMLElement>('[data-notes-split-drop-root="true"]');
          if (!content) throw new Error('Notes content was not rendered');

          const capture = () => {
            const motionPanel = document.querySelector<HTMLElement>('[data-notes-chat-panel-motion="true"]');
            const motionRect = motionPanel?.getBoundingClientRect() ?? null;
            return {
              connected: Boolean(motionPanel),
              panelWidth: motionRect?.width ?? null,
              translateX: motionPanel
                ? new DOMMatrixReadOnly(getComputedStyle(motionPanel).transform).m41
                : null,
              contentWidth: content.getBoundingClientRect().width,
            };
          };

          const samples = [capture()];
          button.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
          }));
          for (let frame = 0; frame < 24; frame += 1) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            samples.push(capture());
          }
          return samples;
        });

      expect(expandSamples[0]?.connected).toBe(false);
      expect(new Set(expandSamples.map(({ contentWidth }) => Math.round(contentWidth))).size)
        .toBeLessThanOrEqual(2);
      expect(expandSamples.some(({ connected, panelWidth, translateX }) =>
        connected
        && panelWidth !== null
        && translateX !== null
        && translateX > 1
        && translateX < panelWidth - 1
      )).toBe(true);
      await expect(page.locator('[data-notes-chat-panel-motion="true"]')).toBeVisible();
      await expect.poll(() => page.locator('[data-notes-chat-panel-motion="true"]').evaluate((element) =>
        new DOMMatrixReadOnly(getComputedStyle(element).transform).m41
      )).toBeLessThan(1);
      await expect(floatingChat).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
