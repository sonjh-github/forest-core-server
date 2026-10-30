import assert from "node:assert/strict";
import test from "node:test";

process.env.DB_MODE = "sqlite";
process.env.SQLITE_PATH = ":memory:";
process.env.SQLITE_SEED_DEMO = "false";

const { app } = await import("../src/app.js");
const { localDb } = await import("../src/local-demo/db.js");

test("SQLite vendor health reads registered devices and the latest persisted message", async () => {
  const db = localDb();
  const assetTypeId = "40000000-0000-4000-8000-000000000001";
  const assetId = "20000000-0000-4000-8000-000000000001";
  const receivedAt = "2026-10-30T02:30:00.000Z";

  db.prepare("INSERT INTO asset_type(asset_type_id,name) VALUES(?,?)")
    .run(assetTypeId, "RTK_LPWA_GATEWAY");
  db.prepare(`
    INSERT INTO asset(
      asset_id, asset_type_id, asset_code, asset_name, status,
      vendor_code, vendor_device_id, device_type, mapping_status,
      created_at, updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    assetId, assetTypeId, "JIN-GW-001", "진인프라 게이트웨이", "ACTIVE",
    "JININFRA", "JIN-GW-001", "RTK_LPWA_GATEWAY", "ACTIVE",
    receivedAt, receivedAt,
  );
  db.prepare(`
    INSERT INTO vendor_message(
      request_id, vendor_code, event_external_id, payload_type,
      source_device_id, occurred_at, received_at, status, payload_json
    ) VALUES(?,?,?,?,?,?,?,?,?)
  `).run(
    "50000000-0000-4000-8000-000000000001", "JININFRA", null, "LPWA_STATUS",
    assetId, receivedAt, receivedAt, "PERSISTED", "{}",
  );

  const response = await app.request("/internal/v1/vendors/JININFRA/health");
  assert.equal(response.status, 200);
  const body = await response.json() as { data: {
    diagnosticStatus: string;
    databaseStatus: string;
    registeredDevices: number;
    lastReceivedAt: string;
    lastPersistedAt: string;
    devices: Array<{ vendor_device_id: string; last_seen_at: string }>;
  } };

  assert.equal(body.data.diagnosticStatus, "HEALTHY");
  assert.equal(body.data.databaseStatus, "REACHABLE");
  assert.equal(body.data.registeredDevices, 1);
  assert.equal(body.data.lastReceivedAt, receivedAt);
  assert.equal(body.data.lastPersistedAt, receivedAt);
  assert.equal(body.data.devices[0]?.vendor_device_id, "JIN-GW-001");
  assert.equal(body.data.devices[0]?.last_seen_at, null);
});

test("SQLite vendor health returns INCOMPLETE instead of failing when no message exists", async () => {
  const response = await app.request("/internal/v1/vendors/NDPS/health");
  assert.equal(response.status, 200);
  const body = await response.json() as { data: {
    diagnosticStatus: string;
    registeredDevices: number;
    lastReceivedAt: null;
  } };

  assert.equal(body.data.diagnosticStatus, "INCOMPLETE");
  assert.equal(body.data.registeredDevices, 0);
  assert.equal(body.data.lastReceivedAt, null);
});
