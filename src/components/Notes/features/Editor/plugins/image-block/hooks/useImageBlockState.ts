import { useEffect, useCallback, useMemo } from 'react';
import { EditorView } from '@milkdown/kit/prose/view';
import { Node } from '@milkdown/kit/prose/model';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { resolveEffectiveNotesRootPath } from '@/stores/notes/effectiveNotesRootPath';
import { isPublicRemoteMediaUrl } from '@/lib/notes/markdown/urlSecurity';
import { resolveObsidianImagePath } from '@/lib/notes/markdown/obsidianImagePath';
import { applyImageNodeAttrsAtPos } from '../commands/imageNodeCommands';
import { useLocalImage } from './useLocalImage';
import { useImageNodeState } from './useImageNodeState';
import { useImageUiState } from './useImageUiState';
import type { ImageNodeAttrs } from '../types';

interface UseImageBlockStateProps {
    node: Node;
    view: EditorView;
    getPos: () => number | undefined;
    shouldLoadImage?: boolean;
}

export function useImageBlockState({ node, view, getPos, shouldLoadImage = true }: UseImageBlockStateProps) {
    const nodeState = useImageNodeState(node);
    const uiState = useImageUiState(nodeState.width);
    const { setIsReady } = uiState;

    const notesPath = useNotesStore(s => s.notesPath);
    const currentNotePath = useNotesStore(s => s.currentNote?.path);
    const rootFolder = useNotesStore(s => s.rootFolder);
    const rootFolderPath = useNotesStore(s => s.rootFolderPath);
    const isObsidianImageEmbed = node.attrs.obsidianEmbed != null;
    const openedFolderFallbackSrc = useMemo(() => (
        isObsidianImageEmbed && rootFolder && rootFolderPath === notesPath
            ? resolveObsidianImagePath(nodeState.baseSrc, rootFolder.children, currentNotePath)
            : null
    ), [currentNotePath, isObsidianImageEmbed, nodeState.baseSrc, notesPath, rootFolder, rootFolderPath]);
    const effectiveNotesPath = resolveEffectiveNotesRootPath({ notesPath, currentNotePath });
    const { resolvedSrc, isLoading, error: loadError } = useLocalImage(
        nodeState.baseSrc,
        effectiveNotesPath,
        currentNotePath,
        shouldLoadImage,
        openedFolderFallbackSrc,
    );
    const isRemoteImageSource = isPublicRemoteMediaUrl(nodeState.baseSrc);

    useEffect(() => {
        if (loadError) {
            setIsReady(true);
        }
    }, [loadError, setIsReady]);

    const updateNodeAttrs = useCallback((attrs: ImageNodeAttrs) => {
        const pos = getPos();
        if (pos === undefined) return;
        applyImageNodeAttrsAtPos(view, pos, attrs, { src: nodeState.nodeSrc });
    }, [view, getPos, nodeState.nodeSrc]);

    const markImageUserInput = useCallback(() => {
        view.dom.dispatchEvent(new CustomEvent('editor:image-user-input', { bubbles: true }));
    }, [view]);

    return {
        ...nodeState,
        ...uiState,
        resolvedSrc,
        isRemoteImageSource,
        isLoading,
        loadError,
        isImageLoadDeferred: !shouldLoadImage && !resolvedSrc,
        notesPath: effectiveNotesPath,
        currentNotePath,
        updateNodeAttrs,
        markImageUserInput,
    };
}
