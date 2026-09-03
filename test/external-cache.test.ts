import assert from "node:assert/strict";
import test from "node:test";
import { cachedExternal, clearExternalCache } from "../src/external/cache.js";

test("외부 API 정상 응답을 재사용하고 중복 호출을 막는다", async () => {
  clearExternalCache();
  let calls = 0;
  const loader = async () => ({ count: ++calls });
  const first = await cachedExternal("risk", loader, { now: () => 100, ttlMs: 100 });
  const second = await cachedExternal("risk", loader, { now: () => 150, ttlMs: 100 });
  assert.equal(first.cache, "MISS");
  assert.equal(second.cache, "HIT");
  assert.equal(second.value.count, 1);
  assert.equal(calls, 1);
});

test("외부 API 장애 시 유효한 마지막 정상 응답을 반환한다", async () => {
  clearExternalCache();
  await cachedExternal("firms", async () => ({ rows: [1] }), { now: () => 100, ttlMs: 10, staleIfErrorMs: 100 });
  const result = await cachedExternal("firms", async () => { throw new Error("provider unavailable"); }, { now: () => 120, ttlMs: 10, staleIfErrorMs: 100 });
  assert.equal(result.cache, "STALE");
  assert.deepEqual(result.value, { rows: [1] });
});
