import React, { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NoteEditorFindController } from './types';
import { NoteEditorFindBar } from './NoteEditorFindBar';

vi.mock('framer-motion', async () => {
  const React = await import('react');

  const MotionDiv = React.forwardRef(function MotionDiv(props: any, ref: React.ForwardedRef<HTMLDivElement>) {
    const { children, onAnimationComplete, onUpdate, ...rest } = props;
    void onAnimationComplete;
    void onUpdate;
    return React.createElement('div', { ...rest, ref }, children);
  });

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    motion: {
      div: MotionDiv,
    },
  };
});

function createController(
  overrides: Partial<NoteEditorFindController> = {},
): NoteEditorFindController {
  return {
    isOpen: true,
    isReplaceOpen: false,
    query: 'find',
    replaceValue: '',
    activeMatchNumber: 1,
    totalMatches: 1,
    canNavigate: true,
    canReplace: true,
    inputRef: createRef<HTMLInputElement>(),
    replaceInputRef: createRef<HTMLInputElement>(),
    setQuery: vi.fn(),
    setReplaceValue: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    goToPrevious: vi.fn(),
    goToNext: vi.fn(),
    toggleReplace: vi.fn(),
    replaceCurrent: vi.fn(),
    replaceAll: vi.fn(),
    handleQueryKeyDown: vi.fn(),
    handleReplaceKeyDown: vi.fn(),
    handleQueryCompositionStart: vi.fn(),
    handleQueryCompositionEnd: vi.fn(),
    handleReplaceCompositionStart: vi.fn(),
    handleReplaceCompositionEnd: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('NoteEditorFindBar', () => {
  it('closes when clicking outside the find bar', () => {
    const controller = createController();

    render(
      <div>
        <NoteEditorFindBar controller={controller} />
        <button type="button" data-testid="outside">
          Outside
        </button>
      </div>,
    );

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(controller.close).toHaveBeenCalledWith(false);
  });

  it('closes from capture when the outside target stops propagation', () => {
    const controller = createController();

    render(
      <div>
        <NoteEditorFindBar controller={controller} />
        <button
          type="button"
          data-testid="outside"
          onMouseDown={(event) => event.stopPropagation()}
        >
          Outside
        </button>
      </div>,
    );

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(controller.close).toHaveBeenCalledWith(false);
  });

  it('closes before editor blank-area handling stops the event at document capture', () => {
    const controller = createController();
    const stopAtDocumentCapture = (event: MouseEvent) => event.stopImmediatePropagation();
    document.addEventListener('mousedown', stopAtDocumentCapture, true);

    try {
      render(
        <div>
          <NoteEditorFindBar controller={controller} />
          <button type="button" data-testid="editor-bottom-blank">
            Blank
          </button>
        </div>,
      );

      fireEvent.mouseDown(screen.getByTestId('editor-bottom-blank'));

      expect(controller.close).toHaveBeenCalledWith(false);
    } finally {
      document.removeEventListener('mousedown', stopAtDocumentCapture, true);
    }
  });

  it('stays open when clicking inside the find bar', () => {
    const controller = createController();

    render(<NoteEditorFindBar controller={controller} />);

    fireEvent.mouseDown(screen.getByPlaceholderText('Find'));

    expect(controller.close).not.toHaveBeenCalled();
  });

  it('does not accept image clipboard companion text as a find or replacement value', () => {
    const controller = createController({ isReplaceOpen: true });
    render(<NoteEditorFindBar controller={controller} />);
    const file = new File(['image'], 'find.png', { type: 'image/png' });
    const clipboardData = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      files: [file],
      getData: () => 'https://example.test/companion',
    };

    expect(fireEvent.paste(screen.getByPlaceholderText('Find'), { clipboardData })).toBe(false);
    expect(fireEvent.paste(screen.getByPlaceholderText('Replace with'), { clipboardData })).toBe(false);
    expect(controller.setQuery).not.toHaveBeenCalled();
    expect(controller.setReplaceValue).not.toHaveBeenCalled();
  });
});
