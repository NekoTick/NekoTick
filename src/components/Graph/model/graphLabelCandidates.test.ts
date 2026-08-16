import { describe, expect, it } from 'vitest';
import { themeGraphTokens } from '@/styles/themeTokens';
import type { PositionedGraphNode } from './graphLayout';
import {
  getGraphLabelCandidates,
  getGraphLabelPriorityIds,
  getOverviewLabelNodes,
  shouldUseFastAllLabelLayout,
} from './graphLabelCandidates';

function node(id: string, degree: number): PositionedGraphNode {
  return { id, label: id, degree, x: 0, y: 0 };
}

describe('graph label candidates', () => {
  it('keeps only connected parents in a low-zoom overview', () => {
    const nodes = [node('leaf-a', 1), node('parent', 2), node('leaf-b', 1)];

    expect(getOverviewLabelNodes(nodes, 0.4)).toEqual([nodes[1]]);
    expect(getOverviewLabelNodes(nodes, 0.8)).toBe(nodes);
  });

  it('uses the highest-degree node when a graph has no parent candidates', () => {
    const nodes = [node('small', 0), node('largest', 1), node('medium', 0)];

    expect(getOverviewLabelNodes(nodes, 0.4)).toEqual([nodes[1]]);
  });

  it('switches large all-label views to the fast layout', () => {
    const largeNodeCount = themeGraphTokens.localPreviewAllLabelNodeLimit + 1;

    expect(shouldUseFastAllLabelLayout(true, null, largeNodeCount)).toBe(true);
    expect(shouldUseFastAllLabelLayout(true, 'focused', largeNodeCount)).toBe(false);
    expect(shouldUseFastAllLabelLayout(false, null, largeNodeCount)).toBe(false);
  });

  it('prioritizes interaction targets before overview labels', () => {
    const overview = [node('parent', 2), node('other', 2)];

    expect(getGraphLabelPriorityIds({
      activePath: 'active',
      currentPath: 'current',
      highlightedPath: null,
      overviewLabelNodes: overview,
      selectedPath: 'selected',
      showAllLabels: true,
      useFastAllLabelLayout: false,
    })).toEqual(['active', 'selected', 'current', 'parent', 'other']);
  });

  it('shows a highlighted node and its direct neighbors only', () => {
    const nodes = [node('focus', 3), node('neighbor', 2), node('unrelated', 1)];

    expect(getGraphLabelCandidates({
      connectedToHighlighted: new Set(['neighbor']),
      highlightedPath: 'focus',
      nodes,
      overviewLabelNodes: nodes,
    })).toEqual([nodes[0], nodes[1]]);
  });
});
