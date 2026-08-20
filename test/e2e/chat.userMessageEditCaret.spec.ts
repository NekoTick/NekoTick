import { expect, test } from '@playwright/test';
import {
  CHAT_MESSAGE_EDITOR_SELECTOR,
  CHAT_MESSAGE_SELECTOR,
  cleanupIsolatedElectron,
  createChatFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  setAppViewMode,
} from './notesE2E';

test.describe('chat user message edit caret', () => {
  test('keeps the visual caret aligned when typing during the edit animation', async ({}, testInfo) => {
    const { app, userDataRoot } = await launchIsolatedElectron(
      `chat-user-edit-caret-${testInfo.workerIndex}`,
    );

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await createChatFixture(page, {
        sessions: [{
          title: 'Edit caret fixture',
          messages: [{ role: 'user', content: '1234' }],
        }],
      });
      await setAppViewMode(page, 'chat');
      await expect(page.locator(CHAT_MESSAGE_SELECTOR)).toHaveCount(1, { timeout: 30_000 });
      await page.locator(CHAT_MESSAGE_SELECTOR).first().hover();

      const initial = await page.evaluate(async () => {
        const refreshOffsets: number[] = [];
        const relativeCaretLefts: number[] = [];
        (window as any).__vlainaEditCaretRefreshOffsets = refreshOffsets;
        (window as any).__vlainaEditCaretRelativeLefts = relativeCaretLefts;
        document.addEventListener('vlaina:native-caret-overlay-refresh', () => {
          const editor = document.querySelector<HTMLElement>('[data-chat-message-editor="true"]');
          if (!editor) return;

          const transform = window.getComputedStyle(editor).transform;
          refreshOffsets.push(transform === 'none' ? 0 : new DOMMatrix(transform).m41);
          const textarea = editor.querySelector<HTMLTextAreaElement>('textarea');
          const caret = document.querySelector<HTMLElement>('.native-caret-overlay');
          if (textarea && caret && document.activeElement === textarea) {
            const caretLeft = Number.parseFloat(caret.style.left);
            if (Number.isFinite(caretLeft)) {
              relativeCaretLefts.push(caretLeft - textarea.getBoundingClientRect().left);
            }
          }
        });
        document.querySelector<HTMLButtonElement>('[data-chat-message-action="edit"]')?.click();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const textarea = document.querySelector<HTMLTextAreaElement>(
          '[data-chat-message-editor="true"] textarea',
        );
        if (!textarea) return null;

        textarea.focus();
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        valueSetter?.call(textarea, '1234X');
        textarea.setSelectionRange(5, 5);
        textarea.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          data: 'X',
          inputType: 'insertText',
        }));

        return {
          selectionStart: textarea.selectionStart,
          transform: textarea.closest<HTMLElement>('[data-chat-message-editor="true"]')
            ?.style.transform ?? null,
          value: textarea.value,
        };
      });

      expect(initial).toMatchObject({
        selectionStart: 5,
        value: '1234X',
      });
      await expect(page.locator(CHAT_MESSAGE_EDITOR_SELECTOR)).toBeVisible();
      await expect.poll(() => page.evaluate(() => {
        const refreshOffsets = (window as any).__vlainaEditCaretRefreshOffsets as number[] | undefined;
        return refreshOffsets?.some((offset) => Math.abs(offset) <= 0.1) ?? false;
      }), { timeout: 10_000 }).toBe(true);
      await expect.poll(() => page.evaluate(() => {
        const refreshOffsets = (window as any).__vlainaEditCaretRefreshOffsets as number[] | undefined;
        return refreshOffsets?.some((offset) => offset > 0.1) ?? false;
      }), { timeout: 10_000 }).toBe(true);

      const metrics = await page.evaluate(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>(
          '[data-chat-message-editor="true"] textarea',
        );
        const caret = document.querySelector<HTMLElement>('.native-caret-overlay');
        if (!textarea || !caret) return null;

        const textareaRect = textarea.getBoundingClientRect();
        const style = window.getComputedStyle(textarea);
        const mirror = document.createElement('div');
        mirror.style.position = 'fixed';
        mirror.style.left = '0px';
        mirror.style.top = '0px';
        mirror.style.visibility = 'hidden';
        mirror.style.pointerEvents = 'none';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.overflowWrap = 'break-word';
        mirror.style.overflow = 'hidden';
        mirror.style.width = `${textareaRect.width}px`;
        for (const property of [
          'boxSizing',
          'borderTopWidth',
          'borderRightWidth',
          'borderBottomWidth',
          'borderLeftWidth',
          'paddingTop',
          'paddingRight',
          'paddingBottom',
          'paddingLeft',
          'fontFamily',
          'fontSize',
          'fontStyle',
          'fontVariant',
          'fontVariantNumeric',
          'fontWeight',
          'fontStretch',
          'letterSpacing',
          'lineHeight',
          'textTransform',
          'textIndent',
          'textAlign',
          'direction',
          'wordSpacing',
          'tabSize',
        ] as const) {
          mirror.style[property] = style[property];
        }
        mirror.textContent = textarea.value.slice(0, textarea.selectionStart ?? 0);
        const marker = document.createElement('span');
        marker.textContent = '\u200b';
        mirror.appendChild(marker);
        document.body.appendChild(mirror);
        const markerRect = marker.getBoundingClientRect();
        mirror.remove();

        return {
          actualLeft: Number.parseFloat(caret.style.left),
          expectedLeft: textareaRect.left + markerRect.left - textarea.scrollLeft,
          selectionEnd: textarea.selectionEnd,
          selectionStart: textarea.selectionStart,
          relativeCaretLefts: (window as any).__vlainaEditCaretRelativeLefts as number[] | undefined,
          transform: textarea.closest<HTMLElement>('[data-chat-message-editor="true"]')
            ?.style.transform ?? null,
          transformOffset: (() => {
            const transform = textarea.closest<HTMLElement>('[data-chat-message-editor="true"]')
              ?.style.transform ?? 'none';
            return transform === 'none' ? 0 : new DOMMatrix(transform).m41;
          })(),
          value: textarea.value,
        };
      });

      expect(metrics).not.toBeNull();
      expect(metrics).toMatchObject({
        selectionEnd: 5,
        selectionStart: 5,
        value: '1234X',
      });
      expect(Math.abs(metrics!.transformOffset)).toBeLessThanOrEqual(0.1);
      expect(metrics!.relativeCaretLefts?.length ?? 0).toBeGreaterThan(1);
      expect(
        Math.max(...metrics!.relativeCaretLefts!) - Math.min(...metrics!.relativeCaretLefts!),
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(metrics!.actualLeft - metrics!.expectedLeft)).toBeLessThanOrEqual(1);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
