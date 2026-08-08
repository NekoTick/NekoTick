import { describe, expect, it, vi } from 'vitest';
import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { MermaidNodeView, shouldRefreshMermaidElementCode } from './MermaidNodeView';
import {
  clearMermaidRenderCaches,
  createMermaidElement,
  getMermaidElementCode,
  getPendingMermaidRenderCount,
} from './mermaidDom';

describe('MermaidNodeView', () => {
  it('defers the first render while the focused editor is still receiving input', () => {
    vi.useFakeTimers();
    const nodeView = new MermaidNodeView(
      {
        attrs: { code: 'graph TD\nA-->B' },
        type: { name: 'mermaid' },
      } as unknown as Node,
      {
        root: document,
        hasFocus: () => true,
      } as unknown as EditorView,
      () => 0,
    );

    expect(nodeView.dom.querySelector('.mermaid-placeholder')).not.toBeNull();
    vi.advanceTimersByTime(179);
    expect(nodeView.dom.querySelector('.mermaid-placeholder')).not.toBeNull();

    nodeView.destroy();
    vi.useRealTimers();
  });

  it('compares node updates against normalized Mermaid code', () => {
    const element = createMermaidElement('sequenceDiagram\nAlice->Bob: Hello');

    expect(
      shouldRefreshMermaidElementCode(element, 'sequence\nAlice->Bob: Hello')
    ).toBe(false);
  });

  it('refreshes when the normalized node code changes', () => {
    const element = createMermaidElement('sequenceDiagram\nAlice->Bob: Hello');

    expect(
      shouldRefreshMermaidElementCode(element, 'sequence\nAlice->Bob: Hi')
    ).toBe(true);
  });

  it('supports legacy data-code elements without writing new source code attributes', () => {
    const element = document.createElement('div');
    element.dataset.code = 'sequenceDiagram\nAlice->Bob: Hello';

    expect(
      shouldRefreshMermaidElementCode(element, 'sequence\nAlice->Bob: Hello')
    ).toBe(false);
  });

  it('adds Typora diagram aliases to Mermaid blocks', () => {
    const element = createMermaidElement('graph TD\nA-->B');

    expect(element.classList.contains('mermaid-block')).toBe(true);
    expect(element.classList.contains('theme-mermaid')).toBe(true);
    expect(element.classList.contains('md-fences')).toBe(true);
    expect(element.classList.contains('md-diagram')).toBe(true);
    expect(element.classList.contains('md-fences-advanced')).toBe(true);
    expect(element.classList.contains('md-diagram-panel')).toBe(true);
    expect(element.classList.contains('md-diagram-panel-preview')).toBe(true);
  });

  it('mirrors node selection to ProseMirror and Typora focus classes', () => {
    const nodeView = new MermaidNodeView(
      {
        attrs: { code: 'graph TD\nA-->B' },
        type: { name: 'mermaid' },
      } as unknown as Node,
      { root: document } as unknown as EditorView,
      () => 0
    );

    nodeView.selectNode();
    expect(nodeView.dom.classList.contains('ProseMirror-selectednode')).toBe(true);
    expect(nodeView.dom.classList.contains('md-focus')).toBe(true);

    nodeView.deselectNode();
    expect(nodeView.dom.classList.contains('ProseMirror-selectednode')).toBe(false);
    expect(nodeView.dom.classList.contains('md-focus')).toBe(false);

    nodeView.destroy();
  });

  it('does not preload offscreen diagrams in a lazy-layout editor', () => {
    class TestIntersectionObserver {
      constructor(_callback: IntersectionObserverCallback) {}

      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = '0px';
      scrollMargin = '0px';
      thresholds = [];
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    clearMermaidRenderCaches();
    const editor = document.createElement('div');
    editor.dataset.noteLazyBlockVisibility = 'true';
    const proseMirror = document.createElement('div');
    editor.append(proseMirror);
    document.body.append(editor);

    try {
      const pendingBefore = getPendingMermaidRenderCount();
      const nodeView = new MermaidNodeView(
        {
          attrs: { code: 'graph TD\nA-->B' },
          type: { name: 'mermaid' },
        } as unknown as Node,
        { dom: proseMirror, root: document } as unknown as EditorView,
        () => 0,
      );

      expect(nodeView.dom.dataset.mermaidLazy).toBe('true');
      expect(getPendingMermaidRenderCount()).toBe(pendingBefore);
      nodeView.destroy();
    } finally {
      clearMermaidRenderCaches();
      vi.unstubAllGlobals();
    }
  });

  it('treats non-string node code as empty without coercion', () => {
    const code = {
      toString() {
        throw new Error('mermaid code coercion');
      },
    };
    const nodeView = new MermaidNodeView(
      {
        attrs: { code },
        type: { name: 'mermaid' },
      } as unknown as Node,
      { root: document } as unknown as EditorView,
      () => 0
    );

    expect(getMermaidElementCode(nodeView.dom)).toBe('');
    nodeView.destroy();
  });
});
