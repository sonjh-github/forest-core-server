export const EXTERNAL_RESPONSE_CACHE_TTL_MS = 30_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function cachedExternalRequest<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = EXTERNAL_RESPONSE_CACHE_TTL_MS,
): Promise<T> {
  const now = Date.now();

  const existing = cache.get(key) as
    | CacheEntry<T>
    | undefined;

  if (
    existing &&
    existing.expiresAt > now
  ) {
    return existing.value;
  }

  const existingInflight = inflight.get(
    key,
  ) as Promise<T> | undefined;

  if (existingInflight) {
    return existingInflight;
  }

  const request = (async () => {
    try {
      const value = await loader();

      cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });

      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, request);

  return request;
}

export function clearExternalResponseCache(): void {
  cache.clear();
  inflight.clear();
}
