import { writeFileSync } from 'node:fs';
import { localDb } from '../dist/local-demo/db.js';

const eventId = process.argv[2];
if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) throw new Error('An existing disaster UUID is required');
if (process.env.DB_MODE !== 'sqlite') throw new Error('Destination must be SQLite');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Original inventory database credentials are required');
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': 'core' };
async function read(table, filter = '') {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1000${filter}`, {
    headers, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${table} read failed: ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`Invalid ${table} response`);
  return rows;
}
const events = await read('disaster_event', `&event_id=eq.${eventId}`);
if (events.length !== 1) throw new Error('Original disaster record not found');
const assignments = await read('event_resource', `&event_id=eq.${eventId}`);
const ids = [...new Set(assignments.map(row => row.asset_id))];
const filter = ids.length ? `&asset_id=in.(${ids.join(',')})` : '';
const assets = ids.length ? await read('asset', filter) : [];
const mappings = ids.length ? await read('vendor_device_mapping', filter) : [];
const types = await read('asset_type');
if (assets.length !== ids.length) throw new Error('An assigned asset is missing from the source database');
if (assets.some(asset => asset.asset_code === 'SLENO_Lab_SingleCH')) throw new Error('Deleted lab gateway cannot be restored');
const db = localDb();
db.exec('PRAGMA busy_timeout=15000');
const backupPath = `/app/data/disaster-restore-${eventId}-${Date.now()}.json`;
writeFileSync(backupPath, JSON.stringify({
  before: {
    events: db.prepare('SELECT * FROM disaster_event WHERE event_id=?').all(eventId),
    assignments: db.prepare('SELECT * FROM event_resource WHERE event_id=?').all(eventId),
    assets: db.prepare('SELECT * FROM asset').all(),
  }, source: { events, assignments, assets, types, mappings },
}));
const resolvedIds = new Map();
db.exec('BEGIN IMMEDIATE');
try {
  const event = events[0];
  db.prepare(`INSERT INTO disaster_event(event_id,event_code,event_name,disaster_type,status,metadata_json)
    VALUES(?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET
    event_code=excluded.event_code,event_name=excluded.event_name,
    disaster_type=excluded.disaster_type,status=excluded.status,metadata_json=excluded.metadata_json`)
    .run(event.event_id,event.event_code,event.event_name,event.disaster_type,event.status,JSON.stringify(event));
  for (const asset of assets) {
    const existing = db.prepare('SELECT asset_id FROM asset WHERE asset_code=?').get(asset.asset_code);
    if (existing) {
      resolvedIds.set(asset.asset_id, existing.asset_id);
      continue;
    }
    const type = types.find(row => row.asset_type_id === asset.asset_type_id);
    if (!type) throw new Error('Original asset type is missing');
    const localType = db.prepare('SELECT asset_type_id FROM asset_type WHERE name=? LIMIT 1').get(type.name);
    const typeId = localType?.asset_type_id ?? type.asset_type_id;
    if (!localType) db.prepare('INSERT INTO asset_type(asset_type_id,name,description,enabled) VALUES(?,?,?,?)')
      .run(typeId,type.name,type.description ?? null,type.enabled ? 1 : 0);
    const mapping = mappings.find(row => row.asset_id === asset.asset_id && row.status === 'ACTIVE');
    if (mapping && db.prepare('SELECT asset_id FROM asset WHERE vendor_code=? AND vendor_device_id=?')
      .get(mapping.vendor_code,mapping.vendor_device_id)) throw new Error('Vendor mapping already belongs to another asset');
    db.prepare(`INSERT INTO asset(asset_id,asset_type_id,asset_code,asset_name,status,product_name,model_name,
      specifications_json,vendor_code,vendor_device_id,device_type,mapping_status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(asset.asset_id,typeId,asset.asset_code,asset.asset_name ?? null,
      asset.status,asset.product_name ?? null,asset.model_name ?? null,JSON.stringify(asset.specifications ?? {}),
      mapping?.vendor_code ?? null,mapping?.vendor_device_id ?? null,mapping?.device_type ?? null,
      mapping?.status ?? null,asset.created_at,asset.updated_at);
    resolvedIds.set(asset.asset_id,asset.asset_id);
  }
  for (const row of assignments) {
    const id = resolvedIds.get(row.asset_id);
    db.prepare(`INSERT INTO event_resource(event_resource_id,event_id,asset_id,assigned_org_code,mission,assigned_at,released_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(event_id,asset_id) DO UPDATE SET
      assigned_org_code=excluded.assigned_org_code,mission=excluded.mission,
      assigned_at=excluded.assigned_at,released_at=excluded.released_at`)
      .run(row.event_resource_id,row.event_id,id,row.assigned_org_code,row.mission,row.assigned_at,row.released_at);
  }
  db.exec('COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; }
console.log(JSON.stringify({ eventId, restoredAssignments: assignments.length,
  assets: assets.map(row => ({ code: row.asset_code, sourceId: row.asset_id, activeId: resolvedIds.get(row.asset_id) })), backupPath }));
