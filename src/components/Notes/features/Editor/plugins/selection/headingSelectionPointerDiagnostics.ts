import { logDiagnostic } from '@/lib/diagnostics/diagnosticsLog';
import { getRetainedHeadingMarkerPointerSnapshot } from '../heading/headingMarkerPointerRetention';
import {
  POINTER_NATIVE_SELECTION_CLASS,
  POINTER_SELECTION_ACTIVE_ATTRIBUTE,
} from './textSelectionOverlayState';
import type { TextSelectionOverlayViewContext } from './textSelectionOverlayViewTypes';

const MAX_POINTER_SAMPLES = 96;
const PRESERVED_INITIAL_SAMPLES = 16;

interface HeadingPointerDiagnosticState {
  droppedSamples: number;
  headingLevel: number;
  lastEventAt: number;
  samples: Array<Record<string, unknown>>;
  startedAt: number;
  totalSamples: number;
}

interface HeadingPointerStepDetails {
  finalPointWasNew?: boolean;
  outcome: string;
}

const activeDiagnostics = new WeakMap<
  TextSelectionOverlayViewContext['view'],
  HeadingPointerDiagnosticState
>();

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function getEventTime(event: MouseEvent): number {
  return Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
}

function getSelectionSnapshot(context: TextSelectionOverlayViewContext) {
  const { selection } = context.view.state;
  return {
    anchor: selection.anchor,
    empty: selection.empty,
    from: selection.from,
    head: selection.head,
    pointerAnchor: context.session.pointerTextSelectionAnchor,
    pointerMoved: context.session.pointerMovedSinceDown,
    pointerTextActive: context.session.pointerTextSelectionActive,
    to: selection.to,
  };
}

function getMarkerSnapshot(context: TextSelectionOverlayViewContext) {
  const retained = getRetainedHeadingMarkerPointerSnapshot(context.view);
  if (!retained) return null;
  return {
    bottom: roundMetric(retained.markerRect.bottom),
    contentStart: retained.contentStart,
    lastClientX: roundMetric(retained.lastPoint.clientX),
    lastClientY: roundMetric(retained.lastPoint.clientY),
    pointerPastMarker: retained.pointerPastMarker,
    right: roundMetric(retained.markerRect.right),
    top: roundMetric(retained.markerRect.top),
  };
}

function recordSample(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent,
  phase: 'down' | 'move' | 'up',
  details: HeadingPointerStepDetails,
): void {
  const diagnostic = activeDiagnostics.get(context.view);
  if (!diagnostic) return;

  const eventAt = getEventTime(event);
  const sample = {
    clientX: roundMetric(event.clientX),
    clientY: roundMetric(event.clientY),
    elapsedMs: roundMetric(eventAt - diagnostic.startedAt),
    eventGapMs: roundMetric(eventAt - diagnostic.lastEventAt),
    finalPointWasNew: details.finalPointWasNew,
    marker: getMarkerSnapshot(context),
    outcome: details.outcome,
    phase,
    selection: getSelectionSnapshot(context),
  };
  diagnostic.lastEventAt = eventAt;
  diagnostic.totalSamples += 1;

  if (diagnostic.samples.length >= MAX_POINTER_SAMPLES) {
    diagnostic.samples.splice(PRESERVED_INITIAL_SAMPLES, 1);
    diagnostic.droppedSamples += 1;
  }
  diagnostic.samples.push(sample);
}

export function beginHeadingPointerSelectionDiagnostic(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent,
): void {
  if (!(event.target instanceof Element)) return;
  const heading = event.target.closest<HTMLElement>('h1, h2, h3, h4, h5, h6');
  if (!heading || !context.view.dom.contains(heading)) return;

  const eventAt = getEventTime(event);
  activeDiagnostics.set(context.view, {
    droppedSamples: 0,
    headingLevel: Number(heading.tagName.slice(1)),
    lastEventAt: eventAt,
    samples: [],
    startedAt: eventAt,
    totalSamples: 0,
  });
  recordSample(context, event, 'down', { outcome: 'pointer-down' });
}

export function recordHeadingPointerSelectionMove(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent,
  outcome: string,
): void {
  recordSample(context, event, 'move', { outcome });
}

export function finishHeadingPointerSelectionDiagnostic(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent,
  details: HeadingPointerStepDetails,
): void {
  const diagnostic = activeDiagnostics.get(context.view);
  if (!diagnostic) return;
  recordSample(context, event, 'up', details);

  queueMicrotask(() => {
    if (activeDiagnostics.get(context.view) !== diagnostic) return;
    activeDiagnostics.delete(context.view);
    if (details.outcome === 'not-drag') return;

    const { view } = context;
    logDiagnostic('notes-heading-selection', 'pointer-session', {
      droppedSamples: diagnostic.droppedSamples,
      durationMs: roundMetric(getEventTime(event) - diagnostic.startedAt),
      headingLevel: diagnostic.headingLevel,
      postRelease: {
        marker: getMarkerSnapshot(context),
        markerSelected: Boolean(view.dom.querySelector('.heading-markdown-marker-pointer-selected')),
        pointerNative: view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS),
        pointerSelecting: view.dom.getAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE),
        selection: getSelectionSnapshot(context),
      },
      samples: diagnostic.samples,
      totalSamples: diagnostic.totalSamples,
    });
  });
}

export function discardHeadingPointerSelectionDiagnostic(
  context: TextSelectionOverlayViewContext,
): void {
  activeDiagnostics.delete(context.view);
}
