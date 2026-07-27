import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChatEmbeddedSidebar } from './useChatEmbeddedSidebar';

describe('useChatEmbeddedSidebar', () => {
  it('suspends the open overlay and its Escape listener while Chat is inactive', () => {
    const stop = vi.fn();
    const { result, rerender } = renderHook(
      ({ active }) => useChatEmbeddedSidebar({
        active,
        isEmbedded: true,
        isSessionActive: false,
        stop,
      }),
      { initialProps: { active: true } },
    );

    act(() => result.current.openEmbeddedSidebar());
    expect(result.current.isEmbeddedSidebarOpen).toBe(true);

    rerender({ active: false });
    expect(result.current.isEmbeddedSidebarOpen).toBe(false);
    const inactiveEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    act(() => window.dispatchEvent(inactiveEscape));
    expect(inactiveEscape.defaultPrevented).toBe(false);

    rerender({ active: true });
    expect(result.current.isEmbeddedSidebarOpen).toBe(true);
  });
});
