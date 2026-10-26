import {test} from "node:test";
import assert from "node:assert/strict";
import {RtpReceptionMetrics,rtpHeader} from "../src/video/rtp-metrics.js";
import {RtpTapReader} from "../src/video/rtp-tap.js";
function packet(seq:number,ssrc=1,stamp=0){const b=Buffer.alloc(13);b[0]=128;b[1]=96;b.writeUInt16BE(seq,2);b.writeUInt32BE(stamp,4);b.writeUInt32BE(ssrc,8);return b;}
test("actual sequence window counts gaps, duplicates, late arrivals and wrap",()=>{
 const m=new RtpReceptionMetrics();m.beginConnection();
 for(let i=0;i<100;i++)if(i!==40 && i!==50)m.record(packet((65500+i)%65536),1000+i,1000+i,90000);
 let s=m.snapshot(1100);assert.equal(s.expectedCount,100);assert.equal(s.receivedCount,98);assert.equal(s.successPercent,98);assert.deepEqual(s.missingSequences,[4,14]);
 m.record(packet(14),1101,1101,90000);m.record(packet(14),1102,1102,90000);
 s=m.snapshot(7000);assert.equal(s.receivedCount,99);assert.equal(s.duplicateCount,1);assert.equal(s.sequenceSilenceMs,5901);
 m.beginConnection();assert.equal(m.snapshot().expectedCount,0);assert.equal(m.snapshot().packetCount,100);
 m.record(packet(500,2),8000,8000,90000);assert.equal(m.snapshot().expectedCount,1);
});
test("large jumps require consecutive confirmation; SSRC changes reset window",()=>{
 const m=new RtpReceptionMetrics();m.record(packet(100),1,1,90000);m.record(packet(5000),2,2,90000);assert.equal(m.snapshot(2).sequenceStatus,"RESET_PENDING");
 m.record(packet(5001),3,3,90000);assert.equal(m.snapshot(3).expectedCount,1);assert.equal(m.snapshot(3).toSequence,5001);
 m.record(packet(2,8),4,4,90000);assert.equal(m.snapshot(4).receivedCount,1);assert.equal(m.snapshot(4).ssrc,"00000008");
});
test("timestamps measure arrival intervals and RTP jitter before decoding",()=>{
 const m=new RtpReceptionMetrics();m.record(packet(1,1,0),1000,100,90000);m.record(packet(2,1,9000),1100,200,90000);m.record(packet(3,1,18000),1220,320,90000);
 const s=m.snapshot(1220);assert.equal(s.averageIntervalMs,110);assert.equal(s.maxIntervalMs,120);assert.equal(s.jitterMs,1.25);
 assert.equal(rtpHeader(Buffer.alloc(11)),null);const bad=packet(1);bad[0]=144;assert.equal(rtpHeader(bad),null);
});
function record(data:Buffer,at=1234){const h=Buffer.alloc(28);h.write("RTAP");h.writeUInt32BE(8,4);h.writeUInt32BE(data.length,8);h.writeBigUInt64BE(BigInt(at*1000),12);h.writeBigUInt64BE(BigInt(at*1000),20);return Buffer.concat([h,data]);}
function interleaved(channel:number,p:Buffer){const h=Buffer.alloc(4);h[0]=36;h[1]=channel;h.writeUInt16BE(p.length,2);return Buffer.concat([h,p]);}
test("fragmented RTSP/SDP and TCP interleaving retain original RTP headers",()=>{
 const m=new RtpReceptionMetrics();const arrivals:number[]=[];const tap=new RtpTapReader(m,at=>arrivals.push(at));
 const sdp="v=0\r\nm=video 0 RTP/AVP 96\r\na=rtpmap:96 H264/90000\r\na=control:track$1\r\nm=audio 0 RTP/AVP 97\r\na=rtpmap:97 MPEG4-GENERIC/48000\r\n";
 const response=Buffer.from("RTSP/1.0 200 OK\r\nContent-Type: application/sdp\r\nContent-Length: "+Buffer.byteLength(sdp)+"\r\n\r\n"+sdp+"RTSP/1.0 200 OK\r\nTransport: RTP/AVP/TCP;interleaved=2-3\r\n\r\n");
 const report=Buffer.alloc(28);report[0]=128;report[1]=200;report.writeUInt32BE(1,4);
 const data=Buffer.concat([response,interleaved(0,packet(99)),interleaved(2,packet(7)),interleaved(3,report)]);
 const wire=Buffer.concat([record(data.subarray(0,23),1200),record(data.subarray(23),1234)]);
 for(let i=0;i<wire.length;i+=7)tap.push(wire.subarray(i,i+7));
 const s=m.snapshot(1240);assert.equal(s.available,true);assert.equal(s.packetCount,1);assert.equal(s.toSequence,7);assert.equal(s.clockRate,90000);assert.equal(s.rtcpSenderReports,1);assert.deepEqual(arrivals,[1234]);
});
test("invalid observation stream fails metrics closed",()=>{const m=new RtpReceptionMetrics();const tap=new RtpTapReader(m,()=>{});tap.push(Buffer.alloc(28));assert.equal(m.snapshot().available,false);assert.ok(m.error);});
