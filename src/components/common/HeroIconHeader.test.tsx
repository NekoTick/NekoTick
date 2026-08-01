import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroIconHeader } from './HeroIconHeader';
import { useUIStore } from '@/stores/uiSlice';
import { RECENT_ICONS_KEY } from '@/components/common/UniversalIconPicker/constants';

vi.mock('@/components/common/AppIcon', () => ({
  AppIcon: ({ icon }: { icon: string }) => <span data-testid="header-icon">{icon}</span>,
}));

vi.mock('@/components/common/UniversalIconPicker/index', () => ({
  UniversalIconPicker: ({
    currentIcon,
    onPreview,
    onSelect,
    onRemove,
    onClose,
  }: {
    currentIcon?: string;
    onPreview?: (icon: string | null) => void;
    onSelect?: (icon: string) => void;
    onRemove?: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="icon-picker">
      <span data-testid="picker-current-icon">{currentIcon ?? ''}</span>
      <button type="button" onClick={() => onPreview?.('misc.heart')}>Preview heart</button>
      <button type="button" onClick={() => onPreview?.(null)}>Clear preview</button>
      <button type="button" onClick={() => {
        onSelect?.('misc.heart');
        onClose();
      }}>Select heart</button>
      <button type="button" onClick={() => {
        onSelect?.('assets/logo.png');
        onClose();
        onClose();
      }}>Select uploaded icon</button>
      <button type="button" onClick={() => onClose()}>Close picker</button>
      <button type="button" onClick={() => {
        onRemove?.();
        onClose();
      }}>Remove icon</button>
    </div>
  ),
}));

vi.mock('@/components/common/UniversalIconPicker/randomEmoji', () => ({
  getRandomHeaderEmoji: () => 'misc.star',
  preloadRandomEmojiData: vi.fn(),
  resolveEmojiForSkinTone: async (emoji: string) => emoji,
}));

describe('HeroIconHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.getState().setUniversalPreview(null, {
      icon: null,
      color: null,
      tone: null,
      size: null,
    });

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 0);
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the newly committed icon visible when hover preview clears before parent props update', async () => {
    const onIconChange = vi.fn();
    const onIconPickerOpen = vi.fn();

    const { container } = render(
      <HeroIconHeader
        id="note-1"
        icon={null}
        onIconChange={onIconChange}
        onIconPickerOpen={onIconPickerOpen}
        onRequestRandomIcon={() => 'misc.star'}
      />,
    );

    expect(container.querySelector('[data-no-editor-drag-box="true"]')).toBeInstanceOf(HTMLElement);

    fireEvent.click(screen.getByRole('button', { name: /add icon/i }));

    expect(onIconChange).toHaveBeenCalledWith('misc.star');
    expect(JSON.parse(localStorage.getItem(RECENT_ICONS_KEY) || '[]')).toEqual([]);
    expect(onIconPickerOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('header-icon')).toHaveTextContent('misc.star');
    expect(await screen.findByTestId('picker-current-icon')).toHaveTextContent('misc.star');

    fireEvent.click(screen.getByRole('button', { name: 'Preview heart' }));
    await waitFor(() => expect(screen.getByTestId('header-icon')).toHaveTextContent('misc.heart'));

    fireEvent.click(screen.getByRole('button', { name: 'Clear preview' }));

    await waitFor(() => expect(screen.getByTestId('header-icon')).toHaveTextContent('misc.star'));

    fireEvent.click(screen.getByRole('button', { name: 'Close picker' }));
    expect(JSON.parse(localStorage.getItem(RECENT_ICONS_KEY) || '[]')).toEqual(['misc.star']);
  });

  it('does not add the initial random icon to recent icons after choosing another icon', async () => {
    const onIconChange = vi.fn();

    render(
      <HeroIconHeader
        id="note-1"
        icon={null}
        onIconChange={onIconChange}
        onRequestRandomIcon={() => 'misc.star'}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add icon/i }));
    expect(JSON.parse(localStorage.getItem(RECENT_ICONS_KEY) || '[]')).toEqual([]);

    fireEvent.click(await screen.findByRole('button', { name: 'Select heart' }));

    expect(onIconChange).toHaveBeenLastCalledWith('misc.heart');
    expect(JSON.parse(localStorage.getItem(RECENT_ICONS_KEY) || '[]')).toEqual([]);
  });

  it('notifies once after selecting or removing an icon closes the picker', async () => {
    const onIconPickerClose = vi.fn();

    render(
      <HeroIconHeader
        id="note-1"
        icon="misc.star"
        onIconChange={vi.fn()}
        onIconPickerClose={onIconPickerClose}
      />,
    );

    fireEvent.click(screen.getByTestId('header-icon').closest('button')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Select uploaded icon' }));
    expect(onIconPickerClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('header-icon').closest('button')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove icon' }));
    expect(onIconPickerClose).toHaveBeenCalledTimes(2);
  });

  it('keeps the latest regenerated icon when older icon prop updates arrive late', async () => {
    const onIconChange = vi.fn();
    const onRequestRandomIcon = vi
      .fn()
      .mockReturnValueOnce('misc.star')
      .mockReturnValueOnce('misc.heart');
    const renderHeader = (icon: string | null) => (
      <HeroIconHeader
        id="note-1"
        icon={icon}
        onIconChange={onIconChange}
        onRequestRandomIcon={onRequestRandomIcon}
      />
    );
    const { rerender } = render(renderHeader(null));

    fireEvent.click(screen.getByRole('button', { name: /add icon/i }));
    expect(screen.getByTestId('header-icon')).toHaveTextContent('misc.star');
    fireEvent.click(await screen.findByRole('button', { name: 'Close picker' }));

    const firstHeaderIconButton = screen.getByTestId('header-icon').closest('button');
    expect(firstHeaderIconButton).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(firstHeaderIconButton!);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove icon' }));
    expect(screen.queryByTestId('header-icon')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add icon/i }));
    expect(screen.getByTestId('header-icon')).toHaveTextContent('misc.heart');
    fireEvent.click(await screen.findByRole('button', { name: 'Close picker' }));

    rerender(renderHeader('misc.star'));
    expect(screen.getByTestId('header-icon')).toHaveTextContent('misc.heart');

    rerender(renderHeader(null));
    expect(screen.getByTestId('header-icon')).toHaveTextContent('misc.heart');

    rerender(renderHeader('misc.heart'));
    expect(screen.getByTestId('header-icon')).toHaveTextContent('misc.heart');
    expect(JSON.parse(localStorage.getItem(RECENT_ICONS_KEY) || '[]')).toEqual([
      'misc.heart',
      'misc.star',
    ]);
  });
});
