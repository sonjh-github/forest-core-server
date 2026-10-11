import assert from "node:assert/strict";
import test from "node:test";

process.env.DB_MODE = "sqlite";
process.env.SQLITE_PATH = ":memory:";
process.env.SQLITE_SEED_DEMO = "false";

const { app } = await import("../src/app.js");

const requestId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeBody(vendor: "JININFRA" | "NDPS") {
  return {
    vendor,
    mode: "DELIVER",
    normalized: true,
    idempotencyKey: requestId,
    mappings: [{
      vendorDeviceId: "GW-PROCESSING",
      assetId: "10000000-0000-4000-8000-000000000001",
      mapped: true,
      assetExists: true,
      mappingStatus: "ACTIVE",
    }],
    request: {
      payloadType: "RTK_LPWA_GATEWAY",
      context: {
        eventExternalId: "PRIVATE-PROCESSING-SENTINEL",
        sourceSystem: "jininfra",
        occurredAt: "2026-10-08T00:00:00.000Z",
        sourceDeviceId: "GW-PROCESSING",
        reportedByDeviceId: "GW-PROCESSING",
      },
      activePath: [],
      data: {
        gatewayDeviceId: "GW-PROCESSING",
        receivedTerminalDeviceIds: [],
        observedAt: "2026-10-08T00:00:00.000Z",
        operationalStatus: "ONLINE",
      },
    },
  };
}

test("cross-vendor idempotency conflict returns safe HTTP error and PROCESSING_FAILED log", async () => {
  const records: string[] = [];
  const originalInfo = console.info;

  console.info = (...args: unknown[]) => {
    records.push(args.map(String).join(" "));
  };

  try {
    const first = await app.request("/internal/v1/vendor-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeBody("JININFRA")),
    });

    assert.equal(first.status, 200);

    const second = await app.request("/internal/v1/vendor-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeBody("NDPS")),
    });

    assert.equal(second.status, 502);

    const responseBody = await second.json() as {
      error?: { code?: string; message?: string };
    };

    assert.equal(responseBody.error?.code, "PROCESSING_FAILURE");
    assert.equal(
      responseBody.error?.message,
      "요청 처리 중 오류가 발생했습니다."
    );

    const logs = records
      .map(line => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(item => item?.event === "device.vendor_message");

    assert.equal(logs.length, 2);

    assert.equal(logs[0]?.status, "ACCEPTED");
    assert.equal(logs[0]?.vendor, "JININFRA");

    assert.equal(logs[1]?.status, "PROCESSING_FAILED");
    assert.equal(logs[1]?.vendor, "NDPS");
    assert.equal(
      logs[1]?.errorType,
      "IDEMPOTENCY_OR_STORAGE_CONFLICT"
    );

    const serializedLogs = JSON.stringify(logs);
    const serializedResponse = JSON.stringify(responseBody);

    assert.equal(
      serializedLogs.includes("PRIVATE-PROCESSING-SENTINEL"),
      false
    );
    assert.equal(
      serializedResponse.includes("PRIVATE-PROCESSING-SENTINEL"),
      false
    );
    assert.equal(
      serializedResponse.includes("Idempotency-Key"),
      false
    );

  } finally {
    console.info = originalInfo;
  }
});
