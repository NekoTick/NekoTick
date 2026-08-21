import { expect, it, vi } from 'vitest';
import { preloadMarkdownEditor } from './preloadMarkdownEditor';

const mocks = vi.hoisted(() => ({
  markdownEditorLoadAttempts: 0,
}));

vi.mock('./index', () => {
  mocks.markdownEditorLoadAttempts += 1;
  if (mocks.markdownEditorLoadAttempts === 1) {
    throw new Error('Markdown editor preload failed');
  }
  return { MarkdownEditor: () => null };
});

vi.mock('./MilkdownEditorInner', () => ({
  MilkdownEditorRuntime: () => null,
}));

it('retries the Markdown editor module after a rejected preload', async () => {
  await expect(preloadMarkdownEditor()).rejects.toThrow();
  await expect(preloadMarkdownEditor()).resolves.toEqual(expect.objectContaining({
    MarkdownEditor: expect.any(Function),
  }));

  expect(mocks.markdownEditorLoadAttempts).toBe(2);
});
