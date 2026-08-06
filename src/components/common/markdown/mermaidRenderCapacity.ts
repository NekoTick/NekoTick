type MermaidRenderDeviceCapacity = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
};

const LOW_CAPACITY_MERMAID_RENDER_CONCURRENCY = 4;
const HIGH_CAPACITY_MERMAID_RENDER_CONCURRENCY = 5;

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function resolveMermaidRenderConcurrency(
  capacity: MermaidRenderDeviceCapacity,
): number {
  const { deviceMemory, hardwareConcurrency } = capacity;
  const hasDeviceMemory = isPositiveFiniteNumber(deviceMemory);
  const hasHardwareConcurrency = isPositiveFiniteNumber(hardwareConcurrency);

  if (!hasDeviceMemory && !hasHardwareConcurrency) {
    return LOW_CAPACITY_MERMAID_RENDER_CONCURRENCY;
  }
  if (
    (hasDeviceMemory && deviceMemory <= 4) ||
    (hasHardwareConcurrency && hardwareConcurrency <= 4)
  ) {
    return LOW_CAPACITY_MERMAID_RENDER_CONCURRENCY;
  }
  return HIGH_CAPACITY_MERMAID_RENDER_CONCURRENCY;
}

function getMermaidRenderDeviceCapacity(): MermaidRenderDeviceCapacity {
  if (typeof navigator === 'undefined') return {};
  const deviceNavigator = navigator as Navigator & { deviceMemory?: number };
  return {
    deviceMemory: deviceNavigator.deviceMemory,
    hardwareConcurrency: deviceNavigator.hardwareConcurrency,
  };
}

export const MAX_CONCURRENT_MERMAID_RENDERS = resolveMermaidRenderConcurrency(
  getMermaidRenderDeviceCapacity(),
);
