import { describe, expect, it } from 'vitest';
import {
  getCapacitorParentPath,
  joinCapacitorPath,
  normalizeCapacitorPath,
  toNativeDataPath,
} from './capacitorPath';

describe('Capacitor storage paths', () => {
  it('normalizes logical paths without exposing native paths', () => {
    expect(normalizeCapacitorPath('/vlaina/notes/./daily/../today.md')).toBe('/vlaina/notes/today.md');
    expect(toNativeDataPath('/vlaina/notes/today.md')).toBe('vlaina/notes/today.md');
    expect(joinCapacitorPath('/vlaina/notes', 'today.md')).toBe('/vlaina/notes/today.md');
    expect(getCapacitorParentPath('/vlaina/notes/today.md')).toBe('/vlaina/notes');
  });

  it.each([
    '/other/file.md',
    '/vlaina/../../private.txt',
    '../vlaina/file.md',
    '/vlaina-file/file.md',
  ])('rejects paths outside the private root: %s', (path) => {
    expect(() => normalizeCapacitorPath(path)).toThrow(/mobile data root/);
  });
});
