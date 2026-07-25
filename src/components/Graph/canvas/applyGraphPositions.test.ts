import { describe, expect, it, vi } from 'vitest';
import {
  applyGraphPositions,
  clearGraphNodePositionElements,
  registerGraphEdgeLayer,
} from './applyGraphPositions';

describe('applyGraphPositions', () => {
  it('skips unchanged node transforms and edge paths', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const alpha = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const beta = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const edge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    alpha.dataset.graphNodePosition = 'Alpha.md';
    beta.dataset.graphNodePosition = 'Beta.md';
    svg.append(edge, alpha, beta);
    registerGraphEdgeLayer(edge, 'base', [{ sourceId: 'Alpha.md', targetId: 'Beta.md' }]);
    const alphaSetAttribute = vi.spyOn(alpha, 'setAttribute');
    const betaSetAttribute = vi.spyOn(beta, 'setAttribute');
    const edgeSetAttribute = vi.spyOn(edge, 'setAttribute');
    const positions = {
      'Alpha.md': { x: 20, y: 30 },
      'Beta.md': { x: 120, y: 130 },
    };

    applyGraphPositions(svg, positions);
    alphaSetAttribute.mockClear();
    betaSetAttribute.mockClear();
    edgeSetAttribute.mockClear();
    applyGraphPositions(svg, positions);

    expect(alphaSetAttribute).not.toHaveBeenCalled();
    expect(betaSetAttribute).not.toHaveBeenCalled();
    expect(edgeSetAttribute).not.toHaveBeenCalled();

    positions['Alpha.md'].x = 40;
    applyGraphPositions(svg, positions);
    expect(alphaSetAttribute).toHaveBeenCalledOnce();
    expect(betaSetAttribute).not.toHaveBeenCalled();
    expect(edgeSetAttribute).toHaveBeenCalledOnce();
  });

  it('keeps freshly registered edge layers when the node cache is refreshed', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const alpha = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const beta = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const edge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    alpha.dataset.graphNodePosition = 'Alpha.md';
    beta.dataset.graphNodePosition = 'Beta.md';
    svg.append(edge, alpha, beta);
    registerGraphEdgeLayer(edge, 'base', [{ sourceId: 'Alpha.md', targetId: 'Beta.md' }]);

    const positions = {
      'Alpha.md': { x: 20, y: 30 },
      'Beta.md': { x: 120, y: 130 },
    };
    applyGraphPositions(svg, positions);
    clearGraphNodePositionElements(svg);
    positions['Alpha.md'] = { x: 40, y: 50 };
    applyGraphPositions(svg, positions);

    expect(edge).toHaveAttribute('d', 'M40,50L120,130');
  });

  it('restores current endpoints when React registers a changed edge detail layer', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const alpha = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const beta = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const edge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    alpha.dataset.graphNodePosition = 'Alpha.md';
    beta.dataset.graphNodePosition = 'Beta.md';
    svg.append(edge, alpha, beta);
    const definitions = [{ sourceId: 'Alpha.md', targetId: 'Beta.md' }];
    registerGraphEdgeLayer(edge, 'base', definitions);
    applyGraphPositions(svg, {
      'Alpha.md': { x: 40.04, y: 50.06 },
      'Beta.md': { x: 120.04, y: 130.06 },
    });

    edge.setAttribute('d', 'M0,0L1,1');
    registerGraphEdgeLayer(edge, 'base', definitions);

    expect(edge).toHaveAttribute('d', 'M40,50.1L120,130.1');
  });
});
