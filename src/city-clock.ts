/** A presentation clock can advance between snapshots, but never rewind on delayed data. */
export const CITY_VIEW_PREDICTION_SECONDS=90;
export class CityClock{
 private source=-Infinity;private anchor=0;private receivedAt=0;private scale=120;
 private readonly predictionSeconds:number;
 constructor(predictionSeconds=30){this.predictionSeconds=predictionSeconds;}
 reset(){this.source=-Infinity;this.anchor=0;this.receivedAt=0;this.scale=120;}
 accept(gameSeconds:number,now:number,timeScale=120){
  if(!Number.isFinite(gameSeconds)||gameSeconds<this.source)return false;
  if(gameSeconds===this.source)return true;
  this.anchor=this.source===-Infinity?gameSeconds:Math.max(gameSeconds,this.read(now));
  this.source=gameSeconds;this.receivedAt=now;this.scale=Math.max(1,timeScale);return true;
 }
 read(now:number){
  if(this.source===-Infinity)return 0;
  const elapsed=Math.min(this.predictionSeconds,Math.max(0,(now-this.receivedAt)/1000));
  const projected=this.predictionSeconds>30?Math.min(20,elapsed)+Math.max(0,elapsed-20)*.6:elapsed;
  // Repeated small authoritative advances must not accumulate unlimited visual lead.
  return Math.min(this.anchor+projected*this.scale,this.source+this.predictionSeconds*this.scale);
 }
}
