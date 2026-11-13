/** Asynchronous GPU queries never wait for the GPU or read pixels. Unsupported drivers report null. */
type TimerExtension={TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number};
export class RenderTimings{
 private ext:TimerExtension|null;private query:WebGLQuery|null=null;private running=false;private nextAt=0;
 gpuMs:number|null=null;private gpuWindow:number[]=[];cpuMs=0;private cpuTotal=0;private cpuCount=0;
 private gl:WebGL2RenderingContext;
 constructor(gl:WebGL2RenderingContext|WebGLRenderingContext){this.gl=gl as WebGL2RenderingContext;this.ext='beginQuery'in gl?gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension|null:null;}
 begin(now:number){
  const gl=this.gl,ext=this.ext;if(!ext)return;
  if(this.query&&!this.running&&gl.getQueryParameter(this.query,gl.QUERY_RESULT_AVAILABLE)){
   if(!gl.getParameter(ext.GPU_DISJOINT_EXT)){this.gpuMs=gl.getQueryParameter(this.query,gl.QUERY_RESULT)/1e6;this.gpuWindow.push(this.gpuMs);}else{this.gpuMs=null;this.gpuWindow=[];}
   gl.deleteQuery(this.query);this.query=null;
  }
  if(!this.query&&now>=this.nextAt&&!gl.isContextLost()){
   this.query=gl.createQuery();if(this.query){gl.beginQuery(ext.TIME_ELAPSED_EXT,this.query);this.running=true;this.nextAt=now+1000;}
  }
 }
 end(cpuMs:number){
  if(this.running&&this.ext){this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.running=false;}
  this.cpuTotal+=cpuMs;this.cpuCount++;
 }
 sampleGPU(){const value=this.gpuWindow.length?this.gpuWindow.reduce((sum,n)=>sum+n,0)/this.gpuWindow.length:this.gpuMs;this.gpuWindow=[];return value;}
 sampleCPU(){this.cpuMs=this.cpuCount?this.cpuTotal/this.cpuCount:0;this.cpuTotal=0;this.cpuCount=0;return this.cpuMs;}
}
