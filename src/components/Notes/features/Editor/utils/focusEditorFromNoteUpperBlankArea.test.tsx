import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { focusEditorFromNoteUpperBlankArea } from './focusEditorFromNoteUpperBlankArea';

const mocks = vi.hoisted(() => ({
  focusNoteInitialPosition: vi.fn(),
}));

vi.mock('./focusNoteInitialPosition', () => ({
  focusNoteInitialPosition: mocks.focusNoteInitialPosition,
}));

function renderFocusSurface() {
  render(
    <div data-testid="surface" onClick={focusEditorFromNoteUpperBlankArea}>
      <div data-testid="upper-blank" />
      <button type="button">Icon control</button>
      <div data-no-auto-close="true">
        <div data-testid="picker-blank" />
      </div>
      <div data-note-content-root="true" data-testid="content-root">
        <div data-testid="line-trailing-blank" />
      </div>
    </div>,
  );
  vi.spyOn(screen.getByTestId('content-root'), 'getBoundingClientRect').mockReturnValue({
    bottom: 500,
    height: 300,
    left: 100,
    right: 700,
    top: 200,
    width: 600,
    x: 100,
    y: 200,
    toJSON: () => ({}),
  });
}

describe('focusEditorFromNoteUpperBlankArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('focuses the first editor line end from non-interactive upper blank space', () => {
    renderFocusSurface();

    fireEvent.click(screen.getByTestId('upper-blank'), { button: 0, clientY: 120 });

    expect(mocks.focusNoteInitialPosition).toHaveBeenCalledTimes(1);
  });

  it('leaves icon controls, picker chrome, and concrete line trailing space alone', () => {
    renderFocusSurface();

    fireEvent.click(screen.getByRole('button', { name: 'Icon control' }), { button: 0, clientY: 120 });
    fireEvent.click(screen.getByTestId('picker-blank'), { button: 0, clientY: 120 });
    fireEvent.click(screen.getByTestId('line-trailing-blank'), { button: 0, clientY: 240 });

    expect(mocks.focusNoteInitialPosition).not.toHaveBeenCalled();
  });
});
