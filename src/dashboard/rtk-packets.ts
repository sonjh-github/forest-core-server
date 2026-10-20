import { Hono } from "hono";
import { localDb } from "../local-demo/db.js";
import { readLiveSlenoRows } from "../device/live-sleno.js";

type Json = Record<string, unknown>;
function object(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function number(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function text(value: unknown): string | null { return value == null || value === "" ? null : String(value); }

export function rtkFixState(value: unknown): "RTK_FIXED" | "RTK_FLOAT" | "DGPS" | "GNSS" | "NO_FIX" | "UNKNOWN" {
  const fix = String(value ?? "").trim().toUpperCase();
  if (["RTK_FIXED","RTK_FIX","FIXED"].includes(fix)) return "RTK_FIXED";
  if (["RTK_FLOAT","FLOAT"].includes(fix)) return "RTK_FLOAT";
  if (["DGPS","DGNSS","DGPS_FIX"].includes(fix)) return "DGPS";
  if (["GPS_FIX","GNSS_FIX","3D_FIX","FIX_3D","2D_FIX","FIX_2D","GPS","GNSS"].includes(fix)) return "GNSS";
  if (["FIX_NOT_AVAILABLE","NO_FIX","INVALID","NONE"].includes(fix)) return "NO_FIX";
  return "UNKNOWN";
}

export function mapRtkPacket(row: Json) {
  const payload = typeof row.payload_json === "string" ? object(JSON.parse(row.payload_json)) : object(row.payload);
  const data = object(payload.data);
  const context = object(payload.context);
  const hops = Array.isArray(payload.activePath) ? payload.activePath.map(object) : [];
  const observations = hops.flatMap(hop => Array.isArray(hop.observations) ? hop.observations.map(object) : []);
  const observation = observations.find(item => item.selected === true) ?? observations[0] ?? {};
  const latitude = number(data.latitude), longitude = number(data.longitude);
  const fixState = rtkFixState(data.fixType);
  const coordinateState = latitude === null || longitude === null ? "MISSING"
    : Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ? "INVALID"
    : latitude === 0 && longitude === 0 ? "ZERO"
    : fixState === "NO_FIX" || fixState === "UNKNOWN" ? "UNCONFIRMED" : "VALID";
  const receivedAt = text(row.received_at);
  const occurredAt = text(row.occurred_at) ?? text(context.occurredAt);
  const delay = receivedAt && occurredAt ? Date.parse(receivedAt) - Date.parse(occurredAt) : NaN;
  return {
    id: String(row.request_id), eventExternalId: text(row.event_external_id) ?? text(context.eventExternalId),
    sourceDeviceId: text(row.source_device_id), receivedAt, occurredAt,
    delayMs: Number.isFinite(delay) ? delay : null, storageStatus: text(row.status),
    latitude, longitude, altitude: number(data.altitude), fixType: text(data.fixType), fixState, coordinateState,
    frameCounter: number(data.frameCounter), devEui: text(data.devEui), networkType: text(data.networkType),
    rssiDbm: number(observation.rssiDbm), snrDb: number(observation.snrDb), payload,
  };
}

export function rtkReceptionState(receivedAt: string | null, now = Date.now()) {
  if (!receivedAt || !Number.isFinite(Date.parse(receivedAt))) return "WAITING";
  const age = Math.max(0, now - Date.parse(receivedAt));
  return age <= 30_000 ? "RECEIVING" : age <= 120_000 ? "DELAYED" : "NO_RECENT_RECEPTION";
}

export function rtkDeliverySummary(packets:Array<{frameCounter:number|null;receivedAt?:string|null;occurredAt?:string|null}>) {
  const records=packets.slice(0,101);
  const point=(packet:typeof records[number]|undefined)=>packet ? {frameCounter:packet.frameCounter,receivedAt:packet.receivedAt ?? null,occurredAt:packet.occurredAt ?? null} : null;
  const comparison={offset:100,requiredRecords:101,availableRecords:records.length,
    latest:point(records[0]),baseline:point(records[100])};
  if(records.length<101)return {window:null,issue:"WAITING_HISTORY",comparison};
  const counters:number[]=[];
  for(const packet of records) {
    const counter=packet.frameCounter;
    if(counter==null || !Number.isSafeInteger(counter) || counter<0)return {window:null,issue:"INVALID_COUNTER",comparison};
    counters.push(counter);
  }
  if(counters.some((counter,index)=>index>0 && counter>counters[index-1]!))return {window:null,issue:"COUNTER_ORDER",comparison};
  const baseline=counters[100]!,latest=counters[0]!;
  if(latest===baseline)return {window:null,issue:"NO_PROGRESS",comparison};
  // The baseline was already received; evaluate only the numbers after it.
  const received=[...new Set(counters.filter(counter=>counter>baseline))].sort((a,b)=>a-b);
  const expectedCount=latest-baseline;
  const missingRanges:Array<{from:number;to:number}>=[];
  let next=baseline+1;
  for(const counter of received) {
    if(counter>next)missingRanges.push({from:next,to:counter-1});
    next=counter+1;
  }
  return {window:{fromCounter:baseline+1,toCounter:latest,expectedCount,receivedCount:received.length,
    missingCount:expectedCount-received.length,missingRanges,successRatePercent:received.length/expectedCount*100,
    sampleCount:100,duplicateCount:100-received.length},issue:null,comparison};
}

export const rtkRoutes = new Hono();
rtkRoutes.get("/packets", (c) => {
  c.header("Cache-Control","no-store");
  const db = localDb();
  const devices = db.prepare(`SELECT a.asset_id id,a.asset_code code,a.asset_name name,t.name type
    FROM asset a JOIN asset_type t ON t.asset_type_id=a.asset_type_id
    WHERE a.vendor_code='JININFRA' AND a.status<>'INACTIVE'
      AND COALESCE(a.mapping_status,'ACTIVE')<>'SUSPENDED'
      AND t.name IN ('RTK_TERMINAL','RTK_BASE_LPWA_GATEWAY') ORDER BY a.asset_code`).all() as Array<{id:string;code:string;name:string|null;type:string}>;
  const requestedId = c.req.query("assetId");
  const selected = requestedId ? devices.find(device => device.id === requestedId) : devices[0];
  if (requestedId && !selected) return c.json({error:{code:"ASSET_NOT_FOUND",message:"운용 중인 RTK 장비를 찾을 수 없습니다."}},404);
  const rows = selected ? db.prepare(`SELECT * FROM vendor_message
    WHERE source_device_id=? AND vendor_code='JININFRA' AND payload_type='RTK_POSITION'
    ORDER BY received_at DESC,rowid DESC LIMIT 101`).all(selected.id) as Json[] : [];
  const records = rows.map(mapRtkPacket);
  const packets = records.slice(0,100);
  const sharing=rtkDeliverySummary(records);
  const live = selected ? readLiveSlenoRows().find(row => row.source_device_id === selected.id) : undefined;
  const receivedTimes = [packets[0]?.receivedAt,live?.received_at].filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)));
  const latestReceivedAt = receivedTimes.sort((a,b) => Date.parse(b)-Date.parse(a))[0] ?? null;
  const receiverState = rtkReceptionState(latestReceivedAt);
  return c.json({data:{
    devices, selectedDevice:selected ?? null, packets, limit:100, checkedAt:new Date().toISOString(),
    sharingWindow:sharing.window,sharingIssue:sharing.issue,sharingComparison:sharing.comparison,receiverState, latestReceivedAt, lastStoredAt:packets[0]?.receivedAt ?? null,
    summary:{count:packets.length,confirmed:packets.filter(packet => packet.coordinateState === "VALID").length,
      noFix:packets.filter(packet => packet.fixState === "NO_FIX").length,
      zero:packets.filter(packet => packet.coordinateState === "ZERO").length,
      unknownFix:packets.filter(packet => packet.fixState === "UNKNOWN").length},
  }});
});
