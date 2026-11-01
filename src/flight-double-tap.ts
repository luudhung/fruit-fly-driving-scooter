// Measure the pause after release, rather than including the duration of the first key press.
export const FLIGHT_DOUBLE_TAP_MS=400;
const MAX_FIRST_TAP_MS=300;
export class FlightDoubleTap{
 private pressedAt:number|null=null;
 private releasedAt:number|null=null;
 private toggled=false;
 private repeated=false;
 down(now:number,repeat=false):'ignored'|'first'|'double'{
  if(repeat){if(this.pressedAt!==null)this.repeated=true;return 'ignored';}
  if(this.pressedAt!==null||!Number.isFinite(now))return 'ignored';
  const gap=this.releasedAt===null?Infinity:now-this.releasedAt;
  this.toggled=gap>=0&&gap<=FLIGHT_DOUBLE_TAP_MS;
  this.pressedAt=now;this.repeated=false;this.releasedAt=null;
  return this.toggled?'double':'first';
 }
 up(now?:number){
  if(this.pressedAt===null)return;
  // The optional timestamp keeps programmatic callers compatible; browser events supply it.
  const released=now??this.pressedAt,duration=released-this.pressedAt;
  this.releasedAt=!this.toggled&&!this.repeated&&Number.isFinite(released)&&duration>=0&&duration<=MAX_FIRST_TAP_MS?released:null;
  this.pressedAt=null;this.toggled=false;this.repeated=false;
 }
 reset(){this.pressedAt=null;this.releasedAt=null;this.toggled=false;this.repeated=false;}
}
