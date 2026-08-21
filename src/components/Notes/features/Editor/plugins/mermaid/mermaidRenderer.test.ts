import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';

const zenumlDiagram = { id: 'zenuml' };
const registerExternalDiagrams = vi.fn(async () => undefined);
const initialize = vi.fn();
const render = vi.fn(async (_id: string, code: string, container?: HTMLElement) => {
  container?.appendChild(document.createElement('div'));
  console.log('core rendering', code);
  return { svg: '<svg data-testid="diagram"></svg>' };
});

vi.mock('@mermaid-js/mermaid-zenuml', () => ({
  default: zenumlDiagram,
}));

vi.mock('mermaid', () => ({
  default: {
    initialize,
    registerExternalDiagrams,
    render,
  },
}));

describe('mermaidRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('registers the ZenUML external diagram before rendering', async () => {
    const { renderMermaid } = await import('./mermaidRenderer');

    const svg = await renderMermaid('zenuml\nAlice->Bob: Hi', 'diagram-1');

    expect(svg).toBe('<svg data-testid="diagram"></svg>');
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({
      flowchart: {
        htmlLabels: false,
      },
      quadrantChart: {
        quadrantTextTopPadding: 18,
      },
      theme: 'base',
      themeVariables: expect.objectContaining({
        background: '#FFFFFF',
        primaryTextColor: '#27272A',
      }),
    }));
    expect(registerExternalDiagrams).toHaveBeenCalledWith([zenumlDiagram]);
    expect(render).toHaveBeenCalledWith('diagram-1', 'zenuml\nAlice->Bob: Hi', expect.any(HTMLElement));
    expect(registerExternalDiagrams.mock.invocationCallOrder[0]).toBeLessThan(
      render.mock.invocationCallOrder[0]
    );
  });

  it('registers ZenUML when comments or init directives precede the diagram directive', async () => {
    const { renderMermaid } = await import('./mermaidRenderer');
    const code = [
      '%% Sequence example',
      '%%{init: {"theme": "base"}}%%',
      'zenuml',
      '  Alice->Bob: Hi',
    ].join('\n');

    const svg = await renderMermaid(code, 'diagram-1');

    expect(svg).toBe('<svg data-testid="diagram"></svg>');
    expect(registerExternalDiagrams).toHaveBeenCalledWith([zenumlDiagram]);
    expect(render).toHaveBeenCalledWith('diagram-1', code, expect.any(HTMLElement));
  });

  it('uses the built-in beautiful Mermaid default render theme', async () => {
    const { renderMermaid } = await import('./mermaidRenderer');

    await renderMermaid('graph TD\nA-->B', 'diagram-1');

    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({
      theme: 'base',
      themeVariables: expect.objectContaining({
        background: '#FFFFFF',
        primaryTextColor: '#27272A',
      }),
    }));
    expect(registerExternalDiagrams).not.toHaveBeenCalled();
  });

  it('does not load the ZenUML external diagram for normal Mermaid diagrams', async () => {
    const { renderMermaid } = await import('./mermaidRenderer');

    await renderMermaid('sequenceDiagram\nAlice->Bob: Hi', 'diagram-1');

    expect(registerExternalDiagrams).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith('diagram-1', 'sequenceDiagram\nAlice->Bob: Hi', expect.any(HTMLElement));
  });

  it('serializes cold-start renders and waits for active interaction before resuming', async () => {
    let resolveFirstRender = (_value: { svg: string }) => {};
    render
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstRender = resolve;
      }))
      .mockResolvedValueOnce({ svg: '<svg data-testid="second"></svg>' });
    const interactionRoot = document.createElement('div');
    const { renderMermaid } = await import('./mermaidRenderer');

    const first = renderMermaid('flowchart TD\nA --> B', 'diagram-first');
    const second = renderMermaid('flowchart TD\nB --> C', 'diagram-second');
    await vi.waitFor(() => {
      expect(render).toHaveBeenCalledTimes(1);
    });
    interactionRoot.dataset.overlayScrollbarInteracting = 'true';
    document.body.appendChild(interactionRoot);
    resolveFirstRender({ svg: '<svg data-testid="first"></svg>' });
    await expect(first).resolves.toContain('data-testid="first"');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(render).toHaveBeenCalledTimes(1);

    delete interactionRoot.dataset.overlayScrollbarInteracting;
    window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT));
    await expect(second).resolves.toContain('data-testid="second"');
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('resumes an interactive cold-start render while scrolling remains active', async () => {
    let resolveFirstRender = (_value: { svg: string }) => {};
    render
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstRender = resolve;
      }))
      .mockResolvedValueOnce({ svg: '<svg data-testid="second"></svg>' });
    const interactionRoot = document.createElement('div');
    const { renderMermaid } = await import('./mermaidRenderer');

    const first = renderMermaid('flowchart TD\nA --> B', 'diagram-first');
    const second = renderMermaid(
      'flowchart TD\nB --> C',
      'diagram-second',
      'interactive',
    );
    await vi.waitFor(() => {
      expect(render).toHaveBeenCalledTimes(1);
    });
    interactionRoot.dataset.overlayScrollbarInteracting = 'true';
    document.body.appendChild(interactionRoot);
    resolveFirstRender({ svg: '<svg data-testid="first"></svg>' });

    await expect(first).resolves.toContain('data-testid="first"');
    await expect(second).resolves.toContain('data-testid="second"');
    expect(render).toHaveBeenCalledTimes(2);
    expect(interactionRoot.dataset.overlayScrollbarInteracting).toBe('true');
  });

  it('renders in a measurable offscreen host for diagrams that use SVG layout metrics', async () => {
    const { renderMermaid } = await import('./mermaidRenderer');

    await renderMermaid('gantt\ndateFormat YYYY-MM-DD\nTask :a, 2026-01-01, 1d', 'diagram-1');

    const container = render.mock.calls.at(-1)?.[2] as HTMLElement | undefined;
    expect(container).toBeInstanceOf(HTMLElement);
    expect(container?.dataset.mermaidRenderHost).toBe('true');
    expect(container?.style.visibility).not.toBe('hidden');
    expect(container?.style.display).not.toBe('none');
    expect(container?.style.width).not.toBe('0px');
    expect(container?.style.height).not.toBe('0px');
    expect(container?.style.opacity).toBe('0');
    expect(container?.style.pointerEvents).toBe('none');
    expect(document.body.querySelector('[data-mermaid-render-host="true"]')).toBeNull();
  });

  it('suppresses third-party renderer console output so diagram source is not leaked', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { renderMermaid } = await import('./mermaidRenderer');

    await renderMermaid('zenuml\nAlice->Bob: Hi', 'diagram-1');

    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    console.log('after render');
    expect(consoleLog).toHaveBeenCalledWith('after render');
  });

  it('does not expose diagram source in rendered error messages', async () => {
    render.mockRejectedValueOnce(new Error('No diagram type detected for text: zenuml\nAlice->Bob: secret'));
    const { renderMermaid } = await import('./mermaidRenderer');

    const html = await renderMermaid('zenuml\nAlice->Bob: secret', 'diagram-1');

    expect(html).toContain('Mermaid Error: Unable to render diagram.');
    expect(html).not.toContain('Alice->Bob');
    expect(html).not.toContain('secret');
  });

  it('times out stuck third-party renders and restores console output', async () => {
    vi.useFakeTimers();
    try {
      render.mockImplementationOnce(() => new Promise(() => undefined));
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const { MERMAID_RENDER_TIMEOUT_MS, renderMermaid } = await import('./mermaidRenderer');

      const renderRequest = renderMermaid('graph TD\nA-->B', 'diagram-timeout');
      await vi.advanceTimersByTimeAsync(MERMAID_RENDER_TIMEOUT_MS);

      const html = await renderRequest;
      expect(html).toContain('Mermaid Error: Unable to render diagram.');

      console.log('after timeout');
      expect(consoleLog).toHaveBeenCalledWith('after timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('replaces Mermaid syntax-error SVGs with the compact app error block', async () => {
    render.mockResolvedValueOnce({
      svg: '<svg viewBox="0 0 2412 512"><text class="error-text">Syntax error in text</text></svg>',
    });
    const { renderMermaid } = await import('./mermaidRenderer');

    const html = await renderMermaid('not a diagram', 'diagram-1');

    expect(html).toContain('Mermaid Error: Unable to render diagram.');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('Syntax error in text');
  });

  it('removes third-party temporary error DOM from the document body', async () => {
    render.mockImplementationOnce(async (_id: string, _code: string, container?: HTMLElement) => {
      const leakedError = document.createElement('div');
      leakedError.textContent = 'Syntax error in text';
      container?.appendChild(leakedError);
      return {
        svg: '<svg viewBox="0 0 2412 512"><text class="error-text">Syntax error in text</text></svg>',
      };
    });
    const { renderMermaid } = await import('./mermaidRenderer');

    const html = await renderMermaid('not a diagram', 'diagram-1');

    expect(html).toContain('Mermaid Error: Unable to render diagram.');
    expect(document.body.textContent).not.toContain('Syntax error in text');
    expect(document.body.querySelector('[data-mermaid-render-host="true"]')).toBeNull();
  });

  it('rejects oversized diagrams before loading mermaid', async () => {
    const { renderMermaid } = await import('./mermaidRenderer');

    const html = await renderMermaid('x'.repeat(20_001), 'diagram-1');

    expect(html).toContain('Diagram is too large to render.');
    expect(render).not.toHaveBeenCalled();
  });
});
