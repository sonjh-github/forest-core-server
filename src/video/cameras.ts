import { FrameReceptionMetrics, inputFrameNumber } from "./frame-metrics.js";
import { startVideoAvailability, videoAvailability, stopAvailability, noteVideoReception, noteVideoInterruption } from "../dashboard/network-availability.js";
import { lookup } from "node:dns/promises";
import { isIPv4 } from "node:net";
import { Hono } from "hono";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Session = {frameMetrics:FrameReceptionMetrics; directory:string;process:ChildProcess|null;touched:number;failed:boolean;lastVideoAt:number|null;hasFrame:boolean;retryTimer?:ReturnType<typeof setTimeout> };
const sessions = new Map<string, Session>();
let starting = 0;
export const cameraRoutes = new Hono();

export function validCameraUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /[\r\n\0]/.test(value)) return false;
  try { const url = new URL(value); return url.protocol === "rtsp:" && Boolean(url.hostname); }
  catch { return false; }
}

export function publicCameraAddress(address: string): boolean {
  if (!isIPv4(address)) return false;
  const [a,b,c] = address.split(".").map(Number) as [number,number,number,number];
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

export function privateCameraAddress(address: string): boolean {
  if (!isIPv4(address)) return false;
  const [a,b] = address.split(".").map(Number);
  return a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168);
}

async function cameraTarget(uri: string): Promise<string> {
  const url = new URL(uri);
  const allowed = (process.env.CAMERA_RTSP_ALLOWED_HOSTS ?? "").split(",").map(host => host.trim().toLowerCase()).filter(Boolean);
  const {address} = await lookup(url.hostname, {family:4});
  const privateAllowed = process.env.CAMERA_RTSP_ALLOW_PRIVATE === "true" && privateCameraAddress(address);
  if (!publicCameraAddress(address) && !privateAllowed && !allowed.includes(url.hostname.toLowerCase()) && !allowed.includes(address)) {
    throw new Error("사설망 카메라는 운영 서버의 허용 주소 설정이 필요합니다.");
  }
  // Pin the checked IP; a second DNS lookup in FFmpeg must not bypass the check.
  url.hostname = address;
  return url.toString();
}

async function stop(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  stopAvailability(id);
  if(session.retryTimer)clearTimeout(session.retryTimer);
  const process=session.process;
  process?.kill("SIGKILL");
  await new Promise<void>((resolve) => {
    if (!process || process.exitCode !== null || process.signalCode !== null || !process.pid) resolve();
    else process.once("close", () => resolve());
  });
  await rm(session.directory, { recursive: true, force: true });
}
const sweep = setInterval(() => {
  for (const [id, session] of sessions) if (Date.now() - session.touched > 90_000) void stop(id).catch(() => {});
}, 10_000);
sweep.unref();

cameraRoutes.post("/sessions", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!validCameraUri(body?.uri)) return c.json({error:{message:"rtsp:// 형식의 카메라 주소를 입력하세요."}},400);
  if (sessions.size + starting >= 4) return c.json({error:{message:"영상 연결이 모두 사용 중입니다. 기존 연결을 중지한 뒤 다시 시도하세요."}},429);
  starting++;
  let directory = "";
  try {
    let target: string;
    try { target = await cameraTarget(body.uri); }
    catch { return c.json({error:{message:"카메라 주소를 확인할 수 없거나 허용되지 않은 내부망 주소입니다. 사설망 카메라는 운영 서버의 허용 주소 설정이 필요합니다."}},400); }
    directory = await mkdtemp(join(tmpdir(), "forest-camera-"));
    const id = randomUUID();
    const session:Session={frameMetrics:new FrameReceptionMetrics(),directory,process:null,touched:Date.now(),failed:false,lastVideoAt:null,hasFrame:false};
    sessions.set(id,session);
    startVideoAvailability(id,async()=>session.hasFrame && cameraReceptionStatus(session.failed,session.lastVideoAt)==="READY");
    const launch = () => {
      if(sessions.get(id)!==session)return;
      session.failed=false;session.hasFrame=false;session.retryTimer=undefined;
      const process=spawn("ffmpeg",["-hide_banner","-loglevel","info","-nostats","-nostdin",
        "-protocol_whitelist","rtsp,rtp,tcp,udp","-rtsp_transport","tcp","-timeout","10000000","-i",target,
        "-map","0:v:0","-an","-vf","showinfo=checksum=0","-c:v","libx264","-preset","ultrafast","-tune","zerolatency",
        "-threads","2","-pix_fmt","yuv420p","-r","15","-g","30",
        "-f","hls","-hls_time","2","-hls_list_size","5","-hls_start_number_source","epoch",
        "-hls_flags","delete_segments+temp_file+append_list+discont_start",
        "-hls_segment_filename",join(directory,"segment-%d.ts"),join(directory,"index.m3u8")],
        {stdio:["ignore","ignore","pipe"],windowsHide:true});
      session.process=process;
      let buffer="";
      process.stderr?.on("data",(chunk:Buffer)=>{
        if(sessions.get(id)!==session || session.process!==process || session.failed)return;
        buffer+=chunk.toString();const lines=buffer.split(/\r?\n/);buffer=(lines.pop() ?? "").slice(-16384);
        const at=Date.now(),tick=performance.now();
        for(const line of lines) {
          if(inputFrameNumber(line)===null)continue;
          const now=at;
          session.frameMetrics.record(at,tick);
          const gap=session.lastVideoAt!==null && now-session.lastVideoAt>=10000;
          if(gap)noteVideoInterruption(id,now);
          if(!session.hasFrame || gap)noteVideoReception(id,now);
          session.hasFrame=true;session.lastVideoAt=now;
        }
      });
      const retry=()=>{
        if(sessions.get(id)!==session || session.process!==process || session.retryTimer)return;
        session.failed=true;session.hasFrame=false;noteVideoInterruption(id);
        session.retryTimer=setTimeout(launch,1000);
      };
      process.once("error",retry);process.once("exit",retry);
    };
    launch();
    return c.json({data:{id,playbackPath:`/api/v1/dashboard/cameras/sessions/${id}/index.m3u8`}},201);
  } catch {
    if (directory) await rm(directory,{recursive:true,force:true});
    return c.json({error:{message:"영상 중계를 시작하지 못했습니다."}},503);
  } finally { starting--; }
});

export function cameraReceptionStatus(failed: boolean, updatedAt: number | null, now = Date.now()) {
  if (failed) return "FAILED";
  if (updatedAt === null) return "CONNECTING";
  return now - updatedAt <= 10_000 ? "READY" : "STALLED";
}

cameraRoutes.get("/sessions/:id", async (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({error:{message:"영상 연결이 종료됐습니다."}},404);
  session.touched = Date.now();
  if (session.failed) return c.json({data:{status:"FAILED",frameMetrics:session.frameMetrics.snapshot(),availability:videoAvailability(c.req.param("id")),message:"카메라에 연결할 수 없습니다. 주소·인증 정보와 서버에서의 네트워크 접근을 확인하세요."}});
  const updatedAt = await stat(join(session.directory,"index.m3u8")).then(file => file.mtimeMs, () => null);
  return c.json({data:{status:cameraReceptionStatus(session.failed,session.hasFrame ? updatedAt : null),frameMetrics:session.frameMetrics.snapshot(),availability:videoAvailability(c.req.param("id")),lastVideoAt:updatedAt === null ? null : new Date(updatedAt).toISOString()}});
});

cameraRoutes.post("/sessions/:id/stop", async (c) => {
  const frameMetrics=sessions.get(c.req.param("id"))?.frameMetrics.snapshot() ?? null;
  await stop(c.req.param("id"));
  return c.json({data:{stopped:true,frameMetrics,availability:videoAvailability(c.req.param("id"))}});
});

cameraRoutes.get("/sessions/:id/:file", async (c) => {
  const session = sessions.get(c.req.param("id"));
  const file = c.req.param("file");
  if (!session || !/^(index\.m3u8|segment-\d+\.ts)$/.test(file)) return c.notFound();
  if (session.failed) return c.json({error:{message:"카메라 영상 연결이 끊겼습니다."}},502);
  session.touched = Date.now();
  const data = await readFile(join(session.directory,file)).catch(() => null);
  if (!data) return c.notFound();
  return new Response(new Uint8Array(data),{headers:{"Content-Type":file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t","Cache-Control":"no-store"}});
});
