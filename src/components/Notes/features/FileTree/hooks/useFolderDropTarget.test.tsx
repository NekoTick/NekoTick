import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearExternalFileTreeDropTarget, setExternalFileTreeDropTarget } from './externalFileTreeDropState';
import { useFolderDropTarget } from './useFolderDropTarget';

vi.mock('./fileTreePointerDragState', () => ({
  useIsFileTreePointerFolderDropTarget: () => false,
}));

function Harness({ path }: { path: string }) {
  const { isDragOver } = useFolderDropTarget(path);

  return <div data-testid="state">{isDragOver ? 'true' : 'false'}</div>;
}

describe('useFolderDropTarget', () => {
  afterEach(() => {
    clearExternalFileTreeDropTarget();
  });

  it('treats external drop targets as drag-over state', () => {
    render(<Harness path="docs" />);

    expect(screen.getByTestId('state')).toHaveTextContent('false');

    act(() => {
      setExternalFileTreeDropTarget('docs');
    });

    expect(screen.getByTestId('state')).toHaveTextContent('true');

    act(() => {
      clearExternalFileTreeDropTarget();
    });

    expect(screen.getByTestId('state')).toHaveTextContent('false');
  });
});
