/** A presentation clock can advance between snapshots, but never rewind on delayed data. */
export class CityClock{
 private source=-Infinity;private anchor=0;private receivedAt=0;private scale=120;
 accept(gameSeconds:number,now:number,timeScale=120){
  if(!Number.isFinite(gameSeconds)||gameSeconds<this.source)return false;
  if(gameSeconds===this.source)return true;
  this.anchor=this.source===-Infinity?gameSeconds:Math.max(gameSeconds,this.read(now));
  this.source=gameSeconds;this.receivedAt=now;this.scale=Math.max(1,timeScale);return true;
 }
 read(now:number){return this.anchor+Math.min(30,Math.max(0,(now-this.receivedAt)/1000))*this.scale;}
}
