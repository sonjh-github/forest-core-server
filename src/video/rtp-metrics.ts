import { FrameReceptionMetrics } from "./frame-metrics.js";
export function rtpHeader(packet:Buffer) {
  if(packet.length<12 || packet[0]!>>6!==2)return null;
  let header=12+4*(packet[0]!&15);
  if(header>packet.length)return null;
  if(packet[0]!&16) {if(header+4>packet.length)return null;header+=4+packet.readUInt16BE(header+2)*4;}
  const padding=packet[0]!&32 ? packet[packet.length-1]! : 0;
  if(header>=packet.length-padding || ((packet[0]!&32)!==0 && padding===0))return null;
  return {sequence:packet.readUInt16BE(2),timestamp:packet.readUInt32BE(4),ssrc:packet.readUInt32BE(8),payloadType:packet[1]!&127};
}
export class RtpReceptionMetrics {
  private readonly windowMs=200000;
  private timing=new FrameReceptionMetrics(this.windowMs);
  private samples:{sequence:number;at:number}[]=[];
  private head=0;
  private windowStartedAt:number|null=null;
  private source:number|null=null;
  private high:number|null=null;
  private counts=new Map<number,number>();
  private pending:number|null=null;
  private progressAt:number|null=null;
  private lastTick:number|null=null;
  private lastTimestamp:number|null=null;
  private rate:number|null=null;
  private jitter:number|null=null;
  private reports=0;
  private connections=0;
  error:string|null=null;
  constructor(private available=true) {}
  beginConnection() {this.connections++;this.reset();}
  private reset(sequence?:number,source?:number) {this.source=source ?? null;this.high=sequence ?? null;this.counts.clear();this.samples=[];this.head=0;this.windowStartedAt=null;this.pending=null;this.progressAt=null;this.lastTick=null;this.lastTimestamp=null;this.jitter=null;}
  record(packet:Buffer,at:number,tick:number,clockRate:number|null) {
    const header=rtpHeader(packet);if(!header)return false;
    this.timing.record(at,tick);
    if(this.source!==header.ssrc)this.reset(header.sequence,header.ssrc);
    let extended=header.sequence;
    if(this.high!==null) {
      extended+=Math.floor(this.high/65536)*65536;
      if(extended<this.high-32768)extended+=65536;
      else if(extended>this.high+32768)extended-=65536;
      const delta=extended-this.high;
      if(delta>3000 || delta < -100) {
        if(this.pending===header.sequence) {this.reset(header.sequence,header.ssrc);extended=header.sequence;}
        else {this.pending=(header.sequence+1)%65536;return true;}
      } else this.pending=null;
    }
    if(this.high===null || extended>this.high || this.progressAt===null){this.high=extended;this.progressAt=at;}
    this.windowStartedAt ??= at;
    this.samples.push({sequence:extended,at});
    this.counts.set(extended,(this.counts.get(extended) ?? 0)+1);
    this.trim(at);
    if(clockRate!==null && clockRate>0) {
      if(this.rate!==clockRate){this.lastTick=null;this.jitter=0;}
      if(this.lastTick!==null && this.lastTimestamp!==null) {
        const timestampDelta=(header.timestamp-this.lastTimestamp)|0;
        const difference=(tick-this.lastTick)-timestampDelta/clockRate*1000;
        this.jitter=(this.jitter ?? 0)+(Math.abs(difference)-(this.jitter ?? 0))/16;
      }
      this.rate=clockRate;this.lastTick=tick;this.lastTimestamp=header.timestamp;
    }
    return true;
  }
  senderReport(packet:Buffer) {
    if(packet.length>=28 && packet[0]!>>6===2 && packet[1]===200 && packet.readUInt32BE(4)===this.source)this.reports++;
  }
  private trim(now:number) {
    while(this.head<this.samples.length && this.samples[this.head]!.at<now-this.windowMs) {
      const sequence=this.samples[this.head++]!.sequence;
      const count=this.counts.get(sequence)!-1;
      if(count)this.counts.set(sequence,count);else this.counts.delete(sequence);
    }
    if(this.head>4096 && this.head>this.samples.length/2){this.samples=this.samples.slice(this.head);this.head=0;}
  }
  snapshot(now=Date.now()) {
    this.trim(now);
    const timing=this.timing.snapshot(now);
    let from:number|null=null,to:number|null=null;
    for(const sequence of this.counts.keys()){from=from===null ? sequence : Math.min(from,sequence);to=to===null ? sequence : Math.max(to,sequence);}
    const expected=from===null ? 0 : to!-from+1;
    const received=this.counts.size,missingCount=expected-received;
    const missing:number[]=[];
    if(missingCount && from!==null)for(let seq=from;seq<=to! && missing.length<100;seq++)if(!this.counts.has(seq))missing.push(((seq%65536)+65536)%65536);
    const observedMs=this.windowStartedAt===null ? 0 : Math.min(this.windowMs,Math.max(0,now-this.windowStartedAt));
    return {available:this.available && !this.error,error:this.error,transport:"RTP_OVER_TCP",windowMs:this.windowMs,observedMs,packetCount:timing.frameCount,sampleCount:timing.sampleCount,
      averageIntervalMs:timing.averageIntervalMs,maxIntervalMs:timing.maxIntervalMs,lastPacketReceivedAt:timing.lastFrameReceivedAt,silenceMs:timing.silenceMs,
      lastNewSequenceAt:this.progressAt===null ? null : new Date(this.progressAt).toISOString(),sequenceSilenceMs:this.progressAt===null ? null : Math.max(0,now-this.progressAt),
      sequenceStatus:this.pending!==null ? "RESET_PENDING" : observedMs<this.windowMs || expected===0 ? "WAITING" : "READY",
      ssrc:this.source===null ? null : this.source.toString(16).padStart(8,"0"),fromSequence:from===null ? null : (from+65536)%65536,toSequence:to===null ? null : ((to%65536)+65536)%65536,
      expectedCount:expected,receivedCount:received,missingCount,missingSequencesTruncated:missingCount>missing.length,missingSequences:missing,
      duplicateCount:[...this.counts.values()].reduce((sum,count)=>sum+count-1,0),successPercent:expected ? received/expected*100 : null,
      jitterMs:this.jitter,clockRate:this.rate,rtcpSenderReports:this.reports,connections:this.connections};
  }
}
