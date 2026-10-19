import { spawnSync } from 'node:child_process';
const suffix = String(process.pid);
const network = `camera-test-${suffix}`;
const camera = `camera-fixture-${suffix}`;
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
    '-hide_banner','-loglevel','error','-re','-f','lavfi','-i','testsrc=size=320x180:rate=15',
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
        if(status.data.status==='READY'){ready=true;break;}
        await new Promise(resolve=>setTimeout(resolve,500));
      }
      assert.ok(ready,'HLS did not become ready');
      const playlist=await (await cameraRoutes.request('/sessions/'+id+'/index.m3u8')).text();
      assert.match(playlist,/#EXTM3U/);
      const filename=playlist.split('\\n').find(line=>/^segment-\\d+\\.ts$/.test(line.trim())).trim();
      const segment=await cameraRoutes.request('/sessions/'+id+'/'+filename);
      assert.equal(segment.status,200);
      const bytes=new Uint8Array(await segment.arrayBuffer());
      assert.ok(bytes.length>188);assert.equal(bytes[0],0x47);
      console.log('RTSP -> HLS playlist and MPEG-TS segment verified');
    } finally {await cameraRoutes.request('/sessions/'+id+'/stop',{method:'POST'});}
    process.exit(0);
  `;
  console.log(docker('run','--rm','--network',network,'-e','CAMERA_RTSP_ALLOW_PRIVATE=true','--entrypoint','node','forest-core-server:verify','--input-type=module','-e',code));
} finally {
  spawnSync('docker',['rm','-f',publisher,camera],{stdio:'ignore'});
  spawnSync('docker',['network','rm',network],{stdio:'ignore'});
}
