import assert from "node:assert/strict";
import test from "node:test";
import {FrameReceptionMetrics,inputFrameNumber} from "../src/video/frame-metrics.js";
test("원본 showinfo 프레임만 식별하고 주기 보고·설정 로그를 세지 않는다",()=>{
  assert.equal(inputFrameNumber("[Parsed_showinfo_0 @ 0x1] n:   0 pts: 123 pts_time:0.04 fmt:yuv420p"),0);
  assert.equal(inputFrameNumber("[Parsed_showinfo_0 @ 0x1] n:  34 pts: 456 pts_time:0.5"),34);
  for(const line of ["frame=34","[Parsed_showinfo_0 @ x] config in time_base: 1/90000","n: 1 pts: 5"])assert.equal(inputFrameNumber(line),null);
});
test("프레임별 단조 시각으로 최근 100개 간격을 계산하고 단절·재시작 간격도 포함한다",()=>{
  const metrics=new FrameReceptionMetrics();
  assert.equal(metrics.snapshot(0).averageIntervalMs,null);
  metrics.record(1000,0);assert.equal(metrics.snapshot().sampleCount,0);
  metrics.record(1030,30);metrics.record(1080,80);
  assert.equal(metrics.snapshot(1100).averageIntervalMs,40);assert.equal(metrics.snapshot(1100).maxIntervalMs,50);assert.equal(metrics.snapshot(1100).silenceMs,20);
  // Wall-clock adjustment must not change intervals.
  metrics.record(900,100);
  assert.equal(metrics.snapshot(1000).averageIntervalMs,100/3);
  metrics.record(20900,20100);
  assert.equal(metrics.snapshot(21000).maxIntervalMs,20000);
  for(let i=1;i<=100;i++)metrics.record(20900+i*40,20100+i*40);
  const result=metrics.snapshot(25000);
  assert.equal(result.sampleCount,100);assert.equal(result.frameCount,105);assert.equal(result.averageIntervalMs,40);assert.equal(result.maxIntervalMs,40);
});


test("일괄 도착한 서로 다른 프레임은 0 간격도 보존한다",()=>{
  const metrics=new FrameReceptionMetrics();metrics.record(1000,10);metrics.record(1000,10);
  assert.equal(metrics.snapshot(1000).frameCount,2);assert.equal(metrics.snapshot(1000).averageIntervalMs,0);
});
