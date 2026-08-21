import { lazy } from 'react';
import { retryDynamicImport } from '@/lib/retryDynamicImport';
import type { EditorTopRightToolbarProps } from './EditorTopRightToolbar';

export const EditorTopRightToolbar = lazy(async () => {
  const mod = await retryDynamicImport(() => import('./EditorTopRightToolbar'));
  return {
    default: (props: EditorTopRightToolbarProps) => (
      <mod.EditorTopRightToolbar {...props} />
    ),
  };
});

export const MilkdownEditorRuntime = lazy(async () => {
  const mod = await retryDynamicImport(() => import('./MilkdownEditorInner'));
  return { default: mod.MilkdownEditorRuntime };
});
