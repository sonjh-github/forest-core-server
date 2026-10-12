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
