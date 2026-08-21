import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageBlockView } from './ImageBlockView';

const mocks = vi.hoisted(() => ({
    useImageBlockState: vi.fn(),
    useBlockDragState: vi.fn(() => false),
    useNearViewport: vi.fn(() => ({ isNearViewport: true, shouldLoadImage: true })),
    handlePointerDown: vi.fn(),
}));

vi.mock('@/components/Chat/features/Markdown/components/ChatImageViewer', () => ({
    ChatImageViewer: ({
        open,
        src,
        previewSrc,
    }: {
        open: boolean;
        src: string;
        previewSrc?: string | null;
    }) => (
        open ? <div data-testid="notes-image-viewer" data-src={src} data-preview-src={previewSrc ?? ''} /> : null
    ),
}));

vi.mock('./components/ImageContent', () => ({
    ImageContent: ({
        isDeferred,
        isNearViewport,
    }: {
        isDeferred: boolean;
        isNearViewport: boolean;
    }) => (
        <div
            data-testid="notes-image-content"
            data-deferred={isDeferred ? 'true' : 'false'}
            data-near-viewport={isNearViewport ? 'true' : 'false'}
        />
    ),
}));

vi.mock('./components/ImageDragOverlay', () => ({
    ImageDragOverlay: () => null,
}));

vi.mock('./components/ImageBlockChrome', () => ({
    ImageBlockChrome: () => null,
}));

vi.mock('./hooks/useImageBlockState', () => ({
    useImageBlockState: mocks.useImageBlockState,
}));

vi.mock('./hooks/useImageActions', () => ({
    useImageActions: () => ({
        isSaving: false,
        handleSave: vi.fn(),
        handleCopy: vi.fn(),
        handleDownload: vi.fn(),
        handleDelete: vi.fn(),
        restoreIfNeeded: vi.fn(),
    }),
}));

vi.mock('./hooks/useImageBlockFrame', () => ({
    useImageBlockFrame: () => ({
        setDragDimensions: vi.fn(),
        finalContainerSize: { width: 320, height: 180 },
        handleMouseEnter: vi.fn(),
        handleMouseLeave: vi.fn(),
    }),
}));

vi.mock('./hooks/useImageDrag', () => ({
    useImageDrag: () => ({
        isDragging: false,
        dragPosition: null,
        dragSize: null,
        handlePointerDown: mocks.handlePointerDown,
    }),
}));

vi.mock('./hooks/useImageResize', () => ({
    useImageResize: () => ({
        handleResizeStart: vi.fn(),
    }),
}));

vi.mock('./hooks/useImageMediaLifecycle', () => ({
    useImageMediaLifecycle: () => ({
        onMediaLoaded: vi.fn(),
    }),
}));

vi.mock('./hooks/useBlockDragState', () => ({
    useBlockDragState: mocks.useBlockDragState,
}));

vi.mock('./hooks/useNearViewport', () => ({
    useNearViewport: mocks.useNearViewport,
}));

function createImageBlockState(overrides: Record<string, unknown> = {}) {
    return {
        nodeSrc: 'https://example.com/image.jpg#w=72%25',
        nodeAlt: 'example image',
        width: 'auto',
        setWidth: vi.fn(),
        height: undefined,
        setHeight: vi.fn(),
        alignment: 'center',
        setAlignment: vi.fn(),
        captionInput: 'example image',
        setCaptionInput: vi.fn(),
        isHovered: false,
        setIsHovered: vi.fn(),
        isEditingCaption: false,
        setIsEditingCaption: vi.fn(),
        isActive: false,
        setIsActive: vi.fn(),
        isReady: true,
        setIsReady: vi.fn(),
        naturalRatio: null,
        setNaturalRatio: vi.fn(),
        cropParams: null,
        setCropParams: vi.fn(),
        baseSrc: 'https://example.com/image.jpg#w=72%25',
        resolvedSrc: 'blob:resolved-image',
        isRemoteImageSource: true,
        isLoading: false,
        loadError: null,
        isImageLoadDeferred: false,
        notesPath: '/notesRoot',
        currentNotePath: 'note.md',
        updateNodeAttrs: vi.fn(),
        markImageUserInput: vi.fn(),
        ...overrides,
    };
}

function renderImageBlock(overrides: Record<string, unknown> = {}) {
    mocks.useImageBlockState.mockReturnValue(createImageBlockState(overrides));
    return render(
        <ImageBlockView
            node={{ attrs: {} } as never}
            view={{} as never}
            getPos={() => 1}
        />
    );
}

describe('ImageBlockView', () => {
    it('renders a background-preloaded image while retaining its viewport priority', () => {
        mocks.useNearViewport.mockReturnValueOnce({
            isNearViewport: false,
            shouldLoadImage: true,
        });

        renderImageBlock();

        expect(screen.getByTestId('notes-image-content')).toHaveAttribute('data-deferred', 'false');
        expect(screen.getByTestId('notes-image-content')).toHaveAttribute('data-near-viewport', 'false');
    });

    it('marks the outer wrapper as the selected-image background layer', () => {
        renderImageBlock();

        expect(screen.getByTestId('notes-image-content').closest('[data-image-selection-wrapper="true"]')).not.toBeNull();
    });

    it('opens the shared image viewer with the original remote resource and cached preview when clicked', async () => {
        renderImageBlock();

        const imageContent = screen.getByTestId('notes-image-content');
        expect(imageContent.parentElement).toHaveClass('cursor-pointer');
        fireEvent.click(imageContent);

        const viewer = await screen.findByTestId('notes-image-viewer');
        expect(viewer).toHaveAttribute('data-src', 'https://example.com/image.jpg');
        expect(viewer).toHaveAttribute('data-preview-src', 'blob:resolved-image');
    });

    it('opens the shared image viewer with the resolved blob resource for local note images', async () => {
        renderImageBlock({
            nodeSrc: 'assets/local.png#w=72%25',
            baseSrc: 'assets/local.png#w=72%25',
            resolvedSrc: 'blob:local-image',
            isRemoteImageSource: false,
        });

        fireEvent.click(screen.getByTestId('notes-image-content'));

        const viewer = await screen.findByTestId('notes-image-viewer');
        expect(viewer).toHaveAttribute('data-src', 'blob:local-image');
        expect(viewer).toHaveAttribute('data-preview-src', 'blob:local-image');
    });

    it('does not open the viewer for failed image loads', () => {
        renderImageBlock({ loadError: new Error('failed') });

        const imageContent = screen.getByTestId('notes-image-content');
        expect(imageContent.parentElement).not.toHaveClass('cursor-pointer');
        fireEvent.click(imageContent);

        expect(screen.queryByTestId('notes-image-viewer')).toBeNull();
    });
});
