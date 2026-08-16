export const FOOTNOTE_TOOLTIP_POSITIONED_CLASS = 'editor-footnote-tooltip-positioned';
const FOOTNOTE_TOOLTIP_LEFT_STYLE = '--vlaina-footnote-tooltip-left';
const FOOTNOTE_TOOLTIP_TOP_STYLE = '--vlaina-footnote-tooltip-top';

export function syncFootnoteTooltipPosition(ref: HTMLElement): void {
  const rect = ref.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return;

  ref.style.setProperty(FOOTNOTE_TOOLTIP_LEFT_STYLE, `${rect.left + rect.width / 2}px`);
  ref.style.setProperty(FOOTNOTE_TOOLTIP_TOP_STYLE, `${rect.top}px`);
  ref.classList.add(FOOTNOTE_TOOLTIP_POSITIONED_CLASS);
}

export function resolveFootnoteRef(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const ref = target.closest('.footnote-ref[data-id], .footnote-ref[data-label]');
  return ref instanceof HTMLElement ? ref : null;
}

export function installFootnoteTooltipPositioning(editorDom: HTMLElement) {
  const ownerWindow = editorDom.ownerDocument.defaultView;
  let hoveredRef: HTMLElement | null = null;
  let focusedRef: HTMLElement | null = null;
  let frameId: number | null = null;

  const prune = () => {
    if (hoveredRef && !editorDom.contains(hoveredRef)) hoveredRef = null;
    if (focusedRef && !editorDom.contains(focusedRef)) focusedRef = null;
  };
  const getActiveRef = () => focusedRef ?? hoveredRef;
  const syncActiveRef = () => {
    frameId = null;
    prune();
    const activeRef = getActiveRef();
    if (activeRef) syncFootnoteTooltipPosition(activeRef);
  };
  const scheduleSync = () => {
    if (!ownerWindow || frameId !== null || !getActiveRef()) return;
    frameId = ownerWindow.requestAnimationFrame(syncActiveRef);
  };
  const handlePointerOver = (event: Event) => {
    hoveredRef = resolveFootnoteRef(event.target);
    syncActiveRef();
  };
  const handlePointerOut = (event: MouseEvent) => {
    if (!hoveredRef || !(event.target instanceof Element) || !hoveredRef.contains(event.target)) return;
    const nextRef = resolveFootnoteRef(event.relatedTarget);
    if (nextRef !== hoveredRef) hoveredRef = nextRef;
  };
  const handleFocusIn = (event: Event) => {
    focusedRef = resolveFootnoteRef(event.target);
    syncActiveRef();
  };
  const handleFocusOut = (event: FocusEvent) => {
    if (!focusedRef || !(event.target instanceof Element) || !focusedRef.contains(event.target)) return;
    const nextRef = resolveFootnoteRef(event.relatedTarget);
    if (nextRef !== focusedRef) focusedRef = nextRef;
  };

  editorDom.addEventListener('mouseover', handlePointerOver);
  editorDom.addEventListener('mouseout', handlePointerOut);
  editorDom.addEventListener('focusin', handleFocusIn);
  editorDom.addEventListener('focusout', handleFocusOut);
  editorDom.addEventListener('scroll', scheduleSync, true);
  ownerWindow?.addEventListener('scroll', scheduleSync, true);
  ownerWindow?.addEventListener('resize', scheduleSync);

  return {
    prune,
    destroy: () => {
      editorDom.removeEventListener('mouseover', handlePointerOver);
      editorDom.removeEventListener('mouseout', handlePointerOut);
      editorDom.removeEventListener('focusin', handleFocusIn);
      editorDom.removeEventListener('focusout', handleFocusOut);
      editorDom.removeEventListener('scroll', scheduleSync, true);
      ownerWindow?.removeEventListener('scroll', scheduleSync, true);
      ownerWindow?.removeEventListener('resize', scheduleSync);
      if (frameId !== null) {
        ownerWindow?.cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
  };
}
