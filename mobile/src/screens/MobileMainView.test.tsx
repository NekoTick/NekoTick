import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileMainView } from './MobileMainView';

const controls = vi.hoisted(() => {
  let resolveChat: (module: unknown) => void = () => undefined;
  const chatModule = new Promise((resolve) => {
    resolveChat = resolve;
  });
  return {
    chatModule,
    notesLayoutCleanup: vi.fn(),
    resolveChat,
    whiteboardProps: vi.fn(),
  };
});

vi.mock('@/components/Notes/NotesView', async () => {
  const ReactModule = await import('react');
  return {
    NotesView: () => {
      ReactModule.useLayoutEffect(() => controls.notesLayoutCleanup, []);
      return ReactModule.createElement('div', { 'data-testid': 'notes-view' });
    },
  };
});

vi.mock('@/components/Chat/ChatView', () => controls.chatModule);
vi.mock('@/components/Whiteboard/WhiteboardView', () => ({
  WhiteboardView: (props: unknown) => {
    controls.whiteboardProps(props);
    return React.createElement('div', { 'data-testid': 'whiteboard-view' });
  },
}));
vi.mock('@/components/Graph/GraphView', () => ({
  GraphView: () => React.createElement('div'),
}));

describe('MobileMainView', () => {
  it('enables touch drawing for the mobile whiteboard', async () => {
    render(<MobileMainView activeView="whiteboard" onCreateNote={vi.fn()} />);

    await screen.findByTestId('whiteboard-view');
    expect(controls.whiteboardProps).toHaveBeenCalledWith(expect.objectContaining({
      active: true,
      drawWithTouch: true,
    }));
  });

  it('keeps Notes mounted while a newly opened view is loading', async () => {
    const { rerender } = render(<MobileMainView activeView="notes" onCreateNote={vi.fn()} />);
    await screen.findByTestId('notes-view');

    rerender(<MobileMainView activeView="chat" onCreateNote={vi.fn()} />);

    expect(controls.notesLayoutCleanup).not.toHaveBeenCalled();
    expect(document.body.contains(screen.getByTestId('notes-view'))).toBe(true);

    await act(async () => {
      controls.resolveChat({
        ChatView: () => React.createElement('div', { 'data-testid': 'chat-view' }),
      });
    });

    await screen.findByTestId('chat-view');
    expect(controls.notesLayoutCleanup).not.toHaveBeenCalled();
  });
});
