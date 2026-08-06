import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearMermaidMarkupCache,
  resolveCachedMermaidMarkup,
} from './mermaidMarkupCache';

describe('Mermaid markup cache', () => {
  afterEach(() => {
    clearMermaidMarkupCache();
  });

  it('coalesces the same diagram across editor and read-only consumers', async () => {
    let resolveRender = (_markup: string) => {};
    const editorRender = vi.fn(() => new Promise<string>((resolve) => {
      resolveRender = resolve;
    }));
    const readOnlyRender = vi.fn(async () => '<svg data-source="readonly"></svg>');
    const editorPromise = resolveCachedMermaidMarkup({
      cacheKey: 'en\0flowchart TD\nA --> B',
      group: 'editor',
      priority: 'background',
      render: editorRender,
    });
    const readOnlyPromise = resolveCachedMermaidMarkup({
      cacheKey: 'en\0flowchart TD\nA --> B',
      group: 'readonly',
      priority: 'interactive',
      render: readOnlyRender,
    });

    await vi.waitFor(() => {
      expect(editorRender).toHaveBeenCalledTimes(1);
    });
    resolveRender('<svg data-source="shared"></svg>');

    await expect(editorPromise).resolves.toContain('data-source="shared"');
    await expect(readOnlyPromise).resolves.toContain('data-source="shared"');
    expect(readOnlyRender).not.toHaveBeenCalled();
  });
});
