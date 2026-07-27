import { describe, expect, it } from 'vitest';

import { restoreMermaidFenceSourceFromReference } from './mermaidFenceSourceRestore';

describe('restoreMermaidFenceSourceFromReference', () => {
  it('does not close an outer fence on quote-prefixed fence content', () => {
    const reference = [
      '~~~~flow',
      '> ~~~~',
      'A --> B',
      '~~~~',
    ].join('\n');
    const serialized = [
      '```mermaid',
      'flowchart TD',
      '> ~~~~',
      'A --> B',
      '```',
    ].join('\n');

    expect(restoreMermaidFenceSourceFromReference(serialized, reference)).toBe(reference);
  });
});
