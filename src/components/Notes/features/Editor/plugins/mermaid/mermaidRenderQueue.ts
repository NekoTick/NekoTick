import {
  getActiveMermaidRenderCount as getActiveScheduledMermaidRenderCount,
  MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS,
  type MermaidRenderPriority,
} from '@/components/common/markdown/mermaidRenderScheduler';
import {
  MAX_CONCURRENT_MERMAID_RENDERS,
  resolveMermaidRenderConcurrency,
} from '@/components/common/markdown/mermaidRenderCapacity';

export {
  MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS,
  MAX_CONCURRENT_MERMAID_RENDERS,
  resolveMermaidRenderConcurrency,
  type MermaidRenderPriority,
};

export const EDITOR_MERMAID_RENDER_GROUP = 'editor';

export function getActiveMermaidRenderCount(): number {
  return getActiveScheduledMermaidRenderCount(EDITOR_MERMAID_RENDER_GROUP);
}
