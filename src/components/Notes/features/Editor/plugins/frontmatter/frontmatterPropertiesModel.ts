import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Document,
  type Scalar,
  YAMLMap,
} from 'yaml';
import { isManagedFrontmatterKey } from './frontmatterMarkdown';

export type FrontmatterListValue = string | number | boolean | null;

export type FrontmatterProperty = {
  key: string;
} & (
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'list'; value: FrontmatterListValue[] }
  | { kind: 'complex'; value: string }
);

export type FrontmatterPropertiesResult =
  | { valid: true; properties: FrontmatterProperty[] }
  | { valid: false; properties: [] };

function parseMapping(rawText: string): Document | null {
  try {
    const document = parseDocument(rawText || '{}', { keepSourceTokens: true });
    if (document.errors.length > 0) {
      return null;
    }
    if (document.contents == null) document.contents = new YAMLMap();
    if (!isMap(document.contents)) return null;
    return document;
  } catch {
    return null;
  }
}

function scalarValue(value: unknown): FrontmatterListValue | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      return undefined;
    }
    return value;
  }
  if (typeof value === 'string' || typeof value === 'boolean' || value === null) return value;
  return undefined;
}

function serializeDocument(document: Document): string {
  const result = document.toString({ lineWidth: 0 }).replace(/\n$/, '');
  return result === '{}' ? '' : result;
}

function complexValue(value: unknown): string {
  if (isScalar(value)) {
    return typeof value.source === 'string'
      ? value.source
      : String(value.value ?? 'null');
  }

  try {
    const jsonValue = value && typeof value === 'object' && 'toJSON' in value
      ? (value as { toJSON: () => unknown }).toJSON()
      : null;
    return JSON.stringify(jsonValue) ?? String(jsonValue);
  } catch {
    return String(value ?? 'YAML');
  }
}

export function readFrontmatterProperties(rawText: string): FrontmatterPropertiesResult {
  const document = parseMapping(rawText);
  if (!document || !isMap(document.contents)) {
    return { valid: false, properties: [] };
  }

  try {
    const properties: FrontmatterProperty[] = [];
    for (const pair of document.contents.items) {
      if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
        return { valid: false, properties: [] };
      }

      const key = pair.key.value;
      if (isScalar(pair.value)) {
        const value = scalarValue(pair.value.value);
        if (typeof value === 'boolean') {
          properties.push({ key, kind: 'boolean', value });
        } else if (typeof value === 'number') {
          properties.push({ key, kind: 'number', value });
        } else if (typeof value === 'string') {
          properties.push({ key, kind: 'text', value });
        } else {
          properties.push({ key, kind: 'complex', value: complexValue(pair.value) });
        }
        continue;
      }

      if (isSeq(pair.value)) {
        const values = pair.value.items.map((item) => isScalar(item) ? scalarValue(item.value) : undefined);
        if (values.every((value) => value !== undefined)) {
          properties.push({ key, kind: 'list', value: values as FrontmatterListValue[] });
          continue;
        }
      }

      properties.push({ key, kind: 'complex', value: complexValue(pair.value) });
    }

    return { valid: true, properties };
  } catch {
    return { valid: false, properties: [] };
  }
}

function updateDocument(
  rawText: string,
  update: (document: Document) => void,
): string | null {
  const document = parseMapping(rawText);
  if (!document || !isMap(document.contents)) {
    return null;
  }
  try {
    update(document);
    return serializeDocument(document);
  } catch {
    return null;
  }
}

export function addFrontmatterProperty(rawText: string, key: string): string | null {
  const nextKey = key.trim();
  if (!nextKey || isManagedFrontmatterKey(nextKey)) return null;
  const document = parseMapping(rawText);
  if (!document || !isMap(document.contents)) return null;
  if (document.has(nextKey)) return rawText;
  try {
    document.set(nextKey, '');
    return serializeDocument(document);
  } catch {
    return null;
  }
}

export function deleteFrontmatterProperty(rawText: string, key: string): string | null {
  return updateDocument(rawText, (document) => {
    document.delete(key);
  });
}

export function renameFrontmatterProperty(
  rawText: string,
  previousKey: string,
  nextKey: string,
): string | null {
  const normalizedKey = nextKey.trim();
  if (!normalizedKey || isManagedFrontmatterKey(normalizedKey)) return null;
  if (normalizedKey === previousKey) return rawText;

  const document = parseMapping(rawText);
  if (!document || !isMap(document.contents) || document.has(normalizedKey)) return null;
  const pair = document.contents.items.find(
    (item) => isScalar(item.key) && item.key.value === previousKey,
  );
  if (!pair || !isScalar(pair.key)) return null;

  try {
    (pair.key as Scalar).value = normalizedKey;
    return serializeDocument(document);
  } catch {
    return null;
  }
}

export function setFrontmatterPropertyValue(
  rawText: string,
  key: string,
  value: string | number | boolean,
): string | null {
  return updateDocument(rawText, (document) => {
    document.set(key, value);
  });
}

export function setFrontmatterPropertyList(
  rawText: string,
  key: string,
  firstValue: string,
): string | null {
  const nextValue = firstValue.trim();
  return updateDocument(rawText, (document) => {
    document.set(key, nextValue ? [nextValue] : []);
  });
}

export function appendFrontmatterListValue(
  rawText: string,
  key: string,
  value: string,
): string | null {
  const nextValue = value.trim();
  if (!nextValue) return null;
  return updateDocument(rawText, (document) => {
    const sequence = document.get(key, true);
    if (isSeq(sequence)) {
      if (sequence.items.length === 0) sequence.flow = false;
      sequence.add(nextValue);
    }
  });
}

export function removeFrontmatterListValue(
  rawText: string,
  key: string,
  index: number,
): string | null {
  return updateDocument(rawText, (document) => {
    const sequence = document.get(key, true);
    if (isSeq(sequence)) sequence.delete(index);
  });
}
