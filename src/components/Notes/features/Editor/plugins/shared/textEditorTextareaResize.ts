import {
  resizeTextEditorPopupTextareaToContent,
  TEXT_EDITOR_POPUP_CARD_SELECTOR,
} from './textEditorPopupDom';

export function createTextEditorTextareaResizeController(args: {
  getEditorElement: () => HTMLElement | null;
  getTextarea: () => HTMLTextAreaElement | null;
  constrainToViewport: boolean;
  idleDelayMs?: number;
}) {
  let textareaResizeFrame: number | null = null;
  let textareaResizeTimer: number | null = null;

  const resizeToContent = () => {
    const editorElement = args.getEditorElement();
    const textarea = args.getTextarea();
    if (!editorElement || !textarea) {
      return;
    }

    const card = editorElement.querySelector(TEXT_EDITOR_POPUP_CARD_SELECTOR);
    if (card instanceof HTMLElement) {
      resizeTextEditorPopupTextareaToContent({
        card,
        textarea,
        constrainToViewport: args.constrainToViewport,
      });
    }
  };

  const clear = () => {
    if (textareaResizeTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(textareaResizeTimer);
    }
    textareaResizeTimer = null;
    if (textareaResizeFrame !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(textareaResizeFrame);
    }
    textareaResizeFrame = null;
  };

  const scheduleFrame = () => {
    if (typeof window === 'undefined') {
      resizeToContent();
      return;
    }

    if (textareaResizeFrame !== null) {
      return;
    }

    textareaResizeFrame = window.requestAnimationFrame(() => {
      textareaResizeFrame = null;
      resizeToContent();
    });
  };

  const schedule = () => {
    if (!args.idleDelayMs || args.idleDelayMs <= 0 || typeof window === 'undefined') {
      scheduleFrame();
      return;
    }
    if (textareaResizeTimer !== null) {
      window.clearTimeout(textareaResizeTimer);
    }
    textareaResizeTimer = window.setTimeout(() => {
      textareaResizeTimer = null;
      scheduleFrame();
    }, args.idleDelayMs);
  };

  return { clear, resizeToContent, schedule };
}
