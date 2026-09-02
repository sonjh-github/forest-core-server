export const EXTERNAL_REQUEST_TIMEOUT_MS = 8_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = EXTERNAL_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `External provider request timed out after ${timeoutMs}ms`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}
