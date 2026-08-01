import type { EditorView } from '@milkdown/kit/prose/view';
import type { BlankAreaPlainClickAction } from './blankAreaPlainClick';
import type { BlockDragStartZone } from './blockDragSession';
import type { BlockRect, BlockRange } from './blockSelectionUtils';

export interface BlankAreaSelectionPlainClickResult {
  zone: BlockDragStartZone;
  action: BlankAreaPlainClickAction | null;
  blockRects: readonly BlockRect[];
  clientX: number;
  clientY: number;
}

export interface StartBlankAreaSelectionSessionOptions {
  view: EditorView;
  event: MouseEvent;
  startZone: BlockDragStartZone;
  dragThreshold: number;
  cursor: string;
  dragBoxColor: string;
  scrollRootSelector: string;
  initialSelectedBlocks: readonly BlockRange[];
  onSelectionChange: (blocks: BlockRange[]) => void;
  onPendingPlainClick?: (result: BlankAreaSelectionPlainClickResult) => boolean;
  onPlainClick: (result: BlankAreaSelectionPlainClickResult) => void;
  onActivateSelectionState: () => void;
  onSyncSelectionState: () => void;
}
