import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MERMAID_FORMAT_FIXTURES } from '@/test/fixtures/mermaidFormatFixtures';
import { useUIStore } from '@/stores/uiSlice';
import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';

vi.mock('./mermaidRenderer', () => ({
  generateMermaidId: () => 'mermaid-readonly-test',
  MAX_MERMAID_CODE_CHARS: 20_000,
  mermaidRenderErrorMarkup: () => '<div class="mermaid-error">Mermaid Error</div>',
  renderMermaid: vi.fn(),
}));

import {
  clearReadOnlyMermaidRenderCaches,
  getActiveReadOnlyMermaidRenderCount,
  getPendingReadOnlyMermaidRenderCount,
  MAX_CONCURRENT_READONLY_MERMAID_RENDERS,
  ReadOnlyMermaidBlock,
  resolveReadOnlyMermaidMarkup,
} from './ReadOnlyMermaidBlock';
import { MAX_MERMAID_CODE_CHARS, renderMermaid } from './mermaidRenderer';

describe('ReadOnlyMermaidBlock', () => {
  beforeEach(() => {
    useUIStore.setState({ languagePreference: 'en' });
    clearReadOnlyMermaidRenderCaches();
    vi.mocked(renderMermaid).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-layout-panel-dragging');
    window.dispatchEvent(new MouseEvent('mouseup'));
    document.body.replaceChildren();
  });

  it('renders empty Mermaid blocks without visible placeholder copy', () => {
    const { container } = render(<ReadOnlyMermaidBlock code={'   \n\t'} />);
    const emptyElement = container.querySelector('.mermaid-empty');

    expect(emptyElement?.textContent).toBe('\u200b');
    expect(emptyElement?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).not.toContain('Empty diagram');
    expect(renderMermaid).not.toHaveBeenCalled();
  });

  it('does not expose diagram source in DOM attributes while loading or rendered', async () => {
    let resolveRender: (markup: string) => void = () => undefined;
    vi.mocked(renderMermaid).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRender = resolve;
      })
    );

    const code = 'sequenceDiagram\nAlice->Bob: secret token';
    const { container } = render(<ReadOnlyMermaidBlock code={code} />);

    expect(container.querySelector('.mermaid-placeholder')).not.toBeNull();
    expect(container.innerHTML).not.toContain('data-code');
    expect(container.innerHTML).not.toContain('secret token');

    await waitFor(() => {
      expect(renderMermaid).toHaveBeenCalledTimes(1);
    });
    resolveRender('<svg><text>rendered</text></svg>');

    await waitFor(() => {
      expect(screen.getByText('rendered')).toBeInTheDocument();
    });
    expect(container.innerHTML).not.toContain('data-code');
    expect(container.innerHTML).not.toContain('secret token');
  });

  it('does not render a diagram passed during active scrolling until it remains near the viewport', async () => {
    let observerCallback: IntersectionObserverCallback = () => undefined;
    class TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }

      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = '0px';
      thresholds = [];
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    const scrollRoot = document.createElement('div');
    scrollRoot.dataset.overlayScrollbarInteracting = 'true';
    document.body.appendChild(scrollRoot);
    const code = 'sequenceDiagram\nAlice->Bob: readonly lazy';
    vi.mocked(renderMermaid).mockResolvedValue('<svg><text>rendered</text></svg>');

    const { container } = render(<ReadOnlyMermaidBlock code={code} />);
    const block = container.querySelector('.mermaid-block')!;
    expect(renderMermaid).not.toHaveBeenCalled();

    act(() => {
      observerCallback([{ target: block, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      observerCallback([{ target: block, isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    delete scrollRoot.dataset.overlayScrollbarInteracting;
    window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(renderMermaid).not.toHaveBeenCalled();

    act(() => {
      observerCallback([{ target: block, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    await waitFor(() => {
      expect(renderMermaid).toHaveBeenCalledWith(code, expect.any(String), 'interactive');
      expect(screen.getByText('rendered')).toBeInTheDocument();
    });
  });

  it('renders a near-viewport diagram before active scrolling settles', async () => {
    let observerCallback: IntersectionObserverCallback = () => undefined;
    class TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }

      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = '0px';
      thresholds = [];
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    const scrollRoot = document.createElement('div');
    scrollRoot.dataset.overlayScrollbarInteracting = 'true';
    document.body.appendChild(scrollRoot);
    const code = 'sequenceDiagram\nAlice->Bob: readonly during scroll';
    vi.mocked(renderMermaid).mockResolvedValue('<svg><text>rendered during scroll</text></svg>');

    const { container } = render(<ReadOnlyMermaidBlock code={code} />);
    const block = container.querySelector('.mermaid-block')!;
    act(() => {
      observerCallback([{ target: block, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    await waitFor(() => {
      expect(screen.getByText('rendered during scroll')).toBeInTheDocument();
    });
    expect(scrollRoot.dataset.overlayScrollbarInteracting).toBe('true');
    delete scrollRoot.dataset.overlayScrollbarInteracting;
    window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT));
  });

  it('defers rendered markup commits while a layout panel is dragging', async () => {
    let resolveRender: (markup: string) => void = () => undefined;
    vi.mocked(renderMermaid).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRender = resolve;
      })
    );
    render(<ReadOnlyMermaidBlock code="sequenceDiagram\nAlice->Bob: deferred commit" />);
    await waitFor(() => {
      expect(renderMermaid).toHaveBeenCalledTimes(1);
    });

    document.documentElement.setAttribute('data-layout-panel-dragging', 'true');
    act(() => resolveRender('<svg><text>after drag</text></svg>'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('after drag')).not.toBeInTheDocument();

    document.documentElement.removeAttribute('data-layout-panel-dragging');
    window.dispatchEvent(new MouseEvent('mouseup'));
    await waitFor(() => {
      expect(screen.getByText('after drag')).toBeInTheDocument();
    });
  });

  it('refreshes read-only Mermaid placeholder copy when language changes', async () => {
    const resolveRenders: Array<(markup: string) => void> = [];
    vi.mocked(renderMermaid).mockImplementation(
      () => new Promise((resolve) => {
        resolveRenders.push(resolve);
      })
    );

    render(<ReadOnlyMermaidBlock code="sequenceDiagram\nAlice->Bob: hi" />);

    expect(screen.getByText('Enter Mermaid diagram...')).toBeInTheDocument();
    await waitFor(() => {
      expect(resolveRenders).toHaveLength(1);
    });

    act(() => {
      useUIStore.setState({ languagePreference: 'zh-CN' });
    });

    expect(screen.getByText('输入图表内容...')).toBeInTheDocument();
    await waitFor(() => {
      expect(resolveRenders).toHaveLength(2);
    });
    resolveRenders.forEach((resolve) => resolve('<svg><text>rendered</text></svg>'));
    await waitFor(() => {
      expect(getActiveReadOnlyMermaidRenderCount()).toBe(0);
    });
  });

  it('marks Gantt diagrams for readable chart sizing while loading and rendered', async () => {
    vi.mocked(renderMermaid).mockResolvedValueOnce('<svg><text>rendered</text></svg>');
    const code = ['%% Schedule', 'gantt', 'dateFormat YYYY-MM-DD'].join('\n');
    const { container } = render(<ReadOnlyMermaidBlock code={code} />);

    expect(container.querySelector('.mermaid-block')?.getAttribute('data-mermaid-diagram')).toBe('gantt');

    await waitFor(() => {
      expect(screen.getByText('rendered')).toBeInTheDocument();
    });
    expect(container.querySelector('.mermaid-block')?.getAttribute('data-mermaid-diagram')).toBe('gantt');
    expect(container.innerHTML).not.toContain('dateFormat');
  });

  it('coalesces duplicate read-only Mermaid renders', async () => {
    let resolveRender: (markup: string) => void = () => undefined;
    vi.mocked(renderMermaid).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRender = resolve;
      })
    );

    const first = resolveReadOnlyMermaidMarkup('sequenceDiagram\nAlice->Bob: hi');
    const second = resolveReadOnlyMermaidMarkup('sequenceDiagram\nAlice->Bob: hi');

    expect(getPendingReadOnlyMermaidRenderCount()).toBe(1);
    await waitFor(() => {
      expect(renderMermaid).toHaveBeenCalledTimes(1);
    });

    resolveRender('<svg><text>rendered</text></svg>');

    await expect(first).resolves.toContain('rendered');
    await expect(second).resolves.toContain('rendered');
    expect(getPendingReadOnlyMermaidRenderCount()).toBe(0);
  });

  it('does not reuse cached read-only Mermaid markup across languages', async () => {
    vi.mocked(renderMermaid).mockResolvedValue('<svg><text>rendered</text></svg>');

    await resolveReadOnlyMermaidMarkup('sequenceDiagram\nAlice->Bob: hi', 'en');
    await resolveReadOnlyMermaidMarkup('sequenceDiagram\nAlice->Bob: hi', 'zh-CN');

    expect(renderMermaid).toHaveBeenCalledTimes(2);
  });

  it('passes the shared Mermaid format fixtures through the read-only renderer', async () => {
    vi.mocked(renderMermaid).mockImplementation(async (code) =>
      `<svg data-readonly-rendered="${code.split(/\r?\n/, 1)[0]}"></svg>`
    );

    for (const fixture of MERMAID_FORMAT_FIXTURES) {
      const code = fixture.source.join('\n');
      const markup = await resolveReadOnlyMermaidMarkup(code);

      expect(renderMermaid, `${fixture.label} should reach the read-only renderer`).toHaveBeenCalledWith(
        code,
        expect.any(String),
        'background',
      );
      expect(markup, `${fixture.label} should return SVG markup`).toContain('data-readonly-rendered');
      expect(markup, `${fixture.label} should not render an error`).not.toContain('mermaid-error');
    }
  });

  it('bounds active work while eventually rendering more than 80 diagrams', async () => {
    const renderResolves: Array<(markup: string) => void> = [];
    let maxActiveRenderCount = 0;
    vi.mocked(renderMermaid).mockImplementation(
      () => new Promise((resolve) => {
        maxActiveRenderCount = Math.max(
          maxActiveRenderCount,
          getActiveReadOnlyMermaidRenderCount(),
        );
        renderResolves.push(resolve);
      })
    );

    const diagramCount = 85;
    const renders = Array.from({ length: diagramCount }, (_value, index) =>
      resolveReadOnlyMermaidMarkup(`sequenceDiagram\nAlice->Bob: ${index}`)
    );
    renders.forEach((renderPromise) => {
      renderPromise.catch(() => undefined);
    });

    expect(getPendingReadOnlyMermaidRenderCount()).toBe(diagramCount);

    await waitFor(() => {
      expect(renderResolves).toHaveLength(MAX_CONCURRENT_READONLY_MERMAID_RENDERS);
    });
    for (let index = 0; index < renders.length; index += 1) {
      await waitFor(() => {
        expect(renderResolves.length).toBeGreaterThanOrEqual(index + 1);
      });
      renderResolves[index]?.(`<svg><text>rendered ${index}</text></svg>`);
    }
    await Promise.all(renders);
    expect(maxActiveRenderCount).toBe(MAX_CONCURRENT_READONLY_MERMAID_RENDERS);
    expect(getActiveReadOnlyMermaidRenderCount()).toBe(0);
    expect(getPendingReadOnlyMermaidRenderCount()).toBe(0);
  });

  it('does not start another read-only Mermaid render during active scrolling', async () => {
    vi.useFakeTimers();
    const scrollRoot = document.createElement('div');
    scrollRoot.dataset.overlayScrollbarInteracting = 'true';
    document.body.appendChild(scrollRoot);
    vi.mocked(renderMermaid).mockResolvedValue('<svg><text>rendered</text></svg>');

    const markupPromise = resolveReadOnlyMermaidMarkup(
      'sequenceDiagram\nAlice->Bob: wait for scroll',
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(renderMermaid).not.toHaveBeenCalled();

    delete scrollRoot.dataset.overlayScrollbarInteracting;
    window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT));
    await vi.runAllTimersAsync();

    await expect(markupPromise).resolves.toContain('rendered');
    expect(renderMermaid).toHaveBeenCalledTimes(1);
  });

  it('does not start read-only Mermaid work during pointer text selection', async () => {
    vi.useFakeTimers();
    const editor = document.createElement('div');
    editor.dataset.editorPointerSelecting = 'true';
    document.body.appendChild(editor);
    vi.mocked(renderMermaid).mockResolvedValue('<svg><text>rendered</text></svg>');

    const markupPromise = resolveReadOnlyMermaidMarkup(
      'sequenceDiagram\nAlice->Bob: wait for selection',
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(renderMermaid).not.toHaveBeenCalled();

    delete editor.dataset.editorPointerSelecting;
    window.dispatchEvent(new MouseEvent('mouseup'));
    await vi.runAllTimersAsync();

    await expect(markupPromise).resolves.toContain('rendered');
    expect(renderMermaid).toHaveBeenCalledTimes(1);
  });

  it('cancels queued read-only Mermaid work when its document unmounts', async () => {
    const startedCodes: string[] = [];
    const renderResolves: Array<(markup: string) => void> = [];
    vi.mocked(renderMermaid).mockImplementation(
      (code) => new Promise((resolve) => {
        startedCodes.push(code);
        renderResolves.push(resolve);
      }),
    );
    const oldDiagramCount = MAX_CONCURRENT_READONLY_MERMAID_RENDERS + 5;
    const oldDocument = render(<>
      {Array.from({ length: oldDiagramCount }, (_value, index) => (
        <ReadOnlyMermaidBlock
          code={`sequenceDiagram\nAlice->Bob: old ${index}`}
          key={index}
        />
      ))}
    </>);

    await waitFor(() => {
      expect(startedCodes).toHaveLength(MAX_CONCURRENT_READONLY_MERMAID_RENDERS);
    });
    oldDocument.unmount();
    const currentDocument = render(
      <ReadOnlyMermaidBlock code="sequenceDiagram\nAlice->Bob: current" />,
    );
    renderResolves.splice(0).forEach((resolve) => resolve('<svg><text>old</text></svg>'));

    await waitFor(() => {
      expect(startedCodes.at(-1)).toContain('current');
    });
    expect(startedCodes).toHaveLength(MAX_CONCURRENT_READONLY_MERMAID_RENDERS + 1);
    renderResolves.splice(0).forEach((resolve) => resolve('<svg><text>current</text></svg>'));
    await waitFor(() => {
      expect(getPendingReadOnlyMermaidRenderCount()).toBe(0);
    });
    currentDocument.unmount();
  });

  it('converts read-only Mermaid render failures to sanitized error markup', async () => {
    vi.mocked(renderMermaid).mockRejectedValueOnce(new Error('render failed'));

    await expect(resolveReadOnlyMermaidMarkup('sequenceDiagram\nAlice->Bob: hi')).resolves.toContain(
      'mermaid-error'
    );
    expect(getPendingReadOnlyMermaidRenderCount()).toBe(0);
  });

  it('rejects oversized Mermaid code before using render caches', async () => {
    const markup = await resolveReadOnlyMermaidMarkup('x'.repeat(MAX_MERMAID_CODE_CHARS + 1));

    expect(markup).toContain('mermaid-error');
    expect(renderMermaid).not.toHaveBeenCalled();
    expect(getPendingReadOnlyMermaidRenderCount()).toBe(0);
  });

  it.each([
    'flowchart TD\nA@{ img: "https://tracker.example/pixel.png" }',
    String.raw`flowchart TD\nA@{ img: "\u0068ttps://tracker.example/pixel.png" }`,
    String.raw`flowchart TD\nA@{ img: "h\74 tps://tracker.example/pixel.png" }`,
    'flowchart TD\nA@{ img: "https&#58;//tracker.example/pixel.png" }',
    'flowchart TD\nA@{ img: "//tracker.example/pixel.png" }',
    String.raw`flowchart TD\nstyle A background-image:u\72 l(images/pixel.png)`,
    String.raw`%%{init: {"themeCSS": "@im\70 ort 'theme.css'"}}%%\nflowchart TD\nA-->B`,
  ])('rejects remote Mermaid resources before invoking the renderer', async (code) => {
    const markup = await resolveReadOnlyMermaidMarkup(code);

    expect(markup).toContain('mermaid-error');
    expect(renderMermaid).not.toHaveBeenCalled();
    expect(getPendingReadOnlyMermaidRenderCount()).toBe(0);
  });

  it('allows fragment-only CSS references to reach the renderer', async () => {
    const code = 'flowchart TD\nstyle A filter:url(#local-filter)';
    vi.mocked(renderMermaid).mockResolvedValueOnce('<svg><text>rendered</text></svg>');

    const markup = await resolveReadOnlyMermaidMarkup(code);

    expect(renderMermaid).toHaveBeenCalledWith(code, expect.any(String), 'background');
    expect(markup).toContain('rendered');
  });
});
