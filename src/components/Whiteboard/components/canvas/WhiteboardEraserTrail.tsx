import { memo } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardPoint } from '@/components/Whiteboard/model/core/whiteboardModel';
import type { WhiteboardEraserSample } from '@/components/Whiteboard/model/interaction/whiteboardEraser';

export const WhiteboardEraserTrail = memo(function WhiteboardEraserTrail({
  trail,
  zoom,
}: {
  trail: WhiteboardEraserSample[];
  zoom: number;
}) {
  const head = trail.at(-1);
  if (!head) return null;
  const radius = themeWhiteboardTokens.eraserTrailWidthPx / 2 / zoom;
  const path = getTrailPath(trail, radius);

  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
      {path ? (
        <path
          data-whiteboard-eraser-trail="true"
          d={path}
          fill="var(--vlaina-color-whiteboard-eraser-trail)"
          opacity={themeWhiteboardTokens.eraserTrailOpacity}
          shapeRendering="geometricPrecision"
        />
      ) : (
        <circle
          data-whiteboard-eraser-trail="true"
          cx={head.point.x}
          cy={head.point.y}
          fill="var(--vlaina-color-whiteboard-eraser-trail)"
          opacity={themeWhiteboardTokens.eraserTrailOpacity}
          r={radius}
        />
      )}
    </svg>
  );
});

function getTrailPath(samples: WhiteboardEraserSample[], radius: number): string | null {
  const points = getDistinctPoints(samples);
  if (points.length < 2) return null;
  const left: WhiteboardPoint[] = [];
  const right: WhiteboardPoint[] = [];

  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const tangent = normalize({ x: next.x - previous.x, y: next.y - previous.y });
    const progress = index / (points.length - 1);
    const width = radius * progress ** themeWhiteboardTokens.eraserTrailTaperExponent;
    left.push({ x: point.x - tangent.y * width, y: point.y + tangent.x * width });
    right.push({ x: point.x + tangent.y * width, y: point.y - tangent.x * width });
  });

  const head = points.at(-1)!;
  const previous = points.at(-2)!;
  const tangent = normalize({ x: head.x - previous.x, y: head.y - previous.y });
  const front = { x: head.x + tangent.x * radius, y: head.y + tangent.y * radius };
  const reversedRight = [...right].reverse();
  return [
    `M ${formatPoint(left[0])}`,
    ...getSmoothCommands(left),
    `Q ${formatPoint(front)} ${formatPoint(reversedRight[0])}`,
    ...getSmoothCommands(reversedRight),
    'Z',
  ].join(' ');
}

function getDistinctPoints(samples: WhiteboardEraserSample[]): WhiteboardPoint[] {
  const points: WhiteboardPoint[] = [];
  for (const sample of samples) {
    const previous = points.at(-1);
    if (!previous || Math.hypot(sample.point.x - previous.x, sample.point.y - previous.y) > Number.EPSILON) {
      points.push(sample.point);
    }
  }
  return points;
}

function getSmoothCommands(points: WhiteboardPoint[]): string[] {
  if (points.length < 2) return [];
  const commands: string[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (index === points.length - 1) {
      commands.push(`L ${formatPoint(point)}`);
      continue;
    }
    const next = points[index + 1];
    commands.push(`Q ${formatPoint(point)} ${formatPoint({ x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 })}`);
  }
  return commands;
}

function normalize(point: WhiteboardPoint): WhiteboardPoint {
  const length = Math.hypot(point.x, point.y);
  return length > Number.EPSILON ? { x: point.x / length, y: point.y / length } : { x: 1, y: 0 };
}

function formatPoint(point: WhiteboardPoint): string {
  return `${formatNumber(point.x)} ${formatNumber(point.y)}`;
}

function formatNumber(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}
