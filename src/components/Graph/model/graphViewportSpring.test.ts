import { describe, expect, it } from 'vitest';
import { stepGraphViewportSpring } from './graphViewportSpring';

describe('stepGraphViewportSpring', () => {
  it('preserves velocity when the zoom target advances', () => {
    const first = stepGraphViewportSpring(
      { x: 0, y: 0, zoom: 1 },
      { x: -80, y: -60, zoom: 1.2 },
      { x: 0, y: 0, zoom: 0 },
      16,
      28,
    );
    const continued = stepGraphViewportSpring(
      first.viewport,
      { x: -160, y: -120, zoom: 1.4 },
      first.velocity,
      16,
      28,
    );
    const restarted = stepGraphViewportSpring(
      first.viewport,
      { x: -160, y: -120, zoom: 1.4 },
      { x: 0, y: 0, zoom: 0 },
      16,
      28,
    );

    expect(continued.viewport.zoom).toBeGreaterThan(restarted.viewport.zoom);
    expect(continued.velocity.zoom).toBeGreaterThan(restarted.velocity.zoom);
  });

  it('is stable across different animation frame intervals', () => {
    const current = { x: 0, y: 0, zoom: 1 };
    const target = { x: -80, y: -60, zoom: 1.2 };
    const velocity = { x: 0, y: 0, zoom: 0 };
    const singleStep = stepGraphViewportSpring(current, target, velocity, 16, 28);
    const firstHalf = stepGraphViewportSpring(current, target, velocity, 8, 28);
    const secondHalf = stepGraphViewportSpring(
      firstHalf.viewport,
      target,
      firstHalf.velocity,
      8,
      28,
    );

    expect(secondHalf.viewport.x).toBeCloseTo(singleStep.viewport.x);
    expect(secondHalf.viewport.y).toBeCloseTo(singleStep.viewport.y);
    expect(secondHalf.viewport.zoom).toBeCloseTo(singleStep.viewport.zoom);
    expect(secondHalf.velocity.zoom).toBeCloseTo(singleStep.velocity.zoom);
  });
});
