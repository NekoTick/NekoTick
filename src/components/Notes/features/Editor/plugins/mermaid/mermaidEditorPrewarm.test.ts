import { afterEach, describe, expect, it, vi } from 'vitest';
import { mermaidEditorTemplates } from './mermaidEditorTemplates';

const mocks = vi.hoisted(() => ({
  getRenderCode: vi.fn((code: string) => `render:${code}`),
  releaseConsumer: vi.fn(),
  resolveMarkup: vi.fn(() => Promise.resolve('<svg></svg>')),
}));

vi.mock('./mermaidMarkup', () => ({
  getMermaidRenderCode: mocks.getRenderCode,
  releaseMermaidRenderConsumer: mocks.releaseConsumer,
  resolveMermaidMarkup: mocks.resolveMarkup,
}));

import { prewarmMermaidEditor } from './mermaidEditorPrewarm';

describe('mermaidEditorPrewarm', () => {
  afterEach(() => {
    mocks.getRenderCode.mockClear();
    mocks.releaseConsumer.mockClear();
    mocks.resolveMarkup.mockReset();
    mocks.resolveMarkup.mockResolvedValue('<svg></svg>');
  });

  it('uses bounded cancellable workers to warm every template', async () => {
    const cancel = prewarmMermaidEditor();

    expect(mocks.resolveMarkup).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      expect(mocks.resolveMarkup).toHaveBeenCalledTimes(mermaidEditorTemplates.length);
    });
    const consumers = mocks.resolveMarkup.mock.calls.map((call) => call[3]);
    expect(new Set(consumers).size).toBe(1);
    expect(mocks.resolveMarkup).toHaveBeenCalledWith(
      expect.stringContaining('render:'),
      undefined,
      'background',
      consumers[0],
    );

    cancel();
    expect(mocks.releaseConsumer).toHaveBeenCalledWith(consumers[0]);
  });

  it('stops dispatching templates after cancellation', async () => {
    const pendingResolvers: Array<() => void> = [];
    mocks.resolveMarkup.mockImplementation(() => new Promise<string>((resolve) => {
      pendingResolvers.push(() => resolve('<svg></svg>'));
    }));
    const cancel = prewarmMermaidEditor();

    expect(mocks.resolveMarkup).toHaveBeenCalledTimes(2);
    cancel();
    pendingResolvers.forEach((resolve) => resolve());
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.resolveMarkup).toHaveBeenCalledTimes(2);
    expect(mocks.releaseConsumer).toHaveBeenCalledTimes(1);
  });
});
