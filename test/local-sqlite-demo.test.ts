import assert from 'node:assert/strict';
import test from 'node:test';
process.env.DB_MODE = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
// Legacy setting must never fabricate inventory or telemetry.
process.env.SQLITE_SEED_DEMO = 'true';
const { app } = await import('../src/app.js');

test('SQLite starts with empty inventory even with legacy seed setting', async () => {
  const response = await app.request('/api/v1/dashboard/assets?limit=200');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, []);
  const health = await (await app.request('/health')).json();
  assert.equal(health.data.demoMode, false);
});

test('No incoming telemetry produces an empty response rather than a fabricated drone', async () => {
  const response = await app.request('/api/v1/dashboard/telemetry/drones?eventId=missing-event');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, []);
  const quality = await (await app.request('/api/v1/dashboard/network-quality/sleno?limit=100')).json();
  assert.equal(quality.data.synthetic, false);
  assert.equal(quality.data.deviceCount, 0);
});


test('registered disaster retains metadata and assigned asset categories without generating positions', async () => {
  const { localDb } = await import('../src/local-demo/db.js');
  const db = localDb();
  const eventId = '10000000-0000-4000-8000-000000000001';
  const typeId = 'c16b731b-d24a-4376-9537-25cbcd7ebd4d';
  const metadata = { geometry: { type: 'Point', coordinates: [128.697, 36.352] },
    severity_code: 'SEVERE', source_system: 'REGISTERED_SOURCE', occurred_at: '2026-07-21T00:30:00Z' };
  db.prepare('INSERT INTO disaster_event(event_id,event_code,event_name,disaster_type,status,metadata_json) VALUES(?,?,?,?,?,?)')
    .run(eventId,'REGISTERED-WF','Existing disaster','WILDFIRE','RESPONDING',JSON.stringify(metadata));
  db.prepare('INSERT INTO asset_type(asset_type_id,name) VALUES(?,?)').run(typeId,'UAV');
  const registration = await app.request('/api/v1/dashboard/assets', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({assetTypeId:typeId,
      assetCode:'REGISTERED-UAV',assetName:'Registered drone',vendor:'NDPS',vendorDeviceId:'REGISTERED-UAV',deviceType:'UAV'}) });
  assert.equal(registration.status,201);
  const assetId = (await registration.json()).data.asset_id;
  db.prepare('INSERT INTO event_resource(event_resource_id,event_id,asset_id) VALUES(?,?,?)')
    .run('30000000-0000-4000-8000-000000000001',eventId,assetId);
  const result = await (await app.request(`/api/v1/dashboard/disasters/${eventId}/assets`)).json();
  assert.equal(result.data.disaster.disasterId,eventId);
  assert.deepEqual(result.data.disaster.geometry,metadata.geometry);
  assert.equal(result.data.disaster.sourceSystem,'REGISTERED_SOURCE');
  assert.equal(result.data.assets[0].asset.asset_type,'UAV');
  const telemetry = await (await app.request(`/api/v1/dashboard/telemetry/drones?eventId=${eventId}`)).json();
  assert.deepEqual(telemetry.data,[]);
});
