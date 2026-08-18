export function touchCacheEntry<Key, Value>(
  cache: Map<Key, Value>,
  key: Key,
): Value | undefined {
  const cached = cache.get(key);
  if (cached === undefined) {
    return undefined;
  }

  cache.delete(key);
  cache.set(key, cached);
  return cached;
}

export function setCacheEntry<Key, Value>(
  cache: Map<Key, Value>,
  key: Key,
  value: Value,
  limit: number,
): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= limit) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }

  cache.set(key, value);
}
