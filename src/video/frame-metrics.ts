export function inputFrameNumber(line:string):number|null {
  if(!line.includes("showinfo"))return null;
  const match=/\bn:\s*(\d+)\s+pts:/.exec(line);
  return match ? Number(match[1]) : null;
}
export class FrameReceptionMetrics {
  private intervals:{at:number;value:number}[]=[];
  private head=0;
  constructor(private windowMs?:number) {}
  private trim(now:number) {
    if(this.windowMs!==undefined)while(this.head<this.intervals.length && this.intervals[this.head]!.at<now-this.windowMs)this.head++;
    else this.head=Math.max(0,this.intervals.length-100);
    if(this.head>4096 || (this.windowMs===undefined && this.head>0)){this.intervals=this.intervals.slice(this.head);this.head=0;}
  }
  private lastTick:number|null=null;
  private lastAt:number|null=null;
  private count=0;
  record(at=Date.now(),tick=performance.now()) {
    if(this.lastTick!==null)this.intervals.push({at,value:Math.max(0,tick-this.lastTick)});
    this.lastTick=tick;this.lastAt=at;this.count++;this.trim(at);
  }
  snapshot(now=Date.now()) {
    this.trim(now);
    const intervals=this.intervals.slice(this.head);
    return {frameCount:this.count,sampleCount:intervals.length,
      averageIntervalMs:intervals.length ? intervals.reduce((sum,item)=>sum+item.value,0)/intervals.length : null,
      maxIntervalMs:intervals.length ? intervals.reduce((max,item)=>Math.max(max,item.value),0) : null,
      lastFrameReceivedAt:this.lastAt===null ? null : new Date(this.lastAt).toISOString(),
      silenceMs:this.lastAt===null ? null : Math.max(0,now-this.lastAt)};
  }
}
