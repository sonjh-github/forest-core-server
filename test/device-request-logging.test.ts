import assert from "node:assert/strict";
import test from "node:test";

process.env.DB_MODE = "sqlite";
process.env.SQLITE_PATH = ":memory:";
process.env.SQLITE_SEED_DEMO = "false";

const { deviceRoutes, logDeviceRequest } = await import("../src/device/routes.js");

test("device log uses only allowed metadata and never includes payload", () => {
  const records: string[] = [];
  const previous = console.info;
  console.info = (line: string) => { records.push(line); };
  try {
    logDeviceRequest({
      timestamp: "2026-10-08T00:00:00.000Z", requestId: "test-request",
      vendor: "JININFRA", mode: "DELIVER", durationMs: 1.5,
      status: "ACCEPTED", errorType: null,
    });
  } finally { console.info = previous; }
  assert.equal(records.length, 1);
  assert.deepEqual(Object.keys(JSON.parse(records[0]!)).sort(), [
    "durationMs", "errorType", "event", "mode", "requestId", "status", "timestamp", "vendor",
  ]);
  assert.equal(JSON.parse(records[0]!).status, "ACCEPTED");
});

test("invalid vendor message is rejected and logged without payload", async () => {
  const records: string[] = [];
  const previous = console.info;
  console.info = (line: string) => { records.push(line); };
  try {
    const response = await deviceRoutes.request("/vendor-messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor: "UNKNOWN", mode: "DELIVER", secretPayload: "DO_NOT_LOG" }),
    });
    assert.equal(response.status, 400);
  } finally { console.info = previous; }
  assert.equal(records.length, 1);
  assert.equal(JSON.parse(records[0]!).status, "REJECTED");
  assert.equal(records[0]!.includes("DO_NOT_LOG"), false);
});

const vendorRequest = {
  payloadType: "RTK_LPWA_GATEWAY",
  context: {
    eventExternalId: "LOG-TEST-1",
    sourceSystem: "jininfra",
    occurredAt: "2026-10-08T00:00:00.000Z",
    sourceDeviceId: "GW-LOG",
    reportedByDeviceId: "GW-LOG",
  },
  activePath: [],
  data: {
    gatewayDeviceId: "GW-LOG",
    receivedTerminalDeviceIds: [],
    observedAt: "2026-10-08T00:00:00.000Z",
    operationalStatus: "ONLINE",
  },
};

const mappedDevice = {
  vendorDeviceId: "GW-LOG",
  assetId: "10000000-0000-4000-8000-000000000001",
  mapped: true,
  assetExists: true,
  mappingStatus: "ACTIVE",
};

async function captureVendorLog(body: unknown) {
  const records: string[] = [];
  const original = console.info;
  console.info = (line: string) => { records.push(line); };
  try {
    const response = await deviceRoutes.request("/vendor-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(records.length, 1, "one structured log per request");
    const log = JSON.parse(records[0]!);
    assert.equal(log.event, "device.vendor_message");
    assert.equal(log.vendor, "JININFRA");
    assert.equal(typeof log.durationMs, "number");
    assert.equal(records[0]!.includes("LOG-TEST-1"), false, "request payload must not be logged");
    return { response, log };
  } finally {
    console.info = original;
  }
}

test("DELIVER records ACCEPTED and duplicate replay records DUPLICATE", async () => {
  const requestId = "99999999-9999-4999-8999-999999999999";
  const body = {
    vendor: "JININFRA",
    mode: "DELIVER",
    normalized: true,
    request: vendorRequest,
    mappings: [mappedDevice],
    idempotencyKey: requestId,
  };
  const first = await captureVendorLog(body);
  assert.equal(first.response.status, 200);
  assert.equal(first.log.status, "ACCEPTED");
  assert.equal(first.log.requestId, requestId);
  const second = await captureVendorLog(body);
  assert.equal(second.response.status, 200);
  assert.equal(second.log.status, "DUPLICATE");
  assert.equal(second.log.requestId, requestId);
  assert.equal((await second.response.json()).data.duplicate, true);
});

test("unmapped device records REJECTED without leaking request payload", async () => {
  const result = await captureVendorLog({
    vendor: "JININFRA", mode: "VALIDATE_ONLY", normalized: true,
    request: vendorRequest,
    mappings: [{ ...mappedDevice, mapped: false }],
  });
  assert.equal(result.response.status, 200); // preserve existing API contract
  assert.equal(result.log.status, "REJECTED");
  assert.equal(result.log.errorType, "UNMAPPED_DEVICE");
  assert.equal((await result.response.json()).data.accepted, false);
});
