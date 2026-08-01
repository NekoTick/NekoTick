import { beforeEach, describe, expect, it, vi } from 'vitest';
import { focusNoteInitialPosition } from './focusNoteInitialPosition';

const mocks = vi.hoisted(() => ({
  focusCurrentEmptyUntitledDraftTitle: vi.fn(() => false),
  focusEditorToInitialPosition: vi.fn(),
}));

vi.mock('./emptyUntitledDraftTitleFocus', () => ({
  focusCurrentEmptyUntitledDraftTitle: mocks.focusCurrentEmptyUntitledDraftTitle,
}));

vi.mock('./focusEditor', () => ({
  focusEditorToInitialPosition: mocks.focusEditorToInitialPosition,
}));

describe('focusNoteInitialPosition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.focusCurrentEmptyUntitledDraftTitle.mockReturnValue(false);
  });

  it('focuses the first editor line end for an ordinary note', () => {
    focusNoteInitialPosition(document);

    expect(mocks.focusEditorToInitialPosition).toHaveBeenCalledTimes(1);
  });

  it('keeps an empty untitled draft focused in its title', () => {
    mocks.focusCurrentEmptyUntitledDraftTitle.mockReturnValue(true);

    focusNoteInitialPosition(document);

    expect(mocks.focusEditorToInitialPosition).not.toHaveBeenCalled();
  });
});
