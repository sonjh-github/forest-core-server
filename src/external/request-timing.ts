export interface TimedExternalResult<T> {
  value: T;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface TimedExternalFailure {
  error: unknown;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export async function measureExternalRequest<T>(
  loader: () => Promise<T>,
  now: () => number = Date.now,
): Promise<TimedExternalResult<T>> {
  const startedMs = now();
  const startedAt = new Date(startedMs).toISOString();

  const value = await loader();

  const finishedMs = now();

  return {
    value,
    startedAt,
    finishedAt: new Date(finishedMs).toISOString(),
    durationMs: Math.max(0, finishedMs - startedMs),
  };
}

export async function measureExternalFailure(
  loader: () => Promise<unknown>,
  now: () => number = Date.now,
): Promise<TimedExternalFailure | null> {
  const startedMs = now();
  const startedAt = new Date(startedMs).toISOString();

  try {
    await loader();
    return null;
  } catch (error) {
    const finishedMs = now();

    return {
      error,
      startedAt,
      finishedAt: new Date(finishedMs).toISOString(),
      durationMs: Math.max(0, finishedMs - startedMs),
    };
  }
}
