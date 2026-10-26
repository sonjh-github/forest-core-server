import { RtpReceptionMetrics,rtpHeader } from "./rtp-metrics.js";
class InterleavedStream {
  private buffer=Buffer.alloc(0);
  private channel:number|null=null;
  private rtcp:number|null=null;
  private types=new Set<number>();
  private rates=new Map<number,number>();
  constructor(private metrics:RtpReceptionMetrics,private received:(at:number)=>void) {}
  push(data:Buffer,at:number,tick:number) {
    this.buffer=Buffer.concat([this.buffer,data]);
    while(this.buffer.length) {
      if(this.buffer[0]===36) {
        if(this.buffer.length<4)return;
        const length=this.buffer.readUInt16BE(2);
        if(this.buffer.length<4+length)return;
        const channel=this.buffer[1]!,packet=this.buffer.subarray(4,4+length);
        if(channel===this.channel) {
          const header=rtpHeader(packet);
          if(header && (!this.types.size || this.types.has(header.payloadType)) && this.metrics.record(packet,at,tick,this.rates.get(header.payloadType) ?? null))this.received(at);
        } else if(channel===this.rtcp)this.metrics.senderReport(packet);
        this.buffer=this.buffer.subarray(4+length);continue;
      }
      const end=this.buffer.indexOf("\r\n\r\n");
      if(end<0){if(this.buffer.length>262144)throw new Error("RTSP header limit");return;}
      const headers=this.buffer.subarray(0,end).toString("utf8");
      if(!/^RTSP\/1\.[01] /i.test(headers))throw new Error("RTSP response framing");
      const size=Number(/(?:^|\r\n)Content-Length:\s*(\d+)/i.exec(headers)?.[1] ?? 0);
      if(size>1048576)throw new Error("RTSP body limit");
      if(this.buffer.length<end+4+size)return;
      const transport=/interleaved\s*=\s*(\d+)\s*-\s*(\d+)/i.exec(headers);
      if(this.channel===null && transport){this.channel=Number(transport[1]);this.rtcp=Number(transport[2]);}
      if(/Content-Type:\s*application\/sdp/i.test(headers)) {
        const sdp=this.buffer.subarray(end+4,end+4+size).toString("utf8");
        const video=/(?:^|\r?\n)m=video[^\r\n]*[\s\S]*?(?=\r?\nm=|$)/.exec(sdp)?.[0].trim();
        if(video) {
          for(const type of video.split(/\r?\n/)[0]!.split(/\s+/).slice(3))this.types.add(Number(type));
          for(const match of video.matchAll(/a=rtpmap:(\d+)\s+[^/\s]+\/(\d+)/g))this.rates.set(Number(match[1]),Number(match[2]));
          for(const type of this.types)if([25,26,28,31,32,33,34].includes(type) && !this.rates.has(type))this.rates.set(type,90000);
        }
      }
      this.buffer=this.buffer.subarray(end+4+size);
    }
  }
}
// Receives private child-process pipe records stamped at FFmpeg's actual recv() call.
export class RtpTapReader {
  private buffer=Buffer.alloc(0);
  private streams=new Map<number,InterleavedStream>();
  constructor(private metrics:RtpReceptionMetrics,private received:(at:number)=>void) {}
  push(chunk:Buffer) {
    if(this.metrics.error)return;
    try {
      this.buffer=Buffer.concat([this.buffer,chunk]);
      while(this.buffer.length>=28) {
        if(this.buffer.subarray(0,4).toString()!=="RTAP")throw new Error("RTP tap framing");
        const fd=this.buffer.readUInt32BE(4),size=this.buffer.readUInt32BE(8);
        if(size>65536)throw new Error("RTP tap length");
        if(this.buffer.length<28+size)return;
        let stream=this.streams.get(fd);
        if(!stream){if(this.streams.size>=8)throw new Error("RTP connection limit");stream=new InterleavedStream(this.metrics,this.received);this.streams.set(fd,stream);}
        stream.push(this.buffer.subarray(28,28+size),Number(this.buffer.readBigUInt64BE(12))/1000,Number(this.buffer.readBigUInt64BE(20))/1000);
        this.buffer=this.buffer.subarray(28+size);
      }
    } catch {this.metrics.error="RTP 계측 스트림을 해석하지 못했습니다.";this.buffer=Buffer.alloc(0);}
  }
}
