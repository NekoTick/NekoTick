import type { MouseEvent as ReactMouseEvent } from 'react';
import { focusNoteInitialPosition } from './focusNoteInitialPosition';

const UPPER_AREA_INTERACTIVE_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'a[href]',
  '[contenteditable="true"]',
  '[data-no-auto-close="true"]',
  '[data-no-editor-drag-box="true"]',
  '[data-note-cover-add-overlay="true"]',
].join(',');

export function focusEditorFromNoteUpperBlankArea(
  event: ReactMouseEvent<HTMLElement>,
): boolean {
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;

  const target = event.target;
  if (!(target instanceof Element) || target.closest(UPPER_AREA_INTERACTIVE_SELECTOR)) {
    return false;
  }

  const contentRoot = event.currentTarget.querySelector<HTMLElement>('[data-note-content-root="true"]');
  if (!contentRoot || event.clientY >= contentRoot.getBoundingClientRect().top) {
    return false;
  }

  focusNoteInitialPosition(event.currentTarget);
  return true;
}
