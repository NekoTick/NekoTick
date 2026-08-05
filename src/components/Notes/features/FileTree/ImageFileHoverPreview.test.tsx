import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageFileHoverPreview } from './ImageFileHoverPreview';
import {
  hideImageFileHoverPreview,
  showImageFileHoverPreview,
} from './imageFileHoverPreviewState';

const mocks = vi.hoisted(() => ({
  loadImageAsBlob: vi.fn(async () => 'blob:hover-preview'),
  resolveNotesRootRelativeFullPath: vi.fn(async () => ({
    fullPath: '/notesRoot/images/cover.gif',
    relativePath: 'images/cover.gif',
  })),
}));

vi.mock('@/lib/assets/io/reader', () => ({
  loadImageAsBlob: mocks.loadImageAsBlob,
}));

vi.mock('@/stores/notes/utils/fs/notesRootPathContainment', () => ({
  resolveNotesRootRelativeFullPath: mocks.resolveNotesRootRelativeFullPath,
}));

describe('ImageFileHoverPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    act(() => hideImageFileHoverPreview('images/cover.gif'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the full image while its file row is hovered and hides on leave', async () => {
    render(<ImageFileHoverPreview />);

    act(() => {
      showImageFileHoverPreview({
        imagePath: 'images/cover.gif',
        notesPath: '/notesRoot',
      });
    });
    expect(document.querySelector('[data-image-file-hover-preview="true"]')).toBeNull();
    expect(document.documentElement).not.toHaveAttribute(
      'data-image-file-hover-preview-active',
    );
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole('img', { name: 'images/cover.gif' })).toHaveAttribute(
      'src',
      'blob:hover-preview',
    );
    const preview = document.querySelector('[data-image-file-hover-preview="true"]');
    expect(preview).toHaveClass('z-[var(--vlaina-z-30)]');
    expect(preview).not.toHaveClass('z-[var(--vlaina-z-40)]');
    expect(document.documentElement).toHaveAttribute(
      'data-image-file-hover-preview-active',
      'true',
    );
    expect(mocks.resolveNotesRootRelativeFullPath).toHaveBeenCalledWith(
      '/notesRoot',
      'images/cover.gif',
    );

    act(() => hideImageFileHoverPreview('images/cover.gif'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute(
      'data-image-file-hover-preview-active',
    );
  });

  it('does not load the full image during a brief hover', () => {
    render(<ImageFileHoverPreview />);

    act(() => {
      showImageFileHoverPreview({
        imagePath: 'images/cover.gif',
        notesPath: '/notesRoot',
      });
      vi.advanceTimersByTime(149);
      hideImageFileHoverPreview('images/cover.gif');
      vi.runOnlyPendingTimers();
    });

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute(
      'data-image-file-hover-preview-active',
    );
    expect(mocks.resolveNotesRootRelativeFullPath).not.toHaveBeenCalled();
    expect(mocks.loadImageAsBlob).not.toHaveBeenCalled();
  });
});
