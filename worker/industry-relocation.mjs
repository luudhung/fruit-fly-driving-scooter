import {INDUSTRIAL_PLANTS,INDUSTRIAL_LOADING_BAYS} from './industry-map.mjs';

/** Move leases, never companies or their assets. Pending freight keeps its escrow/cargo. */
export function migrateNorthIndustry(state){
 if(state.northIndustryRelocation===2)return false;
 const plants=INDUSTRIAL_PLANTS.filter(p=>p.zone==='north'),byId=new Map(plants.map(p=>[p.id,p]));
 const targets=new Map(byId);for(const item of [...(state.urbanWorld?.fires||[]),...(state.urbanWorld?.projects||[])]){const p=byId.get(item.buildingId);if(p)targets.set(`${item.teamIds?'CIVIC-FIRE':'CIVIC-SITE'}-${item.id}`,p);}
 for(const p of plants){
  const record=state.urbanWorld?.buildings?.[p.id];
  if(record)Object.assign(record,{x:p.x,z:p.z,w:p.w,d:p.d,frontage:{...p.frontage},district:'north'});
  for(const project of state.urbanWorld?.projects||[])if(project.buildingId===p.id){if('x'in project)project.x=p.x;if('z'in project)project.z=p.z;}
 }
 for(const b of Object.values(state.enterprises||{})){
  const p=byId.get(b.industrialPlantId||b.locationId);if(!p)continue;
  b.industrialZone='north';if('x'in b)b.x=p.x;if('z'in b)b.z=p.z;
  if(b.lease){if('x'in b.lease)b.lease.x=p.x;if('z'in b.lease)b.lease.z=p.z;}
 }
 for(const f of state.flies||[]){
  const target=targets.get(f.targetLocationId),current=byId.get(f.currentLocationId);
  if(target&&f.traveling){f.relocatedDestinationId=f.targetLocationId;f.relocatedDestinationPoint={...target.frontage};}
  else if(current&&!f.industrialFreightDuty){Object.assign(f,{x:current.frontage.x,z:current.frontage.z});}
 }
 for(const t of [...(state.industrialEconomy?.trucks||[]),...(state.regionalFreight?.trucks||[])]){
  const company=state.enterprises?.[t.ownerBusinessId],home=byId.get(t.locationId||company?.locationId||t.homeId);
  const nearOld=([-390,-280,-145,-40].some(x=>Math.hypot(t.x-x,t.z+596.3)<45)||[-800,-700,-600,-500].some(x=>Math.hypot(t.x-x,t.z+993.7)<45));
  if(!t.traveling&&!t.orderId&&!t.jobId&&home&&nearOld){const bay=INDUSTRIAL_LOADING_BAYS[home.id];Object.assign(t,{...bay,routeWaypoints:[],routeIndex:0,motionSpeed:0});}
  else {
   const order=state.industrialEconomy?.orders?.find(o=>o.id===t.orderId&&!o.paid),job=state.regionalFreight?.jobs?.find(j=>j.id===t.jobId&&!j.paid);
   const destination=order?(t.phase==='collecting'?order.sourceLocationId:order.destinationId):job?(['collecting','loading'].includes(t.phase)?job.from:job.to):t.routeDestination;
   if(byId.has(destination)){t.industryRouteRelocated=true;if(job&&['loading','unloading'].includes(t.phase)){t.phase=t.phase==='loading'?'collecting':'delivering';job.phase=t.phase;t.waitUntil=0;t.routeDestination=destination;}}
  }
 }
 state.northIndustryRelocation=2;return true;
}
