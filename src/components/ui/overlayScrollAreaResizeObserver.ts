export function observeOverlayScrollAreaContent(
  viewport: HTMLDivElement,
  onResize: () => void,
): () => void {
  const resizeObserver = new ResizeObserver(onResize);
  const observeViewportContent = () => {
    resizeObserver.disconnect();
    resizeObserver.observe(viewport);
    Array.from(viewport.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        resizeObserver.observe(child);
      }
    });
  };

  observeViewportContent();
  const mutationObserver = typeof MutationObserver === 'undefined'
    ? null
    : new MutationObserver(() => {
      observeViewportContent();
      onResize();
    });
  mutationObserver?.observe(viewport, { childList: true });

  return () => {
    resizeObserver.disconnect();
    mutationObserver?.disconnect();
  };
}
