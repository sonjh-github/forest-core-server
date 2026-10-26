import assert from "node:assert/strict";
import test from "node:test";
import { cameraReceptionStatus, cameraRoutes, validCameraUri, publicCameraAddress, privateCameraAddress } from "../src/video/cameras.js";

test("카메라는 RTSP 주소만 허용하고 인증 정보·경로·쿼리를 유지한다", async () => {
  assert.equal(validCameraUri("rtsp://operator:secret@192.168.0.10:554/live?channel=1"),true);
  for (const uri of ["", "file:///etc/passwd", "http://169.254.169.254/", "rtsp://", "rtsp://camera/live\n",null]) {
    assert.equal(validCameraUri(uri),false);
    const response = await cameraRoutes.request("/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({uri})});
    assert.equal(response.status,400);
  }
});

test("기본 카메라 연결은 공인 IPv4만 허용한다", async () => {
  for (const ip of ["127.0.0.1","169.254.169.254","10.0.0.1","192.168.1.1","172.16.1.1","100.64.0.1","224.0.0.1","::1","203.0.113.1"]) assert.equal(publicCameraAddress(ip),false);
  assert.equal(publicCameraAddress("8.8.8.8"),true);
  const response=await cameraRoutes.request("/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({uri:"rtsp://127.0.0.1:1/live"})});
  assert.equal(response.status,400);
});

test("실패한 영상 연결은 오류 상태를 반환하고 중지 시 세션을 제거한다", async () => {
  const previous = process.env.CAMERA_RTSP_ALLOWED_HOSTS;
  process.env.CAMERA_RTSP_ALLOWED_HOSTS = "127.0.0.1";
  const created = await cameraRoutes.request("/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({uri:"rtsp://127.0.0.1:1/unreachable"})});
  if (previous === undefined) delete process.env.CAMERA_RTSP_ALLOWED_HOSTS;
  else process.env.CAMERA_RTSP_ALLOWED_HOSTS = previous;
  assert.equal(created.status,201);
  const {data:{id,playbackPath}} = await created.json() as {data:{id:string;playbackPath:string}};
  assert.ok(playbackPath.endsWith("/index.m3u8"));
  try {
    let state = "CONNECTING";
    for (let i=0;i<60 && state!=="FAILED";i++) {
      await new Promise(resolve => setTimeout(resolve,50));
      const response = await cameraRoutes.request(`/sessions/${id}`);
      state = ((await response.json()) as {data:{status:string}}).data.status;
    }
    assert.equal(state,"FAILED");
    assert.equal((await cameraRoutes.request(`/sessions/${id}/index.m3u8`)).status,502);
    assert.equal((await cameraRoutes.request(`/sessions/${id}/credentials.json`)).status,404);
  } finally {
    assert.equal((await cameraRoutes.request(`/sessions/${id}/stop`,{method:"POST"})).status,200);
  }
  assert.equal((await cameraRoutes.request(`/sessions/${id}`)).status,404);
});


test("사설망 화이트리스트는 RFC1918 세 대역만 포함한다", () => {
  for (const address of ["10.0.0.1","10.255.255.254","172.16.0.1","172.31.255.254","192.168.0.1","192.168.255.254"]) assert.equal(privateCameraAddress(address),true);
  for (const address of ["172.15.255.255","172.32.0.1","192.169.0.1","127.0.0.1","169.254.169.254","100.64.0.1","224.0.0.1","8.8.8.8","::1"]) assert.equal(privateCameraAddress(address),false);
});


test("영상 파일이 있어도 10초 넘게 갱신되지 않으면 정상 수신으로 집계하지 않는다", () => {
  assert.equal(cameraReceptionStatus(false,null,20_000),"CONNECTING");
  assert.equal(cameraReceptionStatus(false,10_000,20_000),"READY");
  assert.equal(cameraReceptionStatus(false,9_999,20_000),"STALLED");
  assert.equal(cameraReceptionStatus(true,20_000,20_000),"FAILED");
});
