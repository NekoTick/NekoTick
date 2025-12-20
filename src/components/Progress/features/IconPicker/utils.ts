import { type Icon as PhosphorIcon } from '@phosphor-icons/react';
import { ALL_ICONS } from './data';

export function getIconByName(name: string): PhosphorIcon | null {
  const found = ALL_ICONS.find(i => i.name === name);
  return found?.icon || null;
}
