import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChatInputFocus } from './useChatInputFocus';

describe('useChatInputFocus', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('keeps an explicit caret position when scheduling focus', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'draft';
    textarea.getClientRects = () => [{ width: 100, height: 24 }] as unknown as DOMRectList;
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(0, 0);
    const blur = vi.spyOn(textarea, 'blur');
    const { result } = renderHook(() => useChatInputFocus({ current: textarea }));

    act(() => {
      result.current.scheduleComposerFocus(0);
    });

    await waitFor(() => {
      expect(blur).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(textarea);
      expect(textarea.selectionStart).toBe(0);
    });
  });
});
