import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/lib/ai/types';
import {
  ChatMessageOutlineRail,
  getChatMessageOutlineLabel,
} from './ChatMessageOutlineRail';

const virtualizerMocks = vi.hoisted(() => ({
  measure: vi.fn(),
  scrollToIndex: vi.fn(),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    count: number;
    enabled: boolean;
    estimateSize: () => number;
  }) => ({
    getTotalSize: () => options.count * options.estimateSize(),
    getVirtualItems: () => options.enabled
      ? Array.from({ length: Math.min(options.count, 12) }, (_, index) => ({
          index,
          start: index * options.estimateSize(),
        }))
      : [],
    measure: virtualizerMocks.measure,
    scrollToIndex: virtualizerMocks.scrollToIndex,
  }),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function createMessage(
  id: string,
  role: ChatMessage['role'],
  content: string,
  imageSources?: string[],
): ChatMessage {
  const timestamp = Date.now();
  return {
    id,
    role,
    content,
    imageSources,
    modelId: 'model-a',
    timestamp,
    versions: [{ content, createdAt: timestamp, kind: 'original', subsequentMessages: [] }],
    currentVersionIndex: 0,
  };
}

describe('ChatMessageOutlineRail', () => {
  it('shows only user prompts, limited to their first 15 characters', () => {
    const userMessage = createMessage(
      'u1',
      'user',
      '第一行用户消息\n第二行继续补充内容',
    );

    render(
      <ChatMessageOutlineRail
        activeMessageId="u1"
        enabled
        messages={[
          userMessage,
          createMessage('a1', 'assistant', 'Assistant response'),
        ]}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'sidebar.outline' })).toBeVisible();
    expect(document.querySelector('[data-chat-message-outline="true"]'))
      .toHaveAttribute('data-layout-resize-right-anchor', 'true');
    expect(screen.getByRole('button', {
      name: '第一行用户消息 第二行继续补充',
    })).toHaveAttribute('aria-current', 'location');
    expect(screen.queryByRole('button', { name: 'Assistant response' })).not.toBeInTheDocument();
  });

  it('uses the attachment label when a user prompt only contains an image', () => {
    const source = 'attachment://image.png';
    const message = createMessage(
      'u1',
      'user',
      `![image](<${source}>)`,
      [source],
    );

    expect(getChatMessageOutlineLabel(message, 'Attachment')).toBe('Attachment');
  });

  it('uses the attachment label for an HTML image-only prompt', () => {
    const message = createMessage(
      'u-html-image',
      'user',
      '<img src="https://example.test/image.png">',
    );

    expect(getChatMessageOutlineLabel(message, 'Attachment')).toBe('Attachment');
  });

  it('collapses after selecting a prompt with the pointer and moving away', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ChatMessageOutlineRail
        activeMessageId={null}
        enabled
        messages={[createMessage('u1', 'user', 'Open this prompt')]}
        onSelect={onSelect}
      />,
    );
    const rail = container.querySelector<HTMLElement>('[data-chat-message-outline="true"]')!;

    expect(rail).toHaveAttribute('data-expanded', 'false');
    fireEvent.mouseEnter(rail);
    expect(rail).toHaveAttribute('data-expanded', 'true');

    const prompt = screen.getByRole('button', { name: 'Open this promp' });
    fireEvent.pointerDown(prompt);
    fireEvent.focus(prompt);
    fireEvent.pointerUp(prompt);
    fireEvent.click(prompt);
    expect(onSelect).toHaveBeenCalledWith('u1');

    fireEvent.mouseLeave(rail);
    expect(rail).toHaveAttribute('data-expanded', 'false');
  });

  it('stays expanded while a prompt has keyboard focus', () => {
    const { container } = render(
      <ChatMessageOutlineRail
        activeMessageId={null}
        enabled
        messages={[createMessage('u1', 'user', 'Keyboard prompt')]}
        onSelect={() => {}}
      />,
    );
    const rail = container.querySelector<HTMLElement>('[data-chat-message-outline="true"]')!;

    fireEvent.focus(screen.getByRole('button', { name: 'Keyboard prompt' }));
    fireEvent.mouseLeave(rail);

    expect(rail).toHaveAttribute('data-expanded', 'true');
  });

  it('does not render without user prompts', () => {
    const { container } = render(
      <ChatMessageOutlineRail
        activeMessageId={null}
        enabled
        messages={[createMessage('a1', 'assistant', 'Assistant response')]}
        onSelect={() => {}}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('virtualizes large outlines and keeps the active prompt in view', async () => {
    const messages = Array.from({ length: 200 }, (_, index) => createMessage(
      `u${index + 1}`,
      'user',
      `Prompt ${index + 1} ${'long content '.repeat(100)}`,
    ));

    const { container } = render(
      <ChatMessageOutlineRail
        activeMessageId="u1"
        enabled
        messages={messages}
        onSelect={() => {}}
      />,
    );

    expect(container.querySelector('[data-chat-message-outline-virtual-list="true"]'))
      .toBeInTheDocument();
    expect(container.querySelectorAll('.chat-message-outline-row')).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Prompt 1 long c' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prompt 200 long' })).toBeNull();
    await waitFor(() => {
      expect(virtualizerMocks.scrollToIndex).toHaveBeenCalledWith(0, { align: 'auto' });
    });
  });
});
