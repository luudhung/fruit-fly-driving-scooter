/** Measures completed viewer frames; hidden-tab time is excluded. */
export class FrameStats{
 private start=0;private frames=0;private intervals:number[]=[];private last=0;
 reset(){this.start=0;this.frames=0;this.intervals=[];this.last=0;}
 sample(now:number){
  if(this.last&&now-this.last>1000)this.reset();
  if(!this.start){this.start=now;this.last=now;return null;}
  this.intervals.push(now-this.last);this.last=now;this.frames++;
  const elapsed=now-this.start;if(elapsed<5000)return null;
  const sorted=[...this.intervals].sort((a,b)=>a-b);
  const result={fps:this.frames*1000/elapsed,p95FrameMs:sorted[Math.floor((sorted.length-1)*.95)],seconds:elapsed/1000};
  this.start=now;this.frames=0;this.intervals=[];return result;
 }
}
