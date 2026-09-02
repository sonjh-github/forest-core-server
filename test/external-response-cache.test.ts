import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTERNAL_RESPONSE_CACHE_TTL_MS,
  cachedExternalRequest,
  clearExternalResponseCache,
} from "../src/external/response-cache.js";

test("동일한 외부기관 요청은 TTL 안에서 캐시를 사용한다", async () => {
  clearExternalResponseCache();

  let calls = 0;

  const loader = async () => {
    calls += 1;
    return { calls };
  };

  const first = await cachedExternalRequest(
    "provider:test",
    loader,
    1_000,
  );

  const second = await cachedExternalRequest(
    "provider:test",
    loader,
    1_000,
  );

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
});

test("서로 다른 cache key는 별도로 조회한다", async () => {
  clearExternalResponseCache();

  let calls = 0;

  const loader = async () => {
    calls += 1;
    return calls;
  };

  await cachedExternalRequest("provider:a", loader);
  await cachedExternalRequest("provider:b", loader);

  assert.equal(calls, 2);
});

test("loader 실패 결과는 캐시하지 않는다", async () => {
  clearExternalResponseCache();

  let calls = 0;

  const loader = async () => {
    calls += 1;

    if (calls === 1) {
      throw new Error("provider failure");
    }

    return "recovered";
  };

  await assert.rejects(
    () =>
      cachedExternalRequest(
        "provider:failure",
        loader,
      ),
    /provider failure/,
  );

  const recovered = await cachedExternalRequest(
    "provider:failure",
    loader,
  );

  assert.equal(recovered, "recovered");
  assert.equal(calls, 2);
});

test("외부기관 기본 캐시 TTL은 30초다", () => {
  assert.equal(
    EXTERNAL_RESPONSE_CACHE_TTL_MS,
    30_000,
  );
});

test("TTL이 지나면 외부기관 데이터를 다시 조회한다", async () => {
  clearExternalResponseCache();

  const originalDateNow = Date.now;
  let now = 1_000;

  Date.now = () => now;

  try {
    let calls = 0;

    const loader = async () => {
      calls += 1;
      return calls;
    };

    const first = await cachedExternalRequest(
      "provider:expiry",
      loader,
      100,
    );

    now = 1_050;

    const cached = await cachedExternalRequest(
      "provider:expiry",
      loader,
      100,
    );

    now = 1_101;

    const refreshed = await cachedExternalRequest(
      "provider:expiry",
      loader,
      100,
    );

    assert.equal(first, 1);
    assert.equal(cached, 1);
    assert.equal(refreshed, 2);
    assert.equal(calls, 2);
  } finally {
    Date.now = originalDateNow;
    clearExternalResponseCache();
  }
});
