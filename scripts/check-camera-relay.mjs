import { spawn, spawnSync } from 'node:child_process';
const suffix = String(process.pid);
const network = `camera-test-${suffix}`;
const camera = `camera-fixture-${suffix}`;
const observer = `camera-observer-${suffix}`;
const publisher = `camera-publisher-${suffix}`;
function docker(...args) {
  const result = spawnSync('docker', args, {encoding:'utf8', timeout:120_000});
  if (result.status !== 0) throw new Error(`Docker check failed: ${result.stderr}`);
  return result.stdout.trim();
}
try {
  docker('network','create',network);
  docker('run','-d','--name',camera,'--network',network,'bluenviron/mediamtx:1');
  await new Promise(resolve => setTimeout(resolve,2000));
  docker('run','-d','--name',publisher,'--network',network,'--entrypoint','ffmpeg','forest-core-server:verify',
    '-hide_banner','-loglevel','error','-re','-f','lavfi','-i','testsrc=size=320x180:rate=30',
    '-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-g','30','-f','rtsp','-rtsp_transport','tcp',`rtsp://${camera}:8554/live`);
  await new Promise(resolve => setTimeout(resolve,2000));
  const code = `
    import assert from 'node:assert/strict';
    import {cameraRoutes} from './dist/video/cameras.js';
    const response=await cameraRoutes.request('/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uri:'rtsp://${camera}:8554/live'})});
    assert.equal(response.status,201);
    const {data:{id}}=await response.json();
    try {
      let ready=false;
      for(let i=0;i<40;i++) {
        const status=await (await cameraRoutes.request('/sessions/'+id)).json();
        assert.notEqual(status.data.status,'FAILED','RTSP relay failed');
        assert.equal(status.data.availability.network,'TVWS');
        if(status.data.status==='READY'){ready=true;break;}
        await new Promise(resolve=>setTimeout(resolve,500));
      }
      assert.ok(ready,'HLS did not become ready');
      const metrics=(await (await cameraRoutes.request('/sessions/'+id)).json()).data.frameMetrics;
      assert.ok(metrics.frameCount>1);assert.ok(metrics.sampleCount>0 && metrics.sampleCount<=100);
      assert.ok(metrics.averageIntervalMs>=0 && metrics.averageIntervalMs<100);
      const rtp=(await (await cameraRoutes.request('/sessions/'+id)).json()).data.rtpMetrics;
      assert.equal(rtp.available,true,rtp.error);assert.ok(rtp.packetCount>1,JSON.stringify(rtp));assert.equal(rtp.sequenceStatus,'READY');assert.equal(rtp.expectedCount,100);assert.equal(rtp.receivedCount,100);assert.equal(rtp.successPercent,100);
      const playlist=await (await cameraRoutes.request('/sessions/'+id+'/index.m3u8')).text();
      assert.match(playlist,/#EXTM3U/);
      const filename=playlist.split('\\n').find(line=>/^segment-\\d+\\.ts$/.test(line.trim())).trim();
      const segment=await cameraRoutes.request('/sessions/'+id+'/'+filename);
      assert.equal(segment.status,200);
      const bytes=new Uint8Array(await segment.arrayBuffer());
      assert.ok(bytes.length>188);assert.equal(bytes[0],0x47);
      console.log('READY_FOR_INTERRUPTION');
      let recovered=false,lastCheck;
      for(let i=0;i<160;i++) {
        const status=await (await cameraRoutes.request('/sessions/'+id)).json();
        lastCheck=status.data;
        if(status.data.availability.recoveries.length>0) {
          const first=status.data.availability.firstReceivedAt;
          const resumed=status.data.availability.recoveries[0].receivedAt;
          assert.equal(status.data.availability.receptionBasis,'RTP');
          assert.ok(status.data.rtpMetrics.packetCount>rtp.packetCount);
          assert.ok(Date.parse(status.data.rtpMetrics.lastPacketReceivedAt)>=Date.parse(resumed));
          assert.ok(Date.parse(resumed)>Date.parse(first));
          recovered=true;break;
        }
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      assert.ok(recovered,'No recovery timestamp after RTSP source interruption: '+JSON.stringify(lastCheck));
      console.log('RTSP relay reconnect and first-RTP-packet recovery timestamp verified');
    } finally {await cameraRoutes.request('/sessions/'+id+'/stop',{method:'POST'});}
    process.exit(0);
  `;
  await new Promise((resolve,reject)=>{
    let output='',errors='',paused=false,unpause;
    const runner=spawn('docker',['run','--rm','--name',observer,'--network',network,'-e','CAMERA_RTSP_ALLOW_PRIVATE=true','-e','DB_MODE=sqlite','-e','SQLITE_PATH=/tmp/camera-availability.sqlite','--entrypoint','node','forest-core-server:verify','--input-type=module','-e',code]);
    runner.stdout.on('data',chunk=>{
      output+=chunk.toString();
      if(!paused && output.includes('READY_FOR_INTERRUPTION')) {
        paused=true;
        try {docker('pause',publisher);} catch(error) {reject(error);return;}
        unpause=setTimeout(()=>{try {docker('unpause',publisher);docker('restart',publisher);} catch(error){reject(error);}},15000);
      }
    });
    runner.stderr.on('data',chunk=>{errors+=chunk.toString();});
    runner.once('error',reject);
    runner.once('exit',status=>{clearTimeout(unpause);if(status===0){console.log(output.trim());resolve();}else reject(new Error(`Relay recovery check failed: ${errors}`));});
  });
} finally {
  spawnSync('docker',['rm','-f',observer,publisher,camera],{stdio:'ignore'});
  spawnSync('docker',['network','rm',network],{stdio:'ignore'});
}
