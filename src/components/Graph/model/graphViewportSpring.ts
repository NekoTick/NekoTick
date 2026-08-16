import type { GraphViewport } from './graphViewport';

function stepCriticalSpring(
  current: number,
  target: number,
  velocity: number,
  elapsedMs: number,
  responseMs: number,
) {
  const angularFrequency = 1 / responseMs;
  const displacement = current - target;
  const coefficient = velocity + angularFrequency * displacement;
  const decay = Math.exp(-angularFrequency * elapsedMs);
  return {
    value: target + (displacement + coefficient * elapsedMs) * decay,
    velocity: (velocity - angularFrequency * coefficient * elapsedMs) * decay,
  };
}

export function stepGraphViewportSpring(
  current: GraphViewport,
  target: GraphViewport,
  velocity: GraphViewport,
  elapsedMs: number,
  responseMs: number,
) {
  const x = stepCriticalSpring(current.x, target.x, velocity.x, elapsedMs, responseMs);
  const y = stepCriticalSpring(current.y, target.y, velocity.y, elapsedMs, responseMs);
  const zoom = stepCriticalSpring(
    current.zoom,
    target.zoom,
    velocity.zoom,
    elapsedMs,
    responseMs,
  );
  return {
    velocity: { x: x.velocity, y: y.velocity, zoom: zoom.velocity },
    viewport: { x: x.value, y: y.value, zoom: zoom.value },
  };
}
