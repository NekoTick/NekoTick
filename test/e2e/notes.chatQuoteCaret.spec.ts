import { expect, test, type Page } from '@playwright/test';
import {
  CHAT_COMPOSER_TEXTAREA_SELECTOR,
  cleanupIsolatedElectron,
  createChatModelFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  selectNoteBlocksByText,
} from './notesE2E';

const QUOTED_LINES = [
  '\u516c\u5f0f\u7f16\u8f91\u5668\uff0cword\u516c\u5f0f\u7f16\u8f91\u5668\u90a3\u79cd\u3002',
  '\u6eda\u9f20\u6807\u4e00\u62bd\u4e00\u62bd\u7684\u3002',
  '\u63d2\u5165\u4f8b\u5982\u6d41\u7a0b\u56fe\u7b49\u529f\u80fd\u524d\u7f00\u7684\u5feb\u6377\u64cd\u4f5c\u3002',
  '\u6362\u884c\u6574\u5728\u53f3\u952e\u4e5f\u884c\u3002Mermaid \u5728\u7ebf\u7f16\u8f91\u3002',
  '\u5f39\u51fa\u7684\u5c0f\u5f39\u7a97\u6700\u597d\u3002\u8f6c\u6362\u4e3a',
];
const QUOTED_TEXT = QUOTED_LINES.join('\n\n');

async function openChatAndCollectCaretSamples(page: Page) {
  return page.evaluate(async ({ inputSelector, quotedText }) => {
    const samples: Array<{
      caretLeft: number;
      expectedLeft: number;
      panelOffset: number;
      selectionEnd: number | null;
      selectionStart: number | null;
    }> = [];
    let stableFrames = 0;

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'l',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));

    for (let frame = 0; frame < 180 && stableFrames < 3; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const panel = document.querySelector<HTMLElement>('[data-notes-chat-floating="true"]');
      const textarea = Array.from(document.querySelectorAll<HTMLTextAreaElement>(inputSelector))
        .find((element) => element.getClientRects().length > 0 && !element.closest('[inert]')) ?? null;
      const caret = document.querySelector<HTMLElement>('.native-caret-overlay');
      if (!panel || !textarea || !caret || textarea.value !== quotedText) continue;

      const panelTransform = getComputedStyle(panel).transform;
      const panelOffset = panelTransform === 'none' ? 0 : new DOMMatrixReadOnly(panelTransform).m41;
      stableFrames = Math.abs(panelOffset) <= 0.05 ? stableFrames + 1 : 0;

      const textareaRect = textarea.getBoundingClientRect();
      const styles = getComputedStyle(textarea);
      const mirror = document.createElement('div');
      const copiedProperties = [
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
      ] as const;
      for (const property of copiedProperties) {
        mirror.style[property] = styles[property];
      }
      mirror.style.position = 'fixed';
      mirror.style.visibility = 'hidden';
      mirror.style.pointerEvents = 'none';
      mirror.style.whiteSpace = 'pre-wrap';
      mirror.style.overflowWrap = 'break-word';
      mirror.style.overflow = 'hidden';
      mirror.style.width = `${textareaRect.width}px`;
      mirror.style.left = '0px';
      mirror.style.top = '0px';

      const text = document.createTextNode(textarea.value);
      mirror.appendChild(text);
      document.body.appendChild(mirror);
      const expectedRange = document.createRange();
      expectedRange.setStart(text, text.length);
      expectedRange.collapse(true);
      const expectedRect = expectedRange.getBoundingClientRect();
      mirror.remove();

      samples.push({
        caretLeft: caret.getBoundingClientRect().left,
        expectedLeft: textareaRect.left + expectedRect.left - textarea.scrollLeft,
        panelOffset,
        selectionEnd: textarea.selectionEnd,
        selectionStart: textarea.selectionStart,
      });
    }

    return samples;
  }, { inputSelector: CHAT_COMPOSER_TEXTAREA_SELECTOR, quotedText: QUOTED_TEXT });
}

test.describe('notes chat quote caret', () => {
  test.setTimeout(120_000);

  test('keeps the floating composer caret after the quoted selection', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-chat-quote-caret');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await createChatModelFixture(page);
      await openMarkdownFixture(page, {
        filename: 'chat-quote-caret.md',
        content: QUOTED_TEXT,
      });

      expect(await selectNoteBlocksByText(page, QUOTED_LINES)).toBe(QUOTED_LINES.length);

      const samples = await openChatAndCollectCaretSamples(page);

      const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR).first();
      await expect(textarea).toBeVisible({ timeout: 30_000 });
      await expect(textarea).toHaveValue(QUOTED_TEXT, { timeout: 30_000 });
      expect(samples.length).toBeGreaterThan(3);
      expect(samples[samples.length - 1]).toMatchObject({
        selectionEnd: QUOTED_TEXT.length,
        selectionStart: QUOTED_TEXT.length,
      });
      const maxCaretDelta = Math.max(...samples.map((sample) => (
        Math.abs(sample.caretLeft - sample.expectedLeft)
      )));
      expect(maxCaretDelta, JSON.stringify(samples, null, 2)).toBeLessThanOrEqual(2);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
