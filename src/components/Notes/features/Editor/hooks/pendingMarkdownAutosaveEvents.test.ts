import { describe, expect, it } from 'vitest';
import { isContentEditingUserEvent } from './pendingMarkdownAutosaveEvents';

describe('isContentEditingUserEvent', () => {
  it.each([
    ['undo on Windows and Linux', { key: 'z', ctrlKey: true }],
    ['undo on macOS', { key: 'z', metaKey: true }],
    ['redo with shifted Z', { key: 'z', ctrlKey: true, shiftKey: true }],
    ['redo with Y', { key: 'y', ctrlKey: true }],
  ])('treats %s as editor input', (_name, init) => {
    expect(isContentEditingUserEvent(new KeyboardEvent('keydown', init))).toBe(true);
  });

  it.each([
    ['copy', { key: 'c', ctrlKey: true }],
    ['formatting shortcut', { key: 'b', metaKey: true }],
    ['alt-modified undo key', { key: 'z', ctrlKey: true, altKey: true }],
    ['shifted Y', { key: 'y', ctrlKey: true, shiftKey: true }],
  ])('does not treat %s as editor input', (_name, init) => {
    expect(isContentEditingUserEvent(new KeyboardEvent('keydown', init))).toBe(false);
  });
});
