import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTERNAL_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
} from "../src/external/fetch-with-timeout.js";

test("외부기관 정상 응답을 그대로 반환한다", async (t) => {
  const originalFetch = globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async () =>
    new Response("ok", {
      status: 200,
    })) as typeof fetch;

  const response = await fetchWithTimeout(
    "https://provider.example/data",
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
});

test("제한시간이 지나면 외부기관 요청을 중단한다", async (t) => {
  const originalFetch = globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    return await new Promise<Response>(
      (_resolve, reject) => {
        const signal = init?.signal;

        if (!signal) {
          reject(new Error("AbortSignal missing"));
          return;
        }

        const abort = () => {
          reject(
            new DOMException(
              "The operation was aborted",
              "AbortError",
            ),
          );
        };

        if (signal.aborted) {
          abort();
          return;
        }

        signal.addEventListener(
          "abort",
          abort,
          { once: true },
        );
      },
    );
  }) as typeof fetch;

  await assert.rejects(
    () =>
      fetchWithTimeout(
        "https://provider.example/slow",
        {},
        20,
      ),
    /External provider request timed out after 20ms/,
  );
});

test("외부기관 기본 요청 제한시간은 8초다", () => {
  assert.equal(
    EXTERNAL_REQUEST_TIMEOUT_MS,
    8_000,
  );
});
