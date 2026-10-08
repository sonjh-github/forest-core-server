import assert from "node:assert/strict";
import test from "node:test";

process.env.DB_MODE = "sqlite";
process.env.SQLITE_PATH = ":memory:";
process.env.SQLITE_SEED_DEMO = "false";

const { localDb } = await import("../src/local-demo/db.js");
const { app } = await import("../src/app.js");

test("SQLite storage failure returns safe HTTP error and STORAGE_FAILED log", async () => {
  const db = localDb();

  // This process uses a dedicated in-memory SQLite database.
  db.exec("DROP TABLE vendor_message");

  const logs: string[] = [];
  const previousInfo = console.info;
  console.info = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    const response = await app.request("/internal/v1/vendor-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendor: "JININFRA",
        mode: "DELIVER",
        normalized: true,
        idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        mappings: [{
          vendorDeviceId: "GW-STORAGE-FAIL",
          assetId: "10000000-0000-4000-8000-000000000001",
          mapped: true,
          assetExists: true,
          mappingStatus: "ACTIVE"
        }],
        request: {
          payloadType: "RTK_LPWA_GATEWAY",
          context: {
            eventExternalId: "PRIVATE-EVENT-SENTINEL",
            sourceSystem: "jininfra",
            occurredAt: "2026-10-08T00:00:00.000Z",
            sourceDeviceId: "GW-STORAGE-FAIL",
            reportedByDeviceId: "GW-STORAGE-FAIL"
          },
          activePath: [],
          data: {
            gatewayDeviceId: "GW-STORAGE-FAIL",
            receivedTerminalDeviceIds: [],
            observedAt: "2026-10-08T00:00:00.000Z",
            operationalStatus: "ONLINE"
          }
        }
      })
    });

    const body = await response.json() as {
      error?: { code?: string; message?: string };
    };

    assert.equal(response.status, 502);
    assert.equal(body.error?.code, "PROCESSING_FAILURE");
    assert.equal(body.error?.message, "요청 처리 중 오류가 발생했습니다.");
    assert.equal(JSON.stringify(body).includes("vendor_message"), false);

    const entries = logs
      .map(line => {
        try { return JSON.parse(line) as Record<string, unknown>; }
        catch { return null; }
      })
      .filter(entry => entry?.event === "device.vendor_message");

    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.status, "STORAGE_FAILED");
    assert.equal(entries[0]?.vendor, "JININFRA");
    assert.equal(entries[0]?.mode, "DELIVER");
    assert.equal(
      JSON.stringify(entries).includes("PRIVATE-EVENT-SENTINEL"),
      false
    );
  } finally {
    console.info = previousInfo;
  }
});
