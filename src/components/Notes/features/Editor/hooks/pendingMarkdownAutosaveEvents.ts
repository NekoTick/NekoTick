import type { EditorView } from '@milkdown/kit/prose/view';
import { editorViewCtx } from '@milkdown/kit/core';

import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import type { MilkdownContext } from './pendingMarkdownAutosaveTypes';
import { resolveDocumentHistoryShortcut } from '../plugins/floating-toolbar/floatingToolbarPluginViewUtils';

const CONTENT_EDITING_KEYS = new Set([
  'Backspace',
  'Delete',
  'Enter',
  'Tab',
]);
const SELECTION_MOVEMENT_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Escape',
  'Home',
  'PageDown',
  'PageUp',
]);
const ALLOW_SYNTHETIC_USER_EVENTS =
  import.meta.env.MODE === 'test' || Boolean(import.meta.env.VITEST);

export const COMPOSITION_APPEND_GUARD_MS = 10_000;
export const MAX_COMPOSITION_REPAIR_LOOKBACK_CHARS = 160;
export const MAX_COMPOSITION_REPAIR_TEXT_LENGTH = 128;
export const COMPOSITION_RESIDUE_PATTERN = /^[A-Za-z']+$/;

export function getContentCommitThrottleMs(): number {
  if (import.meta.env.MODE === 'test' || Boolean(import.meta.env.VITEST)) {
    const override = (globalThis as { __VL_TEST_CONTENT_COMMIT_THROTTLE_MS__?: number })
      .__VL_TEST_CONTENT_COMMIT_THROTTLE_MS__;
    return typeof override === 'number' ? override : themeUiFeedbackTokens.editorPendingMarkdownTestCommitThrottleMs;
  }
  return themeUiFeedbackTokens.editorPendingMarkdownCommitThrottleMs;
}

export function isContentEditingUserEvent(event: Event): boolean {
  if (event.type === 'compositionstart' || event.type === 'compositionend') {
    return true;
  }
  if (event.type.startsWith('editor:')) {
    return true;
  }
  if (event.type === 'pointerdown' || event.type === 'mousedown') {
    return false;
  }
  if (!event.isTrusted && !ALLOW_SYNTHETIC_USER_EVENTS) {
    return false;
  }
  if (event instanceof KeyboardEvent) {
    if (ALLOW_SYNTHETIC_USER_EVENTS && event.key === '') return true;
    if (event.isComposing) return true;
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return resolveDocumentHistoryShortcut(event) !== null;
    }
    return CONTENT_EDITING_KEYS.has(event.key) || event.key.length === 1;
  }
  return true;
}

export function getEditorViewFromContext(ctx: MilkdownContext): EditorView | null {
  try {
    return ctx.get(editorViewCtx as never) as EditorView;
  } catch {
    return null;
  }
}

export function isEditorComposing(view: EditorView | null | undefined): boolean {
  return Boolean(view?.composing);
}

export function isInputEvent(event: Event): event is InputEvent {
  return typeof InputEvent !== 'undefined' && event instanceof InputEvent;
}

export function getEventData(event: Event): string | null {
  const data = (event as { data?: unknown }).data;
  return typeof data === 'string' && data.length > 0 ? data : null;
}

export function getCompositionClockMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function isCompositionResidueText(text: string): boolean {
  return text.length > 0 && COMPOSITION_RESIDUE_PATTERN.test(text);
}

export function hasNonAsciiText(text: string | null): text is string {
  return typeof text === 'string' && /[^\x00-\x7F]/.test(text);
}

export function isCompositionInputEvent(event: Event): boolean {
  return event.type === 'compositionstart' ||
    event.type === 'compositionend' ||
    (isInputEvent(event) && (
      event.inputType === 'insertCompositionText' ||
      event.inputType === 'insertFromComposition' ||
      event.isComposing
    )) ||
    (event instanceof KeyboardEvent && event.isComposing);
}

export function shouldClearCompositionAppendGuard(event: Event): boolean {
  if (
    event.type === 'pointerdown' ||
    event.type === 'mousedown' ||
    event.type === 'paste' ||
    event.type === 'cut' ||
    event.type === 'drop'
  ) {
    return true;
  }

  if (isInputEvent(event)) {
    if (
      event.isComposing ||
      event.inputType === 'insertCompositionText' ||
      event.inputType === 'insertFromComposition'
    ) {
      return false;
    }
    return event.inputType !== 'insertText';
  }

  if (event instanceof KeyboardEvent) {
    if (event.isComposing) {
      return false;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return true;
    }
    return event.key.length !== 1;
  }

  return false;
}

export function shouldSuppressCompositionSelectionRepair(event: Event): boolean {
  if (event.type === 'pointerdown' || event.type === 'mousedown') {
    return true;
  }

  return event instanceof KeyboardEvent &&
    !event.isComposing &&
    SELECTION_MOVEMENT_KEYS.has(event.key);
}

export function canCommitSuppressedCompositionEdit(event: Event): boolean {
  return isInputEvent(event) ||
    event.type === 'paste' ||
    event.type === 'cut' ||
    event.type === 'drop' ||
    event.type.startsWith('editor:');
}
