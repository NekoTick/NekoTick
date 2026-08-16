import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { createStrokePoint, type WhiteboardDrawingTool, type WhiteboardPoint, type WhiteboardStrokePoint } from '@/components/Whiteboard/model/core/whiteboardModel';

export interface WhiteboardStrokeInputSample {
  azimuth?: number;
  point: WhiteboardPoint;
  pointerType: string;
  pressure: number;
  rotation?: number;
  screenPoint?: WhiteboardPoint;
  tilt?: number;
  timeStamp: number;
}

export interface WhiteboardStrokeInputState {
  azimuth?: number;
  point: WhiteboardPoint;
  pressure: number;
  rotation?: number;
  tilt: number;
  timeStamp: number;
  velocity: number;
}

export function createResponsiveStrokePoints(
  tool: WhiteboardDrawingTool,
  samples: WhiteboardStrokeInputSample[],
  initialState: WhiteboardStrokeInputState | null,
): { points: WhiteboardStrokePoint[]; state: WhiteboardStrokeInputState | null } {
  let state = initialState;
  const points = samples.map((sample) => {
    const elapsed = state ? Math.max(1, sample.timeStamp - state.timeStamp) : 0;
    const speedPoint = sample.screenPoint ?? sample.point;
    const targetVelocity = state
      ? Math.hypot(speedPoint.x - state.point.x, speedPoint.y - state.point.y) / elapsed
      : 0;
    const smoothing = state ? getPressureSmoothing(tool, elapsed) : 1;
    const velocity = state
      ? state.velocity + (targetVelocity - state.velocity) * smoothing
      : targetVelocity;
    const targetPressure = sample.pointerType === 'pen'
      ? createStrokePoint(sample.point, sample.pressure).pressure
      : getMousePressure(tool, velocity, state);
    const pressure = state
      ? state.pressure + (targetPressure - state.pressure) * smoothing
      : targetPressure;
    const tilt = state
      ? state.tilt + ((sample.tilt ?? state.tilt) - state.tilt) * smoothing
      : sample.tilt ?? 0;
    const azimuth = smoothOptionalAngle(state?.azimuth, sample.azimuth, smoothing);
    const rotation = smoothOptionalAngle(state?.rotation, sample.rotation, smoothing);
    const point = createStrokePoint(sample.point, pressure, { azimuth, rotation, tilt, velocity });
    state = {
      ...(azimuth !== undefined ? { azimuth } : {}),
      point: speedPoint,
      pressure: point.pressure,
      ...(rotation !== undefined ? { rotation } : {}),
      tilt,
      timeStamp: sample.timeStamp,
      velocity,
    };
    return point;
  });
  return { points, state };
}

function getMousePressure(
  tool: WhiteboardDrawingTool,
  velocity: number,
  previous: WhiteboardStrokeInputState | null,
): number {
  if (!previous) return themeWhiteboardTokens.defaultPointerPressure;
  const speedRatio = Math.min(1, velocity / themeWhiteboardTokens.mousePressureSpeedPxPerMs);
  const range = themeWhiteboardTokens.mousePressureRange[tool];
  return range.max - (range.max - range.min) * speedRatio;
}

function getPressureSmoothing(tool: WhiteboardDrawingTool, elapsed: number): number {
  const frameRatio = Math.max(1, elapsed) / (1000 / 60);
  return 1 - Math.pow(1 - themeWhiteboardTokens.pointerPressureSmoothing[tool], frameRatio);
}

function smoothOptionalAngle(
  previous: number | undefined,
  target: number | undefined,
  smoothing: number,
): number | undefined {
  if (target === undefined) return previous;
  if (previous === undefined) return target;
  const delta = Math.atan2(Math.sin(target - previous), Math.cos(target - previous));
  return previous + delta * smoothing;
}
