export type FileTreePointerDragSourceKind = 'note' | 'folder' | 'image';
export type FileTreePointerDropTargetKind = 'folder' | 'starred' | null;

export const FILE_TREE_CHAT_DROP_TARGET_SELECTOR = '[data-file-tree-chat-drop-target="true"]';
export const FILE_TREE_CHAT_DROP_EVENT = 'file-tree-chat-drop';

export interface FileTreeChatDropDetail {
  path: string;
  kind: 'note' | 'folder';
}

export interface FileTreePointerDragSnapshot {
  activeSourcePath: string | null;
  dropTargetPath: string | null;
  dropTargetKind: FileTreePointerDropTargetKind;
}

export interface FileTreePointerDragSession {
  sourcePath: string;
  sourceKind: FileTreePointerDragSourceKind;
  sourceElement: HTMLElement;
  startX: number;
  startY: number;
  lastClientX: number;
  lastClientY: number;
  activated: boolean;
  autoScrollFrame: number | null;
  scrollRoot: HTMLElement | null;
  previewElement: HTMLElement | null;
  previewOffsetX: number;
  previewOffsetY: number;
  pendingStarredDrop: boolean;
  previousBodyCursor: string;
  previousBodyUserSelect: string;
  suppressClickTimeout: number | null;
}
