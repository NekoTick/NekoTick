import { useRef, useCallback, useMemo, useState } from 'react';
import { EditorView } from '@milkdown/kit/prose/view';
import { Node } from '@milkdown/kit/prose/model';
import { LazyChatImageViewer } from '@/components/Chat/features/Markdown/components/LazyChatImageViewer';
import { cn } from '@/lib/utils';
import { getContainerStyle, computeAspectRatio } from './utils/styleUtils';
import { ImageContent } from './components/ImageContent';
import { ImageDragOverlay } from './components/ImageDragOverlay';
import { ImageBlockChrome } from './components/ImageBlockChrome';
import { useImageBlockState } from './hooks/useImageBlockState';
import { useImageActions } from './hooks/useImageActions';
import { useImageBlockFrame } from './hooks/useImageBlockFrame';
import { useImageDrag } from './hooks/useImageDrag';
import { useImageResize } from './hooks/useImageResize';
import { useImageMediaLifecycle } from './hooks/useImageMediaLifecycle';
import { useBlockDragState } from './hooks/useBlockDragState';
import { useNearViewport } from './hooks/useNearViewport';
import { useImageBlockViewHandlers } from './hooks/useImageBlockViewHandlers';
import { getImageViewerResourceSrc } from './utils/imageViewerResource';
import type { CropperViewportState } from './types';

const WRAPPER_ALIGNMENT_CLASSES: Record<'left' | 'center' | 'right', string> = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
};

interface ImageBlockProps {
    node: Node;
    view: EditorView;
    getPos: () => number | undefined;
}

export const ImageBlockView = ({ node, view, getPos }: ImageBlockProps) => {
    const latestStateRef = useRef<CropperViewportState | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [mediaLoadError, setMediaLoadError] = useState(false);
    const isBlockDragging = useBlockDragState();
    const imageLoadGate = useNearViewport(containerRef);

    const handleStateChange = useCallback((state: CropperViewportState) => {
        latestStateRef.current = state;
    }, []);

    const {
        nodeSrc,
        nodeAlt,
        width,
        setWidth,
        height,
        setHeight,
        alignment,
        setAlignment,
        captionInput,
        setCaptionInput,
        isHovered,
        setIsHovered,
        isEditingCaption,
        setIsEditingCaption,
        isActive,
        setIsActive,
        isReady,
        setIsReady,
        naturalRatio,
        setNaturalRatio,
        cropParams,
        setCropParams,
        baseSrc,
        resolvedSrc,
        isRemoteImageSource,
        isLoading,
        loadError,
        notesPath,
        currentNotePath,
        updateNodeAttrs,
        markImageUserInput,
    } = useImageBlockState({ node, view, getPos, shouldLoadImage: imageLoadGate.shouldLoadImage });

    const {
        isSaving,
        handleSave,
        handleCopy,
        handleDownload,
        handleDelete,
        restoreIfNeeded,
    } = useImageActions({
        node,
        view,
        getPos,
        baseSrc,
        resolvedSrc,
        notesPath,
        currentNotePath,
        updateNodeAttrs,
        markImageUserInput,
        setCropParams,
        setIsActive,
        setHeight,
    });

    const {
        setDragDimensions,
        finalContainerSize,
        handleMouseEnter,
        handleMouseLeave,
    } = useImageBlockFrame({
        height,
        isEditingCaption,
        isActive,
        isHoverDisabled: isBlockDragging,
        setIsHovered,
        containerRef,
    });

    const { handleResizeStart } = useImageResize({
        containerRef,
        width,
        height,
        setWidth,
        setHeight,
        setDragDimensions,
        updateNodeAttrs,
        markImageUserInput,
        restoreIfNeeded,
    });

    const { onMediaLoaded } = useImageMediaLifecycle({
        width,
        nodeSrc,
        nodeAlt,
        containerRef,
        setWidth,
        setCaptionInput,
        setNaturalRatio,
        setIsReady,
        updateNodeAttrs,
    });

    const {
        isDragging,
        dragPosition,
        dragSize,
        handlePointerDown,
    } = useImageDrag({
        view,
        getPos,
        containerRef,
        isActive,
        loadError: !!loadError,
        currentAlignment: alignment,
    });

    const computedAspectRatio = computeAspectRatio(height, cropParams, naturalRatio);
    const viewerResourceSrc = useMemo(() => {
        return getImageViewerResourceSrc(baseSrc, resolvedSrc);
    }, [baseSrc, resolvedSrc]);
    const hasLoadError = !!loadError || mediaLoadError;
    const canOpenViewer = Boolean(resolvedSrc) && !hasLoadError && !isActive && !isDragging && !isBlockDragging;
    const {
        lockedEditFrame,
        isViewerOpen,
        setIsViewerOpen,
        handleCaptionSubmit,
        handleCaptionCancel,
        handleAlign,
        handleEdit,
        handleOpenViewer,
    } = useImageBlockViewHandlers({
        captionInput,
        nodeAlt,
        finalContainerSize,
        containerRef,
        isActive,
        isDragging,
        isBlockDragging,
        hasLoadError,
        resolvedSrc,
        markImageUserInput,
        restoreIfNeeded,
        updateNodeAttrs,
        setCaptionInput,
        setIsEditingCaption,
        setAlignment,
        setHeight,
        setIsActive,
        setIsHovered,
    });
    const lockedEditSize = lockedEditFrame
        ? { width: lockedEditFrame.width, height: lockedEditFrame.height }
        : null;
    const activeContainerSize = isActive && lockedEditSize ? lockedEditSize : finalContainerSize;
    const containerStyle = getContainerStyle(isDragging, dragPosition, dragSize, {
        width,
        height,
        isActive,
        isReady,
        computedAspectRatio,
        activeSize: lockedEditSize,
    });
    const positionedContainerStyle = isActive && lockedEditFrame && !isDragging
        ? {
            ...containerStyle,
            marginLeft: `${lockedEditFrame.left}px`,
        }
        : containerStyle;

    return (
        <>
            <ImageDragOverlay
                isDragging={isDragging}
                dragPosition={dragPosition}
                dragSize={dragSize}
                resolvedSrc={resolvedSrc}
                cropParams={cropParams}
                overrideState={latestStateRef.current}
            />

            <div
                data-image-selection-wrapper="true"
                className={cn(
                    'w-full flex group/image',
                    isActive && lockedEditFrame ? 'justify-start' : WRAPPER_ALIGNMENT_CLASSES[alignment],
                    isDragging && 'hidden',
                )}
            >
                <div
                    ref={containerRef}
                    data-dragging={isDragging ? 'true' : undefined}
                    draggable={false}
                    className={cn(
                        'relative flex flex-col leading-none text-[var(--vlaina-font-0)] select-none',
                        canOpenViewer && 'cursor-pointer',
                        (isHovered || isEditingCaption || isActive) && !isBlockDragging ? 'z-[var(--vlaina-z-10)]' : '',
                    )}
                    style={positionedContainerStyle}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onPointerDown={handlePointerDown}
                    onClick={handleOpenViewer}
                    onDragStart={(e) => e.preventDefault()}
                >
                    <ImageContent
                        isLoading={isLoading}
                        loadError={hasLoadError}
                        sourceSrc={nodeSrc}
                        sourceAlt={nodeAlt}
                        resolvedSrc={resolvedSrc}
                        isRemoteImageSource={isRemoteImageSource}
                        isDeferred={!imageLoadGate.shouldLoadImage}
                        isNearViewport={imageLoadGate.isNearViewport}
                        cropParams={cropParams}
                        containerSize={activeContainerSize}
                        isSaving={isSaving}
                        isActive={isActive}
                        onSave={handleSave}
                        onCancel={() => {
                            setIsActive(false);
                            setHeight(undefined);
                        }}
                        onResizeStart={handleResizeStart}
                        onMediaLoaded={onMediaLoaded}
                        onMediaErrorChange={setMediaLoadError}
                        onStateChange={handleStateChange}
                    />

                    <ImageBlockChrome
                        nodeAlt={nodeAlt}
                        captionInput={captionInput}
                        isEditingCaption={isEditingCaption}
                        isHovered={isHovered && !isBlockDragging}
                        isActive={isActive}
                        isDragging={isDragging || isBlockDragging}
                        loadError={hasLoadError}
                        containerSize={activeContainerSize}
                        alignment={alignment}
                        onCaptionChange={setCaptionInput}
                        onCaptionSubmit={handleCaptionSubmit}
                        onCaptionCancel={handleCaptionCancel}
                        onCaptionEditStart={() => setIsEditingCaption(true)}
                        onAlign={handleAlign}
                        onEdit={handleEdit}
                        onCopy={handleCopy}
                        onDownload={handleDownload}
                        onDelete={handleDelete}
                    />
                </div>
            </div>

            {isViewerOpen ? (
                <LazyChatImageViewer
                    open={isViewerOpen}
                    src={viewerResourceSrc}
                    alt={nodeAlt}
                    previewSrc={resolvedSrc || null}
                    onCopyImage={handleCopy}
                    onOpenChange={setIsViewerOpen}
                />
            ) : null}
        </>
    );
};
