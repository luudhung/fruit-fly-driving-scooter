import {NORTH_LANDMARK} from './country-map.mjs';
import {entrance,contains} from './city-map.mjs';

/** Relocate the same owned building and its interior, preserving every deed,
 * balance, incident and project. Outdoor journeys continue from their real pose. */
export function relocateNorthTower(state){
 if(Number(state.northTowerRelocationVersion||0)>=31)return {moved:false};
 const b=NORTH_LANDMARK,block=state.housing?.apartmentBlocks?.find(v=>v.id===b.id),record=state.urbanWorld?.buildings?.[b.id];
 const previous={x:block?.x??record?.x??-216,z:block?.z??record?.z??-904};
 if(block)Object.assign(block,{x:b.x,z:b.z});
 if(record)Object.assign(record,{x:b.x,z:b.z,w:b.w,d:b.d,h:b.h});
 const householdIds=new Set();
 for(const hh of Object.values(state.housing?.households||{}))if(hh.unitId===b.id){hh.homeX=b.x;hh.homeZ=b.z;householdIds.add(hh.id);}
 const old={...b,...previous};let residents=0;
 for(const f of [...(state.flies||[]),...(state.cityVisitors?.visitors||[])]){
  const home=f.housingUnitId===b.id||householdIds.has(f.householdId);
  if(home){f.homeX=b.x;f.homeZ=b.z;residents++;if(f.displacedFrom?.buildingId===b.id){f.displacedFrom.homeX=b.x;f.displacedFrom.homeZ=b.z;}}
  const inside=f.alive&&f.indoors&&!f.traveling&&!f.onTrain&&!f.onPlane&&!f.onPrivateHelicopter&&!f.heliPassenger&&!f.taxiPassenger&&!f.onFireEngine&&!f.onAmbulance&&(f.currentLocationId===b.id||home&&f.currentLocationId===f.homeId&&contains(old,f,2));
  if(inside){const dx=f.x-previous.x,dz=f.z-previous.z;f.x=b.x+Math.max(-b.w/2,Math.min(b.w/2,dx));f.z=b.z+Math.max(-b.d/2,Math.min(b.d/2,dz));f.targetX=f.x;f.targetZ=f.z;f.finalTargetX=f.x;f.finalTargetZ=f.z;f.movementTrace=[];}
  if(f.alive&&f.traveling&&(f.targetLocationId===b.id||home&&f.targetLocationId===f.homeId)){f.relocatedDestinationId=f.targetLocationId;f.relocatedDestinationPoint=entrance(b);}
 }
 for(const p of state.urbanWorld?.projects||[])if(p.buildingId===b.id){p.x=b.x;p.z=b.z;}
 state.northTowerRelocationVersion=31;
 state.northTowerRelocation={at:Number(state.simulationAgeSeconds||0),from:previous,to:{x:b.x,z:b.z},residentCount:residents};
 return {moved:previous.x!==b.x||previous.z!==b.z,residents};
}
