import { act, cleanup, render } from '@testing-library/react';
import { createElement, type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  BodyLineNumberGutter,
} from './BodyLineNumberGutter';
import {
  setBlockSelectionInteractionPending,
  setBlockSelectionPreviewElements,
} from '../plugins/cursor/blockSelectionInteractionState';
import {
  collectBodyLineNumberTargets,
  MAX_BODY_LINE_NUMBER_PRECISE_TEXT_ANCHOR_TARGETS,
  MAX_BODY_LINE_NUMBER_TARGETS,
  resolveBodyLineNumberLabels,
} from '../utils/bodyLineNumberLayout';

function setRect(element: HTMLElement, rect: Partial<DOMRect>) {
  element.getBoundingClientRect = () => ({
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    top: rect.top ?? 0,
    right: rect.right ?? 0,
    bottom: rect.bottom ?? 0,
    left: rect.left ?? 0,
    toJSON: () => ({}),
  } as DOMRect);
}

function createRect(rect: Partial<DOMRect>): DOMRect {
  return {
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    top: rect.top ?? 0,
    right: rect.right ?? 0,
    bottom: rect.bottom ?? 0,
    left: rect.left ?? 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function createRectList(rects: DOMRect[]): DOMRectList {
  const rectList = {
    length: rects.length,
    item: (index: number) => rects[index] ?? null,
  } as DOMRectList & Record<number, DOMRect>;
  rects.forEach((rect, index) => {
    rectList[index] = rect;
  });
  return rectList;
}

function mockTextRects(rectsByText: Record<string, Partial<DOMRect>>) {
  let selectedNode: Node | null = null;
  return vi.spyOn(document, 'createRange').mockImplementation(() => ({
    selectNodeContents: vi.fn((node: Node) => {
      selectedNode = node;
    }),
    getClientRects: vi.fn(() => {
      const text = selectedNode?.textContent ?? '';
      const rect = rectsByText[text];
      return createRectList(rect ? [createRect(rect)] : []);
    }),
    detach: vi.fn(),
  } as unknown as Range));
}

describe('BodyLineNumberGutter', () => {
  it('collects body targets with each code block line but without frontmatter blocks', () => {
    const editorRoot = document.createElement('div');
    editorRoot.className = 'ProseMirror';
    editorRoot.innerHTML = [
      '<div class="frontmatter-block-container"></div>',
      '<h1 id="heading">Title</h1>',
      '<div id="code" class="code-block-container"><div class="cm-content"><div id="code-one" class="cm-line">one</div><div id="code-two" class="cm-line">two</div></div></div>',
      '<ul><li id="one">One</li><li id="two">Two</li></ul>',
      '<p id="paragraph">Text</p>',
    ].join('');

    expect(collectBodyLineNumberTargets(editorRoot).map((item) => item.id)).toEqual([
      'heading',
      'code-one',
      'code-two',
      'one',
      'two',
      'paragraph',
    ]);
  });

  it('collects body targets with source blank lines but without editor-only separators', () => {
    const editorRoot = document.createElement('div');
    editorRoot.className = 'ProseMirror';
    editorRoot.innerHTML = [
      '<h1 id="heading">Title</h1>',
      '<div id="blank-html" data-type="html-block" data-value="<!--vlaina-markdown-blank-line-->"></div>',
      '<div id="html-boundary" data-type="html-block" data-value="<!--vlaina-rendered-html-boundary-blank-line-->"></div>',
      '<div id="tight-heading" data-type="html-block" data-value="<!--vlaina-markdown-tight-heading-->"></div>',
      '<p id="blank-paragraph" class="editor-editable-markdown-blank-line"></p>',
      '<p id="empty-paragraph" class="editor-empty-paragraph"></p>',
      '<p id="paragraph">Text</p>',
    ].join('');

    expect(collectBodyLineNumberTargets(editorRoot).map((item) => item.id)).toEqual([
      'heading',
      'blank-html',
      'blank-paragraph',
      'empty-paragraph',
      'paragraph',
    ]);
  });

  it('collects body targets without hidden link reference or abbreviation definitions', () => {
    const editorRoot = document.createElement('div');
    editorRoot.className = 'ProseMirror';
    editorRoot.innerHTML = [
      '<p id="paragraph">Inline reference</p>',
      '<p id="reference">[docs]: https://example.com</p>',
      '<p id="abbr">*[API]: Application Programming Interface</p>',
      '<p id="after">API body</p>',
    ].join('');

    expect(collectBodyLineNumberTargets(editorRoot).map((item) => item.id)).toEqual([
      'paragraph',
      'after',
    ]);
  });

  it('collects rendered raw audio and video HTML targets', () => {
    const editorRoot = document.createElement('div');
    editorRoot.className = 'ProseMirror';
    const iframe = document.createElement('div');
    const video = document.createElement('div');
    const audio = document.createElement('div');
    iframe.id = 'iframe';
    iframe.dataset.type = 'html-block';
    iframe.dataset.value = '<iframe src="https://example.com/embed"></iframe>';
    video.id = 'video';
    video.dataset.type = 'html-block';
    video.dataset.value = '<video src="xxx.mp4" controls />';
    audio.id = 'audio';
    audio.dataset.type = 'html-block';
    audio.dataset.value = '<audio src="xxx.mp3" controls />';
    editorRoot.append(iframe, video, audio);

    expect(collectBodyLineNumberTargets(editorRoot).map((item) => item.id)).toEqual([
      'iframe',
      'video',
      'audio',
    ]);
  });

  it('collects body targets without materializing child lists', () => {
    const editorRoot = document.createElement('div');
    editorRoot.className = 'ProseMirror';
    const list = document.createElement('ul');
    for (let index = 0; index < MAX_BODY_LINE_NUMBER_TARGETS + 8; index += 1) {
      const item = document.createElement('li');
      item.id = `item-${index}`;
      list.appendChild(item);
    }
    editorRoot.appendChild(list);
    const arrayFromSpy = vi.spyOn(Array, 'from');
    const querySelectorAllSpy = vi.spyOn(Element.prototype, 'querySelectorAll');

    try {
      const targets = collectBodyLineNumberTargets(editorRoot);

      expect(targets).toHaveLength(MAX_BODY_LINE_NUMBER_TARGETS);
      expect(targets[0]?.id).toBe('item-0');
      expect(targets.at(-1)?.id).toBe(`item-${MAX_BODY_LINE_NUMBER_TARGETS - 1}`);
      expect(arrayFromSpy).not.toHaveBeenCalled();
      expect(querySelectorAllSpy).not.toHaveBeenCalled();
    } finally {
      arrayFromSpy.mockRestore();
      querySelectorAllSpy.mockRestore();
    }
  });

  it('observes editor child blocks so media resize can refresh labels', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });

    const observedElements: Element[] = [];
    class TestResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}

      observe = vi.fn((element: Element) => {
        observedElements.push(element);
      });
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    class TestMutationObserver {
      constructor(_callback: MutationCallback) {}

      observe = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const paragraph = document.createElement('p');
    const shellRef = { current: shell } as RefObject<HTMLDivElement | null>;

    editorRoot.className = 'ProseMirror';
    paragraph.textContent = 'Body';
    shell.appendChild(editorRoot);
    editorRoot.appendChild(paragraph);
    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(paragraph, { left: 106, top: 40, height: 24 });

    try {
      render(createElement(BodyLineNumberGutter, {
        markdown: 'Body',
        revision: 1,
        shellRef,
      }));

      expect(observedElements).toEqual(expect.arrayContaining([shell, editorRoot, paragraph]));
    } finally {
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('keeps observers mounted when only markdown content changes', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });

    let resizeObserverCount = 0;
    let mutationObserverCount = 0;
    const resizeDisconnect = vi.fn();
    const mutationDisconnect = vi.fn();
    class TestResizeObserver {
      constructor(_callback: ResizeObserverCallback) {
        resizeObserverCount += 1;
      }

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = resizeDisconnect;
    }
    class TestMutationObserver {
      constructor(_callback: MutationCallback) {
        mutationObserverCount += 1;
      }

      observe = vi.fn();
      disconnect = mutationDisconnect;
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const paragraph = document.createElement('p');
    const shellRef = { current: shell } as RefObject<HTMLDivElement | null>;
    editorRoot.className = 'ProseMirror';
    paragraph.textContent = 'Body';
    editorRoot.appendChild(paragraph);
    shell.appendChild(editorRoot);
    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(paragraph, { left: 106, top: 40, height: 24 });

    try {
      const { rerender } = render(createElement(BodyLineNumberGutter, {
        markdown: 'Body',
        revision: 1,
        shellRef,
      }));

      rerender(createElement(BodyLineNumberGutter, {
        markdown: 'Body updated',
        revision: 1,
        shellRef,
      }));

      expect(resizeObserverCount).toBe(1);
      expect(mutationObserverCount).toBe(1);
      expect(resizeDisconnect).not.toHaveBeenCalled();
      expect(mutationDisconnect).not.toHaveBeenCalled();
    } finally {
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('throttles full layout measurements for large documents', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });

    class TestResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    let mutationCallback: MutationCallback = () => {};
    class TestMutationObserver {
      constructor(callback: MutationCallback) {
        mutationCallback = callback;
      }

      observe = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const shellRef = { current: shell } as RefObject<HTMLDivElement | null>;
    editorRoot.className = 'ProseMirror';
    const paragraphs = Array.from(
      { length: MAX_BODY_LINE_NUMBER_PRECISE_TEXT_ANCHOR_TARGETS + 1 },
      (_value, index) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = `Line ${index + 1}`;
        setRect(paragraph, { left: 106, top: 40 + index * 24, height: 24 });
        return paragraph;
      },
    );
    editorRoot.append(...paragraphs);
    shell.appendChild(editorRoot);
    setRect(shell, { left: 10, top: 20, height: 400 });
    setRect(editorRoot, { left: 106, top: 20, height: paragraphs.length * 24 });
    const firstTargetRect = vi.spyOn(paragraphs[0]!, 'getBoundingClientRect');

    try {
      render(createElement(BodyLineNumberGutter, {
        markdown: paragraphs.map((paragraph) => paragraph.textContent).join('\n\n'),
        revision: 1,
        shellRef,
      }));
      act(() => {
        vi.advanceTimersByTime(0);
      });
      const initialMeasurementCount = firstTargetRect.mock.calls.length;

      act(() => {
        const record = { type: 'childList', target: editorRoot } as unknown as MutationRecord;
        mutationCallback([record], {} as MutationObserver);
        mutationCallback([record], {} as MutationObserver);
        vi.advanceTimersByTime(199);
      });
      expect(firstTargetRect).toHaveBeenCalledTimes(initialMeasurementCount);

      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(firstTargetRect).toHaveBeenCalledTimes(initialMeasurementCount + 1);
    } finally {
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('ignores internal code editor mutations because code block resize already refreshes labels', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });

    class TestResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    let mutationCallback: MutationCallback = () => {};
    class TestMutationObserver {
      constructor(callback: MutationCallback) {
        mutationCallback = callback;
      }

      observe = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const codeBlock = document.createElement('div');
    const codeBody = document.createElement('div');
    const codeLine = document.createElement('div');
    const shellRef = { current: shell } as RefObject<HTMLDivElement | null>;
    let codeLineTop = 72;
    let selectedNode: Node | null = null;
    const createRangeSpy = vi.spyOn(document, 'createRange').mockImplementation(() => ({
      selectNodeContents: vi.fn((node: Node) => {
        selectedNode = node;
      }),
      getClientRects: vi.fn(() => createRectList(
        selectedNode?.textContent === 'const value = 1;'
          ? [createRect({ top: codeLineTop, height: 16, width: 120 })]
          : []
      )),
      detach: vi.fn(),
    } as unknown as Range));

    editorRoot.className = 'ProseMirror';
    codeBlock.className = 'code-block-container';
    codeBody.className = 'code-block-editable';
    codeLine.className = 'cm-line';
    codeLine.textContent = 'const value = 1;';
    codeBody.appendChild(codeLine);
    codeBlock.appendChild(codeBody);
    shell.appendChild(editorRoot);
    editorRoot.appendChild(codeBlock);
    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(codeBlock, { left: 106, top: 40, height: 120 });

    try {
      const { container } = render(createElement(BodyLineNumberGutter, {
        markdown: ['```ts', 'const value = 1;', '```'].join('\n'),
        revision: 1,
        shellRef,
      }));

      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(container.querySelector<HTMLElement>('.body-line-number')?.style.top).toBe('60px');

      codeLineTop = 120;
      act(() => {
        mutationCallback([{ target: codeLine } as unknown as MutationRecord], {} as MutationObserver);
        vi.advanceTimersByTime(0);
      });

      expect(container.querySelector<HTMLElement>('.body-line-number')?.style.top).toBe('60px');
    } finally {
      createRangeSpy.mockRestore();
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('resolves labels in an independent gutter before the editor content', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const heading = document.createElement('h1');
    const paragraph = document.createElement('p');

    editorRoot.className = 'ProseMirror';
    shell.appendChild(editorRoot);
    editorRoot.append(heading, paragraph);

    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(heading, { left: 106, top: 40, height: 32 });
    setRect(paragraph, { left: 106, top: 80, height: 24 });

    const labels = resolveBodyLineNumberLabels(shell, '# Title\nBody');

    expect(labels).toEqual([
      { lineNumber: 1, left: 38, top: 36 },
      { lineNumber: 2, left: 38, top: 72 },
    ]);
  });

  it('skips collapsed blocks without shifting following source line numbers', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const heading = document.createElement('h1');
    const collapsedParagraph = document.createElement('p');
    const visibleParagraph = document.createElement('p');

    editorRoot.className = 'ProseMirror';
    collapsedParagraph.className = 'heading-collapsed-content';
    shell.appendChild(editorRoot);
    editorRoot.append(heading, collapsedParagraph, visibleParagraph);

    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(heading, { left: 106, top: 40, height: 32 });
    collapsedParagraph.getBoundingClientRect = vi.fn(() => {
      throw new Error('Collapsed blocks should not be measured');
    });
    setRect(visibleParagraph, { left: 106, top: 80, height: 24 });

    const labels = resolveBodyLineNumberLabels(shell, '# Title\n\nHidden\n\nVisible');

    expect(labels).toEqual([
      { lineNumber: 1, left: 38, top: 36 },
      { lineNumber: 3, left: 38, top: 72 },
    ]);
    expect(collapsedParagraph.getBoundingClientRect).not.toHaveBeenCalled();
  });

  it('anchors media blocks to the visual block center instead of internal control text', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const mediaParagraph = document.createElement('p');
    const hiddenText = document.createElement('span');

    editorRoot.className = 'ProseMirror';
    mediaParagraph.className = 'editor-paragraph-has-image-block';
    hiddenText.textContent = 'Image alt text';
    mediaParagraph.appendChild(hiddenText);
    shell.appendChild(editorRoot);
    editorRoot.appendChild(mediaParagraph);

    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(mediaParagraph, { left: 106, top: 40, height: 120 });
    const rangeSpy = mockTextRects({
      'Image alt text': { top: 42, height: 12 },
    });

    try {
      const labels = resolveBodyLineNumberLabels(shell, '![Image alt text](image.png)');

      expect(labels).toEqual([
        { lineNumber: 1, left: 38, top: 80 },
      ]);
    } finally {
      rangeSpy.mockRestore();
    }
  });

  it('anchors paragraph-wrapped media to the inner visual media block', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const mediaParagraph = document.createElement('p');
    const imageBlock = document.createElement('div');

    editorRoot.className = 'ProseMirror';
    mediaParagraph.className = 'editor-paragraph-has-image-block';
    imageBlock.className = 'image-block-container';
    mediaParagraph.appendChild(imageBlock);
    shell.appendChild(editorRoot);
    editorRoot.appendChild(mediaParagraph);

    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(mediaParagraph, { left: 106, top: 40, height: 180 });
    setRect(imageBlock, { left: 126, top: 64, height: 96, width: 160 });

    const labels = resolveBodyLineNumberLabels(shell, '![Image alt text](image.png)');

    expect(labels).toEqual([
      { lineNumber: 1, left: 38, top: 92 },
    ]);
  });

  it('anchors code block labels to the first visible code line', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const codeBlock = document.createElement('div');
    const header = document.createElement('div');
    const codeBody = document.createElement('div');
    const gutter = document.createElement('div');
    const gutterLine = document.createElement('div');
    const codeLine = document.createElement('div');
    const restoreCreateRange = mockTextRects({
      TypeScript: { left: 120, top: 42, width: 80, height: 16 },
      '1': { left: 112, top: 92, width: 8, height: 16 },
      'const value = 1;': { left: 132, top: 72, width: 140, height: 16 },
    });

    editorRoot.className = 'ProseMirror';
    codeBlock.className = 'code-block-container';
    header.textContent = 'TypeScript';
    header.contentEditable = 'false';
    codeBody.className = 'code-block-editable';
    gutter.className = 'cm-gutters';
    gutterLine.className = 'cm-gutterElement';
    gutterLine.textContent = '1';
    gutter.appendChild(gutterLine);
    codeLine.className = 'cm-line';
    codeLine.textContent = 'const value = 1;';
    codeBody.append(gutter, codeLine);
    codeBlock.append(header, codeBody);
    shell.appendChild(editorRoot);
    editorRoot.appendChild(codeBlock);

    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(codeBlock, { left: 106, top: 40, height: 120 });

    try {
      const labels = resolveBodyLineNumberLabels(
        shell,
        ['```ts', 'const value = 1;', '```'].join('\n')
      );

      expect(labels).toEqual([{ lineNumber: 2, left: 38, top: 60 }]);
    } finally {
      restoreCreateRange.mockRestore();
    }
  });

  it('anchors multi-line code block labels to each rendered code line', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const codeBlock = document.createElement('div');
    const codeBody = document.createElement('div');
    const firstLine = document.createElement('div');
    const secondLine = document.createElement('div');
    const restoreCreateRange = mockTextRects({
      'const first = 1;': { left: 132, top: 72, width: 140, height: 16 },
      'const second = 2;': { left: 132, top: 96, width: 150, height: 16 },
    });

    editorRoot.className = 'ProseMirror';
    codeBlock.className = 'code-block-container';
    codeBody.className = 'cm-content';
    firstLine.className = 'cm-line';
    firstLine.textContent = 'const first = 1;';
    secondLine.className = 'cm-line';
    secondLine.textContent = 'const second = 2;';
    codeBody.append(firstLine, secondLine);
    codeBlock.appendChild(codeBody);
    shell.appendChild(editorRoot);
    editorRoot.appendChild(codeBlock);

    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(codeBlock, { left: 106, top: 40, height: 120 });
    setRect(firstLine, { left: 106, top: 68, height: 24 });
    setRect(secondLine, { left: 106, top: 92, height: 24 });

    try {
      const labels = resolveBodyLineNumberLabels(
        shell,
        ['```ts', 'const first = 1;', 'const second = 2;', '```'].join('\n')
      );

      expect(labels).toEqual([
        { lineNumber: 2, left: 38, top: 60 },
        { lineNumber: 3, left: 38, top: 84 },
      ]);
    } finally {
      restoreCreateRange.mockRestore();
    }
  });

  it('numbers internal blank line placeholders without shifting following labels', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const heading = document.createElement('h1');
    const blank = document.createElement('div');
    const paragraph = document.createElement('p');

    editorRoot.className = 'ProseMirror';
    heading.textContent = 'Title';
    blank.dataset.type = 'html-block';
    blank.dataset.value = '<!--vlaina-markdown-blank-line-->';
    paragraph.textContent = 'Body';
    shell.appendChild(editorRoot);
    editorRoot.append(heading, blank, paragraph);

    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(heading, { left: 106, top: 40, height: 32 });
    setRect(blank, { left: 106, top: 76, height: 16 });
    setRect(paragraph, { left: 106, top: 96, height: 24 });

    const labels = resolveBodyLineNumberLabels(
      shell,
      ['# Title', '<!--vlaina-markdown-blank-line-->', 'Body'].join('\n')
    );

    expect(labels).toEqual([
      { lineNumber: 1, left: 38, top: 36 },
      { lineNumber: 2, left: 38, top: 64 },
      { lineNumber: 3, left: 38, top: 88 },
    ]);
  });

  it('aligns labels to the first rendered text line instead of the block center', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const paragraph = document.createElement('p');
    const restoreCreateRange = mockTextRects({
      'First visual line': { left: 120, top: 44, width: 160, height: 16 },
    });

    editorRoot.className = 'ProseMirror';
    paragraph.textContent = 'First visual line';
    shell.appendChild(editorRoot);
    editorRoot.appendChild(paragraph);

    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(paragraph, { left: 106, top: 40, height: 96 });

    try {
      const labels = resolveBodyLineNumberLabels(shell, 'First visual line');

      expect(labels).toEqual([{ lineNumber: 1, left: 38, top: 32 }]);
    } finally {
      restoreCreateRange.mockRestore();
    }
  });

  it('aligns nested list labels to each item text line', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const list = document.createElement('ul');
    const parent = document.createElement('li');
    const nestedList = document.createElement('ul');
    const nested = document.createElement('li');
    const next = document.createElement('li');
    const restoreCreateRange = mockTextRects({
      'Parent item': { left: 120, top: 44, width: 120, height: 16 },
      'Nested item': { left: 140, top: 92, width: 120, height: 16 },
      'Next item': { left: 120, top: 128, width: 120, height: 16 },
    });

    editorRoot.className = 'ProseMirror';
    parent.append('Parent item');
    nested.append('Nested item');
    next.append('Next item');
    nestedList.appendChild(nested);
    parent.appendChild(nestedList);
    list.append(parent, next);
    shell.appendChild(editorRoot);
    editorRoot.appendChild(list);

    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(parent, { left: 106, top: 40, height: 80 });
    setRect(nested, { left: 126, top: 88, height: 24 });
    setRect(next, { left: 106, top: 124, height: 24 });

    try {
      const labels = resolveBodyLineNumberLabels(
        shell,
        ['- Parent item', '  - Nested item', '- Next item'].join('\n')
      );

      expect(labels).toEqual([
        { lineNumber: 1, left: 38, top: 32 },
        { lineNumber: 2, left: 38, top: 80 },
        { lineNumber: 3, left: 38, top: 116 },
      ]);
    } finally {
      restoreCreateRange.mockRestore();
    }
  });

  it('collects table targets as rendered rows', () => {
    const editorRoot = document.createElement('div');
    editorRoot.className = 'ProseMirror';
    editorRoot.innerHTML = [
      '<p id="before">Before</p>',
      '<div class="milkdown-table-block">',
      '<div class="table-wrapper"><table>',
      '<thead><tr id="header-row"><th>A</th><th>B</th></tr></thead>',
      '<tbody><tr id="first-row"><td>1</td><td>2</td></tr><tr id="second-row"><td>3</td><td>4</td></tr></tbody>',
      '</table></div>',
      '</div>',
      '<p id="after">After</p>',
    ].join('');

    expect(collectBodyLineNumberTargets(editorRoot).map((item) => item.id)).toEqual([
      'before',
      'header-row',
      'first-row',
      'second-row',
      'after',
    ]);
  });

  it('aligns table labels with the regular body line number column', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const tableBlock = document.createElement('div');
    const tableWrapper = document.createElement('div');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    const headerRow = document.createElement('tr');
    const headerCell = document.createElement('th');
    const firstRow = document.createElement('tr');
    const firstCell = document.createElement('td');
    const secondRow = document.createElement('tr');
    const secondCell = document.createElement('td');
    const restoreCreateRange = mockTextRects({
      A: { left: 96, top: 44, width: 16, height: 16 },
      '1': { left: 96, top: 80, width: 16, height: 16 },
      '3': { left: 96, top: 116, width: 16, height: 16 },
    });

    editorRoot.className = 'ProseMirror';
    tableBlock.className = 'milkdown-table-block';
    tableWrapper.className = 'table-wrapper';
    tableWrapper.setAttribute('contenteditable', 'false');
    headerCell.textContent = 'A';
    headerRow.appendChild(headerCell);
    thead.appendChild(headerRow);
    firstCell.textContent = '1';
    firstRow.appendChild(firstCell);
    secondCell.textContent = '3';
    secondRow.appendChild(secondCell);
    tbody.append(firstRow, secondRow);
    table.append(thead, tbody);
    tableWrapper.appendChild(table);
    tableBlock.appendChild(tableWrapper);
    shell.appendChild(editorRoot);
    editorRoot.appendChild(tableBlock);

    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(tableBlock, { left: 106, top: 40, height: 180 });
    setRect(tableWrapper, { left: 70, top: 40, height: 180, width: 320 });
    setRect(table, { left: 70, top: 40, height: 180, width: 320 });
    setRect(headerRow, { left: 70, top: 40, height: 36, width: 320 });
    setRect(headerCell, { left: 70, top: 40, height: 36, width: 160 });
    setRect(firstRow, { left: 70, top: 76, height: 36, width: 320 });
    setRect(firstCell, { left: 70, top: 76, height: 36, width: 160 });
    setRect(secondRow, { left: 70, top: 112, height: 36, width: 320 });
    setRect(secondCell, { left: 70, top: 112, height: 36, width: 160 });

    try {
      const labels = resolveBodyLineNumberLabels(
        shell,
        ['| A | B |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |'].join('\n')
      );

      expect(labels).toEqual([
        { lineNumber: 1, left: 38, top: 32 },
        { lineNumber: 3, left: 38, top: 68 },
        { lineNumber: 4, left: 38, top: 104 },
      ]);
    } finally {
      restoreCreateRange.mockRestore();
    }
  });

  it('skips per-text range measurement for large body line number sets', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const paragraphCount = MAX_BODY_LINE_NUMBER_PRECISE_TEXT_ANCHOR_TARGETS + 1;
    const markdownLines: string[] = [];
    const createRangeSpy = vi.spyOn(document, 'createRange').mockImplementation(() => {
      throw new Error('Large body line number sets should use block geometry only');
    });

    editorRoot.className = 'ProseMirror';
    shell.appendChild(editorRoot);
    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });

    for (let index = 0; index < paragraphCount; index += 1) {
      const paragraph = document.createElement('p');
      paragraph.textContent = `Line ${index}`;
      editorRoot.appendChild(paragraph);
      setRect(paragraph, { left: 106, top: 40 + index * 24, height: 24 });
      markdownLines.push(`- Line ${index}`);
    }

    try {
      const labels = resolveBodyLineNumberLabels(shell, markdownLines.join('\n'));

      expect(labels).toHaveLength(paragraphCount);
      expect(labels[0]).toEqual({ lineNumber: 1, left: 38, top: 32 });
      expect(labels.at(-1)).toEqual({
        lineNumber: paragraphCount,
        left: 38,
        top: 32 + (paragraphCount - 1) * 24,
      });
      expect(createRangeSpy).not.toHaveBeenCalled();
    } finally {
      createRangeSpy.mockRestore();
    }
  });

  it('skips selected descendant scans while block selection is inactive', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const paragraphCount = MAX_BODY_LINE_NUMBER_PRECISE_TEXT_ANCHOR_TARGETS + 1;
    const markdownLines: string[] = [];
    const createTreeWalker = document.createTreeWalker.bind(document);

    editorRoot.className = 'ProseMirror';
    shell.appendChild(editorRoot);
    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    const createTreeWalkerSpy = vi.spyOn(document, 'createTreeWalker').mockImplementation((
      root: Node,
      whatToShow?: number,
      filter?: NodeFilter | null,
    ) => {
      if (root === editorRoot && whatToShow === NodeFilter.SHOW_ELEMENT) {
        throw new Error('Inactive body line number refresh should not scan selected descendants');
      }
      return createTreeWalker(root, whatToShow, filter);
    });

    for (let index = 0; index < paragraphCount; index += 1) {
      const paragraph = document.createElement('p');
      paragraph.textContent = `Line ${index}`;
      editorRoot.appendChild(paragraph);
      setRect(paragraph, { left: 106, top: 40 + index * 24, height: 24 });
      markdownLines.push(`- Line ${index}`);
    }

    try {
      expect(resolveBodyLineNumberLabels(shell, markdownLines.join('\n'))).toHaveLength(paragraphCount);
      expect(createTreeWalkerSpy.mock.calls.some(([root, whatToShow]) =>
        root === editorRoot && whatToShow === NodeFilter.SHOW_ELEMENT
      )).toBe(false);
    } finally {
      createTreeWalkerSpy.mockRestore();
    }
  });

  it('keeps labels for selected blocks without shifting body line numbers', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const first = document.createElement('p');
    const selected = document.createElement('p');
    const third = document.createElement('p');

    editorRoot.className = 'ProseMirror editor-block-selection-active';
    selected.className = 'editor-block-selected';
    shell.appendChild(editorRoot);
    editorRoot.append(first, selected, third);

    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(first, { left: 106, top: 40, height: 24 });
    setRect(selected, { left: 106, top: 72, height: 24 });
    setRect(third, { left: 106, top: 104, height: 24 });

    const labels = resolveBodyLineNumberLabels(shell, '- First\n- Selected\n- Third');

    expect(labels).toEqual([
      { lineNumber: 1, left: 38, top: 32 },
      { lineNumber: 2, left: 38, top: 64, selected: true },
      { lineNumber: 3, left: 38, top: 96 },
    ]);
  });

  it('marks list item labels when a selected child paragraph carries the block selection class', () => {
    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const list = document.createElement('ul');
    const first = document.createElement('li');
    const second = document.createElement('li');
    const selectedParagraph = document.createElement('p');

    editorRoot.className = 'ProseMirror editor-block-selection-active';
    selectedParagraph.className = 'editor-block-selected';
    second.appendChild(selectedParagraph);
    list.append(first, second);
    shell.appendChild(editorRoot);
    editorRoot.appendChild(list);

    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(first, { left: 106, top: 40, height: 24 });
    setRect(second, { left: 106, top: 72, height: 24 });
    const firstQuerySelectorSpy = vi.spyOn(first, 'querySelector').mockImplementation(() => {
      throw new Error('Line number labels should not scan each target subtree');
    });
    const secondQuerySelectorSpy = vi.spyOn(second, 'querySelector').mockImplementation(() => {
      throw new Error('Line number labels should not scan each target subtree');
    });

    try {
      const labels = resolveBodyLineNumberLabels(shell, '- First\n- Second');

      expect(labels).toEqual([
        { lineNumber: 1, left: 38, top: 32 },
        { lineNumber: 2, left: 38, top: 64, selected: true },
      ]);
      expect(firstQuerySelectorSpy).not.toHaveBeenCalled();
      expect(secondQuerySelectorSpy).not.toHaveBeenCalled();
    } finally {
      firstQuerySelectorSpy.mockRestore();
      secondQuerySelectorSpy.mockRestore();
    }
  });

  it('renders selected body line numbers with the selected class', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });

    class TestResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}

      observe = vi.fn();
      disconnect = vi.fn();
    }

    class TestMutationObserver {
      constructor(_callback: MutationCallback) {}

      observe = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const paragraph = document.createElement('p');
    const shellRef = { current: shell } as RefObject<HTMLDivElement | null>;

    editorRoot.className = 'ProseMirror editor-block-selection-active';
    paragraph.className = 'editor-block-selected';
    paragraph.textContent = 'Body';
    shell.appendChild(editorRoot);
    editorRoot.appendChild(paragraph);
    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(paragraph, { left: 106, top: 40, height: 24 });

    try {
      const { container } = render(createElement(BodyLineNumberGutter, {
        markdown: 'Body',
        revision: 1,
        shellRef,
      }));

      act(() => {
        vi.advanceTimersByTime(0);
      });

      const lineNumber = container.querySelector<HTMLElement>('.body-line-number');
      expect(lineNumber?.textContent).toBe('1');
      expect(lineNumber?.classList.contains('body-line-number-selected')).toBe(true);
    } finally {
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('syncs selected line numbers while pointer drag defers layout refreshes', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });

    class TestResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    let mutationCallback: MutationCallback = () => {};
    class TestMutationObserver {
      constructor(callback: MutationCallback) {
        mutationCallback = callback;
      }

      observe = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const firstParagraph = document.createElement('p');
    const secondParagraph = document.createElement('p');
    const shellRef = { current: shell } as RefObject<HTMLDivElement | null>;

    editorRoot.className = 'ProseMirror';
    firstParagraph.textContent = 'First';
    secondParagraph.textContent = 'Second';
    shell.appendChild(editorRoot);
    editorRoot.append(firstParagraph, secondParagraph);
    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(firstParagraph, { left: 106, top: 40, height: 24 });
    setRect(secondParagraph, { left: 106, top: 72, height: 24 });
    const createTreeWalker = document.createTreeWalker.bind(document);
    let createTreeWalkerSpy: ReturnType<typeof vi.spyOn> | null = null;
    let childItemSpy: ReturnType<typeof vi.spyOn> | null = null;

    try {
      const { container, rerender } = render(createElement(BodyLineNumberGutter, {
        markdown: 'First\n\nSecond',
        revision: 1,
        shellRef,
      }));

      act(() => {
        vi.advanceTimersByTime(0);
      });
      childItemSpy = vi.spyOn(editorRoot.children, 'item');

      const lineNumbers = () => Array.from(container.querySelectorAll<HTMLElement>('.body-line-number'));
      expect(lineNumbers().map((lineNumber) =>
        lineNumber.classList.contains('body-line-number-selected')
      )).toEqual([false, false]);

      act(() => {
        setBlockSelectionPreviewElements(editorRoot, [firstParagraph]);
      });
      expect(lineNumbers().map((lineNumber) =>
        lineNumber.classList.contains('body-line-number-selected')
      )).toEqual([true, false]);
      rerender(createElement(BodyLineNumberGutter, {
        markdown: 'First\n\nSecond',
        revision: 1,
        shellRef,
      }));
      expect(lineNumbers().map((lineNumber) =>
        lineNumber.classList.contains('body-line-number-selected')
      )).toEqual([true, false]);
      act(() => {
        setBlockSelectionInteractionPending(editorRoot, true);
        mutationCallback([{
          attributeName: 'class',
          target: secondParagraph,
          type: 'attributes',
        } as unknown as MutationRecord], {} as MutationObserver);
        vi.advanceTimersByTime(0);
      });
      expect(lineNumbers().map((lineNumber) =>
        lineNumber.classList.contains('body-line-number-selected')
      )).toEqual([true, false]);
      act(() => {
        setBlockSelectionPreviewElements(editorRoot, null);
        setBlockSelectionInteractionPending(editorRoot, false);
      });
      expect(lineNumbers().map((lineNumber) =>
        lineNumber.classList.contains('body-line-number-selected')
      )).toEqual([false, false]);

      createTreeWalkerSpy = vi.spyOn(document, 'createTreeWalker').mockImplementation((
        root: Node,
        whatToShow?: number,
        filter?: NodeFilter | null,
      ) => {
        if (root === editorRoot && whatToShow === NodeFilter.SHOW_ELEMENT) {
          throw new Error('Incremental line number selection sync should not scan the whole editor');
        }
        return createTreeWalker(root, whatToShow, filter);
      });

      firstParagraph.getBoundingClientRect = () => {
        throw new Error('Deferred line number selection sync should not measure block layout');
      };
      secondParagraph.getBoundingClientRect = () => {
        throw new Error('Deferred line number selection sync should not measure block layout');
      };

      window.dispatchEvent(new Event('pointerdown'));
      editorRoot.classList.add('editor-block-selection-pending');
      firstParagraph.classList.add('editor-block-selected');
      mutationCallback([{
        attributeName: 'class',
        target: firstParagraph,
        type: 'attributes',
      } as unknown as MutationRecord], {} as MutationObserver);
      secondParagraph.classList.add('editor-block-selected');

      act(() => {
        mutationCallback([{
          attributeName: 'class',
          target: secondParagraph,
          type: 'attributes',
        } as unknown as MutationRecord], {} as MutationObserver);
        vi.advanceTimersByTime(0);
      });

      expect(lineNumbers().map((lineNumber) =>
        lineNumber.classList.contains('body-line-number-selected')
      )).toEqual([true, true]);
      expect(lineNumbers().map((lineNumber) => lineNumber.style.top)).toEqual(['32px', '64px']);

      firstParagraph.classList.remove('editor-block-selected');
      act(() => {
        mutationCallback([{
          attributeName: 'class',
          target: firstParagraph,
          type: 'attributes',
        } as unknown as MutationRecord], {} as MutationObserver);
        vi.advanceTimersByTime(0);
      });

      expect(lineNumbers().map((lineNumber) =>
        lineNumber.classList.contains('body-line-number-selected')
      )).toEqual([false, true]);
      expect(childItemSpy).not.toHaveBeenCalled();
    } finally {
      childItemSpy?.mockRestore();
      createTreeWalkerSpy?.mockRestore();
      act(() => {
        setBlockSelectionPreviewElements(editorRoot, null);
        setBlockSelectionInteractionPending(editorRoot, false);
        window.dispatchEvent(new Event('pointerup'));
      });
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('defers expensive label refreshes while block selection is pending', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });

    let resizeCallback: ResizeObserverCallback = () => {};
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe = vi.fn();
      disconnect = vi.fn();
    }

    class TestMutationObserver {
      constructor(_callback: MutationCallback) {}

      observe = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const paragraph = document.createElement('p');
    const shellRef = { current: shell } as RefObject<HTMLDivElement | null>;

    editorRoot.className = 'ProseMirror editor-block-selection-pending';
    paragraph.textContent = 'Body';
    shell.appendChild(editorRoot);
    editorRoot.appendChild(paragraph);
    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(paragraph, { left: 106, top: 40, height: 24 });

    try {
      const { container } = render(createElement(BodyLineNumberGutter, {
        markdown: 'Body',
        revision: 1,
        shellRef,
      }));

      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(container.querySelectorAll('.body-line-number')).toHaveLength(0);

      act(() => {
        resizeCallback([], {} as ResizeObserver);
        vi.advanceTimersByTime(0);
      });
      expect(container.querySelectorAll('.body-line-number')).toHaveLength(0);

      editorRoot.classList.remove('editor-block-selection-pending');
      act(() => {
        vi.advanceTimersByTime(80);
        vi.runOnlyPendingTimers();
      });

      expect(Array.from(container.querySelectorAll('.body-line-number')).map((node) => node.textContent)).toEqual(['1']);
    } finally {
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('defers expensive label refreshes while block dragging is active', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });

    let resizeCallback: ResizeObserverCallback = () => {};
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe = vi.fn();
      disconnect = vi.fn();
    }

    class TestMutationObserver {
      constructor(_callback: MutationCallback) {}

      observe = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const paragraph = document.createElement('p');
    const shellRef = { current: shell } as RefObject<HTMLDivElement | null>;

    document.body.classList.add('editor-block-drag-active');
    editorRoot.className = 'ProseMirror';
    paragraph.textContent = 'Body';
    shell.appendChild(editorRoot);
    editorRoot.appendChild(paragraph);
    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(paragraph, { left: 106, top: 40, height: 24 });

    try {
      const { container } = render(createElement(BodyLineNumberGutter, {
        markdown: 'Body',
        revision: 1,
        shellRef,
      }));

      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(container.querySelectorAll('.body-line-number')).toHaveLength(0);

      act(() => {
        resizeCallback([], {} as ResizeObserver);
        vi.advanceTimersByTime(0);
      });
      expect(container.querySelectorAll('.body-line-number')).toHaveLength(0);

      document.body.classList.remove('editor-block-drag-active');
      act(() => {
        vi.advanceTimersByTime(80);
        vi.runOnlyPendingTimers();
      });

      expect(Array.from(container.querySelectorAll('.body-line-number')).map((node) => node.textContent)).toEqual(['1']);
    } finally {
      document.body.classList.remove('editor-block-drag-active');
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('defers expensive label refreshes while pointer interaction is active', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });

    class TestResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}

      observe = vi.fn();
      disconnect = vi.fn();
    }

    class TestMutationObserver {
      constructor(_callback: MutationCallback) {}

      observe = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const paragraph = document.createElement('p');
    const shellRef = { current: shell } as RefObject<HTMLDivElement | null>;

    editorRoot.className = 'ProseMirror';
    paragraph.textContent = 'Body';
    shell.appendChild(editorRoot);
    editorRoot.appendChild(paragraph);
    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(paragraph, { left: 106, top: 40, height: 24 });

    try {
      const { container } = render(createElement(BodyLineNumberGutter, {
        markdown: 'Body',
        revision: 1,
        shellRef,
      }));

      window.dispatchEvent(new Event('pointerdown'));
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(container.querySelectorAll('.body-line-number')).toHaveLength(0);

      window.dispatchEvent(new Event('pointerup'));
      act(() => {
        vi.advanceTimersByTime(80);
        vi.runOnlyPendingTimers();
      });

      expect(Array.from(container.querySelectorAll('.body-line-number')).map((node) => node.textContent)).toEqual(['1']);
    } finally {
      window.dispatchEvent(new Event('pointerup'));
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('recovers deferred label refreshes when pointer end events are lost', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });

    class TestResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}

      observe = vi.fn();
      disconnect = vi.fn();
    }

    class TestMutationObserver {
      constructor(_callback: MutationCallback) {}

      observe = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    const shell = document.createElement('div');
    const editorRoot = document.createElement('div');
    const paragraph = document.createElement('p');
    const shellRef = { current: shell } as RefObject<HTMLDivElement | null>;

    editorRoot.className = 'ProseMirror';
    paragraph.textContent = 'Body';
    shell.appendChild(editorRoot);
    editorRoot.appendChild(paragraph);
    setRect(shell, { left: 10, top: 20 });
    setRect(editorRoot, { left: 106, top: 20 });
    setRect(paragraph, { left: 106, top: 40, height: 24 });

    try {
      const { container } = render(createElement(BodyLineNumberGutter, {
        markdown: 'Body',
        revision: 1,
        shellRef,
      }));

      window.dispatchEvent(new Event('pointerdown'));
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(container.querySelectorAll('.body-line-number')).toHaveLength(0);

      act(() => {
        vi.advanceTimersByTime(10_000);
        vi.runOnlyPendingTimers();
      });

      expect(Array.from(container.querySelectorAll('.body-line-number')).map((node) => node.textContent)).toEqual(['1']);
    } finally {
      window.dispatchEvent(new Event('pointerup'));
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
