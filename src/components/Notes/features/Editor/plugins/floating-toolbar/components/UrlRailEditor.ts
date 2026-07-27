import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import {
  preventImageClipboardTextPaste,
  preventImageDataTransferTextDrop,
} from '@/lib/clipboardImagePayload';

interface UrlRailEditorOptions {
  value?: string;
  placeholder: string;
  hint: string;
  autoFocus?: boolean;
  validate?: (value: string) => boolean;
  onSubmit: (value: string) => void;
  onEmpty?: () => void;
  onCancel: () => void;
}

export function renderUrlRailEditor(
  container: HTMLElement,
  options: UrlRailEditorOptions
): HTMLInputElement {
  const {
    value = '',
    placeholder,
    hint,
    autoFocus = false,
    validate,
    onSubmit,
    onEmpty,
    onCancel,
  } = options;
  const editor = document.createElement('div');
  editor.className = 'link-editor-rail';
  editor.innerHTML = `
    <div class="link-editor-rail-inner">
      <input
        type="text"
        class="link-editor-rail-input"
        placeholder="${escapeHtml(placeholder)}"
        value="${escapeHtml(value)}"
        autocomplete="off"
        spellcheck="false"
      />
    </div>
    <div class="link-editor-rail-hint">${escapeHtml(hint)}</div>
  `;

  const input = editor.querySelector('.link-editor-rail-input') as HTMLInputElement;
  let isComposing = false;

  if (autoFocus) {
    requestAnimationFrame(() => {
      if (!input.isConnected) {
        return;
      }
      input.focus();
      input.select();
    });
  }

  const showValidationError = () => {
    input.classList.add('error-shake');

    setTimeout(() => {
      if (!input.isConnected) {
        return;
      }
      input.classList.remove('error-shake');
    }, themeUiFeedbackTokens.urlRailValidationErrorDurationMs);
  };

  const applyValue = () => {
    const nextValue = input.value.trim();

    if (!nextValue) {
      onEmpty?.();
      return;
    }

    if (validate && !validate(nextValue)) {
      showValidationError();
      return;
    }

    onSubmit(nextValue);
  };

  input.addEventListener('compositionstart', () => {
    isComposing = true;
  });
  input.addEventListener('compositionend', () => {
    isComposing = false;
  });
  input.addEventListener('paste', preventImageClipboardTextPaste);
  input.addEventListener('drop', preventImageDataTransferTextDrop);

  input.addEventListener('keydown', (event) => {
    if (event.isComposing || isComposing) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      applyValue();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  });

  container.appendChild(editor);
  return input;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
