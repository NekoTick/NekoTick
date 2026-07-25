import { useLayoutEffect, useState, type RefObject } from 'react';
import type { GraphPoint } from '../model/graphViewport';

const EMPTY_CANVAS_SIZE: GraphPoint = { x: 0, y: 0 };

export function useGraphCanvasSize(svgRef: RefObject<SVGSVGElement | null>): GraphPoint {
  const [size, setSize] = useState(EMPTY_CANVAS_SIZE);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateSize = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setSize((current) => (
        current.x === rect.width && current.y === rect.height
          ? current
          : { x: rect.width, y: rect.height }
      ));
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svgRef]);

  return size;
}
