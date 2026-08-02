import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MERMAID_FORMAT_FIXTURES } from '@/test/fixtures/mermaidFormatFixtures';
import { useUIStore } from '@/stores/uiSlice';

vi.mock('./mermaidRenderer', () => ({
  generateMermaidId: () => 'mermaid-readonly-test',
  MAX_MERMAID_CODE_CHARS: 20_000,
  mermaidRenderErrorMarkup: () => '<div class="mermaid-error">Mermaid Error</div>',
  renderMermaid: vi.fn(),
}));

import {
  clearReadOnlyMermaidRenderCaches,
  getPendingReadOnlyMermaidRenderCount,
  MAX_PENDING_READONLY_MERMAID_RENDERS,
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

    resolveRender('<svg><text>rendered</text></svg>');

    await waitFor(() => {
      expect(screen.getByText('rendered')).toBeInTheDocument();
    });
    expect(container.innerHTML).not.toContain('data-code');
    expect(container.innerHTML).not.toContain('secret token');
  });

  it('refreshes read-only Mermaid placeholder copy when language changes', () => {
    vi.mocked(renderMermaid).mockImplementation(
      () => new Promise(() => undefined)
    );

    render(<ReadOnlyMermaidBlock code="sequenceDiagram\nAlice->Bob: hi" />);

    expect(screen.getByText('Enter Mermaid diagram...')).toBeInTheDocument();

    act(() => {
      useUIStore.setState({ languagePreference: 'zh-CN' });
    });

    expect(screen.getByText('输入图表内容...')).toBeInTheDocument();
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

    expect(renderMermaid).toHaveBeenCalledTimes(1);
    expect(getPendingReadOnlyMermaidRenderCount()).toBe(1);

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
        expect.any(String)
      );
      expect(markup, `${fixture.label} should return SVG markup`).toContain('data-readonly-rendered');
      expect(markup, `${fixture.label} should not render an error`).not.toContain('mermaid-error');
    }
  });

  it('bounds pending read-only Mermaid renders for different diagrams', async () => {
    const renderResolves: Array<(markup: string) => void> = [];
    vi.mocked(renderMermaid).mockImplementation(
      () => new Promise((resolve) => {
        renderResolves.push(resolve);
      })
    );

    const renders = Array.from({ length: MAX_PENDING_READONLY_MERMAID_RENDERS }, (_value, index) =>
      resolveReadOnlyMermaidMarkup(`sequenceDiagram\nAlice->Bob: ${index}`)
    );
    renders.forEach((renderPromise) => {
      renderPromise.catch(() => undefined);
    });

    expect(getPendingReadOnlyMermaidRenderCount()).toBe(MAX_PENDING_READONLY_MERMAID_RENDERS);
    const overflowMarkup = await resolveReadOnlyMermaidMarkup('sequenceDiagram\nAlice->Bob: overflow');

    expect(overflowMarkup).toContain('mermaid-error');
    expect(getPendingReadOnlyMermaidRenderCount()).toBe(MAX_PENDING_READONLY_MERMAID_RENDERS);

    renderResolves.forEach((resolve, index) => {
      resolve(`<svg><text>rendered ${index}</text></svg>`);
    });
    await Promise.all(renders);
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

    expect(renderMermaid).toHaveBeenCalledWith(code, expect.any(String));
    expect(markup).toContain('rendered');
  });
});
