import { ghostIconButtonClass } from '@/components/ui/surfaceStyles';

export const noteToolbarIconButtonClassName = [
  'app-no-drag flex h-8 w-8 items-center justify-center',
  'cursor-pointer text-[var(--vlaina-color-titlebar-button)] disabled:cursor-default',
  ghostIconButtonClass,
].join(' ');
