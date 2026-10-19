import assert from "node:assert/strict";
import test from "node:test";
process.env.DB_MODE="sqlite";
process.env.SQLITE_PATH=":memory:";
const {rtkRoutes,mapRtkPacket,rtkReceptionState}=await import("../src/dashboard/rtk-packets.js");
const {localDb}=await import("../src/local-demo/db.js");

test("RTK Fix와 좌표 유효성을 분리하고 0·음수·원문을 보존한다",()=>{
  const row={request_id:"packet",occurred_at:"2026-10-19T00:00:00Z",received_at:"2026-10-19T00:00:03Z",status:"PERSISTED",
    payload:{context:{},data:{latitude:37.4,longitude:127.1,altitude:0,frameCounter:0,fixType:"FIX_NOT_AVAILABLE"},activePath:[{observations:[{rssiDbm:-112,snrDb:-9.8,selected:true}]}]}};
  const packet=mapRtkPacket(row);
  assert.equal(packet.fixState,"NO_FIX");assert.equal(packet.coordinateState,"UNCONFIRMED");
  assert.equal(packet.altitude,0);assert.equal(packet.frameCounter,0);assert.equal(packet.snrDb,-9.8);assert.equal(packet.rssiDbm,-112);assert.equal(packet.delayMs,3000);
  assert.deepEqual(packet.payload,row.payload);
  for(const [data,expected] of [[{latitude:0,longitude:0,fixType:"RTK_FIXED"},"ZERO"],[{latitude:null,longitude:0},"MISSING"],[{latitude:91,longitude:127},"INVALID"],[{latitude:37,longitude:127,fixType:"mystery"},"UNCONFIRMED"],[{latitude:37,longitude:127,fixType:"RTK_FIXED"},"VALID"]] as const){
    assert.equal(mapRtkPacket({...row,payload:{data}}).coordinateState,expected);
  }
});

test("수신 상태는 장비 관측 시각과 구분해 서버 수신 시각으로 판정한다",()=>{
  const now=Date.parse("2026-10-19T00:03:00Z");
  assert.equal(rtkReceptionState(null,now),"WAITING");
  assert.equal(rtkReceptionState(new Date(now-30_000).toISOString(),now),"RECEIVING");
  assert.equal(rtkReceptionState(new Date(now-30_001).toISOString(),now),"DELAYED");
  assert.equal(rtkReceptionState(new Date(now-120_001).toISOString(),now),"NO_RECENT_RECEPTION");
});

test("선택 장비의 RTK 위치 패킷만 최신 수신 순서로 정확히 100개 반환한다",async()=>{
  const db=localDb();
  db.prepare("INSERT INTO asset_type(asset_type_id,name) VALUES('rtk-type','RTK_TERMINAL')").run();
  for(const id of ["device-a","device-b"]) db.prepare(`INSERT INTO asset(asset_id,asset_type_id,asset_code,status,vendor_code,created_at,updated_at) VALUES(?,'rtk-type',?,'READY','JININFRA','2026-10-19','2026-10-19')`).run(id,id);
  const insert=db.prepare("INSERT INTO vendor_message(request_id,vendor_code,payload_type,source_device_id,occurred_at,received_at,status,payload_json) VALUES(?,'JININFRA',?,?,?,'2026-10-19T00:00:00Z','PERSISTED',?)");
  for(let i=0;i<110;i++) insert.run('a-'+i,'RTK_POSITION','device-a','2026-10-18T00:00:00Z',JSON.stringify({data:{frameCounter:i,latitude:0,longitude:0,fixType:'FIX_NOT_AVAILABLE'}}));
  for(let i=0;i<150;i++) insert.run('b-'+i,'RTK_POSITION','device-b','2026-10-19T00:00:00Z','{}');
  insert.run('other-type','DEVICE_STATUS','device-a','2026-10-19T00:00:00Z','{}');
  const response=await rtkRoutes.request('/packets?assetId=device-a');
  assert.equal(response.status,200);
  const {data}=await response.json() as any;
  assert.equal(data.packets.length,100);assert.equal(data.packets[0].frameCounter,109);assert.equal(data.packets[99].frameCounter,10);
  assert.equal(data.summary.zero,100);assert.equal(data.summary.noFix,100);assert.equal(data.summary.confirmed,0);
  assert.equal((await rtkRoutes.request('/packets?assetId=missing')).status,404);
});
