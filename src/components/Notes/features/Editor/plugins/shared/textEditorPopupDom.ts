import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { translate } from '@/lib/i18n';
import { themeTextAreaTokens } from '@/styles/themeTokens';
import {
  preventImageClipboardTextPaste,
  preventImageDataTransferTextDrop,
} from '@/lib/clipboardImagePayload';

export interface TextEditorPopupElements {
  card: HTMLElement;
  content: HTMLElement;
  textarea: HTMLTextAreaElement;
  actions: HTMLElement;
  cancelButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
}

export interface MountTextEditorPopupArgs {
  container: HTMLElement;
  value: string;
  placeholder?: string;
  onInput: (value: string) => void;
  onResizeRequest?: () => void;
  onCancel: () => void;
  onSave: () => void;
  onCompositionStart?: () => void;
  onCompositionEnd?: () => void;
  configurePopup?: (
    elements: TextEditorPopupElements,
    notifyInput: () => void,
  ) => void;
}

const POPUP_VIEWPORT_MARGIN = 12;
export const TEXT_EDITOR_POPUP_CARD_SELECTOR = '.text-editor-card';

export function createTextEditorPopupElements(
  placeholder = ''
): TextEditorPopupElements {
  const card = document.createElement('div');
  card.className = `text-editor-card math-editor-card !rounded-[var(--vlaina-notes-ui-radius-panel)] ${raisedPillSurfaceClass}`;
  card.setAttribute('data-no-editor-drag-box', 'true');

  const content = document.createElement('div');
  content.className = 'text-editor-content math-editor-content';

  const textarea = document.createElement('textarea');
  textarea.className = 'text-editor-textarea math-editor-textarea';
  textarea.setAttribute('data-native-caret-overlay-disabled', 'true');
  textarea.placeholder = placeholder;

  const actions = document.createElement('div');
  actions.className = 'text-editor-footer math-editor-footer';

  const buttonGroup = document.createElement('div');
  buttonGroup.className = 'text-editor-actions math-editor-actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className =
    'text-editor-action-button text-editor-action-button-secondary math-editor-action-button math-editor-action-button-secondary';
  cancelButton.setAttribute('aria-label', translate('common.cancel'));
  cancelButton.textContent = translate('common.cancel');

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className =
    'text-editor-action-button text-editor-action-button-primary math-editor-action-button math-editor-action-button-primary';
  saveButton.setAttribute('aria-label', translate('common.save'));
  saveButton.textContent = translate('common.save');

  content.append(textarea);
  buttonGroup.append(cancelButton, saveButton);
  actions.append(buttonGroup);
  card.append(content, actions);

  return { card, content, textarea, actions, cancelButton, saveButton };
}

export function resizeTextEditorPopupTextareaToContent(args: {
  card: HTMLElement;
  textarea: HTMLTextAreaElement;
  constrainToViewport?: boolean;
}) {
  const { card, textarea, constrainToViewport = true } = args;
  const viewportHeight =
    typeof window === 'undefined'
      ? Number.POSITIVE_INFINITY
      : window.innerHeight || document.documentElement.clientHeight;

  textarea.style.height = themeTextAreaTokens.heightAuto;
  textarea.style.overflowY = themeTextAreaTokens.overflowHidden;

  const cardRect = card.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  const contentHeight = Math.ceil(textarea.scrollHeight);
  if (!constrainToViewport) {
    textarea.style.height = `${Math.max(0, contentHeight)}px`;
    textarea.style.overflowY = themeTextAreaTokens.overflowHidden;
    return;
  }

  const chromeHeight = Math.max(0, cardRect.height - textareaRect.height);
  const availableCardHeight = viewportHeight - cardRect.top - POPUP_VIEWPORT_MARGIN;
  const availableTextareaHeight = availableCardHeight - chromeHeight;
  const constrainedHeight = availableTextareaHeight > 0
    ? Math.min(contentHeight, Math.floor(availableTextareaHeight))
    : contentHeight;

  textarea.style.height = `${Math.max(0, constrainedHeight)}px`;
  textarea.style.overflowY = constrainedHeight < contentHeight
    ? themeTextAreaTokens.overflowAuto
    : themeTextAreaTokens.overflowHidden;
}

export function mountTextEditorPopup(args: MountTextEditorPopupArgs): TextEditorPopupElements {
  const {
    container,
    value,
    placeholder,
    onInput,
    onResizeRequest,
    onCancel,
    onSave,
    onCompositionStart,
    onCompositionEnd,
    configurePopup,
  } = args;
  const elements = createTextEditorPopupElements(placeholder);
  const { card, textarea, cancelButton, saveButton } = elements;
  let isComposing = false;

  textarea.value = value;
  textarea.addEventListener('compositionstart', () => {
    isComposing = true;
    onCompositionStart?.();
  });
  textarea.addEventListener('compositionend', () => {
    isComposing = false;
    onCompositionEnd?.();
  });
  const notifyInput = () => {
    if (onResizeRequest) {
      onResizeRequest();
    } else {
      resizeTextEditorPopupTextareaToContent({ card, textarea });
    }
    onInput(textarea.value);
  };
  textarea.addEventListener('input', notifyInput);
  textarea.addEventListener('paste', preventImageClipboardTextPaste);
  textarea.addEventListener('drop', preventImageDataTransferTextDrop);
  textarea.addEventListener('keydown', (event) => {
    if (event.isComposing || isComposing) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      onSave();
      return;
    }
  });

  cancelButton.addEventListener('click', onCancel);
  saveButton.addEventListener('click', onSave);
  configurePopup?.(elements, notifyInput);
  container.replaceChildren(card);
  if (onResizeRequest) {
    onResizeRequest();
  } else {
    resizeTextEditorPopupTextareaToContent({ card, textarea });
  }

  return elements;
}
