import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMarkdownEditorFocus } from './useMarkdownEditorFocus';

function FocusHarness({ active }: { active: boolean }) {
  useMarkdownEditorFocus({ active, hasActiveNote: true });

  return (
    <div>
      <textarea data-note-source-editor="true" defaultValue={'# Alpha\n\nBody'} />
    </div>
  );
}

describe('useMarkdownEditorFocus', () => {
  it('focuses the note at its initial position after reactivation', async () => {
    const { rerender } = render(<FocusHarness active />);
    const sourceEditor = screen.getByRole('textbox') as HTMLTextAreaElement;

    rerender(<FocusHarness active={false} />);
    rerender(<FocusHarness active />);

    await waitFor(() => {
      expect(document.activeElement).toBe(sourceEditor);
    });
    expect(sourceEditor.selectionStart).toBe('# Alpha'.length);
    expect(sourceEditor.selectionEnd).toBe('# Alpha'.length);
  });
});
