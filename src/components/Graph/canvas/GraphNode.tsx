import { memo, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { themeGraphTokens } from '@/styles/themeTokens';
import type { GraphNavigationDirection } from '../model/graphKeyboardNavigation';
import type { GraphLabelPlacement } from '../model/graphLabelLayout';
import type { PositionedGraphNode } from '../model/graphLayout';
import type { GraphNodePosition } from '../store/useGraphUIStore';

interface GraphNodeProps {
  current: boolean;
  dragging: boolean;
  focusable: boolean;
  hovered: boolean;
  labelPlacement: GraphLabelPlacement | null;
  node: PositionedGraphNode;
  onHoverChange: (path: string | null) => void;
  onHoverStart?: (event: MouseEvent<SVGGElement>, path: string, position: GraphNodePosition) => void;
  onFocusChange: (path: string) => void;
  onNavigate: (path: string, direction: GraphNavigationDirection) => void;
  onOpen: (path: string) => void;
  onPositionNudge: (path: string, delta: GraphNodePosition) => void;
  onSelect: (path: string | null) => void;
  onStartDrag: (event: PointerEvent<SVGGElement>, path: string, position: GraphNodePosition) => void;
  related: boolean;
  selected: boolean;
  dimmed: boolean;
}

function areGraphNodePropsEqual(previous: GraphNodeProps, next: GraphNodeProps): boolean {
  return previous.current === next.current
    && previous.dragging === next.dragging
    && previous.focusable === next.focusable
    && previous.hovered === next.hovered
    && previous.labelPlacement?.textAnchor === next.labelPlacement?.textAnchor
    && previous.labelPlacement?.text === next.labelPlacement?.text
    && previous.labelPlacement?.x === next.labelPlacement?.x
    && previous.labelPlacement?.y === next.labelPlacement?.y
    && previous.related === next.related
    && previous.selected === next.selected
    && previous.dimmed === next.dimmed
    && previous.node.id === next.node.id
    && previous.node.label === next.node.label
    && previous.node.degree === next.node.degree
    && previous.node.x === next.node.x
    && previous.node.y === next.node.y
    && previous.onHoverChange === next.onHoverChange
    && previous.onHoverStart === next.onHoverStart
    && previous.onFocusChange === next.onFocusChange
    && previous.onNavigate === next.onNavigate
    && previous.onOpen === next.onOpen
    && previous.onPositionNudge === next.onPositionNudge
    && previous.onSelect === next.onSelect
    && previous.onStartDrag === next.onStartDrag;
}

export const GraphNode = memo(function GraphNode(props: GraphNodeProps) {
  const { t } = useI18n();
  const { node } = props;
  const nodeRadius = themeGraphTokens.nodeRadiusPx + Math.min(
    themeGraphTokens.nodeDegreeRadiusMaxBonusPx,
    Math.sqrt(node.degree) * themeGraphTokens.nodeDegreeRadiusScalePx,
  );
  return (
    <g
      data-graph-node-position={node.id}
      data-graph-selected={props.selected ? 'true' : undefined}
      transform={`translate(${node.x} ${node.y})`}
      role="option"
      tabIndex={props.focusable ? 0 : -1}
      aria-label={node.label}
      aria-description={t('graph.linksCount', { count: node.degree })}
      aria-current={props.current ? 'page' : undefined}
      aria-selected={props.selected}
      className={cn('vlaina-graph-node cursor-grab outline-none', props.dragging && 'cursor-grabbing')}
      onClick={(event) => {
        if (event.detail === 0) props.onOpen(node.id);
      }}
      onPointerDown={(event) => props.onStartDrag(event, node.id, { x: node.x, y: node.y })}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); props.onOpen(node.id); return; }
        if (event.key === ' ') {
          event.preventDefault();
          props.onSelect(props.selected ? null : node.id);
          return;
        }
        if (event.key === 'Escape' && props.selected) {
          event.preventDefault();
          props.onSelect(null);
          return;
        }
        const direction: GraphNavigationDirection | null = event.key === 'ArrowLeft' ? 'left'
          : event.key === 'ArrowRight' ? 'right'
            : event.key === 'ArrowUp' ? 'up'
              : event.key === 'ArrowDown' ? 'down' : null;
        if (!direction) return;
        event.preventDefault();
        if (!event.altKey) {
          props.onNavigate(node.id, direction);
          return;
        }
        const step = event.shiftKey ? 12 : 2;
        const delta = direction === 'left' ? { x: -step, y: 0 }
          : direction === 'right' ? { x: step, y: 0 }
            : direction === 'up' ? { x: 0, y: -step }
              : { x: 0, y: step };
        props.onSelect(node.id);
        props.onPositionNudge(node.id, delta);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        props.onOpen(node.id);
      }}
      onMouseEnter={(event) => {
        if (props.onHoverStart) {
          props.onHoverStart(event, node.id, { x: node.x, y: node.y });
        } else {
          props.onHoverChange(node.id);
        }
      }}
      onMouseLeave={() => props.onHoverChange(null)}
      onFocus={() => props.onFocusChange(node.id)}
      onBlur={() => props.onHoverChange(null)}
    >
      <circle
        data-graph-node-hit-target={node.id}
        cx={0}
        cy={0}
        r={themeGraphTokens.nodeHitRadiusPx}
        style={{
          r: `calc(${themeGraphTokens.nodeHitRadiusPx}px * var(--vlaina-graph-inverse-zoom))`,
        } as CSSProperties}
        className="fill-transparent"
        pointerEvents="all"
      />
      <circle
        cx={0}
        cy={0}
        r={nodeRadius}
        style={{
          r: `calc(${nodeRadius}px * var(--vlaina-graph-inverse-zoom))`,
          transform: `scale(${props.selected || props.hovered
            ? themeGraphTokens.nodeActiveScale
            : themeGraphTokens.nodeDefaultScale})`,
          opacity: props.dimmed ? themeGraphTokens.dimmedNodeOpacity : 1,
        } as CSSProperties}
        className={cn(
          'vlaina-graph-node-dot',
          props.selected || props.hovered
            ? 'fill-[var(--vlaina-color-graph-node-active)] stroke-[var(--vlaina-color-graph-node-ring-active)]'
            : props.related
              ? 'fill-[var(--vlaina-color-graph-node-related)] stroke-[var(--vlaina-color-graph-node-ring)]'
              : 'fill-[var(--vlaina-color-graph-node)] stroke-[var(--vlaina-color-graph-node-ring)]',
        )}
        strokeWidth={themeGraphTokens.nodeRingWidthPx}
        vectorEffect="non-scaling-stroke"
      />
      {props.current ? (
        <circle
          aria-hidden="true"
          data-graph-current-note="true"
          cx={0}
          cy={0}
          r={themeGraphTokens.currentNodeRingRadiusPx}
          style={{
            r: `calc(${themeGraphTokens.currentNodeRingRadiusPx}px * var(--vlaina-graph-inverse-zoom))`,
          } as CSSProperties}
          className="pointer-events-none fill-none stroke-[var(--vlaina-color-graph-current-ring)]"
          strokeWidth={themeGraphTokens.nodeRingWidthPx}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {props.labelPlacement ? (
        <g
          data-graph-node-label="true"
          data-graph-node-label-hit-target={node.id}
          className="vlaina-graph-label-enter"
          pointerEvents="bounding-box"
        >
          <g style={{
            opacity: props.dimmed ? themeGraphTokens.dimmedNodeOpacity : 1,
            transform: themeGraphTokens.inverseZoomTransform,
          }}>
            <text
              x={props.labelPlacement.x}
              y={props.labelPlacement.y}
              textAnchor={props.labelPlacement.textAnchor}
              className="vlaina-graph-label-text fill-[var(--vlaina-color-graph-label)] font-medium"
              fontSize="var(--vlaina-font-13)"
            >
              {props.labelPlacement.text ?? node.label}
            </text>
          </g>
        </g>
      ) : null}
    </g>
  );
}, areGraphNodePropsEqual);
