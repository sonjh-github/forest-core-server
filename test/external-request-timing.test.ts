import assert from "node:assert/strict";
import test from "node:test";

import {
  measureExternalFailure,
  measureExternalRequest,
} from "../src/external/request-timing.js";

test("외부기관 정상 요청의 처리시간을 측정한다", async () => {
  const times = [
    Date.parse("2026-09-03T00:00:00.000Z"),
    Date.parse("2026-09-03T00:00:00.125Z"),
  ];

  const result = await measureExternalRequest(
    async () => ({ provider: "test" }),
    () => times.shift()!,
  );

  assert.deepEqual(result.value, {
    provider: "test",
  });

  assert.equal(result.durationMs, 125);
  assert.equal(
    result.startedAt,
    "2026-09-03T00:00:00.000Z",
  );
  assert.equal(
    result.finishedAt,
    "2026-09-03T00:00:00.125Z",
  );
});

test("외부기관 실패 요청도 처리시간과 오류를 보존한다", async () => {
  const times = [
    Date.parse("2026-09-03T00:00:00.000Z"),
    Date.parse("2026-09-03T00:00:00.250Z"),
  ];

  const failure = await measureExternalFailure(
    async () => {
      throw new Error("provider failure");
    },
    () => times.shift()!,
  );

  assert.ok(failure);
  assert.equal(failure.durationMs, 250);
  assert.match(
    String(failure.error),
    /provider failure/,
  );
});

test("성공한 요청은 failure 결과를 만들지 않는다", async () => {
  const failure = await measureExternalFailure(
    async () => "ok",
  );

  assert.equal(failure, null);
});

test("시계 역행 시 durationMs는 0 미만이 되지 않는다", async () => {
  const times = [2_000, 1_000];

  const result = await measureExternalRequest(
    async () => "ok",
    () => times.shift()!,
  );

  assert.equal(result.durationMs, 0);
});
