import type { EditorView } from '@milkdown/kit/prose/view';

export function withPreviewDomObservationPaused(view: EditorView, mutate: () => void): void {
  const domObserver = (view as EditorView & {
    domObserver?: {
      start: () => void;
      stop: () => void;
    };
  }).domObserver;

  domObserver?.stop();
  try {
    mutate();
  } finally {
    domObserver?.start();
  }
}
