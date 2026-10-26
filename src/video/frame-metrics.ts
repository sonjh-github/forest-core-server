export function inputFrameNumber(line:string):number|null {
  if(!line.includes("showinfo"))return null;
  const match=/\bn:\s*(\d+)\s+pts:/.exec(line);
  return match ? Number(match[1]) : null;
}
export class FrameReceptionMetrics {
  private intervals:number[]=[];
  private lastTick:number|null=null;
  private lastAt:number|null=null;
  private count=0;
  record(at=Date.now(),tick=performance.now()) {
    if(this.lastTick!==null)this.intervals=[...this.intervals,Math.max(0,tick-this.lastTick)].slice(-100);
    this.lastTick=tick;this.lastAt=at;this.count++;
  }
  snapshot(now=Date.now()) {
    return {frameCount:this.count,sampleCount:this.intervals.length,
      averageIntervalMs:this.intervals.length ? this.intervals.reduce((sum,value)=>sum+value,0)/this.intervals.length : null,
      maxIntervalMs:this.intervals.length ? Math.max(...this.intervals) : null,
      lastFrameReceivedAt:this.lastAt===null ? null : new Date(this.lastAt).toISOString(),
      silenceMs:this.lastAt===null ? null : Math.max(0,now-this.lastAt)};
  }
}
