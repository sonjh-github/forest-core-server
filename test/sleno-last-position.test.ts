import assert from 'node:assert/strict';
import test from 'node:test';
process.env.DB_MODE='sqlite';
process.env.SQLITE_PATH=':memory:';

test('No-Fix last coordinates survive a burst of newer zero-position packets from another device',async()=>{
  const {localDb,insertLocalVendorMessage,slenoMessages}=await import('../src/local-demo/db.js');
  const {clearLiveSlenoRows}=await import('../src/device/live-sleno.js');
  const {readSlenoDashboardTelemetry,mapSlenoPositionRows}=await import('../src/dashboard/sleno-telemetry.js');
  clearLiveSlenoRows();
  const db=localDb();
  db.prepare('INSERT INTO asset_type(asset_type_id,name) VALUES(?,?)').run('type','RTK_TERMINAL');
  for(const [id,code] of [['device-old','SIM-RTK-04'],['device-new','SIM-RTK-01']]){
    db.prepare(`INSERT INTO asset(asset_id,asset_type_id,asset_code,status,vendor_code,vendor_device_id,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?)`).run(id,'type',code,'READY','JININFRA',code,'2026-10-11T00:00:00Z','2026-10-11T00:00:00Z');
  }
  function row(id,device,timestamp,latitude,longitude){return {
    request_id:id,vendor_code:'JININFRA',event_external_id:id,payload_type:'RTK_POSITION',source_device_id:device,
    occurred_at:timestamp,status:'PERSISTED',payload:{payloadType:'RTK_POSITION',
      context:{sourceSystem:'sleno-server',sourceDeviceId:device,occurredAt:timestamp},activePath:[],
      data:{latitude,longitude,altitude:100,fixType:'FIX_NOT_AVAILABLE'}}};}
  const old=row('old','device-old','2026-10-11T00:00:00Z',37.42437318,126.8868591);
  insertLocalVendorMessage(old);
  for(let i=0;i<250;i++)insertLocalVendorMessage(row('new-'+i,'device-new','2026-10-12T00:00:00Z',0,0));
  const markers=await readSlenoDashboardTelemetry('event',undefined,Date.parse('2026-10-12T00:01:00Z'));
  assert.equal(markers.length,1);
  assert.ok(slenoMessages(200).some(row=>row.source_device_id==='device-old'));
  assert.equal(markers[0].assetId,'device-old');
  assert.equal(markers[0].positioningMethod,'NO_FIX');
  assert.equal(markers[0].operationalStatus,'OFFLINE');
  assert.equal(markers[0].latitude,37.42437318);
  assert.match(String(markers[0].positionFetchStatus),/측위 미확정/);
  assert.equal(mapSlenoPositionRows('event',[row('zero','device-new','2026-10-12T00:00:00Z',0,0)]).length,0);
});
