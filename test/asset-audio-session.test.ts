import assert from "node:assert/strict";
import test from "node:test";
process.env.DB_MODE = "sqlite";
process.env.SQLITE_PATH = ":memory:";
process.env.SQLITE_SEED_DEMO = "false";
const { app } = await import("../src/app.js");
const { localDb } = await import("../src/local-demo/db.js");

test("오디오 세션 등록·수정·해제는 DB에 저장되며 중복과 잘못된 값을 거부한다", async () => {
  const db = localDb();
  db.prepare("INSERT INTO asset_type(asset_type_id,name) VALUES('radio-type','UAV')").run();
  const register = (code: string, audioSession: unknown) => app.request("/api/v1/dashboard/assets", {
    method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({
      assetCode: code, assetTypeId: "radio-type", vendor: "JININFRA", vendorDeviceId: code,
      deviceType: "UAV", specifications: {keep: true}, audioSession,
    }),
  });
  const response = await register("DRONE-01", "03");
  assert.equal(response.status, 201);
  const asset = (await response.json() as {data:Record<string,unknown>}).data;
  const id = String(asset.asset_id);
  assert.equal(asset.audio_session, "03");
  assert.equal(db.prepare("SELECT audio_session FROM asset WHERE asset_id=?").get(id)?.audio_session, "03");
  assert.equal((await register("OTHER", "03")).status, 409);
  const update = (body: object) => app.request(`/api/v1/dashboard/assets/${id}/audio-session`, {
    method: "PUT", headers: {"content-type":"application/json"}, body: JSON.stringify(body),
  });
  assert.equal((await update({audioSession:"01"})).status, 200);
  for (const value of [1, "1", "001", "a1", {}]) assert.equal((await update({audioSession:value})).status, 400);
  assert.equal((await update({})).status, 400);
  const saved = db.prepare("SELECT * FROM asset WHERE asset_id=?").get(id)!;
  assert.equal(saved.audio_session, "01");
  assert.equal(saved.vendor_device_id, "DRONE-01");
  assert.equal(saved.specifications_json, '{"keep":true}');
  assert.equal((await register("OTHER", "01")).status, 409);
  assert.equal((await update({audioSession:null})).status, 200);
  assert.equal(db.prepare("SELECT audio_session FROM asset WHERE asset_id=?").get(id)?.audio_session, null);
  assert.equal((await register("OTHER", "01")).status, 201);
  assert.equal((await app.request('/api/v1/dashboard/assets/missing/audio-session', {method:'PUT',headers:{'content-type':'application/json'},body:'{"audioSession":"02"}'})).status,404);
});
