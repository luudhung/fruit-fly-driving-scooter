import {isNorthF1TrackClosed,northF1MovementBlocked} from './north-f1-closure.mjs';
import {PARKING_SPACES,clearSegment} from './city-map.mjs';
import {countryAt} from './country-map.mjs';
import {parkingReservations,occupyParking} from './vehicle-parking.mjs';
const STALLED=6*3600;
/** Slow, paid roadside removal of a genuinely stalled freight vehicle. Cargo,
 * contract and its escrow stay on the same truck. Positions are swept through
 * free space, never reset to a depot or pushed through another vehicle. */
export function recoverStalledFreight(world,truck,seconds,headway,onCleared){
 const now=Number(world.simulationAgeSeconds||0),previous=truck.freightProgress;
 const clearRecoveryPath=(a,b)=>clearSegment(a,b)&&(!isNorthF1TrackClosed(world)||!northF1MovementBlocked(a,b,2));
 const moved=previous&&Math.hypot(truck.x-previous.x,truck.z-previous.z)>.2;
 if(!previous||moved)truck.freightProgress={x:truck.x,z:truck.z,at:now};
 let rescue=truck.freightRecovery;
 if(!rescue){
  if(!truck.traveling||now-Number(truck.freightProgress.at)<STALLED)return false;
  if(now<Number(truck.nextFreightRecoveryAt||0))return false;
  // A single tow clears each congested junction; two intersecting recovery
  // paths would otherwise block one another just like the original trucks.
  if((world.regionalFreight?.trucks||[]).some(t=>t.id!==truck.id&&t.freightRecovery&&Math.hypot(t.x-truck.x,t.z-truck.z)<120))return false;
  const country=countryAt(truck),taken=parkingReservations(world,truck.id);
  // Other disabled hauliers retain their booked clearance bays.
  for(const t of world.regionalFreight?.trucks||[])if(t.id!==truck.id&&t.freightRecovery)occupyParking(taken,t.freightRecovery);
  const choices=PARKING_SPACES.filter(p=>countryAt(p)===country&&!taken.has(p.id)&&Math.hypot(p.x-truck.x,p.z-truck.z)>5&&Math.hypot(p.x-truck.x,p.z-truck.z)<100)
   .sort((a,b)=>Math.hypot(a.x-truck.x,a.z-truck.z)-Math.hypot(b.x-truck.x,b.z-truck.z));
  let bay=choices.find(p=>clearRecoveryPath(truck,p)&&headway({...truck,vehicleHeading:truck.heading},p)>=Math.hypot(p.x-truck.x,p.z-truck.z)-.1);
  if(!bay){
   // A disabled lorry across a turning lane may have no straight path to a
   // curb. First reverse out of the conflict, with the same swept-body check.
   const h=Number(truck.vehicleHeading??truck.heading??0);
   for(const length of [8,6,4]){
    const p={x:truck.x-Math.sin(h)*length,z:truck.z-Math.cos(h)*length,backing:true};
    if(countryAt(p)===country&&clearRecoveryPath(truck,p)&&headway({...truck,vehicleHeading:h},p)>=length-.1){bay=p;break;}
   }
  }
  if(!bay){truck.nextFreightRecoveryAt=now+1800;return false;}
  const payer=country==='hansdrex'?world.treasury:world.businesses?.[`treasury:${country}`];
  world.businesses||={};const operator=world.businesses['vehicle-recovery']||={cash:0,inventory:0,sector:'roadside-assistance',receivables:0};
  const paid=Math.min(12,Math.max(0,Number(payer?.cash||0)));if(paid){payer.cash-=paid;operator.cash+=paid;world.totalTransactions=Number(world.totalTransactions||0)+1;}
  operator.receivables=Number(operator.receivables||0)+12-paid;
  truck.freightRecovery=rescue={...bay,startedAt:now,lastProgressAt:now,paid,originalPhase:truck.phase};truck.vehicleHeading=truck.heading;truck.motionSpeed=0;
 }
 if(now-Number(rescue.lastProgressAt??rescue.startedAt)>1800){truck.freightRecovery=null;delete truck.vehicleHeading;truck.nextFreightRecoveryAt=now+600;return false;}
 const length=Math.hypot(rescue.x-truck.x,rescue.z-truck.z),step=Math.min(length,Math.max(0,seconds)/Math.max(1,Number(world.timeScale||120))*2);
 if(length>.03&&step>0){
  const dx=(rescue.x-truck.x)/length,dz=(rescue.z-truck.z)/length,end={x:truck.x+dx*step,z:truck.z+dz*step};
  const allowed=Math.min(step,headway(truck,end));
  const next={x:truck.x+dx*allowed,z:truck.z+dz*allowed};
  if(clearRecoveryPath(truck,next)&&countryAt(next)===countryAt(truck)){
   if(allowed>.05)rescue.lastProgressAt=now;
   Object.assign(truck,{x:next.x,z:next.z,vx:dx*allowed,vz:dz*allowed,motionSpeed:allowed>0?2:0,targetX:rescue.x,targetZ:rescue.z});
  }
 }
 if(Math.hypot(rescue.x-truck.x,rescue.z-truck.z)<.08){
  truck.freightRecovery=null;delete truck.vehicleHeading;truck.freightProgress={x:truck.x,z:truck.z,at:now};truck.lastProgressAt=now;
  onCleared?.(truck);world.regionalFreight.recovered=Number(world.regionalFreight.recovered||0)+1;
 }
 return true;
}
