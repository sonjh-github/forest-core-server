import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
process.env.DB_MODE="sqlite";
process.env.SQLITE_PATH=":memory:";
const {AvailabilityStore,availabilitySummary}=await import("../src/dashboard/network-availability.js");

test("시간 기반 가용률은 준비·실패·복구·중지를 누적하고 재시작 공백을 측정에 넣지 않는다",()=>{
  const db=new DatabaseSync(":memory:");const store=new AvailabilityStore(db);
  store.start("TVWS",null,"video",0);
  store.observe("video",true,1000);
  store.observe("video",false,4000);
  store.observe("video",true,6000);
  const finished=availabilitySummary(store.stop("video",10000))!;
  assert.equal(finished.totalMs,10000);assert.equal(finished.downMs,3000);assert.equal(finished.upMs,7000);assert.equal(finished.availabilityPercent,70);
  assert.deepEqual(availabilitySummary(store.stop("video",20000)),finished);
  store.start("TVWS",null,"interrupted",20000);store.observe("interrupted",true,21000);
  const restored=new AvailabilityStore(db);
  assert.equal(restored.get("interrupted")?.endedAt,21000);
  assert.equal(availabilitySummary(restored.get("interrupted"))?.totalMs,1000);
  db.close();
});

test("LPWA는 기존·중복 FCnt를 새 수신으로 인정하지 않고 새 번호가 6초 없으면 중단한다",()=>{
  const db=new DatabaseSync(":memory:");const store=new AvailabilityStore(db);
  store.start("LPWA","rtk","lpwa",10000,412);
  assert.equal(store.observe("lpwa",true,11000,412,11000)?.state,"DOWN");
  assert.equal(store.observe("lpwa",true,12000,413,12000)?.state,"UP");
  assert.equal(store.observe("lpwa",true,17999,413,17999)?.state,"UP");
  assert.equal(store.observe("lpwa",true,18000,413,18000)?.state,"DOWN");
  assert.equal(store.observe("lpwa",true,19000,414,19000)?.state,"UP");
  assert.equal(store.observe("lpwa",false,20000,415,20000)?.state,"DOWN");
  assert.equal(store.get("lpwa")?.lastProgressAt,19000);
  db.close();
});


test("LPWA 측정은 실재 등록 단말만 시작하고 중복 시작·중지를 안전하게 처리한다",async()=>{
  const {availabilityRoutes}=await import("../src/dashboard/network-availability.js");
  const {localDb}=await import("../src/local-demo/db.js");
  const db=localDb();
  db.prepare("INSERT INTO asset_type(asset_type_id,name) VALUES('lpwa-type','RTK_TERMINAL')").run();
  db.prepare("INSERT INTO asset(asset_id,asset_type_id,asset_code,status,vendor_code,created_at,updated_at) VALUES('lpwa-asset','lpwa-type','RTK-TEST','READY','JININFRA','2026-10-26','2026-10-26')").run();
  assert.equal((await availabilityRoutes.request('/lpwa/missing/start',{method:'POST'})).status,404);
  const first=await (await availabilityRoutes.request('/lpwa/lpwa-asset/start',{method:'POST'})).json() as any;
  const second=await (await availabilityRoutes.request('/lpwa/lpwa-asset/start',{method:'POST'})).json() as any;
  assert.equal(first.data.id,second.data.id);assert.equal(first.data.availabilityPercent,null);
  const ended=await (await availabilityRoutes.request('/lpwa/lpwa-asset/stop',{method:'POST'})).json() as any;
  assert.ok(ended.data.endedAt);
  const loaded=await (await availabilityRoutes.request('/lpwa/lpwa-asset')).json() as any;
  assert.deepEqual(loaded.data,ended.data);
});
