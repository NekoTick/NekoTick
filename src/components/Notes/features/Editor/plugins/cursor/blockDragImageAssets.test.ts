import { describe, expect, it, vi } from 'vitest';
import { remapDraggedMarkdownImageAssets, type RemapDraggedMarkdownImageAssetsDeps } from './blockDragImageAssets';

function createDeps(uploadedPath: string): RemapDraggedMarkdownImageAssetsDeps & {
  uploadedFiles: File[];
} {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const uploadedFiles: File[] = [];

  return {
    notesPath: '/notes',
    storage: {
      exists: vi.fn(async (path: string) => path === '/notes/source/assets/photo.png'),
      stat: vi.fn(async (path: string) => path === '/notes/source/assets/photo.png'
        ? {
            name: 'photo.png',
            path,
            isDirectory: false,
            isFile: true,
            size: bytes.byteLength,
            modifiedAt: 1234,
          }
        : null),
      readBinaryFile: vi.fn(async () => bytes),
    },
    uploadAsset: vi.fn(async (file: File, currentNotePath?: string) => {
      uploadedFiles.push(file);
      expect(currentNotePath).toBe('target/target.md');
      return {
        success: true,
        path: uploadedPath,
        isDuplicate: false,
      };
    }),
    resolveCandidates: vi.fn(async ({ rawSrc }) => (
      rawSrc.startsWith('./assets/photo.png') ? ['/notes/source/assets/photo.png'] : []
    )),
    uploadedFiles,
  };
}

describe('remapDraggedMarkdownImageAssets', () => {
  it('copies html image assets and rewrites their src for the target note', async () => {
    const deps = createDeps('./assets/photo-copy.png');

    const result = await remapDraggedMarkdownImageAssets({
      markdown: '<img src="./assets/photo.png" alt="Demo" />',
      sourceNotePath: 'source/source.md',
      targetNotePath: 'target/target.md',
    }, deps);

    expect(result).toBe('<img src="./assets/photo-copy.png" alt="Demo" />');
    expect(deps.uploadAsset).toHaveBeenCalledTimes(1);
    const uploadedFile = deps.uploadedFiles[0];
    if (!uploadedFile) {
      throw new Error('Expected dragged image copy to upload a file');
    }
    expect(uploadedFile).toBeInstanceOf(File);
    expect(uploadedFile.name).toBe('photo.png');
    await expect(uploadedFile.arrayBuffer().then((buffer) => Array.from(new Uint8Array(buffer))))
      .resolves.toEqual([137, 80, 78, 71]);
  });

  it('copies markdown image assets while preserving title and presentation fragment', async () => {
    const deps = createDeps('./assets/copied photo.png');

    const result = await remapDraggedMarkdownImageAssets({
      markdown: '![Alt](./assets/photo.png#card "Title")',
      sourceNotePath: 'source/source.md',
      targetNotePath: 'target/target.md',
    }, deps);

    expect(result).toBe('![Alt](<./assets/copied photo.png#card> "Title")');
  });

  it('does not rewrite image-looking text inside fenced code blocks', async () => {
    const deps = createDeps('./assets/photo-copy.png');

    const result = await remapDraggedMarkdownImageAssets({
      markdown: [
        '```html',
        '<img src="./assets/photo.png" alt="Code" />',
        '```',
        '',
        '<img src="./assets/photo.png" alt="Real" />',
      ].join('\n'),
      sourceNotePath: 'source/source.md',
      targetNotePath: 'target/target.md',
    }, deps);

    expect(result).toBe([
      '```html',
      '<img src="./assets/photo.png" alt="Code" />',
      '```',
      '',
      '<img src="./assets/photo-copy.png" alt="Real" />',
    ].join('\n'));
    expect(deps.uploadAsset).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: 'list',
      lines: [
        '- ```md',
        '  ![Code](./assets/photo.png)',
        '  ```',
      ],
    },
    {
      name: 'blockquote',
      lines: [
        '> ```md',
        '> ![Code](./assets/photo.png)',
        '> ```',
      ],
    },
  ])('does not rewrite image-looking text inside $name-contained fenced code', async ({ lines }) => {
    const deps = createDeps('./assets/photo-copy.png');
    const markdown = lines.join('\n');

    const result = await remapDraggedMarkdownImageAssets({
      markdown,
      sourceNotePath: 'source/source.md',
      targetNotePath: 'target/target.md',
    }, deps);

    expect(result).toBe(markdown);
    expect(deps.uploadAsset).not.toHaveBeenCalled();
  });

  it('resumes rewriting after an unclosed list fence leaves its container', async () => {
    const deps = createDeps('./assets/photo-copy.png');

    const result = await remapDraggedMarkdownImageAssets({
      markdown: [
        '- ```md',
        '  ![Code](./assets/photo.png)',
        'Outside',
        '![Real](./assets/photo.png)',
      ].join('\n'),
      sourceNotePath: 'source/source.md',
      targetNotePath: 'target/target.md',
    }, deps);

    expect(result).toBe([
      '- ```md',
      '  ![Code](./assets/photo.png)',
      'Outside',
      '![Real](./assets/photo-copy.png)',
    ].join('\n'));
    expect(deps.uploadAsset).toHaveBeenCalledTimes(1);
  });
});
