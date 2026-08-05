import { afterEach, describe, expect, it } from 'vitest';
import { createPreviewElement } from './fileTreePointerDragPreview';

function createSourceElement() {
  const source = document.createElement('div');
  source.innerHTML = [
    '<span data-file-tree-image-background="cover.png"><span></span></span>',
    '<span data-file-tree-image-name="cover.png">cover.png</span>',
  ].join('');
  const thumbnail = source.querySelector<HTMLElement>('[data-file-tree-image-background] > span');
  if (thumbnail) thumbnail.style.backgroundImage = 'url("blob:thumbnail")';
  Object.defineProperty(source, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 10,
      top: 20,
      width: 180,
      height: 36,
      right: 190,
      bottom: 56,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }),
  });
  return source;
}

describe('createPreviewElement', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('keeps image thumbnail backgrounds and names in drag previews', () => {
    const { previewElement } = createPreviewElement(createSourceElement());
    const thumbnail = previewElement.querySelector<HTMLElement>(
      '[data-file-tree-image-background] > span',
    );

    expect(previewElement.querySelector('[data-file-tree-image-background]')).not.toBeNull();
    expect(thumbnail?.style.backgroundImage).toBe('url("blob:thumbnail")');
    expect(previewElement.querySelector('[data-file-tree-image-name]')).toHaveTextContent('cover.png');
  });
});
