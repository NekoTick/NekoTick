import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverPicker } from './CoverPicker';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';

const hoisted = vi.hoisted(() => ({
  loadAssets: vi.fn(),
  uploadAsset: vi.fn(),
  assetList: [] as Array<{ filename: string }>,
  isLoadingAssets: false,
  assetLoadError: null as string | null,
}));

const supportedImageFilenames = [
  'photo.jpg',
  'photo.jpeg',
  'screenshot.png',
  'animation.gif',
  'cover.webp',
  'diagram.svg',
  'scan.bmp',
  'favicon.ico',
  'photo.avif',
];

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: (selector: (state: any) => unknown) => selector({
    assetList: hoisted.assetList,
    isLoadingAssets: hoisted.isLoadingAssets,
    assetLoadError: hoisted.assetLoadError,
    loadAssets: hoisted.loadAssets,
    uploadAsset: hoisted.uploadAsset,
  }),
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ open, children }: { open: boolean; children?: ReactNode }) => (
    open ? <div>{children}</div> : null
  ),
  PopoverAnchor: ({ children, ...props }: { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  PopoverContent: ({
    children,
    align: _align,
    side: _side,
    sideOffset: _sideOffset,
    ...props
  }: {
    children?: ReactNode;
    align?: string;
    side?: string;
    sideOffset?: number;
  }) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock('./AssetGrid', () => ({
  AssetGrid: ({ onHover }: { onHover?: (assetPath: string | null) => void }) => (
    <div data-testid="asset-grid" onMouseLeave={() => onHover?.(null)}>
      <button type="button" onMouseEnter={() => onHover?.('a.png')}>
        hover a
      </button>
      <button type="button" onMouseEnter={() => onHover?.('b.png')}>
        hover b
      </button>
    </div>
  ),
}));

vi.mock('./UploadZone', () => ({
  UploadZone: () => <div data-testid="upload-zone" />,
}));

vi.mock('./EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));

describe('CoverPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.loadAssets.mockReturnValue(new Promise(() => undefined));
    hoisted.assetList = [];
    hoisted.isLoadingAssets = false;
    hoisted.assetLoadError = null;
  });

  it('uses the shared composer pill surface for the picker shell', () => {
    const { container } = render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="note.md"
      />,
    );

    const pickerShell = Array.from(container.querySelectorAll('div'))
      .find((element) => element.className.includes('w-[var(--vlaina-size-340px)]'));
    expect(pickerShell?.className).toContain(raisedPillSurfaceClass);
    expect(pickerShell?.className).toContain('!rounded-[var(--vlaina-notes-ui-radius-panel)]');
    expect(pickerShell?.getAttribute('data-no-editor-drag-box')).toBe('true');
  });

  it('can anchor the picker at the empty cover option bottom edge', () => {
    const { container } = render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="note.md"
        anchorPlacement="empty-cover-option"
      />,
    );

    const anchor = Array.from(container.querySelectorAll('div'))
      .find((element) => element.className.includes('top-[var(--vlaina-size-80px)]'));
    expect(anchor?.className).toContain('right-[var(--vlaina-width-cover-picker-inset)]');
  });

  it('removes the current cover without bubbling pointer events to cover interactions', () => {
    const onClose = vi.fn();
    const onRemove = vi.fn();
    const onPreview = vi.fn();
    const parentPointerDown = vi.fn();
    const parentMouseDown = vi.fn();

    render(
      <div onPointerDown={parentPointerDown} onMouseDown={parentMouseDown}>
        <CoverPicker
          isOpen
          onClose={onClose}
          onSelect={vi.fn()}
          onRemove={onRemove}
          onPreview={onPreview}
          notesRootPath="/notesRoot"
          currentNotePath="note.md"
        />
      </div>,
    );

    const removeButton = screen.getByRole('button', { name: 'Remove' });
    fireEvent.pointerDown(removeButton);
    fireEvent.mouseDown(removeButton);
    fireEvent.click(removeButton);

    expect(parentPointerDown).not.toHaveBeenCalled();
    expect(parentMouseDown).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenCalledWith(null);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on editor body mouse down outside the picker and cover region', () => {
    const onClose = vi.fn();
    const onPreview = vi.fn();

    const { container } = render(
      <>
        <div data-testid="editor-body">body</div>
        <div data-note-cover-region="true" data-testid="cover-region">cover</div>
        <CoverPicker
          isOpen
          onClose={onClose}
          onSelect={vi.fn()}
          onPreview={onPreview}
          notesRootPath="/notesRoot"
          currentNotePath="note.md"
        />
      </>,
    );

    const pickerShell = container.querySelector<HTMLElement>('[data-no-editor-drag-box="true"]');
    expect(pickerShell).not.toBeNull();

    fireEvent.mouseDown(pickerShell!);
    fireEvent.mouseDown(screen.getByTestId('cover-region'));

    expect(onClose).not.toHaveBeenCalled();
    expect(onPreview).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId('editor-body'));

    expect(onPreview).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes before blank-area editor handling stops the mouse down event', () => {
    const onClose = vi.fn();
    const onPreview = vi.fn();
    const stopAtDocumentCapture = (event: MouseEvent) => event.stopImmediatePropagation();

    document.addEventListener('mousedown', stopAtDocumentCapture, true);
    try {
      render(
        <>
          <div data-testid="editor-bottom-blank">blank</div>
          <CoverPicker
            isOpen
            onClose={onClose}
            onSelect={vi.fn()}
            onPreview={onPreview}
            notesRootPath="/notesRoot"
            currentNotePath="note.md"
          />
        </>,
      );

      fireEvent.mouseDown(screen.getByTestId('editor-bottom-blank'));

      expect(onPreview).toHaveBeenCalledWith(null);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('mousedown', stopAtDocumentCapture, true);
    }
  });

  it('clears the preview before closing on Escape', () => {
    const onClose = vi.fn();
    const onPreview = vi.fn();

    render(
      <CoverPicker
        isOpen
        onClose={onClose}
        onSelect={vi.fn()}
        onPreview={onPreview}
        notesRootPath="/notesRoot"
        currentNotePath="note.md"
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onPreview).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('debounces cover previews while moving across library items', async () => {
    hoisted.loadAssets.mockResolvedValue(undefined);
    hoisted.assetList = [{ filename: 'a.png' }];
    const onPreview = vi.fn();

    render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onPreview={onPreview}
        notesRootPath="/notesRoot"
        currentNotePath="note.md"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('asset-grid')).toBeInTheDocument());

    vi.useFakeTimers();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'hover a' }));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'hover b' }));
    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledWith('b.png');
    vi.useRealTimers();
  });

  it('clears the visible preview when leaving the asset grid', async () => {
    hoisted.loadAssets.mockResolvedValue(undefined);
    hoisted.assetList = [{ filename: 'a.png' }];
    const onPreview = vi.fn();

    render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onPreview={onPreview}
        notesRootPath="/notesRoot"
        currentNotePath="note.md"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('asset-grid')).toBeInTheDocument());

    vi.useFakeTimers();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'hover a' }));
    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(onPreview).toHaveBeenCalledWith('a.png');

    fireEvent.mouseLeave(screen.getByTestId('asset-grid'));
    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(onPreview).toHaveBeenCalledWith(null);
    vi.useRealTimers();
  });

  it('clears the visible preview when switching to upload', async () => {
    hoisted.loadAssets.mockResolvedValue(undefined);
    hoisted.assetList = [{ filename: 'a.png' }];
    const onPreview = vi.fn();

    render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onPreview={onPreview}
        notesRootPath="/notesRoot"
        currentNotePath="note.md"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('asset-grid')).toBeInTheDocument());

    vi.useFakeTimers();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'hover a' }));
    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(onPreview).toHaveBeenCalledWith('a.png');

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(onPreview).toHaveBeenLastCalledWith(null);
    vi.useRealTimers();
  });

  it.each(supportedImageFilenames)('uploads a pasted %s when clipboard MIME is missing', async (filename) => {
    hoisted.uploadAsset.mockResolvedValue({
      success: true,
      path: `./assets/${filename}`,
      isDuplicate: false,
    });
    const onSelect = vi.fn();
    const file = new File(['image'], filename, { type: '' });

    render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={onSelect}
        notesRootPath="/notesRoot"
        currentNotePath="note.md"
      />,
    );

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [
          {
            kind: 'file',
            type: '',
            getAsFile: () => file,
          },
        ],
      },
    });
    await act(async () => {
      document.dispatchEvent(pasteEvent);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(hoisted.uploadAsset).toHaveBeenCalledWith(file, 'note.md');
    });
    expect(onSelect).toHaveBeenCalledWith(`./assets/${filename}`);
    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  it('uploads a pasted image exposed only through clipboard files', async () => {
    const file = new File(['image'], 'files-only.png', { type: 'image/png' });
    hoisted.uploadAsset.mockResolvedValue({
      success: true,
      path: './assets/files-only.png',
      isDuplicate: false,
    });
    const onSelect = vi.fn();
    render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={onSelect}
        notesRootPath="/notesRoot"
        currentNotePath="note.md"
      />,
    );
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
        files: [file],
        getData: () => 'https://example.test/companion',
      },
    });

    await act(async () => {
      document.dispatchEvent(pasteEvent);
      await Promise.resolve();
    });

    expect(hoisted.uploadAsset).toHaveBeenCalledTimes(1);
    expect(hoisted.uploadAsset).toHaveBeenCalledWith(file, 'note.md');
    expect(onSelect).toHaveBeenCalledWith('./assets/files-only.png');
    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  it('does not consume a paste event already handled by the note editor', () => {
    render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="note.md"
      />,
    );
    const file = new File(['image'], 'handled.png', { type: 'image/png' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
        getData: () => '',
      },
    });
    pasteEvent.preventDefault();

    document.dispatchEvent(pasteEvent);

    expect(hoisted.uploadAsset).not.toHaveBeenCalled();
  });

  it('starts asset reload when the picker opens and uses the latest note scope', async () => {
    hoisted.assetList = [{ filename: 'a.png' }];

    const { rerender } = render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="one.md"
      />,
    );

    await waitFor(() => expect(hoisted.loadAssets).toHaveBeenCalledTimes(1));

    rerender(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="nested/two.md"
      />,
    );

    await waitFor(() => expect(hoisted.loadAssets).toHaveBeenCalledTimes(2));
    expect(hoisted.loadAssets).toHaveBeenLastCalledWith('/notesRoot');
  });

  it('shows a stable loading state instead of stale assets while the library refreshes', async () => {
    let resolveLoad: () => void = () => {};
    hoisted.assetList = [{ filename: 'stale-single-cover.png' }];
    hoisted.loadAssets.mockReturnValue(new Promise<void>((resolve) => {
      resolveLoad = resolve;
    }));

    render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="one.md"
      />,
    );

    expect(screen.getByTestId('asset-library-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-grid')).not.toBeInTheDocument();

    await waitFor(() => expect(hoisted.loadAssets).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveLoad();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('asset-grid')).toBeInTheDocument());
  });

  it('keeps existing assets visible and lets the user retry a failed library refresh', async () => {
    hoisted.loadAssets.mockResolvedValue(undefined);
    hoisted.assetList = [{ filename: 'existing.png' }];
    hoisted.assetLoadError = 'Library read failed';

    render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="one.md"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('asset-grid')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Library read failed');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(hoisted.loadAssets).toHaveBeenCalledTimes(2));
  });

  it('reports a failed pasted image upload without selecting a cover', async () => {
    hoisted.loadAssets.mockResolvedValue(undefined);
    hoisted.uploadAsset.mockResolvedValue({
      success: false,
      path: null,
      isDuplicate: false,
      error: 'Disk write failed',
    });
    const onSelect = vi.fn();
    const file = new File(['image'], 'failed.png', { type: 'image/png' });

    render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={onSelect}
        notesRootPath="/notesRoot"
        currentNotePath="one.md"
      />,
    );

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
        getData: () => '',
      },
    });

    await act(async () => {
      document.dispatchEvent(pasteEvent);
      await Promise.resolve();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Disk write failed');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not refetch only because the asset count changes while open', async () => {
    hoisted.loadAssets.mockResolvedValue(undefined);
    hoisted.assetList = [];
    const { rerender } = render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="one.md"
      />,
    );

    await waitFor(() => expect(hoisted.loadAssets).toHaveBeenCalledTimes(1));

    hoisted.assetList = [{ filename: 'a.png' }];
    rerender(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="one.md"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('asset-grid')).toBeInTheDocument());
    expect(hoisted.loadAssets).toHaveBeenCalledTimes(1);
  });

  it('does not enter library loading when opened without a opened folder path', () => {
    hoisted.assetList = [];

    render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath=""
        currentNotePath="one.md"
      />,
    );

    expect(hoisted.loadAssets).not.toHaveBeenCalled();
    expect(screen.queryByTestId('asset-library-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-zone')).toBeInTheDocument();
  });

  it('does not show paste instructions in the upload tab', () => {
    hoisted.assetList = [{ filename: 'a.png' }];

    render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="one.md"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Upload/ }));

    expect(screen.getByTestId('upload-zone')).toBeInTheDocument();
    expect(screen.queryByText(/to paste/i)).not.toBeInTheDocument();
  });

  it('keeps the library header controls when cover images exist', () => {
    hoisted.assetList = [{ filename: 'a.png' }];

    const { container } = render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="one.md"
      />,
    );

    expect(screen.getByRole('button', { name: /Library/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove/ })).toBeInTheDocument();
    expect(container.querySelector('.border-b')).toBeInTheDocument();
  });

  it('keeps the header controls when editing an existing cover even if the library is empty', async () => {
    hoisted.loadAssets.mockResolvedValue(undefined);
    hoisted.assetList = [];

    const { container } = render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="one.md"
      />,
    );

    expect(screen.getByRole('button', { name: /Library/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove/ })).toBeInTheDocument();
    expect(container.querySelector('.border-b')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('upload-zone')).toBeInTheDocument());
  });

  it('shows upload inside library when there are no cover images', async () => {
    hoisted.loadAssets.mockResolvedValue(undefined);
    hoisted.assetList = [];

    render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="one.md"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('upload-zone')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Library/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upload/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  it('hides tabs and the divider while showing empty-library upload', async () => {
    hoisted.loadAssets.mockResolvedValue(undefined);
    hoisted.assetList = [];

    const { container } = render(
      <CoverPicker
        isOpen
        onClose={vi.fn()}
        onSelect={vi.fn()}
        notesRootPath="/notesRoot"
        currentNotePath="one.md"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('upload-zone')).toBeInTheDocument());
    expect(container.querySelector('.border-b')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Library/ })).not.toBeInTheDocument();
  });
});
