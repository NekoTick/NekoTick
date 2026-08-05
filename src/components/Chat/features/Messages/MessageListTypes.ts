import type { ChatMessage } from '@/lib/ai/types';

export interface ChatImageGalleryItem {
  id: string;
  src: string;
}

export type ChatImageGalleryGetter = () => ChatImageGalleryItem[];
export type ChatMessageNavigationDirection = 'prev' | 'next';
export type ChatMessageNavigationHandler = (direction: ChatMessageNavigationDirection) => void;

export interface RenderedMessageRow {
  message: ChatMessage;
  originalIndex: number;
}

export interface RenderedMessageState {
  ids: Set<string>;
  messageById: Map<string, ChatMessage>;
  messages: ChatMessage[];
  rows: RenderedMessageRow[];
}

export interface MessageListProps {
  active?: boolean;
  chatId?: string | null;
  messages: ChatMessage[];
  getImageGallery?: ChatImageGalleryGetter;
  isSessionActive: boolean;
  showLoading: boolean;
  isLayoutCentered?: boolean;
  useOverlayScrollbar?: boolean;
  showMessageOutline?: boolean;
  spacerHeight: number;
  currentTurnTopSpacerHeight?: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  navigationRef?: React.RefObject<ChatMessageNavigationHandler | null>;
  onCopy: (text: string) => Promise<boolean | void> | boolean | void;
  onFork?: (id: string) => void;
  onRegenerate: (id: string) => void;
  onEdit?: (id: string, newContent: string) => void;
  onSwitchVersion: (msgId: string, idx: number) => void;
}
