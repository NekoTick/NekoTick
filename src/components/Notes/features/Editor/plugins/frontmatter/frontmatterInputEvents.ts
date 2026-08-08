import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export function isFrontmatterInputComposing(
  event: ReactKeyboardEvent<HTMLInputElement>,
): boolean {
  const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent & { keyCode?: number };
  return nativeEvent.isComposing || nativeEvent.keyCode === 229;
}
