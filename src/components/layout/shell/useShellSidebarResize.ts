import {
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  getDefaultSidebarWidth,
} from '@/lib/layout/sidebarWidth';
import { useResizableDivider } from './useResizableDivider';

const SNAP_THRESHOLD = 8;
const SNAP_RESISTANCE = 0.88;

interface UseShellSidebarResizeProps {
  width: number;
  onWidthChange: (width: number) => void;
  onWidthCommit?: (width: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

export function useShellSidebarResize({
  width,
  onWidthChange,
  onWidthCommit,
  onDragStateChange,
}: UseShellSidebarResizeProps) {
  return useResizableDivider({
    width,
    minWidth: SIDEBAR_MIN_WIDTH,
    maxWidth: SIDEBAR_MAX_WIDTH,
    defaultWidth: getDefaultSidebarWidth(),
    getDefaultWidth: getDefaultSidebarWidth,
    onWidthChange,
    onWidthCommit,
    onDragStateChange,
    direction: 'normal',
    snap: {
      threshold: SNAP_THRESHOLD,
      resistance: SNAP_RESISTANCE,
    },
    liveUpdateMode: 'animation-frame',
  });
}
