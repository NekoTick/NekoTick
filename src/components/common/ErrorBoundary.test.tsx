import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { safeTranslate } from './errorBoundaryMessages';

const mocks = vi.hoisted(() => ({ prepareNotesForReload: vi.fn() }));

vi.mock('@/stores/notes/prepareNotesForReload', () => ({
  prepareNotesForReload: mocks.prepareNotesForReload,
}));

function BrokenView(): never {
  throw new Error('render failed');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('ErrorBoundary reload safety', () => {
  it('stays on the error screen when note data cannot be secured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.prepareNotesForReload.mockResolvedValue(false);
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: safeTranslate('common.reload') }));

    await waitFor(() => {
      expect(mocks.prepareNotesForReload).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('alert')).toHaveTextContent(safeTranslate('storage.saveFailed'));
    });
  });
});
