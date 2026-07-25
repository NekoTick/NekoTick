import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearEditorFocusIntent,
  fulfillEditorFocusIntent,
  requestEditorFocus,
  subscribeEditorFocusIntent,
} from './editorFocusIntent';

afterEach(() => {
  clearEditorFocusIntent();
});

describe('editorFocusIntent', () => {
  it('fulfills a pending intent once for the matching note', () => {
    const focus = vi.fn(() => true);
    requestEditorFocus('docs/alpha.md');

    expect(fulfillEditorFocusIntent('docs/beta.md', focus)).toBe(false);
    expect(fulfillEditorFocusIntent('docs/alpha.md', focus)).toBe(true);
    expect(fulfillEditorFocusIntent('docs/alpha.md', focus)).toBe(false);
    expect(focus).toHaveBeenCalledOnce();
  });

  it('keeps an intent pending until the editor can receive focus', () => {
    const focus = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    requestEditorFocus('alpha.md');

    expect(fulfillEditorFocusIntent('alpha.md', focus)).toBe(false);
    expect(fulfillEditorFocusIntent('alpha.md', focus)).toBe(true);
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('notifies mounted editors when a request is made', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEditorFocusIntent(listener);

    requestEditorFocus('alpha.md');

    expect(listener).toHaveBeenCalledWith('alpha.md');
    unsubscribe();
  });
});
