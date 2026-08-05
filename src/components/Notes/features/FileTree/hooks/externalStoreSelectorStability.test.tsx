import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getFileTreePointerDragSnapshot,
  setFileTreePointerDragSnapshot,
  useFileTreePointerDragState,
  useIsFileTreePointerDragActive,
  useIsFileTreePointerDragSource,
  useIsFileTreePointerFolderDropTarget,
  useIsFileTreePointerStarredDropTarget,
} from './fileTreePointerDragStore';
import {
  clearExternalFileTreeDropTarget,
  setExternalFileTreeDropTarget,
  useExternalFileTreeDropState,
} from './externalFileTreeDropState';

function SelectorHarness() {
  const pointerDrag = useFileTreePointerDragState((snapshot) => ({
    active: snapshot.activeSourcePath !== null,
  }));
  const externalDrop = useExternalFileTreeDropState((snapshot) => ({
    active: snapshot.active,
  }));

  return <div>{String(pointerDrag.active)}:{String(externalDrop.active)}</div>;
}

function SourceSelectionHarness({ path, onRender }: { path: string; onRender: () => void }) {
  onRender();
  const active = useIsFileTreePointerDragSource(path);
  return <div>{path}:{String(active)}</div>;
}

function FolderSelectionHarness({ path, onRender }: { path: string; onRender: () => void }) {
  onRender();
  const active = useIsFileTreePointerFolderDropTarget(path);
  return <div>{path}:{String(active)}</div>;
}

function ActiveSelectionHarness({ onRender }: { onRender: () => void }) {
  onRender();
  const active = useIsFileTreePointerDragActive();
  return <div>active:{String(active)}</div>;
}

function StarredSelectionHarness({ onRender }: { onRender: () => void }) {
  onRender();
  const active = useIsFileTreePointerStarredDropTarget();
  return <div>starred:{String(active)}</div>;
}

describe('external file tree selector hooks', () => {
  afterEach(() => {
    act(() => {
      setFileTreePointerDragSnapshot({
        activeSourcePath: null,
        dropTargetKind: null,
        dropTargetPath: null,
      });
      clearExternalFileTreeDropTarget();
    });
  });

  it('allows derived object selectors without exposing them as external-store snapshots', () => {
    expect(getFileTreePointerDragSnapshot().activeSourcePath).toBeNull();
    render(
      <StrictMode>
        <SelectorHarness />
      </StrictMode>,
    );

    expect(screen.getByText('false:false')).toBeInTheDocument();

    act(() => {
      setFileTreePointerDragSnapshot({
        activeSourcePath: 'docs/alpha.md',
        dropTargetKind: null,
        dropTargetPath: null,
      });
      setExternalFileTreeDropTarget('docs', 'folder');
    });

    expect(screen.getByText('true:true')).toBeInTheDocument();
  });

  it('rerenders only consumers whose selected drag state changes', () => {
    const sourceAlphaRender = vi.fn();
    const sourceBetaRender = vi.fn();
    const folderDocsRender = vi.fn();
    const folderArchiveRender = vi.fn();
    const activeRender = vi.fn();
    const starredRender = vi.fn();
    render(
      <>
        <SourceSelectionHarness path="alpha.md" onRender={sourceAlphaRender} />
        <SourceSelectionHarness path="beta.md" onRender={sourceBetaRender} />
        <FolderSelectionHarness path="docs" onRender={folderDocsRender} />
        <FolderSelectionHarness path="archive" onRender={folderArchiveRender} />
        <ActiveSelectionHarness onRender={activeRender} />
        <StarredSelectionHarness onRender={starredRender} />
      </>,
    );

    expect(sourceAlphaRender).toHaveBeenCalledTimes(1);
    expect(sourceBetaRender).toHaveBeenCalledTimes(1);
    expect(folderDocsRender).toHaveBeenCalledTimes(1);
    expect(folderArchiveRender).toHaveBeenCalledTimes(1);
    expect(activeRender).toHaveBeenCalledTimes(1);
    expect(starredRender).toHaveBeenCalledTimes(1);

    act(() => {
      setFileTreePointerDragSnapshot({
        activeSourcePath: 'alpha.md',
        dropTargetKind: 'folder',
        dropTargetPath: 'docs',
      });
    });

    expect(sourceAlphaRender).toHaveBeenCalledTimes(2);
    expect(sourceBetaRender).toHaveBeenCalledTimes(1);
    expect(folderDocsRender).toHaveBeenCalledTimes(2);
    expect(folderArchiveRender).toHaveBeenCalledTimes(1);
    expect(activeRender).toHaveBeenCalledTimes(2);
    expect(starredRender).toHaveBeenCalledTimes(1);

    act(() => {
      setFileTreePointerDragSnapshot({
        activeSourcePath: 'alpha.md',
        dropTargetKind: 'folder',
        dropTargetPath: 'archive',
      });
    });

    expect(sourceAlphaRender).toHaveBeenCalledTimes(2);
    expect(sourceBetaRender).toHaveBeenCalledTimes(1);
    expect(folderDocsRender).toHaveBeenCalledTimes(3);
    expect(folderArchiveRender).toHaveBeenCalledTimes(2);
    expect(activeRender).toHaveBeenCalledTimes(2);
    expect(starredRender).toHaveBeenCalledTimes(1);

    act(() => {
      setFileTreePointerDragSnapshot({
        activeSourcePath: 'alpha.md',
        dropTargetKind: 'starred',
        dropTargetPath: null,
      });
    });

    expect(sourceAlphaRender).toHaveBeenCalledTimes(2);
    expect(sourceBetaRender).toHaveBeenCalledTimes(1);
    expect(folderDocsRender).toHaveBeenCalledTimes(3);
    expect(folderArchiveRender).toHaveBeenCalledTimes(3);
    expect(activeRender).toHaveBeenCalledTimes(2);
    expect(starredRender).toHaveBeenCalledTimes(2);
  });
});
