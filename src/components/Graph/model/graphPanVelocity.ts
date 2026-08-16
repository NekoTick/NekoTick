import { themeGraphTokens } from '@/styles/themeTokens';

export interface GraphPanVelocity {
  hasSample: boolean;
  lastClientX: number;
  lastClientY: number;
  lastEventAt: number;
  x: number;
  y: number;
}

export function createGraphPanVelocity(
  clientX: number,
  clientY: number,
  eventAt: number,
): GraphPanVelocity {
  return {
    hasSample: false,
    lastClientX: clientX,
    lastClientY: clientY,
    lastEventAt: eventAt,
    x: 0,
    y: 0,
  };
}

export function sampleGraphPanVelocity(
  current: GraphPanVelocity,
  clientX: number,
  clientY: number,
  eventAt: number,
): GraphPanVelocity {
  const elapsed = eventAt - current.lastEventAt;
  if (elapsed <= 0) return current;
  if (elapsed > themeGraphTokens.panVelocitySampleMaxAgeMs) {
    return createGraphPanVelocity(clientX, clientY, eventAt);
  }
  const blend = current.hasSample
    ? 1 - Math.exp(-elapsed / themeGraphTokens.panVelocitySmoothingTimeMs)
    : 1;
  const sampleX = (clientX - current.lastClientX) / elapsed;
  const sampleY = (clientY - current.lastClientY) / elapsed;
  return {
    hasSample: true,
    lastClientX: clientX,
    lastClientY: clientY,
    lastEventAt: eventAt,
    x: current.x + (sampleX - current.x) * blend,
    y: current.y + (sampleY - current.y) * blend,
  };
}

export function getCurrentGraphPanVelocity(
  velocity: GraphPanVelocity,
  eventAt: number,
) {
  const age = eventAt - velocity.lastEventAt;
  return age >= 0 && age <= themeGraphTokens.panVelocitySampleMaxAgeMs
    ? { x: velocity.x, y: velocity.y }
    : { x: 0, y: 0 };
}
