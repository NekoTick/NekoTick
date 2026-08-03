import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/lib/ai/types';
import { MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS } from '@/lib/ui/composerFocusRegistry';

const { notesStoreState, useNotesStoreMock } = vi.hoisted(() => ({
  notesStoreState: {
    rootFolder: null,
    currentNote: null,
    notesPath: '',
    isLoading: false,
    starredEntries: [],
    loadFileTree: vi.fn(),
    getDisplayName: (path: string) => path,
    getNoteIcon: () => undefined,
  },
  useNotesStoreMock: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: (selector: (state: any) => unknown) => useNotesStoreMock(selector(notesStoreState)),
}));

vi.mock('@/components/Chat/common/LocalImage', () => ({
  LocalImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

vi.mock('@/components/Chat/common/messageClipboard', () => ({
  MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES: 2000,
  MAX_CHAT_MESSAGE_IMAGE_SOURCES: 1000,
  copyMessageContentToClipboard: vi.fn(async () => {}),
  extractMarkdownImageSources: vi.fn(() => []),
  extractRenderedMarkdownImageSources: vi.fn(() => []),
  extractRenderedMessageImageSources: vi.fn(() => []),
  isRenderedImageSource: vi.fn(() => true),
  normalizeRenderedMessageImageSources: vi.fn((value: string[] | undefined) => value ?? []),
  stripMarkdownImageTokens: vi.fn((value: string) => value),
  stripMessageImageTokens: vi.fn((value: string) => value),
}));

vi.mock('@/lib/navigation/externalLinks', () => ({
  normalizeExternalHref: vi.fn(() => null),
  openExternalHref: vi.fn(async () => {}),
}));

import { UserMessage } from './UserMessage';

function createMessage(content = 'Draft the launch checklist'): ChatMessage {
  const timestamp = Date.now();
  return {
    id: 'u1',
    role: 'user',
    content,
    modelId: 'model-a',
    timestamp,
    versions: [{ content, createdAt: timestamp, kind: 'original' as const, subsequentMessages: [] }],
    currentVersionIndex: 0,
  };
}

describe('UserMessage', () => {
  beforeEach(() => {
    useNotesStoreMock.mockClear();
    useNotesStoreMock.mockImplementation((selectedValue: unknown) => selectedValue);
  });

  it('does not subscribe to notes state while only rendering display mode', () => {
    render(<UserMessage message={createMessage()} containerWidth={880} onEdit={vi.fn()} />);

    expect(screen.getByText('Draft the launch checklist')).toBeInTheDocument();
    expect(useNotesStoreMock).not.toHaveBeenCalled();
  });

  it('uses the shared compact icon button styling for sent message actions', () => {
    render(<UserMessage message={createMessage()} containerWidth={880} onEdit={vi.fn()} />);

    const copyButton = screen.getByLabelText('Copy message');
    const editButton = screen.getByLabelText('Edit message');

    for (const button of [copyButton, editButton]) {
      expect(button.className).toContain('h-7');
      expect(button.className).toContain('w-7');
      expect(button.className).toContain('cursor-pointer');
      expect(button.className).toContain('hover:text-[var(--vlaina-accent)]');
      expect(button.className).toContain('text-[var(--vlaina-sidebar-chat-text)]');
    }
  });

  it('subscribes to notes state after entering edit mode', () => {
    render(<UserMessage message={createMessage()} containerWidth={880} onEdit={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]!);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(useNotesStoreMock).toHaveBeenCalled();
  });

  it('limits edited message text before saving', () => {
    const onEdit = vi.fn();
    const { container } = render(<UserMessage message={createMessage()} containerWidth={880} onEdit={onEdit} />);
    const oversizedMessage = 'x'.repeat(MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS + 1);

    fireEvent.click(screen.getByLabelText('Edit message'));
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: oversizedMessage,
        selectionStart: oversizedMessage.length,
      },
    });

    expect(textarea.value).toBe('x'.repeat(MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS));

    const saveButton = container.querySelector('[data-chat-message-editor-action="save"]');
    expect(saveButton).not.toBeNull();
    fireEvent.click(saveButton!);

    expect(onEdit).toHaveBeenCalledWith('u1', 'x'.repeat(MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS));
  });

  it('uses the dark-theme accent treatment for the edit send button in light mode', () => {
    const { container } = render(<UserMessage message={createMessage()} containerWidth={880} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Edit message'));

    const saveButton = container.querySelector('[data-chat-message-editor-action="save"]');
    expect(saveButton).not.toBeNull();
    expect(saveButton?.className).toContain('bg-[var(--vlaina-color-user-message-editor-submit)]');
    expect(saveButton?.className).toContain('text-[length:var(--vlaina-font-13)]');
    expect(saveButton?.className).toContain('text-[var(--vlaina-color-white)]');
    expect(saveButton?.className).toContain('shadow-[var(--vlaina-shadow-user-message-editor-submit)]');
    expect(saveButton?.className).not.toContain('dark:bg-');
  });

  it('does not render the hover toolbar while waiting for an assistant response', () => {
    render(
      <UserMessage
        message={createMessage()}
        containerWidth={880}
        isAwaitingResponse
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('collapses visually wrapped first user messages while waiting for an assistant response', () => {
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      lineHeight: '24px',
    } as CSSStyleDeclaration);
    const scrollHeightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(240);

    try {
      const { container } = render(
        <UserMessage
          message={createMessage('这是一段没有换行但是会在窄气泡里视觉换行的长中文内容。'.repeat(30))}
          containerWidth={220}
          isAwaitingResponse
          onEdit={vi.fn()}
        />,
      );

      expect(container.querySelector('[data-chat-long-user-message]'))
        .toHaveAttribute('data-chat-long-user-message', 'collapsed');
      expect(screen.getByLabelText('Expand')).toHaveAttribute('aria-expanded', 'false');
    } finally {
      getComputedStyleSpy.mockRestore();
      scrollHeightSpy.mockRestore();
    }
  });

  it('reuses the bounded preview when an oversized message is collapsed again', () => {
    const tail = 'END-OF-LONG-MESSAGE';
    const content = `${'x'.repeat(5_000)}${tail}`;
    const onLayoutChange = vi.fn();
    const { container } = render(
      <div data-chat-scrollable="true">
        <UserMessage
          message={createMessage(content)}
          containerWidth={880}
          onEdit={vi.fn()}
          onLayoutChange={onLayoutChange}
        />
      </div>,
    );
    const bubble = container.querySelector('[data-chat-long-user-message]');
    const preview = container.querySelector('[data-chat-long-user-message-text="preview"]');

    expect(bubble).toHaveAttribute('data-chat-long-user-message', 'collapsed');
    expect(preview).not.toHaveAttribute('hidden');
    expect(container.querySelector('[data-chat-long-user-message-text="full"]')).toBeNull();
    expect(container.textContent).not.toContain(tail);

    fireEvent.click(screen.getByLabelText('Expand'));

    expect(onLayoutChange).toHaveBeenLastCalledWith('u1');
    expect(preview).toHaveAttribute('hidden');
    expect(container.textContent).toContain(tail);

    const scrollable = container.querySelector('[data-chat-scrollable="true"]') as HTMLDivElement;
    scrollable.scrollTop = 500;
    const collapseButton = screen.getByLabelText('Collapse');
    vi.spyOn(collapseButton, 'getBoundingClientRect').mockImplementation(() => ({
      top: collapseButton.getAttribute('aria-expanded') === 'true' ? 300 : 240,
    } as DOMRect));
    onLayoutChange.mockClear();
    fireEvent.click(collapseButton);

    expect(onLayoutChange).toHaveBeenCalledOnce();
    expect(onLayoutChange).toHaveBeenCalledWith('u1');
    expect(scrollable.scrollTop).toBe(440);
    expect(container.querySelector('[data-chat-long-user-message-text="preview"]')).toBe(preview);
    expect(preview).not.toHaveAttribute('hidden');
    expect(container.querySelector('[data-chat-long-user-message-text="full"]')).toBeNull();
    expect(container.textContent).not.toContain(tail);
  });

  it('keeps 8-line user messages expanded without a long-message toggle', () => {
    const content = Array.from({ length: 8 }, (_value, index) => `line ${index + 1}`).join('\n');
    const { container } = render(<UserMessage message={createMessage(content)} containerWidth={880} onEdit={vi.fn()} />);

    expect(container.querySelector('[data-chat-long-user-message]')).toBeNull();
    expect(screen.queryByLabelText('Expand')).not.toBeInTheDocument();
    expect(container.textContent).toContain('line 8');
  });

  it('collapses user messages longer than 8 lines and allows them to be expanded', () => {
    const content = Array.from({ length: 9 }, (_value, index) => `line ${index + 1}`).join('\n');
    const { container } = render(<UserMessage message={createMessage(content)} containerWidth={880} onEdit={vi.fn()} />);
    const bubble = container.querySelector('[data-chat-long-user-message]');

    expect(bubble).toHaveAttribute('data-chat-long-user-message', 'collapsed');
    expect(container.textContent).toContain('line 8');
    expect(container.textContent).not.toContain('line 9');

    const expandButton = screen.getByLabelText('Expand');
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expandButton);

    expect(bubble).toHaveAttribute('data-chat-long-user-message', 'expanded');
    expect(container.textContent).toContain('line 9');
    const collapseButton = screen.getByLabelText('Collapse');
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(collapseButton);

    expect(bubble).toHaveAttribute('data-chat-long-user-message', 'collapsed');
    expect(container.textContent).not.toContain('line 9');
  });

  it('uses the shared compact version navigator for editable prompt versions', () => {
    const onSwitchVersion = vi.fn();
    const message = {
      ...createMessage(),
      content: 'Second prompt',
      currentVersionIndex: 1,
      versions: [
        { content: 'First prompt', createdAt: 1, kind: 'original' as const, subsequentMessages: [] },
        { content: 'Second prompt', createdAt: 2, kind: 'edit' as const, subsequentMessages: [] },
        { content: 'Third prompt', createdAt: 3, kind: 'edit' as const, subsequentMessages: [] },
      ],
    };

    render(
      <UserMessage
        message={message}
        containerWidth={880}
        onEdit={vi.fn()}
        onSwitchVersion={onSwitchVersion}
      />,
    );

    expect(screen.getByText('2/3')).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[1]!);

    expect(onSwitchVersion).toHaveBeenNthCalledWith(1, 'u1', 0);
    expect(onSwitchVersion).toHaveBeenNthCalledWith(2, 'u1', 2);
  });
});
