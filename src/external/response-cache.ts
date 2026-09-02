export const EXTERNAL_RESPONSE_CACHE_TTL_MS = 30_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export async function cachedExternalRequest<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = EXTERNAL_RESPONSE_CACHE_TTL_MS,
): Promise<T> {
  const now = Date.now();

  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  const value = await loader();

  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });

  return value;
}

export function clearExternalResponseCache(): void {
  cache.clear();
}
