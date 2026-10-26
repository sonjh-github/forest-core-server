import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { localDb } from "../local-demo/db.js";

type Recovery = {receivedAt:number;frameCounter:number|null};
type Run = {firstReceivedAt?:number|null;recoveries?:Recovery[];id:string;network:"LPWA"|"TVWS";assetId:string|null;startedAt:number;endedAt:number|null;checkedAt:number;state:"UP"|"DOWN";upMs:number;downMs:number;lastCounter:number|null;lastProgressAt:number|null};
export class AvailabilityStore {
  constructor(private db:DatabaseSync) {
    db.exec("CREATE TABLE IF NOT EXISTS network_availability_run (id TEXT PRIMARY KEY, asset_id TEXT, network TEXT NOT NULL, ended INTEGER NOT NULL DEFAULT 0, record_json TEXT NOT NULL)");
    // A server restart ends the previous observation at its last confirmed checkpoint.
    for(const row of db.prepare("SELECT record_json FROM network_availability_run WHERE ended=0").all()) {
      const run=JSON.parse(String(row.record_json)) as Run;run.endedAt=run.checkedAt;this.save(run);
    }
  }
  private save(run:Run) {this.db.prepare("INSERT OR REPLACE INTO network_availability_run VALUES(?,?,?,?,?)").run(run.id,run.assetId,run.network,run.endedAt===null ? 0 : 1,JSON.stringify(run));return run;}
  get(id:string) {const row=this.db.prepare("SELECT record_json FROM network_availability_run WHERE id=?").get(id);return row ? JSON.parse(String(row.record_json)) as Run : null;}
  latest(assetId:string) {const row=this.db.prepare("SELECT record_json FROM network_availability_run WHERE asset_id=? AND network='LPWA' ORDER BY rowid DESC LIMIT 1").get(assetId);return row ? JSON.parse(String(row.record_json)) as Run : null;}
  start(network:Run["network"],assetId:string|null,id:string=randomUUID(),now=Date.now(),counter:number|null=null) {
    return this.save({id,network,assetId,startedAt:now,endedAt:null,checkedAt:now,state:"DOWN",upMs:0,downMs:0,lastCounter:counter,lastProgressAt:null,firstReceivedAt:null,recoveries:[]});
  }
  observe(id:string,up:boolean,now=Date.now(),counter?:number|null,receivedAt?:number|null) {
    const run=this.get(id);if(!run || run.endedAt!==null)return run;
    const elapsed=Math.max(0,now-run.checkedAt);
    if(run.state==="UP")run.upMs+=elapsed;else run.downMs+=elapsed;
    if(up && counter!=null && counter!==run.lastCounter && receivedAt!=null && receivedAt>=run.startedAt && receivedAt<=now) {
      run.lastCounter=counter;run.lastProgressAt=receivedAt;
    }
    const previousState=run.state;
    run.state=(run.network==="LPWA" ? up && run.lastProgressAt!==null && now-run.lastProgressAt<6000 : up) ? "UP" : "DOWN";
    if(previousState==="DOWN" && run.state==="UP") {
      const at=run.network==="LPWA" ? run.lastProgressAt! : receivedAt ?? now;
      if(run.firstReceivedAt==null)run.firstReceivedAt=at;
      else (run.recoveries ??= []).push({receivedAt:at,frameCounter:run.network==="LPWA" ? run.lastCounter : null});
    }
    run.checkedAt=now;return this.save(run);
  }
  stop(id:string,now=Date.now()) {const run=this.get(id);if(!run || run.endedAt!==null)return run;const updated=this.observe(id,run.state==="UP",now)!;updated.endedAt=now;return this.save(updated);}
}
export function availabilitySummary(run:Run|null) {
  if(!run)return null;
  const totalMs=run.upMs+run.downMs;
  return {id:run.id,network:run.network,assetId:run.assetId,startedAt:new Date(run.startedAt).toISOString(),endedAt:run.endedAt===null ? null : new Date(run.endedAt).toISOString(),checkedAt:new Date(run.checkedAt).toISOString(),state:run.state,firstReceivedAt:run.firstReceivedAt==null ? null : new Date(run.firstReceivedAt).toISOString(),recoveries:(run.recoveries ?? []).map(item=>({receivedAt:new Date(item.receivedAt).toISOString(),frameCounter:item.frameCounter})),totalMs,upMs:run.upMs,downMs:run.downMs,availabilityPercent:totalMs>0 ? run.upMs/totalMs*100 : null};
}
let store:AvailabilityStore|undefined;
function measurements() {return store ??= new AvailabilityStore(localDb());}
const monitors=new Map<string,()=>Promise<void>>();
let ticking=false;
const timer=setInterval(async()=>{
  if(ticking)return;ticking=true;
  try {await Promise.allSettled([...monitors.values()].map(check=>check()));} finally {ticking=false;}
},1000);timer.unref();
export function startVideoAvailability(id:string,check:()=>Promise<boolean>) {
  measurements().start("TVWS",null,id);
  monitors.set(id,async()=>{const up=await check();measurements().observe(id,up);});
}
export function noteVideoReception(id:string,at=Date.now()) {measurements().observe(id,true,at,undefined,at);}
export function noteVideoInterruption(id:string,at=Date.now()) {measurements().observe(id,false,at);}
export function videoAvailability(id:string) {return availabilitySummary(measurements().get(id));}
export function stopAvailability(id:string) {monitors.delete(id);return availabilitySummary(measurements().stop(id));}
function lpwaPacket(assetId:string,since?:number,baseline?:number|null) {
  const row=since!==undefined ? localDb().prepare("SELECT payload_json,received_at FROM vendor_message INDEXED BY idx_vendor_message_device_received WHERE source_device_id=? AND vendor_code='JININFRA' AND payload_type='RTK_POSITION' AND received_at>=? AND json_extract(payload_json,'$.data.frameCounter') IS NOT ? ORDER BY received_at ASC,rowid ASC LIMIT 1").get(assetId,new Date(since).toISOString(),baseline ?? null) :localDb().prepare("SELECT payload_json,received_at FROM vendor_message INDEXED BY idx_vendor_message_device_received WHERE source_device_id=? AND vendor_code='JININFRA' AND payload_type='RTK_POSITION' ORDER BY received_at DESC,rowid DESC LIMIT 1").get(assetId);
  if(!row)return {up:false,counter:null,receivedAt:null};
  const payload=JSON.parse(String(row.payload_json));
  const counter=payload?.data?.frameCounter;
  const up=Array.isArray(payload?.activePath) && payload.activePath.some((hop:{medium?:string;status?:string})=>hop.medium==="LPWA" && hop.status==="ACTIVE");
  return {up,counter:Number.isSafeInteger(counter) && counter>=0 ? counter as number : null,receivedAt:Date.parse(String(row.received_at))};
}
export const availabilityRoutes=new Hono();
availabilityRoutes.get("/lpwa/:assetId",c=>c.json({data:availabilitySummary(measurements().latest(c.req.param("assetId")))}));
availabilityRoutes.post("/lpwa/:assetId/start",c=>{
  const assetId=c.req.param("assetId");
  const asset=localDb().prepare("SELECT a.asset_id FROM asset a JOIN asset_type t ON t.asset_type_id=a.asset_type_id WHERE a.asset_id=? AND t.name='RTK_TERMINAL' AND a.status NOT IN ('RETIRED','DISPOSED')").get(assetId);
  if(!asset)return c.json({error:{message:"측정 가능한 RTK 단말을 찾을 수 없습니다."}},404);
  const previous=measurements().latest(assetId);
  if(previous?.endedAt===null)return c.json({data:availabilitySummary(previous)});
  const packet=lpwaPacket(assetId);
  const run=measurements().start("LPWA",assetId,undefined,Date.now(),packet.counter);
  monitors.set(run.id,async()=>{const current=measurements().get(run.id);const sample=current?.state==="DOWN" ? lpwaPacket(assetId,current.checkedAt,current.lastCounter) : lpwaPacket(assetId);measurements().observe(run.id,sample.up,Date.now(),sample.counter,sample.receivedAt);});
  return c.json({data:availabilitySummary(run)},201);
});
availabilityRoutes.post("/lpwa/:assetId/stop",c=>{
  const run=measurements().latest(c.req.param("assetId"));
  return c.json({data:run ? stopAvailability(run.id) : null});
});
