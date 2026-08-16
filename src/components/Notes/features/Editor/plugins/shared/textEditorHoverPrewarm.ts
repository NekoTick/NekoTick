import { themeUiFeedbackTokens } from '@/styles/themeTokens';

export function createTextEditorHoverPrewarm(args: {
  editorDom: HTMLElement;
  findTarget: (target: EventTarget | null) => HTMLElement | null;
  prewarm: () => void | (() => void);
}) {
  const ownerWindow = args.editorDom.ownerDocument.defaultView;
  let activeTarget: HTMLElement | null = null;
  let prewarmCleanup: (() => void) | undefined;
  let prewarmTimer: number | undefined;

  const cancel = () => {
    if (prewarmTimer !== undefined) ownerWindow?.clearTimeout(prewarmTimer);
    prewarmTimer = undefined;
    prewarmCleanup?.();
    prewarmCleanup = undefined;
    activeTarget = null;
  };

  const handleMouseOver = (event: MouseEvent) => {
    const target = args.findTarget(event.target);
    if (!target || target === activeTarget) return;
    cancel();
    activeTarget = target;
    prewarmTimer = ownerWindow?.setTimeout(() => {
      prewarmTimer = undefined;
      if (activeTarget === target) prewarmCleanup = args.prewarm() || undefined;
    }, themeUiFeedbackTokens.editorPreviewPrewarmDelayMs);
  };

  const handleMouseOut = (event: MouseEvent) => {
    const target = args.findTarget(event.target);
    if (!target || target !== activeTarget) return;
    if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
    cancel();
  };

  args.editorDom.addEventListener('mouseover', handleMouseOver);
  args.editorDom.addEventListener('mouseout', handleMouseOut);
  ownerWindow?.addEventListener('blur', cancel);

  return {
    cancel,
    destroy() {
      cancel();
      args.editorDom.removeEventListener('mouseover', handleMouseOver);
      args.editorDom.removeEventListener('mouseout', handleMouseOut);
      ownerWindow?.removeEventListener('blur', cancel);
    },
  };
}
