import { useEffect, useReducer, useRef } from 'react';
import type { WhiteboardStroke } from '../../model/whiteboardModel';

const EMPTY_STROKES: WhiteboardStroke[] = [];
const PROGRESSIVE_REPLACEMENT_BATCH_SIZE = 16;
const PROGRESSIVE_REPLACEMENT_MIN_STROKES = 128;

export interface WhiteboardProgressiveStrokeSlot {
  strokes: WhiteboardStroke[];
  transform?: string;
}

interface DisplayedStrokes {
  activeSlot: 0 | 1;
  strokes: WhiteboardStroke[];
  transform?: string;
}

interface StrokeReplacement {
  ids: string[];
  processed: number;
  source: WhiteboardStroke[];
  sourceSlot: 0 | 1;
  sourceTransform?: string;
  target: WhiteboardStroke[];
  targetSlot: 0 | 1;
  targetTransform?: string;
}

export function useWhiteboardProgressiveStrokeSlots(
  enabled: boolean,
  strokes: WhiteboardStroke[],
  transform?: string,
): [WhiteboardProgressiveStrokeSlot, WhiteboardProgressiveStrokeSlot] {
  const [, rerender] = useReducer((version) => version + 1, 0);
  const displayedRef = useRef<DisplayedStrokes>({ activeSlot: 0, strokes, transform });
  const replacementRef = useRef<StrokeReplacement | null>(null);
  let replacement = replacementRef.current;

  if (!enabled) {
    displayedRef.current = { activeSlot: 0, strokes, transform };
    replacementRef.current = null;
    replacement = null;
  } else if (replacement && (replacement.target !== strokes || replacement.targetTransform !== transform)) {
    displayedRef.current = { activeSlot: replacement.targetSlot, strokes, transform };
    replacementRef.current = null;
    replacement = null;
  } else if (replacement && replacement.processed >= replacement.ids.length) {
    displayedRef.current = {
      activeSlot: replacement.targetSlot,
      strokes: replacement.target,
      transform: replacement.targetTransform,
    };
    replacementRef.current = null;
    replacement = null;
  } else if (!replacement) {
    const displayed = displayedRef.current;
    if (displayed.strokes === strokes) {
      displayed.transform = transform;
    } else if (shouldReplaceProgressively(displayed.strokes, strokes)) {
      replacement = createReplacement(displayed, strokes, transform);
      replacementRef.current = replacement;
    } else {
      displayedRef.current = { ...displayed, strokes, transform };
    }
  }

  useEffect(() => {
    const current = replacementRef.current;
    if (!current || current.processed >= current.ids.length) return undefined;
    const frame = requestAnimationFrame(() => {
      if (replacementRef.current !== current) return;
      current.processed = Math.min(
        current.ids.length,
        current.processed + PROGRESSIVE_REPLACEMENT_BATCH_SIZE,
      );
      rerender();
    });
    return () => cancelAnimationFrame(frame);
  });

  if (!replacement) return getDisplayedSlots(displayedRef.current);
  const processedIds = new Set(replacement.ids.slice(0, replacement.processed));
  const source = replacement.source.filter((stroke) => !processedIds.has(stroke.id));
  const target = replacement.target.filter((stroke) => processedIds.has(stroke.id));
  const slots: [WhiteboardProgressiveStrokeSlot, WhiteboardProgressiveStrokeSlot] = [
    { strokes: EMPTY_STROKES },
    { strokes: EMPTY_STROKES },
  ];
  slots[replacement.sourceSlot] = { strokes: source, transform: replacement.sourceTransform };
  slots[replacement.targetSlot] = { strokes: target, transform: replacement.targetTransform };
  return slots;
}

function createReplacement(
  displayed: DisplayedStrokes,
  target: WhiteboardStroke[],
  targetTransform?: string,
): StrokeReplacement {
  const targetIds = target.map((stroke) => stroke.id);
  const targetIdSet = new Set(targetIds);
  return {
    ids: [...targetIds, ...displayed.strokes.flatMap((stroke) => targetIdSet.has(stroke.id) ? [] : [stroke.id])],
    processed: 0,
    source: displayed.strokes,
    sourceSlot: displayed.activeSlot,
    sourceTransform: displayed.transform,
    target,
    targetSlot: displayed.activeSlot === 0 ? 1 : 0,
    targetTransform,
  };
}

function getDisplayedSlots(
  displayed: DisplayedStrokes,
): [WhiteboardProgressiveStrokeSlot, WhiteboardProgressiveStrokeSlot] {
  const slots: [WhiteboardProgressiveStrokeSlot, WhiteboardProgressiveStrokeSlot] = [
    { strokes: EMPTY_STROKES },
    { strokes: EMPTY_STROKES },
  ];
  slots[displayed.activeSlot] = { strokes: displayed.strokes, transform: displayed.transform };
  return slots;
}

function shouldReplaceProgressively(source: WhiteboardStroke[], target: WhiteboardStroke[]): boolean {
  if (Math.max(source.length, target.length) < PROGRESSIVE_REPLACEMENT_MIN_STROKES) return false;
  const targetById = new Map(target.map((stroke) => [stroke.id, stroke]));
  let changed = 0;
  let overlap = 0;
  for (const stroke of source) {
    const next = targetById.get(stroke.id);
    if (!next) continue;
    overlap += 1;
    if (next !== stroke) changed += 1;
  }
  return overlap >= PROGRESSIVE_REPLACEMENT_MIN_STROKES && changed >= PROGRESSIVE_REPLACEMENT_MIN_STROKES;
}
