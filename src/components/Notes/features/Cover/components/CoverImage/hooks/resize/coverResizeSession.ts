import {
  calculateEffectiveResizeHeight,
  calculateFinalCropFromResize,
  calculateVerticalShift,
  type ResizeSnapshot,
} from '../../../../utils/coverResizeMath';

interface ResizeFrame {
  effectiveHeight: number;
  shiftY: number;
  pointerY: number;
}

interface StartCoverResizeSessionProps {
  startY: number;
  startHeight: number;
  snapshot: ResizeSnapshot;
  onFrame: (frame: ResizeFrame) => void;
  onCommit: (frame: ResizeFrame & { finalCrop: { x: number; y: number } }) => void;
}

export function startCoverResizeSession({
  startY,
  startHeight,
  snapshot,
  onFrame,
  onCommit,
}: StartCoverResizeSessionProps) {
  let disposed = false;
  let topPinned = snapshot.maxShiftDown === 0;
  let lastFrame: ResizeFrame | null = null;
  let resizeFrameId: number | null = null;
  let resizeFrameScheduled = false;
  let pendingClientY: number | null = null;

  const buildFrame = (clientY: number): ResizeFrame => {
    const delta = clientY - startY;
    const effectiveHeight = calculateEffectiveResizeHeight(
      startHeight,
      delta,
      snapshot.maxMechanicalHeight
    );
    const shiftY = calculateVerticalShift(
      effectiveHeight,
      snapshot.maxVisualHeightNoShift,
      snapshot.maxShiftDown
    );
    if (shiftY >= snapshot.maxShiftDown - 0.001) {
      topPinned = true;
    }
    return {
      effectiveHeight,
      shiftY: topPinned ? snapshot.maxShiftDown : shiftY,
      pointerY: clientY,
    };
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (resizeFrameId !== null) {
      window.cancelAnimationFrame(resizeFrameId);
      resizeFrameId = null;
    }
    resizeFrameScheduled = false;
    pendingClientY = null;
    document.removeEventListener('mousemove', handleMove, true);
    document.removeEventListener('mouseup', handleUp, true);
  };

  const applyPendingMove = () => {
    resizeFrameId = null;
    resizeFrameScheduled = false;
    if (disposed || pendingClientY === null) return;
    const clientY = pendingClientY;
    pendingClientY = null;
    const frame = buildFrame(clientY);
    if (
      lastFrame &&
      lastFrame.effectiveHeight === frame.effectiveHeight &&
      Math.abs(lastFrame.shiftY - frame.shiftY) < 0.001
    ) {
      return;
    }
    lastFrame = frame;
    onFrame(frame);
  };

  const scheduleMove = (clientY: number) => {
    pendingClientY = clientY;
    if (resizeFrameScheduled) return;
    resizeFrameScheduled = true;
    const frameId = window.requestAnimationFrame(applyPendingMove);
    if (resizeFrameScheduled) {
      resizeFrameId = frameId;
    }
  };

  const handleMove = (event: MouseEvent) => {
    if (disposed) return;
    scheduleMove(event.clientY);
  };

  const handleUp = (event: MouseEvent) => {
    if (disposed) return;
    if (resizeFrameId !== null) {
      window.cancelAnimationFrame(resizeFrameId);
      resizeFrameId = null;
    }
    resizeFrameScheduled = false;
    pendingClientY = null;
    const frame = buildFrame(event.clientY);
    lastFrame = frame;
    const finalCrop = calculateFinalCropFromResize(
      snapshot,
      frame.effectiveHeight,
      frame.shiftY
    );
    onCommit({ ...frame, finalCrop });
    dispose();
  };

  document.addEventListener('mousemove', handleMove, true);
  document.addEventListener('mouseup', handleUp, true);

  return dispose;
}
