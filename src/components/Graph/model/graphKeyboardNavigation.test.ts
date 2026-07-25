import { describe, expect, it } from 'vitest';
import type { PositionedGraphNode } from './graphLayout';
import { findGraphNodeInDirection } from './graphKeyboardNavigation';

const nodes: PositionedGraphNode[] = [
  { id: 'center', label: 'Center', degree: 0, x: 100, y: 100 },
  { id: 'right', label: 'Right', degree: 0, x: 180, y: 105 },
  { id: 'down-right', label: 'Down right', degree: 0, x: 140, y: 220 },
  { id: 'left', label: 'Left', degree: 0, x: 20, y: 100 },
];

describe('findGraphNodeInDirection', () => {
  it('prefers a spatially aligned node in the requested direction', () => {
    expect(findGraphNodeInDirection(nodes, 'center', 'right')?.id).toBe('right');
  });

  it('does not wrap to a node behind the requested direction', () => {
    expect(findGraphNodeInDirection(nodes, 'right', 'right')).toBeNull();
  });
});
