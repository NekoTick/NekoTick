import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_CARET_OVERLAY_REFRESH_EVENT } from '@/hooks/useNativeCaretOverlay';
import { CreateNotesRootModal } from './CreateNotesRootModal';

const mocks = vi.hoisted(() => ({
  createNotesRoot: vi.fn().mockResolvedValue(true),
  clearError: vi.fn(),
}));

vi.mock('@/stores/useNotesRootStore', () => {
  const state = {
    createNotesRoot: mocks.createNotesRoot,
    isLoading: false,
    error: null,
    clearError: mocks.clearError,
  };
  return {
    useNotesRootStore: (selector: (notesRootState: typeof state) => unknown) => selector(state),
  };
});

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/storage/adapter', () => ({
  isWeb: () => true,
  joinPath: async (parent: string, name: string) => `${parent}/${name}`,
}));

vi.mock('@/lib/storage/dialog', () => ({
  hasNativeDialogs: () => false,
  openDialog: vi.fn(),
}));

describe('CreateNotesRootModal', () => {
  beforeEach(() => {
    mocks.createNotesRoot.mockClear();
    mocks.clearError.mockClear();
  });

  it('refreshes the visual caret while the auto-focused input enters', async () => {
    const handleRefresh = vi.fn();
    document.addEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleRefresh);

    try {
      render(<CreateNotesRootModal isOpen onClose={vi.fn()} />);
      await waitFor(() => expect(handleRefresh).toHaveBeenCalled());
    } finally {
      document.removeEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleRefresh);
    }
  });

  it('does not create a notes root while the name input is composing text', async () => {
    render(<CreateNotesRootModal isOpen onClose={vi.fn()} />);

    const nameInput = screen.getByPlaceholderText('notesRoot.myNotesPlaceholder');
    const createButton = screen.getByText('notesRoot.createNotesRoot');

    fireEvent.compositionStart(nameInput);
    fireEvent.change(nameInput, { target: { value: 'nihon' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    fireEvent.click(createButton);

    expect(mocks.createNotesRoot).not.toHaveBeenCalled();

    fireEvent.compositionEnd(nameInput);
    fireEvent.change(nameInput, { target: { value: '日本' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mocks.createNotesRoot).toHaveBeenCalledWith('日本', '/notes-roots/日本');
    });
  });
});
