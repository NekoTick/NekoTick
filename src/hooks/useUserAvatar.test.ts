import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAccountSessionStore } from '@/stores/accountSession';
import { initialAccountSessionState } from '@/stores/accountSession/state';
import { useUserAvatar } from './useUserAvatar';

describe('useUserAvatar', () => {
  it('falls back to the remote Google account avatar while the local cache is missing', () => {
    useAccountSessionStore.setState({
      ...initialAccountSessionState,
      provider: 'google',
      avatarUrl: 'https://lh3.googleusercontent.com/avatar',
      localAvatarUrl: null,
    });

    const { result } = renderHook(() => useUserAvatar());

    expect(result.current).toBe('https://lh3.googleusercontent.com/avatar');
  });

  it('prefers the local cached Google avatar once available', () => {
    useAccountSessionStore.setState({
      ...initialAccountSessionState,
      provider: 'google',
      avatarUrl: 'https://lh3.googleusercontent.com/avatar',
      localAvatarUrl: 'data:image/png;base64,local',
    });

    const { result } = renderHook(() => useUserAvatar());

    expect(result.current).toBe('data:image/png;base64,local');
  });

  it('does not expose provider avatars for email accounts', () => {
    useAccountSessionStore.setState({
      ...initialAccountSessionState,
      provider: 'email',
      avatarUrl: 'https://example.com/avatar.png',
      localAvatarUrl: 'data:image/png;base64,email',
    });

    const { result } = renderHook(() => useUserAvatar());

    expect(result.current).toBeNull();
  });

  it('does not expose avatars when no provider is connected', () => {
    useAccountSessionStore.setState({
      ...initialAccountSessionState,
      provider: null,
      avatarUrl: 'https://example.com/avatar.png',
      localAvatarUrl: null,
    });

    const { result } = renderHook(() => useUserAvatar());

    expect(result.current).toBeNull();
  });

  it('does not rerender for unrelated account status changes', () => {
    useAccountSessionStore.setState({
      ...initialAccountSessionState,
      provider: 'google',
      avatarUrl: 'https://lh3.googleusercontent.com/avatar',
    });
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useUserAvatar();
    });
    const initialRenderCount = renderCount;

    act(() => {
      useAccountSessionStore.setState({ isLoading: false, hasCheckedStatus: true });
    });

    expect(renderCount).toBe(initialRenderCount);
    expect(result.current).toBe('https://lh3.googleusercontent.com/avatar');
  });
});
