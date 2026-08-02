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
import {
  publishComputerCommandApproval,
  resetComputerCommandApprovalsForTests,
} from '@/lib/ai/computerUse/approvalState';
import type { DesktopApi } from '@/lib/electron/bridge';

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

function openComputerUseEnableDialog(): HTMLTextAreaElement {
  (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
    platform: 'electron',
    computer: {},
  } as DesktopApi;
  renderChatInput();
  const textarea = screen.getByPlaceholderText('chat.composerPlaceholder') as HTMLTextAreaElement;
  vi.spyOn(textarea, 'getClientRects').mockReturnValue([
    { width: 1, height: 1 },
  ] as unknown as DOMRectList);
  textarea.focus();
  fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));
  fireEvent.click(screen.getByRole('button', { name: 'chat.computerUse' }));
  return textarea;
}

async function expectComposerFocusAfterDialogCloses(textarea: HTMLTextAreaElement) {
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
  expect(textarea).toHaveFocus();
}

describe('ChatInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetComputerCommandApprovalsForTests();
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
          computerUseEnabled: false,
        },
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop;
  });

  it('restores composer focus after cancelling computer control enablement', async () => {
    const textarea = openComputerUseEnableDialog();

    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

    await expectComposerFocusAfterDialogCloses(textarea);
  });

  it('restores composer focus after confirming computer control enablement', async () => {
    const setComputerUseEnabled = vi.spyOn(aiActions, 'setComputerUseEnabled').mockImplementation(() => {});
    const textarea = openComputerUseEnableDialog();

    fireEvent.click(screen.getByRole('button', { name: 'chat.computerUse.enableConfirm' }));

    expect(setComputerUseEnabled).toHaveBeenCalledWith(true);
    await expectComposerFocusAfterDialogCloses(textarea);
  });

  it('stops the active request when execution mode is disabled', () => {
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {},
    } as DesktopApi;
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          computerUseEnabled: true,
        },
      },
    }));
    const onStop = vi.fn();
    const setComputerUseEnabled = vi.spyOn(aiActions, 'setComputerUseEnabled').mockImplementation(() => {});
    renderChatInput({ isLoading: true, onStop });

    fireEvent.click(screen.getByRole('button', { name: 'chat.computerUse.disable' }));

    expect(setComputerUseEnabled).toHaveBeenCalledWith(false);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('revokes execution mode when the desktop command capability is unavailable', () => {
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
    } as DesktopApi;
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          computerUseEnabled: true,
        },
      },
    }));
    const setComputerUseEnabled = vi.spyOn(aiActions, 'setComputerUseEnabled').mockImplementation(() => {});

    renderChatInput();

    expect(setComputerUseEnabled).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));
    expect(screen.queryByRole('button', { name: 'chat.computerUse' })).not.toBeInTheDocument();
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

  it('disables web search for a verified model-level Anthropic endpoint', () => {
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
            endpointType: 'anthropic',
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
    setWebSearchEnabled.mockRestore();
  });

  it('disables tools for standalone image generation models', () => {
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {},
    } as DesktopApi;
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
          computerUseEnabled: true,
        },
      },
    }));
    const setWebSearchEnabled = vi.spyOn(aiActions, 'setWebSearchEnabled').mockImplementation(() => {});
    const setComputerUseEnabled = vi.spyOn(aiActions, 'setComputerUseEnabled').mockImplementation(() => {});

    renderChatInput();

    expect(setWebSearchEnabled).toHaveBeenCalledWith(false);
    expect(setComputerUseEnabled).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));
    expect(screen.queryByRole('button', { name: 'chat.computerUse' })).not.toBeInTheDocument();
    setWebSearchEnabled.mockRestore();
    setComputerUseEnabled.mockRestore();
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

  it('renders the managed quota notice as part of an expanded composer frame', () => {
    const { container } = renderChatInput({
      isManagedQuotaExhausted: true,
    });

    const banner = container.querySelector('[data-managed-quota-banner="true"]');
    const frame = container.querySelector('[data-chat-input="true"]')?.parentElement;
    expect(banner).not.toBeNull();
    expect(frame).toHaveClass('bg-[var(--vlaina-color-accent-soft)]');
    expect(frame).toHaveClass('overflow-hidden');
    expect(banner).toHaveClass('min-h-[var(--vlaina-size-32px)]');
    expect(banner).not.toHaveClass('absolute');
  });

  it('anchors computer command approval above the composer without changing its flow height', () => {
    publishComputerCommandApproval('approval-1', {
      sessionId: 'session-1',
      messageId: 'assistant-1',
      commandId: 'command-1',
      command: 'uname -a',
      cwd: '/tmp/project',
      workspaceRoot: '/tmp/project',
      purpose: 'Inspect the system',
      timeoutSeconds: 600,
    });
    const { container } = renderChatInput();

    const approval = container.querySelector<HTMLElement>('[data-computer-command-approval="true"]');
    const approvalFrame = container.querySelector<HTMLElement>('[data-computer-command-approval-frame="true"]');
    const composer = container.querySelector<HTMLElement>('[data-chat-input="true"]');
    expect(approval).not.toBeNull();
    expect(approvalFrame).not.toBeNull();
    expect(composer).not.toBeNull();
    if (!approval || !approvalFrame || !composer) {
      throw new Error('Expected approval frame, approval controls, and composer elements.');
    }
    expect(approvalFrame).toContainElement(approval);
    expect(approvalFrame.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(approvalFrame).toHaveClass('absolute');
    expect(approvalFrame).toHaveClass('bottom-[var(--vlaina-offset-computer-command-approval)]');
    expect(approvalFrame).toHaveClass('bg-[var(--vlaina-color-accent-soft)]');
    expect(composer).toHaveClass('!shadow-none');
    expect(screen.getByRole('button', { name: 'chat.computerUse.runOnce' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'chat.computerUse.alwaysRun' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument();
    for (const button of screen.getAllByRole('button').filter((item) => [
      'chat.computerUse.runOnce',
      'chat.computerUse.alwaysRun',
      'common.cancel',
    ].includes(item.textContent || ''))) {
      expect(button).toHaveClass('!rounded-[var(--vlaina-radius-pill)]');
    }
  });

  it('restores composer focus after approving a computer command', async () => {
    const respondToApproval = vi.fn(async () => true);
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: { respondToApproval },
    } as unknown as DesktopApi;
    publishComputerCommandApproval('approval-1', {
      sessionId: 'session-1',
      messageId: 'assistant-1',
      commandId: 'command-1',
      command: 'uname -a',
      cwd: '/tmp/project',
      workspaceRoot: '/tmp/project',
      purpose: 'Inspect the system',
      timeoutSeconds: 600,
    });
    renderChatInput();

    const textarea = screen.getByPlaceholderText('chat.composerPlaceholder') as HTMLTextAreaElement;
    vi.spyOn(textarea, 'getClientRects').mockReturnValue([
      { width: 1, height: 1 },
    ] as unknown as DOMRectList);
    textarea.blur();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'chat.computerUse.runOnce' }));
    });

    expect(respondToApproval).toHaveBeenCalledWith('approval-1', 'run_once');
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('keeps the approval overlay outside the quota frame clipping boundary', () => {
    publishComputerCommandApproval('approval-1', {
      sessionId: 'session-1',
      messageId: 'assistant-1',
      commandId: 'command-1',
      command: 'uname -a',
      cwd: '/tmp/project',
      workspaceRoot: '/tmp/project',
      purpose: 'Inspect the system',
      timeoutSeconds: 600,
    });
    const { container } = renderChatInput({ isManagedQuotaExhausted: true });

    const approvalFrame = container.querySelector<HTMLElement>('[data-computer-command-approval-frame="true"]');
    const composer = container.querySelector<HTMLElement>('[data-chat-input="true"]');
    if (!approvalFrame || !composer?.parentElement) {
      throw new Error('Expected approval and quota frames.');
    }

    const quotaFrame = composer.parentElement;
    expect(quotaFrame).toHaveClass('overflow-hidden');
    expect(quotaFrame).not.toContainElement(approvalFrame);
    expect(approvalFrame.parentElement).toContainElement(quotaFrame);
  });

  it('does not show pending approval controls in an inactive chat input', () => {
    publishComputerCommandApproval('approval-1', {
      sessionId: 'session-1',
      messageId: 'assistant-1',
      commandId: 'command-1',
      command: 'uname -a',
      cwd: '/tmp/project',
      workspaceRoot: '/tmp/project',
      purpose: 'Inspect the system',
      timeoutSeconds: 600,
    });
    const { container } = renderChatInput({ active: false });

    expect(container.querySelector('[data-computer-command-approval-frame="true"]')).toBeNull();
  });

  it('suspends input portals when the chat becomes inactive', async () => {
    (window as Window & { vlainaDesktop?: DesktopApi }).vlainaDesktop = {
      platform: 'electron',
      computer: {},
    } as DesktopApi;
    const { props, rerender } = renderChatInput();

    fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));
    fireEvent.click(screen.getByRole('button', { name: 'chat.computerUse' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(<ChatInput {...props} active={false} />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('chat.uploadFile')).not.toBeInTheDocument();

    rerender(<ChatInput {...props} active />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
