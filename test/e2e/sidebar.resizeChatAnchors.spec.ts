import { expect, test } from '@playwright/test';
import {
  CHAT_VIEW_SELECTOR,
  cleanupIsolatedElectron,
  createChatFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  setAppViewMode,
  waitForChatSession,
} from './notesE2E';

test('keeps the Chat outline visible during bidirectional sidebar resizing', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('sidebar-resize-chat-anchors');

  try {
    await app.firstWindow();
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 945, height: 1036 });

    const fixture = await createChatFixture(page, {
      sessions: [{
        title: 'Sidebar resize Chat outline',
        messages: Array.from({ length: 240 }, (_, index) => ({
          role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
          content: index % 2 === 0
            ? `Chat resize outline message ${index + 1} ${'long prompt content '.repeat(60)}`
            : `Chat resize outline response ${index + 1}`,
        })),
      }],
    });
    const chatOpenStartedAt = Date.now();
    await setAppViewMode(page, 'chat');
    await waitForChatSession(page, {
      sessionId: fixture.sessionIds[0]!,
      minMessageCount: 240,
    });
    await expect(page.locator(CHAT_VIEW_SELECTOR)).toBeVisible();

    const resizeHandle = page.locator('[data-resize-handle="shell-sidebar"]').first();
    const sidebar = page.locator('[data-shell-sidebar-width-scope="true"] aside').first();
    const outline = page.locator('[data-chat-message-outline="true"]').first();
    const composer = page.locator('[data-chat-input="true"] textarea').first();
    await expect(outline).toBeVisible();
    await composer.fill('Sidebar resize caret');
    await composer.evaluate((element) => {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
      document.dispatchEvent(new Event('vlaina:native-caret-overlay-refresh'));
    });
    await expect(page.locator('.native-caret-overlay')).toBeVisible();
    const outlineLoadMs = Date.now() - chatOpenStartedAt;
    const renderedOutlineRows = await outline.locator('.chat-message-outline-row').count();
    expect(outlineLoadMs).toBeLessThan(5_000);
    expect(renderedOutlineRows).toBeGreaterThan(0);
    expect(renderedOutlineRows).toBeLessThan(120);
    await expect(outline.locator('[data-chat-message-outline-virtual-list="true"]')).toBeVisible();
    const outlineScrollAreaHeight = await outline.locator('.chat-message-outline-scroll-area')
      .evaluate((element) => element.clientHeight);
    expect(outlineScrollAreaHeight).toBeLessThanOrEqual(420);
    const startSidebarWidth = await sidebar.evaluate((element) => (
      element.getBoundingClientRect().width
    ));
    const startOutlineRight = await outline.evaluate((element) => (
      element.getBoundingClientRect().right
    ));
    const dragDistance = 180;

    const dragAndRead = async (deltaX: number) => {
      const handleBox = await resizeHandle.boundingBox();
      expect(handleBox).not.toBeNull();
      const startX = handleBox!.x + handleBox!.width / 2;
      const startY = handleBox!.y + handleBox!.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      for (let step = 1; step <= 15; step += 1) {
        await page.mouse.move(startX + deltaX * step / 15, startY);
        await page.evaluate(() => new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        }));
      }

      return outline.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const paintedElements = document.elementsFromPoint(
          rect.right - 4,
          rect.top + rect.height / 2,
        );
        return {
          caretOverlayPresent: document.querySelector('.native-caret-overlay') !== null,
          composerFocused: document.activeElement === document.querySelector(
            '[data-chat-input="true"] textarea',
          ),
          layoutPanelDragging: document.documentElement.getAttribute(
            'data-layout-panel-dragging',
          ),
          painted: paintedElements.some((candidate) => (
            candidate === element || element.contains(candidate)
          )),
          position: getComputedStyle(element).position,
          right: rect.right,
        };
      });
    };

    const rightDragMetrics = await dragAndRead(dragDistance);
    expect(rightDragMetrics.caretOverlayPresent).toBe(false);
    expect(rightDragMetrics.composerFocused).toBe(true);
    expect(rightDragMetrics.layoutPanelDragging).toBe('true');
    expect(rightDragMetrics.painted).toBe(true);
    expect(rightDragMetrics.position).toBe('fixed');
    expect(rightDragMetrics.right).toBeCloseTo(startOutlineRight, 0);
    await page.mouse.up();
    await expect.poll(() => sidebar.evaluate((element) => (
      element.getBoundingClientRect().width
    ))).toBeCloseTo(startSidebarWidth + dragDistance, 0);
    await expect(page.locator('.native-caret-overlay')).toBeVisible();
    await expect(composer).toBeFocused();

    const leftDragMetrics = await dragAndRead(-dragDistance);
    expect(leftDragMetrics.caretOverlayPresent).toBe(false);
    expect(leftDragMetrics.composerFocused).toBe(true);
    expect(leftDragMetrics.layoutPanelDragging).toBe('true');
    expect(leftDragMetrics.painted).toBe(true);
    expect(leftDragMetrics.position).toBe('fixed');
    expect(leftDragMetrics.right).toBeCloseTo(startOutlineRight, 0);
    await page.mouse.up();
    await expect.poll(() => sidebar.evaluate((element) => (
      element.getBoundingClientRect().width
    ))).toBeCloseTo(startSidebarWidth, 0);
    await expect.poll(() => outline.evaluate((element) => (
      getComputedStyle(element).position
    ))).toBe('absolute');
    await expect(page.locator('.native-caret-overlay')).toBeVisible();
    await expect(composer).toBeFocused();
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});
