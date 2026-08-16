import type { PointerEvent } from 'react';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardStroke, WhiteboardViewport } from '@/components/Whiteboard/model/core/whiteboardModel';
import type { WhiteboardResizeHandle, WhiteboardSelectionRect } from './whiteboardSelection';

export type WhiteboardDragState =
  | {
    kind: 'move-elements';
    elementIds: string[];
    currentPoint: WhiteboardPoint;
    originalElementsById: ReadonlyMap<string, WhiteboardElement>;
    originalStrokesById: ReadonlyMap<string, WhiteboardStroke>;
    startPoint: WhiteboardPoint;
    strokeIds: string[];
  }
  | {
    bounds: WhiteboardSelectionRect;
    currentBounds: WhiteboardSelectionRect;
    handle: WhiteboardResizeHandle;
    kind: 'resize-selection';
    originalElementsById: ReadonlyMap<string, WhiteboardElement>;
    originalStrokesById: ReadonlyMap<string, WhiteboardStroke>;
    preserveAspectRatio: boolean;
    startPoint: WhiteboardPoint;
  }
  | {
    kind: 'pan';
    startClientX: number;
    startClientY: number;
    startViewport: WhiteboardViewport;
  }
  | {
    kind: 'pinch';
    startCenter: WhiteboardPoint;
    startDistance: number;
    startViewport: WhiteboardViewport;
  }
  | {
    kind: 'move-strokes';
    currentPoint: WhiteboardPoint;
    originalStrokesById: ReadonlyMap<string, WhiteboardStroke>;
    startPoint: WhiteboardPoint;
    strokeIds: string[];
  }
  | {
    kind: 'lasso';
    points: WhiteboardPoint[];
  }
  | {
    kind: 'draw';
  }
  | {
    kind: 'draw-autoshape';
  }
  | {
    kind: 'draw-linear';
    startPoint: WhiteboardPoint;
  }
  | {
    kind: 'edit-linear-point';
    midpoint: boolean;
    originalStroke: WhiteboardStroke;
    pointIndex: number;
    started: boolean;
    startPoint: WhiteboardPoint;
    strokeId: string;
  }
  | {
    center: WhiteboardPoint;
    currentAngle: number;
    kind: 'rotate-selection';
    originalElementsById: ReadonlyMap<string, WhiteboardElement>;
    originalStrokesById: ReadonlyMap<string, WhiteboardStroke>;
    startAngle: number;
  }
  ;

export interface WhiteboardMovePreview {
  dx: number;
  dy: number;
  elementIds: string[];
  strokeIds: string[];
}

export interface WhiteboardResizePreview {
  nextBounds: WhiteboardSelectionRect;
  originalElementsById: ReadonlyMap<string, WhiteboardElement>;
  originalStrokesById: ReadonlyMap<string, WhiteboardStroke>;
  startBounds: WhiteboardSelectionRect;
}

export interface WhiteboardRotationPreview {
  angle: number;
  center: WhiteboardPoint;
  originalElementsById: ReadonlyMap<string, WhiteboardElement>;
  originalStrokesById: ReadonlyMap<string, WhiteboardStroke>;
}

export type WhiteboardMoveDragState = Extract<WhiteboardDragState, { kind: 'move-elements' | 'move-strokes' }>;

export function isWhiteboardMoveDragState(state: WhiteboardDragState | null): state is WhiteboardMoveDragState {
  return state?.kind === 'move-elements' || state?.kind === 'move-strokes';
}

export function getWhiteboardMovePreview(state: WhiteboardDragState | null): WhiteboardMovePreview | null {
  if (!isWhiteboardMoveDragState(state)) return null;
  return {
    dx: state.currentPoint.x - state.startPoint.x,
    dy: state.currentPoint.y - state.startPoint.y,
    elementIds: state.kind === 'move-elements' ? state.elementIds : [],
    strokeIds: state.strokeIds,
  };
}

export function getWhiteboardResizePreview(state: WhiteboardDragState | null): WhiteboardResizePreview | null {
  if (state?.kind !== 'resize-selection') return null;
  return {
    nextBounds: state.currentBounds,
    originalElementsById: state.originalElementsById,
    originalStrokesById: state.originalStrokesById,
    startBounds: state.bounds,
  };
}

export function getWhiteboardRotationPreview(state: WhiteboardDragState | null): WhiteboardRotationPreview | null {
  if (state?.kind !== 'rotate-selection') return null;
  return {
    angle: state.currentAngle,
    center: state.center,
    originalElementsById: state.originalElementsById,
    originalStrokesById: state.originalStrokesById,
  };
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, [contenteditable="true"]'));
}

export function getCoalescedPointerEvents(event: PointerEvent): globalThis.PointerEvent[] {
  const nativeEvent = event.nativeEvent;
  const events = nativeEvent.getCoalescedEvents?.() ?? [nativeEvent];
  return events.length > 0 ? events : [nativeEvent];
}
