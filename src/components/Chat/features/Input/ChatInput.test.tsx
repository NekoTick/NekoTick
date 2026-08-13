import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from './ChatInput';
import { FILE_TREE_CHAT_DROP_EVENT } from '@/components/Notes/features/FileTree/hooks/fileTreePointerDragState';
import { getDroppedExternalPaths } from '@/components/Notes/hooks/externalDropPayload';
import { setCurrentNotesRootPath, useNotesStore } from '@/stores/notes/useNotesStore';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { actions as aiActions } from '@/stores/useAIStore';
import { useWebSearchQuotaStore } from '@/stores/useWebSearchQuotaStore';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/hooks/usePredictedTextareaHeight', () => ({
  usePredictedTextareaHeight: () => ({ syncHeight: vi.fn() }),
}));

vi.mock('@/lib/navigation/externalLinks', () => ({
  openExternalHref: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/billing/returnRefresh', () => ({
  markBillingReturnRefreshPending: vi.fn(),
}));

vi.mock('@/components/Notes/hooks/externalDropPayload', () => ({
  getDroppedExternalPaths: vi.fn(() => []),
}));

type ChatInputProps = ComponentProps<typeof ChatInput>;
const getDroppedExternalPathsMock = vi.mocked(getDroppedExternalPaths);

function getTestDisplayName(path: string): string {
  return path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? path;
}

function renderChatInput(overrides: Partial<ChatInputProps> = {}) {
  const noop = vi.fn();
  const props: ChatInputProps = {
    active: true,
    onSend: vi.fn(),
    onStop: noop,
    isLoading: false,
    hasSelectedModel: true,
    sessionId: 'session-1',
    sentUserMessages: [],
    ...overrides,
  };

  return {
    ...render(<ChatInput {...props} />),
    props,
  };
}

describe('ChatInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWebSearchQuotaStore.setState({ exhausted: false });
    getDroppedExternalPathsMock.mockReturnValue([]);
    setCurrentNotesRootPath(null);
    useNotesRootStore.setState({ currentNotesRoot: null });
    useNotesStore.setState({
      notesPath: '',
      getDisplayName: getTestDisplayName,
    });
    useUnifiedStore.setState((state) => ({
      loaded: false,
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          providers: [],
          models: [],
          selectedModelId: null,
          webSearchEnabled: false,
        },
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not clear persisted web search while the selected model is unresolved', () => {
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          webSearchEnabled: true,
        },
      },
    }));
    const setWebSearchEnabled = vi.spyOn(aiActions, 'setWebSearchEnabled').mockImplementation(() => {});

    renderChatInput();

    expect(setWebSearchEnabled).not.toHaveBeenCalled();
    setWebSearchEnabled.mockRestore();
  });

  it('hides and disables web search for custom channels', () => {
    useUnifiedStore.setState((state) => ({
      loaded: true,
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          providers: [{
            id: 'custom-provider',
            name: 'Custom provider',
            type: 'newapi',
            endpointType: 'openai',
            apiHost: 'https://api.example.test',
            apiKey: 'test-key',
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
          }],
          models: [{
            id: 'custom-model',
            apiModelId: 'custom-model',
            name: 'Custom model',
            providerId: 'custom-provider',
            endpointType: 'openai',
            endpointTypeCheckedAt: 1,
            enabled: true,
            createdAt: 1,
          }],
          selectedModelId: 'custom-model',
          webSearchEnabled: true,
        },
      },
    }));
    const setWebSearchEnabled = vi.spyOn(aiActions, 'setWebSearchEnabled').mockImplementation(() => {});

    renderChatInput();

    expect(setWebSearchEnabled).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));
    expect(screen.queryByRole('button', { name: 'chat.webSearch' })).not.toBeInTheDocument();
    setWebSearchEnabled.mockRestore();
  });

  it('disables web search for standalone image generation models', () => {
    useUnifiedStore.setState((state) => ({
      loaded: true,
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          providers: [{
            id: 'image-provider',
            name: 'Image provider',
            type: 'newapi',
            endpointType: 'openai',
            apiHost: 'https://api.example.test',
            apiKey: 'test-key',
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
          }],
          models: [{
            id: 'image-model',
            apiModelId: 'gpt-image-2',
            name: 'GPT Image 2',
            providerId: 'image-provider',
            enabled: true,
            createdAt: 1,
          }],
          selectedModelId: 'image-model',
          webSearchEnabled: true,
        },
      },
    }));
    const setWebSearchEnabled = vi.spyOn(aiActions, 'setWebSearchEnabled').mockImplementation(() => {});

    renderChatInput();

    expect(setWebSearchEnabled).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));
    setWebSearchEnabled.mockRestore();
  });

  it('keeps the composer editable and lets submit retry quota refresh while managed quota is shown', async () => {
    const onSend = vi.fn(async () => false);

    renderChatInput({
      onSend,
      isManagedQuotaExhausted: true,
    });

    const textarea = screen.getByPlaceholderText('chat.composerPlaceholder') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'still editable' } });

    expect(textarea).not.toBeDisabled();
    expect(textarea.value).toBe('still editable');
    expect(screen.getByRole('button', { name: 'chat.openActions' })).not.toBeDisabled();

    const sendButton = screen.getByRole('button', { name: 'common.send' });
    expect(sendButton).not.toBeDisabled();
    expect(sendButton).not.toHaveClass('opacity-[var(--vlaina-opacity-60)]');

    await act(async () => {
      fireEvent.click(sendButton);
      await Promise.resolve();
    });
    expect(onSend).toHaveBeenCalledWith('still editable', [], []);
    expect(textarea.value).toBe('still editable');
  });

  it('keeps long ordinary drafts in the native textarea without a duplicate preview layer', () => {
    renderChatInput();
    const textarea = screen.getByPlaceholderText('chat.composerPlaceholder') as HTMLTextAreaElement;
    const longDraft = 'ordinary chat text '.repeat(8_000);

    fireEvent.change(textarea, { target: { value: longDraft } });

    expect(textarea.value).toBe(longDraft);
    expect(textarea.parentElement?.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('does not measure or reset the textarea selection on ordinary changes', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    renderChatInput();
    const textarea = screen.getByPlaceholderText('chat.composerPlaceholder') as HTMLTextAreaElement;
    const getClientRects = vi.spyOn(textarea, 'getClientRects');
    const setSelectionRange = vi.spyOn(textarea, 'setSelectionRange');

    fireEvent.change(textarea, { target: { value: 'ordinary typing' } });

    expect(getClientRects).not.toHaveBeenCalled();
    expect(setSelectionRange).not.toHaveBeenCalled();
  });

  it('inserts a mention trigger into the latest draft after repeated text updates', () => {
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    useNotesStore.setState({
      rootFolder: {
        children: [{ isFolder: false, path: 'Today.md' }],
      } as any,
      notesPath: '/notesRoot',
      getDisplayName: getTestDisplayName,
    });
    try {
      renderChatInput();
      const textarea = screen.getByPlaceholderText('chat.composerPlaceholder') as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: 'first draft' } });
      fireEvent.change(textarea, { target: { value: 'latest draft' } });
      fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));
      fireEvent.click(document.querySelector('[data-chat-input-action="mention"]')!);

      expect(textarea.value).toBe('latest draft @');
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
      } else {
        Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
      }
    }
  });

  it('renders the managed quota notice as part of an expanded composer frame', () => {
    const { container } = renderChatInput({
      isManagedQuotaExhausted: true,
    });

    const banner = container.querySelector('[data-managed-quota-banner="true"]');
    const frame = container.querySelector('[data-chat-input="true"]')?.parentElement;
    expect(banner).not.toBeNull();
    expect(frame).toHaveClass('bg-[var(--vlaina-color-accent-soft)]');
    expect(frame).toHaveClass('overflow-hidden');
    expect(frame).toHaveClass('rounded-[var(--vlaina-radius-26px)]');
    expect(banner).toHaveClass('min-h-[var(--vlaina-size-32px)]');
    expect(banner).not.toHaveClass('absolute');
  });

  it('shows web search exhaustion without blocking ordinary messages', async () => {
    const onSend = vi.fn();
    act(() => useWebSearchQuotaStore.setState({ exhausted: true }));
    renderChatInput({ onSend });

    expect(screen.getByText('chat.webSearchQuotaExhausted')).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText('chat.composerPlaceholder');
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'continue without search' } });
      fireEvent.click(screen.getByRole('button', { name: 'common.send' }));
      await Promise.resolve();
    });

    expect(onSend).toHaveBeenCalledWith('continue without search', [], []);
  });

  it('suspends input portals when the chat becomes inactive', async () => {
    const { props, rerender } = renderChatInput();

    fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));
    expect(screen.getByText('chat.uploadFile')).toBeInTheDocument();

    rerender(<ChatInput {...props} active={false} />);

    expect(screen.queryByText('chat.uploadFile')).not.toBeInTheDocument();

    rerender(<ChatInput {...props} active />);

    expect(screen.queryByText('chat.uploadFile')).not.toBeInTheDocument();
  });

  it('adds a note mention when a file tree item is dropped into chat', async () => {
    renderChatInput();

    act(() => {
      window.dispatchEvent(new CustomEvent(FILE_TREE_CHAT_DROP_EVENT, {
        detail: {
          path: 'docs/Source.md',
          kind: 'note',
        },
      }));
    });

    const textarea = screen.getByPlaceholderText('chat.composerPlaceholder') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe('@Source ');
    });
    expect(document.querySelector('[data-mention-preview-token="true"]')).toHaveTextContent('@Source');
  });

  it('opens the native file picker from the upload action', () => {
    const originalShowPicker = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'showPicker');
    const showPicker = vi.fn();
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      configurable: true,
      value: showPicker,
    });

    try {
      renderChatInput();

      fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));
      fireEvent.click(screen.getByText('chat.uploadFile'));

      expect(showPicker).toHaveBeenCalledTimes(1);
    } finally {
      if (originalShowPicker) {
        Object.defineProperty(HTMLInputElement.prototype, 'showPicker', originalShowPicker);
      } else {
        Reflect.deleteProperty(HTMLInputElement.prototype, 'showPicker');
      }
    }
  });

  it('adds note mentions when opened folder markdown files are dropped into chat', async () => {
    getDroppedExternalPathsMock.mockReturnValue([
      '/notesRoot/docs/Source.md',
      '/notesRoot/docs/Source.md',
      '/notesRoot/docs/Skipped.txt',
      '/other-notesRoot/Outside.txt',
    ]);
    useNotesStore.setState({
      notesPath: '/notesRoot',
      getDisplayName: getTestDisplayName,
    });
    renderChatInput();

    const dropTarget = document.querySelector('[data-chat-input="true"]');
    expect(dropTarget).not.toBeNull();
    fireEvent.drop(dropTarget!, {
      dataTransfer: {
        files: [new File(['body'], 'Source.md', { type: 'text/markdown' })],
        items: [],
        types: ['Files'],
      },
    });

    const textarea = screen.getByPlaceholderText('chat.composerPlaceholder') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe('@Source ');
    });
    expect(document.querySelector('[data-mention-preview-token="true"]')).toHaveTextContent('@Source');
  });

  it('adds note mentions when external markdown files are dropped into chat', async () => {
    getDroppedExternalPathsMock.mockReturnValue(['/outside/Untitled.md']);
    useNotesStore.setState({
      notesPath: '/notesRoot',
      getDisplayName: getTestDisplayName,
    });
    renderChatInput();

    const dropTarget = document.querySelector('[data-chat-input="true"]');
    expect(dropTarget).not.toBeNull();
    fireEvent.drop(dropTarget!, {
      dataTransfer: {
        files: [new File(['body'], 'Untitled.md', { type: 'text/markdown' })],
        items: [],
        types: ['Files'],
      },
    });

    const textarea = screen.getByPlaceholderText('chat.composerPlaceholder') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe('@Untitled ');
    });
    expect(document.querySelector('[data-mention-preview-token="true"]')).toHaveTextContent('@Untitled');
  });

  it('uses the active opened folder path when the notes store path is not initialized yet', async () => {
    getDroppedExternalPathsMock.mockReturnValue(['/notesRoot/docs/Fallback.md']);
    useNotesRootStore.setState({
      currentNotesRoot: {
        id: 'notesRoot',
        name: 'NotesRoot',
        path: '/notesRoot',
        lastOpened: Date.now(),
      },
    });
    renderChatInput();

    const dropTarget = document.querySelector('[data-chat-input="true"]');
    expect(dropTarget).not.toBeNull();
    fireEvent.drop(dropTarget!, {
      dataTransfer: {
        files: [new File(['body'], 'Fallback.md', { type: 'text/markdown' })],
        items: [],
        types: ['Files'],
      },
    });

    const textarea = screen.getByPlaceholderText('chat.composerPlaceholder') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe('@Fallback ');
    });
    expect(document.querySelector('[data-mention-preview-token="true"]')).toHaveTextContent('@Fallback');
  });

  it('lets the active composer own external drops while an inactive Chat view stays mounted', async () => {
    getDroppedExternalPathsMock.mockReturnValue(['/notesRoot/docs/Active.md']);
    useNotesStore.setState({
      notesPath: '/notesRoot',
      getDisplayName: getTestDisplayName,
    });
    renderChatInput({ active: false, sessionId: 'inactive-session' });
    const activeView = renderChatInput({ active: true, sessionId: 'active-session' });

    const dropTarget = activeView.container.querySelector('[data-chat-input="true"]');
    expect(dropTarget).not.toBeNull();
    fireEvent.drop(dropTarget!, {
      dataTransfer: {
        files: [new File(['body'], 'Active.md', { type: 'text/markdown' })],
        items: [],
        types: ['Files'],
      },
    });

    const textareas = screen.getAllByPlaceholderText('chat.composerPlaceholder') as HTMLTextAreaElement[];
    await waitFor(() => expect(textareas[1]?.value).toBe('@Active '));
    expect(textareas[0]?.value).toBe('');
  });
});
