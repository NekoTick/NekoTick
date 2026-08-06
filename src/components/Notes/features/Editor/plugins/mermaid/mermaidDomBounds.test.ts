import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MERMAID_FORMAT_FIXTURES } from '@/test/fixtures/mermaidFormatFixtures';
import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';
import { POINTER_SELECTION_ACTIVE_ATTRIBUTE } from '../selection/textSelectionOverlayState';

vi.mock('./mermaidRenderer', () => ({
  renderMermaid: vi.fn(async () => '<svg data-rendered="unexpected"></svg>'),
}));

import {
  clearMermaidRenderCaches,
  createMermaidElement,
  disposeMermaidElement,
  getActiveMermaidRenderCount,
  getMermaidElementCode,
  getPendingMermaidRenderCount,
  MAX_LEGACY_MERMAID_DATA_CODE_CHARS,
  renderMermaidEditorLivePreview,
  resolveMermaidMarkup,
} from './mermaidDom';
import { renderMermaid } from './mermaidRenderer';
import {
  MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS,
  resolveMermaidRenderConcurrency,
} from './mermaidRenderQueue';

describe('mermaid DOM render bounds', () => {
  beforeEach(() => {
    clearMermaidRenderCaches();
    vi.mocked(renderMermaid).mockReset();
    vi.mocked(renderMermaid).mockResolvedValue('<svg data-rendered="unexpected"></svg>');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects oversized initial Mermaid elements before rendering', async () => {
    const element = createMermaidElement('x'.repeat(20_001));

    await Promise.resolve();
    await Promise.resolve();

    expect(renderMermaid).not.toHaveBeenCalled();
    expect(element.querySelector('.mermaid-error')?.textContent).toContain(
      'Diagram is too large to render.'
    );
    expect(element.querySelector('svg')).toBeNull();
  });

  it('rejects oversized live previews before rendering', async () => {
    const anchor = document.createElement('div');
    const render = vi.fn(async () => '<svg data-rendered="unexpected"></svg>');
    const onRendered = vi.fn();

    await renderMermaidEditorLivePreview({
      anchor,
      code: 'x'.repeat(20_001),
      render,
      onRendered,
    });

    expect(render).not.toHaveBeenCalled();
    expect(anchor.querySelector('.mermaid-error')?.textContent).toContain(
      'Diagram is too large to render.'
    );
    expect(anchor.querySelector('svg')).toBeNull();
    expect(onRendered).toHaveBeenCalledTimes(1);
  });

  it('short-circuits visibly incomplete live previews before rendering', async () => {
    const anchor = document.createElement('div');
    const render = vi.fn(async () => '<svg data-rendered="unexpected"></svg>');
    const onRendered = vi.fn();

    await renderMermaidEditorLivePreview({
      anchor,
      code: 'graph TD\nA --> B{unfinished',
      render,
      onRendered,
    });

    expect(render).not.toHaveBeenCalled();
    expect(anchor.querySelector('.mermaid-error')?.textContent).toContain(
      'Mermaid Error'
    );
    expect(anchor.querySelector('svg')).toBeNull();
    expect(onRendered).toHaveBeenCalledTimes(1);
  });

  it('does not treat ER relationship cardinality braces as incomplete syntax', async () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    const render = vi.fn(async () => '<svg data-rendered="er"></svg>');
    const onRendered = vi.fn();
    const code = [
      'erDiagram',
      '  CUSTOMER ||--o{ ORDER : places',
      '  ORDER ||--|{ ITEM : contains',
      '  CUSTOMER }|..|{ ADDRESS : uses',
    ].join('\n');

    await renderMermaidEditorLivePreview({
      anchor,
      code,
      render,
      onRendered,
    });

    expect(render).toHaveBeenCalledWith(code, expect.any(String));
    expect(anchor.querySelector('[data-rendered="er"]')).not.toBeNull();
    expect(anchor.querySelector('.mermaid-error')).toBeNull();
    expect(onRendered).toHaveBeenCalledTimes(1);
  });

  it('does not short-circuit valid Mermaid format fixtures before rendering', async () => {
    for (const fixture of MERMAID_FORMAT_FIXTURES) {
      const render = vi.fn(async () => `<svg data-rendered="${fixture.label}"></svg>`);
      const code = fixture.source.join('\n');

      const markup = await resolveMermaidMarkup(code, render);

      expect(render, `${fixture.label} should reach the renderer`).toHaveBeenCalledWith(
        code,
        expect.any(String)
      );
      expect(markup, `${fixture.label} should return rendered markup`).toContain(
        `data-rendered="${fixture.label}"`
      );
    }
  });

  it('does not cache a persistent default render error', async () => {
    vi.mocked(renderMermaid).mockResolvedValue(
      '<div class="mermaid-error">persistent failure</div>'
    );
    const code = 'sequenceDiagram\nAlice->>Bob: invalid';

    await expect(resolveMermaidMarkup(code)).resolves.toContain('mermaid-error');
    await expect(resolveMermaidMarkup(code)).resolves.toContain('mermaid-error');

    expect(renderMermaid).toHaveBeenCalledTimes(4);
  });

  it('ignores Mermaid comments and init directives when checking incomplete syntax', async () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    const render = vi.fn(async () => '<svg data-rendered="comment-safe"></svg>');

    await renderMermaidEditorLivePreview({
      anchor,
      code: [
        '%% Comment text with an unmatched { and "quote',
        '%%{init: {',
        '  "theme": "base"',
        '} }%%',
        'flowchart TD',
        '  A[Start] --> B[Done]',
      ].join('\n'),
      render,
    });

    expect(render).toHaveBeenCalledTimes(1);
    expect(anchor.querySelector('[data-rendered="comment-safe"]')).not.toBeNull();
    expect(anchor.querySelector('.mermaid-error')).toBeNull();
  });

  it('bounds legacy data-code fallback reads', () => {
    const element = document.createElement('div');
    element.dataset.code = 'x'.repeat(MAX_LEGACY_MERMAID_DATA_CODE_CHARS + 1);

    expect(getMermaidElementCode(element)).toHaveLength(MAX_LEGACY_MERMAID_DATA_CODE_CHARS);
  });

  it('selects bounded Mermaid concurrency from device capacity', () => {
    expect(resolveMermaidRenderConcurrency({
      hardwareConcurrency: 2,
      deviceMemory: 2,
    })).toBe(4);
    expect(resolveMermaidRenderConcurrency({
      hardwareConcurrency: 8,
      deviceMemory: 8,
    })).toBe(5);
    expect(resolveMermaidRenderConcurrency({
      hardwareConcurrency: 16,
      deviceMemory: 16,
    })).toBe(5);
    expect(resolveMermaidRenderConcurrency({
      hardwareConcurrency: 16,
      deviceMemory: 4,
    })).toBe(4);
    expect(resolveMermaidRenderConcurrency({})).toBe(4);
  });

  it('promotes an already queued interactive render ahead of background work', async () => {
    const startedCodes: string[] = [];
    const renderResolves = new Map<string, (markup: string) => void>();
    vi.mocked(renderMermaid).mockImplementation(
      (code) => new Promise((resolve) => {
        startedCodes.push(code);
        renderResolves.set(code, resolve);
      })
    );
    const backgroundCodes = Array.from(
      { length: MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS + 1 },
      (_value, index) => `sequenceDiagram\nAlice->>Bob: background ${index}`,
    );
    const targetCode = 'sequenceDiagram\nAlice->>Bob: visible';
    const backgroundRenders = backgroundCodes.map((code) => resolveMermaidMarkup(code));
    const target = resolveMermaidMarkup(targetCode);
    const finishRender = async (code: string) => {
      await vi.waitFor(() => {
        expect(renderResolves.has(code)).toBe(true);
      }, { interval: 1, timeout: 2_000 });
      renderResolves.get(code)?.(`<svg data-rendered="${code}"></svg>`);
    };

    await vi.waitFor(() => {
      expect(startedCodes).toHaveLength(MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS);
    }, { interval: 1, timeout: 2_000 });
    const promotedTarget = resolveMermaidMarkup(targetCode, undefined, 'interactive');
    await finishRender(backgroundCodes[0]!);

    await vi.waitFor(() => {
      expect(startedCodes[MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS]).toBe(targetCode);
    }, { interval: 1, timeout: 2_000 });

    await finishRender(targetCode);
    for (const code of backgroundCodes.slice(1)) {
      await finishRender(code);
    }
    await Promise.all([...backgroundRenders, target, promotedTarget]);
  });

  it('starts more than two background Mermaid renders on every device tier', async () => {
    let releaseRenders = () => {};
    const renderGate = new Promise<void>((resolve) => {
      releaseRenders = resolve;
    });
    vi.mocked(renderMermaid).mockImplementation(async (code) => {
      await renderGate;
      return `<svg data-rendered="${code}"></svg>`;
    });

    const renders = Array.from(
      { length: MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS + 1 },
      (_value, index) => resolveMermaidMarkup(
        `sequenceDiagram\nAlice->>Bob: parallel ${index}`,
      ),
    );

    try {
      await vi.waitFor(() => {
        expect(MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS).toBeGreaterThan(2);
        expect(renderMermaid).toHaveBeenCalledTimes(
          MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS,
        );
        expect(getActiveMermaidRenderCount()).toBe(
          MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS,
        );
      }, { interval: 1, timeout: 2_000 });
    } finally {
      releaseRenders();
      await Promise.all(renders);
    }
  });

  it('keeps one render slot available for interactive Mermaid work', async () => {
    let releaseRenders = () => {};
    const renderGate = new Promise<void>((resolve) => {
      releaseRenders = resolve;
    });
    const startedCodes: string[] = [];
    vi.mocked(renderMermaid).mockImplementation(async (code) => {
      startedCodes.push(code);
      await renderGate;
      return `<svg data-rendered="${code}"></svg>`;
    });
    const backgroundRenders = Array.from(
      { length: MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS + 1 },
      (_value, index) => resolveMermaidMarkup(
        `sequenceDiagram\nAlice->>Bob: reserved background ${index}`,
      ),
    );

    try {
      await vi.waitFor(() => {
        expect(startedCodes).toHaveLength(MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS);
      }, { interval: 1, timeout: 2_000 });

      const interactive = resolveMermaidMarkup(
        'sequenceDiagram\nAlice->>Bob: reserved interactive',
        undefined,
        'interactive',
      );
      await vi.waitFor(() => {
        expect(startedCodes.at(-1)).toContain('reserved interactive');
        expect(getActiveMermaidRenderCount()).toBe(
          MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS + 1,
        );
      }, { interval: 1, timeout: 2_000 });

      releaseRenders();
      await Promise.all([...backgroundRenders, interactive]);
    } finally {
      releaseRenders();
    }
  });

  it('checks scroll interaction once before starting an otherwise idle render', async () => {
    vi.useFakeTimers();
    const querySelectorSpy = vi.spyOn(document, 'querySelector');
    vi.mocked(renderMermaid).mockResolvedValue('<svg data-rendered="single-check"></svg>');

    const markupPromise = resolveMermaidMarkup(
      'sequenceDiagram\nAlice->>Bob: single interaction check',
    );
    await vi.advanceTimersByTimeAsync(0);

    await expect(markupPromise).resolves.toContain('data-rendered="single-check"');
    expect(querySelectorSpy).toHaveBeenCalledTimes(1);
  });

  it('waits for every active scroll interaction to become idle', async () => {
    vi.useFakeTimers();
    const firstScrollRoot = document.createElement('div');
    firstScrollRoot.dataset.noteScrollRoot = 'true';
    firstScrollRoot.dataset.overlayScrollbarInteracting = 'true';
    const secondScrollRoot = document.createElement('div');
    secondScrollRoot.dataset.noteScrollRoot = 'true';
    secondScrollRoot.dataset.overlayScrollbarInteracting = 'true';
    document.body.append(firstScrollRoot, secondScrollRoot);
    vi.mocked(renderMermaid).mockResolvedValue('<svg data-rendered="idle"></svg>');

    const markupPromise = resolveMermaidMarkup('sequenceDiagram\nAlice->>Bob: idle wake');

    await vi.advanceTimersByTimeAsync(0);
    expect(renderMermaid).not.toHaveBeenCalled();

    delete firstScrollRoot.dataset.overlayScrollbarInteracting;
    window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT));
    await vi.advanceTimersByTimeAsync(0);
    expect(renderMermaid).not.toHaveBeenCalled();

    delete secondScrollRoot.dataset.overlayScrollbarInteracting;
    window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT));
    await vi.runAllTimersAsync();

    await expect(markupPromise).resolves.toContain('data-rendered="idle"');
    expect(renderMermaid).toHaveBeenCalledTimes(1);
  });

  it('waits for pointer text selection to finish before starting another render', async () => {
    vi.useFakeTimers();
    const editor = document.createElement('div');
    editor.setAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE, 'true');
    document.body.append(editor);
    vi.mocked(renderMermaid).mockResolvedValue('<svg data-rendered="selection-idle"></svg>');

    const markupPromise = resolveMermaidMarkup('sequenceDiagram\nAlice->>Bob: selection idle');
    await vi.advanceTimersByTimeAsync(0);

    expect(renderMermaid).not.toHaveBeenCalled();

    editor.removeAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
    window.dispatchEvent(new MouseEvent('mouseup'));
    await vi.runAllTimersAsync();

    await expect(markupPromise).resolves.toContain('data-rendered="selection-idle"');
    expect(renderMermaid).toHaveBeenCalledTimes(1);
  });

  it('bounds active work while eventually rendering more than 80 diagrams', async () => {
    const renderResolves: Array<(markup: string) => void> = [];
    let maxActiveRenderCount = 0;
    vi.mocked(renderMermaid).mockImplementation(
      () => new Promise((resolve) => {
        maxActiveRenderCount = Math.max(maxActiveRenderCount, getActiveMermaidRenderCount());
        renderResolves.push(resolve);
      })
    );

    const diagramCount = 85;
    const renders = Array.from({ length: diagramCount }, (_value, index) =>
      resolveMermaidMarkup(`sequenceDiagram\nAlice->>Bob: message ${index}`)
    );
    renders.forEach((render) => {
      render.catch(() => undefined);
    });

    expect(getPendingMermaidRenderCount()).toBe(diagramCount);

    await vi.waitFor(() => {
      expect(renderResolves).toHaveLength(MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS);
    }, { interval: 1, timeout: 2_000 });
    for (let index = 0; index < renders.length; index += 1) {
      await vi.waitFor(() => {
        expect(renderResolves.length).toBeGreaterThanOrEqual(index + 1);
      }, { interval: 1, timeout: 2_000 });
      renderResolves[index]?.(`<svg data-rendered="${index}"></svg>`);
    }
    await Promise.all(renders);

    expect(maxActiveRenderCount).toBe(MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS);
    expect(getActiveMermaidRenderCount()).toBe(0);
    expect(getPendingMermaidRenderCount()).toBe(0);
  });

  it('cancels queued renders after every waiting Mermaid element is disposed', async () => {
    const renderResolves: Array<(markup: string) => void> = [];
    vi.mocked(renderMermaid).mockImplementation(
      () => new Promise((resolve) => {
        renderResolves.push(resolve);
      })
    );
    const elementCount = MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS + 2;
    const sharedQueuedIndex = MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS;
    const elements = Array.from({ length: elementCount }, (_value, index) =>
      createMermaidElement(`sequenceDiagram\nAlice->>Bob: disposed ${index}`)
    );
    const sharedQueuedElement = createMermaidElement(
      `sequenceDiagram\nAlice->>Bob: disposed ${sharedQueuedIndex}`
    );

    await vi.waitFor(() => {
      expect(renderResolves).toHaveLength(MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS);
    }, { interval: 1, timeout: 2_000 });
    expect(getPendingMermaidRenderCount()).toBe(elementCount);

    disposeMermaidElement(elements[sharedQueuedIndex]!);
    expect(getPendingMermaidRenderCount()).toBe(elementCount);
    disposeMermaidElement(sharedQueuedElement);
    expect(getPendingMermaidRenderCount()).toBe(elementCount - 1);
    elements
      .filter((_element, index) => index !== sharedQueuedIndex)
      .forEach(disposeMermaidElement);

    expect(getPendingMermaidRenderCount()).toBe(
      MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS,
    );
    expect(renderMermaid).toHaveBeenCalledTimes(
      MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS,
    );
    renderResolves.forEach((resolve, index) => {
      resolve(`<svg data-rendered="active-${index}"></svg>`);
    });
    await vi.waitFor(() => {
      expect(getPendingMermaidRenderCount()).toBe(0);
      expect(getActiveMermaidRenderCount()).toBe(0);
    }, { interval: 1, timeout: 2_000 });
  });
});
