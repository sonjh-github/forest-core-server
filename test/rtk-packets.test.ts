import assert from "node:assert/strict";
import test from "node:test";
process.env.DB_MODE="sqlite";
process.env.SQLITE_PATH=":memory:";
const {rtkRoutes,mapRtkPacket,rtkReceptionState,rtkDeliverySummary}=await import("../src/dashboard/rtk-packets.js");
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
  assert.equal(data.sharingComparison.baseline.frameCounter,9);
  assert.equal(data.sharingComparison.latest.frameCounter,109);
  assert.equal(data.sharingWindow.expectedCount,100);
  assert.equal(data.sharingWindow.missingCount,0);
  assert.equal(data.summary.zero,100);assert.equal(data.summary.noFix,100);assert.equal(data.summary.confirmed,0);
  assert.equal((await rtkRoutes.request('/packets?assetId=missing')).status,404);
});


test("최근 100건이 동일 번호이면 과거 수신 번호가 많아도 성공률을 만들지 않는다",async()=>{
  const db=localDb();
  db.prepare("INSERT INTO asset(asset_id,asset_type_id,asset_code,status,vendor_code,created_at,updated_at) VALUES('window-device','rtk-type','WINDOW','READY','JININFRA','2026-10-19','2026-10-19')").run();
  const insert=db.prepare("INSERT INTO vendor_message(request_id,vendor_code,payload_type,source_device_id,occurred_at,received_at,status,payload_json) VALUES(?,'JININFRA','RTK_POSITION','window-device','2026-10-19T00:00:00Z','2026-10-19T00:00:00Z','PERSISTED',?)");
  for(let i=0;i<=300;i++)if(![202,205,299].includes(i))insert.run('window-'+i,JSON.stringify({data:{frameCounter:i,devEui:'current'}}));
  // Other hardware with the same asset mapping must not fill the missing counters.
  for(const i of [202,205,299])insert.run('old-eui-'+i,JSON.stringify({data:{frameCounter:i,devEui:'old'}}));
  insert.run('failed-frame',JSON.stringify({data:{frameCounter:202,devEui:'current'}}));
  db.prepare("UPDATE vendor_message SET status='REJECTED' WHERE request_id='failed-frame'").run();
  for(let i=0;i<150;i++)insert.run('repeat-'+i,JSON.stringify({data:{frameCounter:300,devEui:'current'}}));
  const {data}=await (await rtkRoutes.request('/packets?assetId=window-device')).json() as any;
  assert.equal(data.packets.length,100);assert.ok(data.packets.every((packet:any)=>packet.frameCounter===300));
  assert.equal(data.sharingWindow,null);assert.equal(data.sharingIssue,"NO_PROGRESS");
  insert.run('invalid-latest',JSON.stringify({data:{frameCounter:null,devEui:'current'}}));
  const invalid=await (await rtkRoutes.request('/packets?assetId=window-device')).json() as any;
  assert.equal(invalid.data.sharingWindow,null);
});

test("100건 전 기록이 없는 장비는 계산하지 않고 대기한다",async()=>{
  const db=localDb();
  db.prepare("INSERT INTO asset(asset_id,asset_type_id,asset_code,status,vendor_code,created_at,updated_at) VALUES('start-device','rtk-type','START','READY','JININFRA','2026-10-19','2026-10-19')").run();
  const insert=db.prepare("INSERT INTO vendor_message(request_id,vendor_code,payload_type,source_device_id,occurred_at,received_at,status,payload_json) VALUES(?,'JININFRA','RTK_POSITION','start-device','2026-10-19T00:00:00Z','2026-10-19T00:00:00Z','PERSISTED',?)");
  for(const i of [0,1,3])insert.run('start-'+i,JSON.stringify({data:{frameCounter:i}}));
  const {data}=await (await rtkRoutes.request('/packets?assetId=start-device')).json() as any;
  assert.equal(data.sharingWindow,null);assert.equal(data.sharingIssue,"WAITING_HISTORY");assert.equal(data.sharingComparison.availableRecords,3);assert.equal(data.sharingComparison.baseline,null);
});


test("수신 기록의 번호 범위로 예상 개수·실수신·누락·중복을 구분한다",()=>{
  const counters=Array.from({length:100},(_,i)=>199-i).filter(n=>![101,102,103,104,105,106,107,108,109,110].includes(n));
  const packets=[...Array(10).fill({frameCounter:199}),...counters.map(frameCounter=>({frameCounter})),{frameCounter:99}];
  const result=rtkDeliverySummary(packets);
  assert.deepEqual(result.window,{fromCounter:100,toCounter:199,expectedCount:100,receivedCount:90,missingCount:10,missingRanges:[{from:101,to:110}],successRatePercent:90,sampleCount:100,duplicateCount:10});
});
test("번호 역전·초기화 의심·번호 누락은 수신율을 임의 계산하지 않는다",()=>{
  assert.equal(rtkDeliverySummary([...Array(100).fill({frameCounter:1}),{frameCounter:65535}]).issue,"COUNTER_ORDER");
  assert.equal(rtkDeliverySummary([...Array(100).fill({frameCounter:2}),{frameCounter:null}]).issue,"INVALID_COUNTER");
  assert.equal(rtkDeliverySummary([]).issue,"WAITING_HISTORY");
});

test("100건 전은 101번째 기록이며 100건만 있으면 아직 대기한다",()=>{
  const records=Array.from({length:101},(_,i)=>({frameCounter:100-i}));
  assert.equal(rtkDeliverySummary(records.slice(0,100)).issue,"WAITING_HISTORY");
  const result=rtkDeliverySummary(records);
  assert.equal(result.comparison.baseline?.frameCounter,0);
  assert.equal(result.window?.expectedCount,100);assert.equal(result.window?.receivedCount,100);
});
test("누락 번호는 개별 번호와 연속 범위로 빠짐없이 반환한다",()=>{
  const absent=[2,5,6,100,101,102];
  const records=Array.from({length:107},(_,i)=>106-i).filter(n=>!absent.includes(n)).map(frameCounter=>({frameCounter}));
  const result=rtkDeliverySummary(records);
  assert.equal(result.window?.missingCount,6);
  assert.deepEqual(result.window?.missingRanges,[{from:2,to:2},{from:5,to:6},{from:100,to:102}]);
});
test("번호가 크게 건너뛰어도 누락 번호를 무한히 나열하지 않고 범위로 반환한다",()=>{
  const result=rtkDeliverySummary([...Array(100).fill({frameCounter:1_000_000_000}),{frameCounter:0}]);
  assert.equal(result.window?.missingCount,999_999_999);
  assert.deepEqual(result.window?.missingRanges,[{from:1,to:999_999_999}]);
});
