import { fireEvent, render, screen } from '@testing-library/react';
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
  NotesSplitPreviewPane: ({
    content,
    path,
    title,
  }: {
    content: string;
    path: string;
    title: string;
  }) => (
    <div data-content-length={content.length} data-testid="preview-note">
      {title}:{path}:{content}
    </div>
  ),
}));
vi.mock('./GlobalWhiteboardSearchPreview', () => ({
  GlobalWhiteboardSearchPreview: () => null,
}));
vi.mock('./GlobalSearchGraphPreview', () => ({
  GlobalSearchLocalGraphPreview: ({ focusPath }: { focusPath: string }) => (
    <div data-testid="local-graph-preview">{focusPath}</div>
  ),
  GlobalSearchGraphPreviewButton: ({
    focusPath,
    onOpenGraph,
  }: {
    focusPath: string;
    onOpenGraph: (path: string) => void;
  }) => <button type="button" onClick={() => onOpenGraph(focusPath)}>Open graph</button>,
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
  it('previews a graph result around its file instead of showing note content', () => {
    const result: GlobalSearchResult = {
      id: 'graph:docs/Project.md',
      kind: 'graph',
      node: { degree: 2, id: 'docs/Project.md', label: 'Project' },
      subtitle: 'docs/Project.md',
      title: 'Project',
    };

    render(
      <GlobalSearchPreview
        activeBoardId={null}
        activeSnapshot={null}
        chatMessages={[]}
        notesRootPath="/notes"
        noteContent=""
        onOpenGraph={() => {}}
        result={result}
      />,
    );

    expect(screen.queryByTestId('preview-note')).not.toBeInTheDocument();
    expect(screen.getByTestId('local-graph-preview')).toHaveTextContent('docs/Project.md');
  });

  it('opens the hovered note preview graph from the note path', () => {
    const onOpenGraph = vi.fn();
    const result: GlobalSearchResult = {
      id: 'notes:project',
      kind: 'notes',
      note: {
        id: 'project',
        path: 'docs/Project.md',
        name: 'Project',
        preview: '',
        matchIndex: 0,
        matchKind: 'name',
        contentSnippet: null,
        contentMatchOrdinal: null,
      },
      subtitle: '',
      title: 'Project',
    };

    render(
      <GlobalSearchPreview
        activeBoardId={null}
        activeSnapshot={null}
        chatMessages={[]}
        notesRootPath="/notes"
        noteContent="# Project"
        onOpenGraph={onOpenGraph}
        result={result}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open graph' }));
    expect(onOpenGraph).toHaveBeenCalledWith('docs/Project.md');
  });

  it('bounds markdown work for large note previews', () => {
    const result: GlobalSearchResult = {
      id: 'notes:large',
      kind: 'notes',
      note: {
        id: 'large',
        path: 'Large.md',
        name: 'Large',
        preview: '',
        matchIndex: 0,
        matchKind: 'name',
        contentSnippet: null,
        contentMatchOrdinal: null,
      },
      subtitle: '',
      title: 'Large',
    };

    render(
      <GlobalSearchPreview
        activeBoardId={null}
        activeSnapshot={null}
        chatMessages={[]}
        notesRootPath="/notes"
        noteContent={'x'.repeat(100_000)}
        onOpenGraph={() => {}}
        result={result}
      />,
    );

    expect(screen.getByTestId('preview-note')).toHaveAttribute('data-content-length', '80000');
  });

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
        onOpenGraph={() => {}}
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
