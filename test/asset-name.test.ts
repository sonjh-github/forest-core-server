import assert from "node:assert/strict";
import test from "node:test";
process.env.DB_MODE = "sqlite";
process.env.SQLITE_PATH = ":memory:";
process.env.SQLITE_SEED_DEMO = "false";
const { app } = await import("../src/app.js");
const { localDb } = await import("../src/local-demo/db.js");

test("표시 이름 수정·초기화는 장비 ID와 업체 연결을 보존한다", async () => {
  const db = localDb();
  const id = "20000000-0000-4000-8000-000000000001";
  db.prepare("INSERT INTO asset_type(asset_type_id,name) VALUES('type','COMMAND_VEHICLE')").run();
  db.prepare("INSERT INTO asset(asset_id,asset_type_id,asset_code,status,vendor_code,vendor_device_id,mapping_status,created_at,updated_at) VALUES(?,'type','CAR-01','READY','JININFRA','CAR-01','ACTIVE','before','before')").run(id);
  const update = (assetName: unknown) => app.request(`/api/v1/dashboard/assets/${id}/name`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetName, assetCode: "MUST-NOT-CHANGE" }),
  });
  const response = await update("  지휘차량 1호  ");
  assert.equal(response.status, 200);
  const saved = (await response.json() as {data: Record<string, unknown>}).data;
  assert.equal(saved.asset_name, "지휘차량 1호");
  assert.equal(saved.asset_code, "CAR-01");
  assert.equal(db.prepare("SELECT vendor_device_id FROM asset WHERE asset_id=?").get(id)?.vendor_device_id, "CAR-01");
  assert.equal((await update({})).status, 400);
  assert.equal((await update("가".repeat(81))).status, 400);
  assert.equal((await update(null)).status, 200);
  assert.equal(db.prepare("SELECT asset_name FROM asset WHERE asset_id=?").get(id)?.asset_name, null);
  assert.equal((await app.request('/api/v1/dashboard/assets/missing/name', { method: 'PUT', headers: {'content-type':'application/json'}, body: JSON.stringify({assetName:'이름'}) })).status, 404);
});
