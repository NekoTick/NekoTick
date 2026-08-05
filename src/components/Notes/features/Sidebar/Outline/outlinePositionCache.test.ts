import { describe, expect, it, vi } from 'vitest';
import {
  buildOutlineElementMap,
  buildOutlinePositionMap,
  MAX_OUTLINE_HEADING_DOM_SCAN_ELEMENTS,
  MAX_OUTLINE_HEADING_METRICS,
  readOutlineHeadingMetrics,
  refreshOutlineHeadingMetricTops,
  selectActiveOutlineHeadingId,
} from './outlinePositionCache';

describe('outlinePositionCache', () => {
  it('reads heading metrics with stable ids and top offsets', () => {
    const scrollRoot = document.createElement('div');
    const editorRoot = document.createElement('div');
    scrollRoot.appendChild(editorRoot);
    scrollRoot.scrollTop = 120;

    scrollRoot.getBoundingClientRect = () => ({
      bottom: 800,
      height: 800,
      left: 0,
      right: 600,
      top: 40,
      width: 600,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    });

    const headingOne = document.createElement('h1');
    headingOne.textContent = 'Alpha';
    headingOne.getBoundingClientRect = () => ({
      bottom: 100,
      height: 40,
      left: 0,
      right: 300,
      top: 60,
      width: 300,
      x: 0,
      y: 60,
      toJSON: () => ({}),
    });

    const headingTwo = document.createElement('h2');
    headingTwo.textContent = 'Beta';
    headingTwo.getBoundingClientRect = () => ({
      bottom: 360,
      height: 48,
      left: 0,
      right: 300,
      top: 312,
      width: 300,
      x: 0,
      y: 312,
      toJSON: () => ({}),
    });

    editorRoot.append(headingOne, headingTwo);

    const metrics = readOutlineHeadingMetrics(editorRoot, scrollRoot);

    expect(metrics.map(({ id, level, text, top }) => ({ id, level, text, top }))).toEqual([
      {
        id: 'outline-0-h1-alpha',
        level: 1,
        text: 'Alpha',
        top: 140,
      },
      {
        id: 'outline-1-h2-beta',
        level: 2,
        text: 'Beta',
        top: 392,
      },
    ]);
    expect(buildOutlineElementMap(metrics).get('outline-1-h2-beta')).toBe(headingTwo);
    expect(buildOutlinePositionMap(metrics).get('outline-0-h1-alpha')).toBe(140);
  });

  it('reads heading metrics without aggregating heading textContent', () => {
    const editorRoot = document.createElement('div');
    const heading = document.createElement('h2');
    heading.appendChild(document.createTextNode('Bounded heading'));
    heading.getBoundingClientRect = () => ({
      bottom: 40,
      height: 40,
      left: 0,
      right: 300,
      top: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    Object.defineProperty(heading, 'textContent', {
      get() {
        throw new Error('aggregate heading textContent should not be read');
      },
    });
    editorRoot.appendChild(heading);

    const metrics = readOutlineHeadingMetrics(editorRoot, null);

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      id: 'outline-0-h2-bounded-heading',
      level: 2,
      text: 'Bounded heading',
    });
  });

  it('selects the active heading from cached positions', () => {
    const metrics = [
      {
        id: 'a',
        level: 1,
        text: 'A',
        from: 0,
        to: 3,
        top: 0,
        element: document.createElement('h1'),
      },
      {
        id: 'b',
        level: 2,
        text: 'B',
        from: 4,
        to: 7,
        top: 220,
        element: document.createElement('h2'),
      },
      {
        id: 'c',
        level: 2,
        text: 'C',
        from: 8,
        to: 11,
        top: 480,
        element: document.createElement('h2'),
      },
    ];

    expect(selectActiveOutlineHeadingId(metrics, 0, 72, 12)).toBe('a');
    expect(selectActiveOutlineHeadingId(metrics, 168, 72, 12)).toBe('b');
    expect(selectActiveOutlineHeadingId(metrics, 396, 72, 12)).toBe('c');
  });

  it('selects the last heading only after a scrollable editor reaches its end', () => {
    const metrics = [
      {
        id: 'first',
        level: 1,
        text: 'First',
        from: 0,
        to: 5,
        top: 0,
        element: document.createElement('h1'),
      },
      {
        id: 'last',
        level: 2,
        text: 'Last',
        from: 6,
        to: 10,
        top: 900,
        element: document.createElement('h2'),
      },
    ];

    expect(selectActiveOutlineHeadingId(metrics, 400, 72, 12, 400)).toBe('last');
    expect(selectActiveOutlineHeadingId(metrics, 0, 72, 12, 0)).toBe('first');
    expect(selectActiveOutlineHeadingId(metrics, 0, 72, 12, 1)).toBe('first');
  });

  it('refreshes heading metric tops from live DOM geometry', () => {
    const scrollRoot = document.createElement('div');
    const heading = document.createElement('h2');
    document.body.append(scrollRoot);
    scrollRoot.append(heading);
    scrollRoot.scrollTop = 200;
    scrollRoot.getBoundingClientRect = () => ({
      bottom: 600,
      height: 600,
      left: 0,
      right: 600,
      top: 50,
      width: 600,
      x: 0,
      y: 50,
      toJSON: () => ({}),
    });
    heading.getBoundingClientRect = () => ({
      bottom: 350,
      height: 40,
      left: 0,
      right: 300,
      top: 310,
      width: 300,
      x: 0,
      y: 310,
      toJSON: () => ({}),
    });

    try {
      const [metric] = refreshOutlineHeadingMetricTops([
        {
          id: 'outline-0-h2-stale',
          level: 2,
          text: 'Stale',
          from: 0,
          to: 10,
          top: 80,
          element: heading,
        },
      ], scrollRoot);

      expect(metric?.top).toBe(460);
    } finally {
      scrollRoot.remove();
    }
  });

  it('reads heading metrics without materializing selector results', () => {
    const editorRoot = document.createElement('div');
    for (let index = 0; index < MAX_OUTLINE_HEADING_METRICS + 4; index += 1) {
      const heading = document.createElement('h2');
      heading.textContent = `Heading ${index}`;
      heading.getBoundingClientRect = () => ({
        bottom: index + 20,
        height: 20,
        left: 0,
        right: 300,
        top: index,
        width: 300,
        x: 0,
        y: index,
        toJSON: () => ({}),
      } as DOMRect);
      editorRoot.appendChild(heading);
    }

    const querySelectorAllSpy = vi.spyOn(editorRoot, 'querySelectorAll').mockImplementation(() => {
      throw new Error('Outline metrics should not materialize selector results');
    });
    const arrayFromSpy = vi.spyOn(Array, 'from').mockImplementation(() => {
      throw new Error('Outline metrics should not use Array.from');
    });

    try {
      const metrics = readOutlineHeadingMetrics(editorRoot, null);

      expect(metrics).toHaveLength(MAX_OUTLINE_HEADING_METRICS);
      expect(metrics[0]?.id).toBe('outline-0-h2-heading-0');
      expect(metrics.at(-1)?.id).toBe(`outline-${MAX_OUTLINE_HEADING_METRICS - 1}-h2-heading-${MAX_OUTLINE_HEADING_METRICS - 1}`);
      expect(querySelectorAllSpy).not.toHaveBeenCalled();
    } finally {
      querySelectorAllSpy.mockRestore();
      arrayFromSpy.mockRestore();
    }
  });

  it('stops scanning DOM elements when the scan budget is exhausted', () => {
    const editorRoot = document.createElement('div');
    for (let index = 0; index < MAX_OUTLINE_HEADING_DOM_SCAN_ELEMENTS; index += 1) {
      editorRoot.appendChild(document.createElement('span'));
    }
    const overBudgetHeading = document.createElement('h2');
    overBudgetHeading.textContent = 'Over budget';
    editorRoot.appendChild(overBudgetHeading);

    expect(readOutlineHeadingMetrics(editorRoot, null)).toEqual([]);
  });
});
