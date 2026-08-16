export const FORMULA_RENDER_FRAME_BUDGET_MS = 4;

export function createMathFormulaRenderQueue(args: {
  onSettled?: (element: HTMLElement) => void;
  render: (element: HTMLElement, latex: string) => void;
}) {
  const pending = new Map<HTMLElement, string>();
  let renderFrame: number | undefined;

  const flush = () => {
    renderFrame = undefined;
    const frameStart = performance.now();
    for (const [element, latex] of pending) {
      pending.delete(element);
      if (element.isConnected) args.render(element, latex);
      args.onSettled?.(element);
      if (performance.now() - frameStart >= FORMULA_RENDER_FRAME_BUDGET_MS) break;
    }
    schedule();
  };

  function schedule() {
    if (!pending.size || renderFrame !== undefined) return;
    renderFrame = requestAnimationFrame(flush);
  }

  return {
    add(element: HTMLElement, latex: string) {
      pending.set(element, latex);
      schedule();
    },
    clear() {
      pending.clear();
      if (renderFrame !== undefined) cancelAnimationFrame(renderFrame);
      renderFrame = undefined;
    },
    remove(element: HTMLElement) {
      pending.delete(element);
    },
  };
}
