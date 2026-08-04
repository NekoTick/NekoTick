import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { DeleteIcon } from '@/components/common/DeleteIcon';
import { Icon } from '@/components/ui/icons';
import { SidebarInlineRenameInput } from '@/components/layout/sidebar/SidebarInlineRenameInput';
import {
  getSidebarLabelClass,
  SIDEBAR_LABEL_TEXT_METRICS_CLASS,
} from '@/components/layout/sidebar/sidebarLabelStyles';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { loadImageAsBlob } from '@/lib/assets/io/reader';
import { useImageCacheGeneration } from '@/hooks/useImageCacheGeneration';
import { resolveNotesRootRelativeFullPath } from '@/stores/notes/utils/fs/notesRootPathContainment';
import { useNotesStore, type ImageFile } from '@/stores/useNotesStore';
import { useToastStore } from '@/stores/useToastStore';
import type { NotesSidebarMenuEntry } from '../Sidebar/context-menu/NotesSidebarContextMenuContent';
import { ImageFileDeleteDialog } from './ImageFileDeleteDialog';
import { ImageFileNameBackground } from './ImageFileNameBackground';
import { findImageFileReferences, type ImageFileReference } from './imageFileReferences';
import { navigateToImageFileReference } from './imageFileReferenceNavigation';
import { SidebarLiveNoteFileIcon } from '../Sidebar/SidebarNoteFileIcon';
import { NOTES_SIDEBAR_ICON_SIZE } from '../Sidebar/sidebarLayout';
import { TreeItemShell } from './components/TreeItemShell';
import { createTreeItemOpenLocationEntry } from './components/treeItemMenuEntries';
import { useTreeItemPathActions } from './hooks/useTreeItemPathActions';
import { useTreeItemUiState } from './hooks/useTreeItemUiState';
import {
  hideImageFileHoverPreview,
  showImageFileHoverPreview,
} from './imageFileHoverPreviewState';
import { useTreeItemDragSource } from './hooks/useTreeItemDragSource';

const TreeItemMenu = lazy(async () => {
  const mod = await import('./components/TreeItemMenu');
  return { default: mod.TreeItemMenu };
});

const LazyChatImageViewer = lazy(async () => {
  const mod = await import('@/components/Chat/features/Markdown/components/LazyChatImageViewer');
  return { default: mod.LazyChatImageViewer };
});

interface ImageFileItemProps {
  node: ImageFile;
  depth: number;
  parentFolderPath?: string;
  showMenuButton?: boolean;
}

export const ImageFileItem = memo(function ImageFileItem({
  node,
  depth,
  parentFolderPath = '',
  showMenuButton = true,
}: ImageFileItemProps) {
  const { t } = useI18n();
  const notesPath = useNotesStore((state) => state.notesPath);
  const deleteImage = useNotesStore((state) => state.deleteImage);
  const renameImage = useNotesStore((state) => state.renameImage);
  const openNote = useNotesStore((state) => state.openNote);
  const currentNotePath = useNotesStore((state) => state.currentNote?.path);
  const getDisplayName = useNotesStore((state) => state.getDisplayName);
  const addToast = useToastStore((state) => state.addToast);
  const imageCacheGeneration = useImageCacheGeneration();
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const previewGenerationRef = useRef(imageCacheGeneration);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [references, setReferences] = useState<ImageFileReference[]>([]);
  const [referencesState, setReferencesState] = useState<'idle' | 'loading' | 'loaded'>('idle');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const extensionIndex = node.name.lastIndexOf('.');
  const imageExtension = extensionIndex > 0 ? node.name.slice(extensionIndex) : '';
  const imageNameStem = extensionIndex > 0 ? node.name.slice(0, extensionIndex) : node.name;
  const {
    showMenu,
    setShowMenu,
    menuPosition,
    isRenaming,
    setIsRenaming,
    renameValue,
    setRenameValue,
    handleContextMenu,
    handleMenuTrigger,
  } = useTreeItemUiState({
    path: node.path,
    name: imageNameStem,
  });
  const dragHandlers = useTreeItemDragSource(node.path, isRenaming, 'image');
  const { handleCopyPath, handleOpenLocation } = useTreeItemPathActions({
    notesPath,
    itemPath: node.path,
  });

  useEffect(() => {
    return () => hideImageFileHoverPreview(node.path);
  }, [node.path]);

  useEffect(() => {
    if (!showMenu || referencesState !== 'idle') {
      return;
    }
    let active = true;
    const controller = new AbortController();
    setReferencesState('loading');
    void findImageFileReferences({
      ...useNotesStore.getState(),
      imagePath: node.path,
    }, { signal: controller.signal }).then((nextReferences) => {
      if (!active) return;
      setReferences(nextReferences);
      setReferencesState('loaded');
    }).catch(() => {
      if (active) setReferencesState('loaded');
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [node.path, showMenu]);

  const openPreview = useCallback(async () => {
    if (isLoadingPreview) {
      return;
    }

    setShowMenu(false);
    setIsLoadingPreview(true);
    try {
      const { fullPath } = await resolveNotesRootRelativeFullPath(notesPath, node.path);
      const src = await loadImageAsBlob(fullPath);
      previewGenerationRef.current = imageCacheGeneration;
      setPreviewSrc(src);
      setIsPreviewOpen(true);
    } catch {
      addToast(t('editor.imageFailedToLoad'), 'error');
    } finally {
      setIsLoadingPreview(false);
    }
  }, [addToast, imageCacheGeneration, isLoadingPreview, node.path, notesPath, setShowMenu, t]);

  useEffect(() => {
    if (!isPreviewOpen || !previewSrc || previewGenerationRef.current === imageCacheGeneration) return;
    let active = true;
    void resolveNotesRootRelativeFullPath(notesPath, node.path)
      .then(({ fullPath }) => loadImageAsBlob(fullPath))
      .then((src) => {
        if (!active) return;
        previewGenerationRef.current = imageCacheGeneration;
        setPreviewSrc(src);
      })
      .catch(() => {
        if (!active) return;
        setIsPreviewOpen(false);
        setPreviewSrc(null);
        addToast(t('editor.imageFailedToLoad'), 'error');
      });
    return () => {
      active = false;
    };
  }, [addToast, imageCacheGeneration, isPreviewOpen, node.path, notesPath, previewSrc, t]);

  const handleRenameSubmit = useCallback(async () => {
    const trimmedValue = renameValue.trim();
    let nextName = trimmedValue;
    if (nextName && !nextName.toLowerCase().endsWith(imageExtension.toLowerCase())) {
      nextName += imageExtension;
    }
    if (nextName && nextName !== node.name) {
      await renameImage(node.path, nextName);
    }
    setIsRenaming(false);
  }, [imageExtension, node.name, node.path, renameImage, renameValue, setIsRenaming]);

  const handleRenameFromDoubleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('button,a,input,textarea,select,[role="button"]')) return;
    event.preventDefault();
    event.stopPropagation();
    setShowMenu(false);
    setIsRenaming(true);
  }, [setIsRenaming, setShowMenu]);

  const menuEntries: NotesSidebarMenuEntry[] = [
    {
      key: 'rename',
      icon: <Icon name="common.compose" size="md" />,
      label: t('sidebar.rename'),
      onClick: () => {
        setShowMenu(false);
        setIsRenaming(true);
      },
    },
    {
      key: 'preview',
      icon: <Icon name="file.image" size="md" />,
      label: t('common.preview'),
      onClick: openPreview,
    },
    {
      kind: 'submenu',
      key: 'references',
      icon: <Icon name="file.text" size="md" />,
      label: `${t('notes.imageReferences')} (${referencesState === 'loaded' ? references.length : '…'})`,
      children: referencesState !== 'loaded'
        ? [{ key: 'references-loading', icon: <Icon name="common.refresh" size="md" />, label: t('notes.imageReferencesLoading'), onClick: () => undefined, disabled: true }]
        : references.length === 0
          ? [{ key: 'references-empty', icon: <Icon name="file.text" size="md" />, label: t('notes.imageNoReferences'), onClick: () => undefined, disabled: true }]
          : references.map((reference) => ({
              key: `reference-${reference.path}`,
              icon: (
                <SidebarLiveNoteFileIcon
                  notePath={reference.path}
                  notesRootPath={notesPath}
                  size={NOTES_SIDEBAR_ICON_SIZE}
                />
              ),
              label: getDisplayName(reference.path) || reference.name,
              onClick: async () => {
                setShowMenu(false);
                await navigateToImageFileReference(reference, currentNotePath, openNote);
              },
            })),
    },
    {
      key: 'copy-path',
      icon: <Icon name="common.copy" size="md" />,
      label: t('sidebar.copyPath'),
      onClick: async () => {
        setShowMenu(false);
        await handleCopyPath();
      },
    },
    createTreeItemOpenLocationEntry({
      label: t('sidebar.openFileLocation'),
      onClose: () => setShowMenu(false),
      onOpenLocation: handleOpenLocation,
    }),
    { kind: 'divider', key: 'delete-divider' },
    {
      key: 'delete',
      icon: <DeleteIcon />,
      label: t('sidebar.moveToTrash'),
      danger: true,
      onClick: () => {
        setShowMenu(false);
        setShowDeleteDialog(true);
      },
    },
  ];

  return (
    <>
      <TreeItemShell
        itemPath={node.path}
        itemKind="image"
        parentFolderPath={parentFolderPath}
        depth={depth}
        leading={null}
        isHighlighted={showMenu}
        onMouseEnter={() => {
          if (!isRenaming) {
            showImageFileHoverPreview({ imagePath: node.path, notesPath });
          }
        }}
        onMouseLeave={() => {
          hideImageFileHoverPreview(node.path);
        }}
        onClick={(event) => {
          if (isRenaming) return;
          event.stopPropagation();
          void openPreview();
        }}
        onDoubleClick={handleRenameFromDoubleClick}
        onContextMenu={handleContextMenu}
        dragHandlers={dragHandlers}
        showActionsByDefault={showMenu}
        showMenuButton={showMenuButton}
        menuButtonLabel={t('sidebar.openFileMenu')}
        onMenuClick={handleMenuTrigger}
        main={
          isRenaming ? (
            <SidebarInlineRenameInput
              value={renameValue}
              onValueChange={setRenameValue}
              onSubmit={handleRenameSubmit}
              onCancel={() => setIsRenaming(false)}
              className={cn(
                'w-full min-w-0 border-none bg-transparent p-0 outline-none',
                SIDEBAR_LABEL_TEXT_METRICS_CLASS,
                getSidebarLabelClass('notes', { selected: true }),
              )}
            />
          ) : (
            <span className="relative -mx-1 block min-h-[var(--vlaina-size-28px)] w-full min-w-0 overflow-hidden rounded-lg px-2 py-1">
              <ImageFileNameBackground notesPath={notesPath} imagePath={node.path} />
              <span
                className={`relative z-[var(--vlaina-z-10)] block min-w-0 whitespace-normal break-all [overflow-wrap:anywhere] ${getSidebarLabelClass('notes', { selected: showMenu })}`}
                data-file-tree-image-name={node.path}
              >
                {node.name}
              </span>
            </span>
          )
        }
      >
        {showMenu ? (
          <Suspense fallback={null}>
            <TreeItemMenu
              isOpen={showMenu}
              onClose={() => setShowMenu(false)}
              position={menuPosition}
              entries={menuEntries}
            />
          </Suspense>
        ) : null}
      </TreeItemShell>

      {previewSrc ? (
        <Suspense fallback={null}>
          <LazyChatImageViewer
            open={isPreviewOpen}
            src={previewSrc}
            alt={node.name}
            onOpenChange={setIsPreviewOpen}
          />
        </Suspense>
      ) : null}

      <ImageFileDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        imageName={node.name}
        references={references}
        onConfirm={() => deleteImage(node.path)}
      />
    </>
  );
}, (previous, next) => (
  previous.node === next.node &&
  previous.depth === next.depth &&
  previous.parentFolderPath === next.parentFolderPath &&
  previous.showMenuButton === next.showMenuButton
));
