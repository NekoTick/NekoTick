import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/lib/ai/types';
import { GlobalSearchPreview } from './GlobalSearchPreview';
import type { GlobalSearchResult } from './globalSearchResults';

vi.mock('@/components/Chat/features/Messages/components/MessageItem', () => ({
  MessageItem: ({ msg }: { msg: ChatMessage }) => (
    <div
      data-testid="preview-chat-message"
      data-image-count={msg.imageSources?.length ?? 0}
      data-message-id={msg.id}
      data-version-count={msg.versions.length}
    >
      {msg.content}
    </div>
  ),
}));
vi.mock('@/components/Notes/features/Split/NotesSplitPreviewPane', () => ({
  NotesSplitPreviewPane: () => null,
}));
vi.mock('./GlobalWhiteboardSearchPreview', () => ({
  GlobalWhiteboardSearchPreview: () => null,
}));

function createMessage(index: number): ChatMessage {
  return {
    id: `message-${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: index === 9 ? 'x'.repeat(9_000) : `Message ${index}`,
    imageSources: index === 9 ? Array.from({ length: 10 }, (_, imageIndex) => `image-${imageIndex}`) : undefined,
    modelId: 'model',
    timestamp: index,
    versions: [],
    currentVersionIndex: 0,
  };
}

describe('GlobalSearchPreview', () => {
  it('reuses chat message items while bounding preview work', () => {
    const result: GlobalSearchResult = {
      id: 'chat:session-1',
      kind: 'chat',
      session: {
        id: 'session-1',
        title: 'Project chat',
        modelId: 'model',
        createdAt: 1,
        updatedAt: 2,
      },
      subtitle: '',
      title: 'Project chat',
    };

    render(
      <GlobalSearchPreview
        activeBoardId={null}
        activeSnapshot={null}
        chatMessages={Array.from({ length: 10 }, (_, index) => createMessage(index))}
        notesRootPath="/notes"
        noteContent=""
        result={result}
      />,
    );

    const renderedMessages = screen.getAllByTestId('preview-chat-message');
    expect(renderedMessages).toHaveLength(8);
    expect(renderedMessages[0]).toHaveAttribute('data-message-id', 'message-2');
    expect(renderedMessages[7]).toHaveTextContent('x'.repeat(8_000));
    expect(renderedMessages[7]).not.toHaveTextContent('x'.repeat(8_001));
    expect(renderedMessages[7]).toHaveAttribute('data-image-count', '4');
    expect(renderedMessages[7]).toHaveAttribute('data-version-count', '0');
  });
});
