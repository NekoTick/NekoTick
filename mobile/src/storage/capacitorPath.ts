const LOGICAL_ROOT = '/vlaina';

export function normalizeCapacitorPath(path: string): string {
  const normalizedInput = path.replace(/\\/g, '/').trim();
  const absoluteInput = normalizedInput.startsWith('/') ? normalizedInput : `/${normalizedInput}`;
  const parts: string[] = [];

  for (const part of absoluteInput.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length <= 1) {
        throw new Error(`Path escapes the mobile data root: ${path}`);
      }
      parts.pop();
      continue;
    }
    if (part.includes('\0')) {
      throw new Error('File paths cannot contain null bytes.');
    }
    parts.push(part);
  }

  const logicalPath = `/${parts.join('/')}`;
  if (logicalPath !== LOGICAL_ROOT && !logicalPath.startsWith(`${LOGICAL_ROOT}/`)) {
    throw new Error(`Path is outside the mobile data root: ${path}`);
  }
  return logicalPath;
}

export function toNativeDataPath(path: string): string {
  return normalizeCapacitorPath(path).slice(1);
}

export function joinCapacitorPath(parent: string, name: string): string {
  return normalizeCapacitorPath(`${parent.replace(/\/+$/, '')}/${name}`);
}

export function getCapacitorParentPath(path: string): string | null {
  const normalized = normalizeCapacitorPath(path);
  if (normalized === LOGICAL_ROOT) return null;
  return normalized.slice(0, normalized.lastIndexOf('/')) || LOGICAL_ROOT;
}

export function getCapacitorBasePath(): string {
  return LOGICAL_ROOT;
}
