import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTextEditorPopupElements,
  mountTextEditorPopup,
  resizeTextEditorPopupTextareaToContent,
} from './textEditorPopupDom';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';

function stubPopupGeometry(args: {
  card: HTMLElement;
  textarea: HTMLTextAreaElement;
  cardTop: number;
  cardHeight: number;
  textareaHeight: number;
  scrollHeight: number;
}) {
  const { card, textarea, cardTop, cardHeight, textareaHeight, scrollHeight } = args;

  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    right: 600,
    top: cardTop,
    bottom: cardTop + cardHeight,
    width: 600,
    height: cardHeight,
    x: 0,
    y: cardTop,
    toJSON: () => ({}),
  });
  vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({
    left: 16,
    right: 584,
    top: cardTop + 16,
    bottom: cardTop + 16 + textareaHeight,
    width: 568,
    height: textareaHeight,
    x: 16,
    y: cardTop + 16,
    toJSON: () => ({}),
  });
  Object.defineProperty(textarea, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  });
}

describe('textEditorPopupDom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fits the textarea height to content when the popup can fit in the viewport', () => {
    vi.stubGlobal('innerHeight', 500);
    const { card, textarea } = createTextEditorPopupElements();
    stubPopupGeometry({
      card,
      textarea,
      cardTop: 100,
      cardHeight: 190,
      textareaHeight: 100,
      scrollHeight: 160,
    });

    resizeTextEditorPopupTextareaToContent({ card, textarea });

    expect(textarea.style.height).toBe('160px');
    expect(textarea.style.overflowY).toBe('hidden');
  });

  it('uses the shared composer pill surface for formula and diagram popups', () => {
    const { card, textarea } = createTextEditorPopupElements();

    expect(card.className).toContain('!rounded-[var(--vlaina-notes-ui-radius-panel)]');
    expect(card.className).toContain(raisedPillSurfaceClass);
    expect(card.getAttribute('data-no-editor-drag-box')).toBe('true');
    expect(textarea).toHaveAttribute('data-native-caret-overlay-disabled', 'true');
  });

  it('constrains the textarea and lets it scroll when content would exceed the viewport', () => {
    vi.stubGlobal('innerHeight', 500);
    const { card, textarea } = createTextEditorPopupElements();
    stubPopupGeometry({
      card,
      textarea,
      cardTop: 100,
      cardHeight: 190,
      textareaHeight: 100,
      scrollHeight: 400,
    });

    resizeTextEditorPopupTextareaToContent({ card, textarea });

    expect(textarea.style.height).toBe('298px');
    expect(textarea.style.overflowY).toBe('auto');
  });

  it('can leave long textareas unconstrained for HTML block editing', () => {
    vi.stubGlobal('innerHeight', 500);
    const { card, textarea } = createTextEditorPopupElements();
    stubPopupGeometry({
      card,
      textarea,
      cardTop: 100,
      cardHeight: 190,
      textareaHeight: 100,
      scrollHeight: 400,
    });

    resizeTextEditorPopupTextareaToContent({
      card,
      textarea,
      constrainToViewport: false,
    });

    expect(textarea.style.height).toBe('400px');
    expect(textarea.style.overflowY).toBe('hidden');
  });

  it('keeps handled popup keyboard shortcuts from bubbling to the editor', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onCancel = vi.fn();
    const onSave = vi.fn();
    const outerKeydown = vi.fn();
    container.addEventListener('keydown', outerKeydown);

    const { textarea } = mountTextEditorPopup({
      container,
      value: 'draft',
      onInput: vi.fn(),
      onCancel,
      onSave,
    });

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(escapeEvent);

    const saveEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(saveEvent);

    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(saveEvent.defaultPrevented).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(outerKeydown).not.toHaveBeenCalled();
  });

  it('ignores unmarked shortcuts while a text composition session is active', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onCancel = vi.fn();
    const onSave = vi.fn();
    const { textarea } = mountTextEditorPopup({
      container,
      value: 'draft',
      onInput: vi.fn(),
      onCancel,
      onSave,
    });

    textarea.dispatchEvent(new CompositionEvent('compositionstart'));
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('defers the initial textarea resize when a resize scheduler is provided', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onResizeRequest = vi.fn();

    const { textarea } = mountTextEditorPopup({
      container,
      value: 'draft',
      onInput: vi.fn(),
      onResizeRequest,
      onCancel: vi.fn(),
      onSave: vi.fn(),
    });

    expect(onResizeRequest).toHaveBeenCalledTimes(1);
    expect(textarea.style.height).toBe('');
  });

  it('blocks image clipboard companion text in Mermaid, math, and HTML text popups', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { textarea } = mountTextEditorPopup({
      container,
      value: 'draft',
      onInput: vi.fn(),
      onCancel: vi.fn(),
      onSave: vi.fn(),
    });
    const file = new File(['image'], 'popup.png', { type: 'image/png' });
    const imageEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(imageEvent, 'clipboardData', {
      value: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
        getData: () => 'https://example.test/companion',
      },
    });
    const textEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(textEvent, 'clipboardData', {
      value: {
        items: [],
        files: [],
        getData: () => 'ordinary text',
      },
    });

    textarea.dispatchEvent(imageEvent);
    textarea.dispatchEvent(textEvent);

    expect(imageEvent.defaultPrevented).toBe(true);
    expect(textEvent.defaultPrevented).toBe(false);
    expect(textarea.value).toBe('draft');

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dropEvent, 'dataTransfer', { value: imageEvent.clipboardData });
    textarea.dispatchEvent(dropEvent);
    expect(dropEvent.defaultPrevented).toBe(true);
  });
});
