import {
  getMermaidRenderCode,
  releaseMermaidRenderConsumer,
  resolveMermaidMarkup,
} from './mermaidMarkup';
import { mermaidEditorTemplates } from './mermaidEditorTemplates';

const MERMAID_EDITOR_PREWARM_WORKERS = 2;

export function prewarmMermaidEditor() {
  const consumer = {};
  let isCancelled = false;
  let nextTemplateIndex = 0;
  const prewarmNext = async () => {
    while (!isCancelled) {
      const template = mermaidEditorTemplates[nextTemplateIndex];
      nextTemplateIndex += 1;
      if (!template) return;
      await resolveMermaidMarkup(
        getMermaidRenderCode(template.code),
        undefined,
        'background',
        consumer,
      ).catch(() => undefined);
    }
  };
  for (let index = 0; index < MERMAID_EDITOR_PREWARM_WORKERS; index += 1) {
    void prewarmNext();
  }

  return () => {
    isCancelled = true;
    releaseMermaidRenderConsumer(consumer);
  };
}
