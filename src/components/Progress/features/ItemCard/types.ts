import { ProgressOrCounter } from '@/stores/useProgressStore';

export interface ItemCardProps {
  item: ProgressOrCounter;
  onUpdate: (id: string, delta: number) => void;
  onClick?: () => void;
  onAutoArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  isDragging?: boolean;
  previewIcon?: string;
  previewTitle?: string;
}
