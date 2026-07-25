import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearAppViewModeFocusIntent,
  fulfillAppViewModeFocus,
  requestAppViewModeFocus,
  subscribeAppViewModeFocusIntent,
} from './appViewModeFocusIntent';

afterEach(() => {
  clearAppViewModeFocusIntent();
});

describe('appViewModeFocusIntent', () => {
  it('fulfills a pending intent once for the matching view', () => {
    const focus = vi.fn(() => true);
    requestAppViewModeFocus('notes');

    expect(fulfillAppViewModeFocus('graph', focus)).toBe(false);
    expect(fulfillAppViewModeFocus('notes', focus)).toBe(true);
    expect(fulfillAppViewModeFocus('notes', focus)).toBe(false);
    expect(focus).toHaveBeenCalledOnce();
  });

  it('keeps an intent pending until the target can receive focus', () => {
    const focus = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    requestAppViewModeFocus('chat');

    expect(fulfillAppViewModeFocus('chat', focus)).toBe(false);
    expect(fulfillAppViewModeFocus('chat', focus)).toBe(true);
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('notifies mounted switches when a request is made', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppViewModeFocusIntent(listener);

    requestAppViewModeFocus('whiteboard');

    expect(listener).toHaveBeenCalledWith('whiteboard');
    unsubscribe();
  });
});
