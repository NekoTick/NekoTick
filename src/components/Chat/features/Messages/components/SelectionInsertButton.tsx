import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icons";
import { raisedPillSurfaceClass } from "@/components/ui/surfaceStyles";
import { focusComposerInput, insertTextIntoComposer } from "@/lib/ui/composerFocusRegistry";
import { cn, iconButtonStyles } from "@/lib/utils";
import { useSelectionInsertState } from "./useSelectionInsertState";
import { useI18n } from "@/lib/i18n";

export function SelectionInsertButton() {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const { clearSelectionInsertState, state } = useSelectionInsertState();

  useEffect(() => {
    setMounted(true);
  }, []);

  const transformClass = useMemo(() => {
    if (!state) return "";
    return state.placeBelow ? "-translate-x-1/2" : "-translate-x-1/2 -translate-y-full";
  }, [state]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      data-chat-selection-insert-layer="true"
      className="pointer-events-none fixed inset-0 z-[var(--vlaina-z-115)]"
    >
      {state && (
        <button
          type="button"
          aria-label={t('chat.insertSelection')}
          data-chat-selection-insert-button="true"
          data-no-focus-input="true"
          className={cn(
            "pointer-events-auto absolute flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            iconButtonStyles,
            cn(raisedPillSurfaceClass, "rounded-full"),
            "text-[var(--vlaina-sidebar-chat-text)] hover:bg-transparent hover:text-[var(--vlaina-accent)] dark:hover:bg-transparent",
            transformClass,
          )}
          style={{ left: `${state.x}px`, top: `${state.y}px` }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const inserted = insertTextIntoComposer(state.text);
            if (!inserted) {
              return;
            }
            requestAnimationFrame(() => {
              focusComposerInput();
            });
            window.getSelection()?.removeAllRanges();
            clearSelectionInsertState();
          }}
        >
          <Icon name="common.quote" size="sm" />
        </button>
      )}
    </div>,
    document.body
  );
}
