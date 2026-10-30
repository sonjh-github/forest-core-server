import assert from "node:assert/strict";
import test from "node:test";

process.env.DB_MODE = "sqlite";
process.env.SQLITE_PATH = ":memory:";
process.env.SQLITE_SEED_DEMO = "false";

const { app } = await import("../src/app.js");

test("Vendor 요청 로그를 SQLite에 저장하고 대시보드 API에서 조회한다", async () => {
  const entry = {
    timestamp: "2026-10-30 12:00:00.000",
    method: "POST",
    url: "https://device.forest.tobeunicorn.kr/jininfra/invoke?mode=DELIVER",
    status: 200,
    "구분": "DELIVER",
    durationMs: 37,
    "user-agent": "VENDOR-LOG-TEST",
    "request.body": { payloadType: "RTK_POSITION" },
    "response.body": { data: { accepted: true } },
  };

  const stored = await app.request("/internal/v1/vendor-request-logs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry),
  });
  assert.equal(stored.status, 201);

  const response = await app.request("/api/v1/dashboard/vendor-request-logs?limit=10");
  assert.equal(response.status, 200);
  const body = await response.json() as { data: Array<Record<string, unknown>> };
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0]?.category, "DELIVER");
  assert.equal(body.data[0]?.user_agent, "VENDOR-LOG-TEST");
  assert.deepEqual(body.data[0]?.request_body, entry["request.body"]);
  assert.deepEqual(body.data[0]?.response_body, entry["response.body"]);
});

test("잘못된 Vendor 요청 로그는 저장하지 않는다", async () => {
  const response = await app.request("/internal/v1/vendor-request-logs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method: "POST" }),
  });
  assert.equal(response.status, 400);
});
