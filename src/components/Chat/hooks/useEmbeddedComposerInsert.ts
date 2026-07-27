import { useEffect } from 'react';
import { focusComposerInput, insertTextIntoComposer } from '@/lib/ui/composerFocusRegistry';

export function useEmbeddedComposerInsert(args: {
  active: boolean;
  consumePendingComposerInsert: (id: number) => void;
  isEmbedded: boolean;
  pendingComposerInsert: { id: number; text: string } | null;
}) {
  const { active, consumePendingComposerInsert, isEmbedded, pendingComposerInsert } = args;

  useEffect(() => {
    if (!active || !isEmbedded || !pendingComposerInsert) {
      return;
    }

    let frameId = 0;
    let attempts = 0;
    let cancelled = false;

    const tryInsert = () => {
      if (cancelled) {
        return;
      }

      if (insertTextIntoComposer(pendingComposerInsert.text)) {
        focusComposerInput();
        consumePendingComposerInsert(pendingComposerInsert.id);
        return;
      }

      attempts += 1;
      if (attempts >= 24) {
        consumePendingComposerInsert(pendingComposerInsert.id);
        return;
      }

      frameId = requestAnimationFrame(tryInsert);
    };

    tryInsert();

    return () => {
      cancelled = true;
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [active, consumePendingComposerInsert, isEmbedded, pendingComposerInsert]);
}
