type CacheEntry<T> = {
  value?: T;
  freshUntil: number;
  staleUntil: number;
  pending?: Promise<T>;
};

const entries = new Map<string, CacheEntry<unknown>>();

export async function cachedExternal<T>(
  key: string,
  loader: () => Promise<T>,
  options: { ttlMs?: number; staleIfErrorMs?: number; now?: () => number } = {},
): Promise<{ value: T; cache: "HIT" | "MISS" | "STALE" }> {
  const now = (options.now ?? Date.now)();
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const staleIfErrorMs = options.staleIfErrorMs ?? 60 * 60_000;
  const current = entries.get(key) as CacheEntry<T> | undefined;
  if (current?.value !== undefined && now < current.freshUntil) return { value: current.value, cache: "HIT" };
  if (current?.pending) return { value: await current.pending, cache: "HIT" };

  const pending = loader();
  const entry: CacheEntry<T> = current ?? { freshUntil: 0, staleUntil: 0 };
  entry.pending = pending;
  entries.set(key, entry);
  try {
    const value = await pending;
    entries.set(key, { value, freshUntil: now + ttlMs, staleUntil: now + ttlMs + staleIfErrorMs });
    return { value, cache: "MISS" };
  } catch (error) {
    entry.pending = undefined;
    if (entry.value !== undefined && now < entry.staleUntil) return { value: entry.value, cache: "STALE" };
    entries.delete(key);
    throw error;
  }
}

export function clearExternalCache() {
  entries.clear();
}
