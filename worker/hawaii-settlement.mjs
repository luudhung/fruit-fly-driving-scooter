import {HAWAII_APARTMENTS,COUNTRY_IDS,countryForHome} from './country-map.mjs';
import {RESIDENT_CAP,COMBINED_CAP,HAWAII_RESIDENT_TARGET} from './population-limits.mjs';
/** One funded external settlement, with real resident brains and permanent homes. */
export function settleHawaiiResidents(state,{createResident,releaseHousingUnit,parkingPoint=()=>null,liquidMoneySupply,remember=()=>{},emit=()=>{},jobs=[]}){
 if(state.hawaiiSettlement?.version)return 0;
 const living=state.flies.filter(f=>f.alive),existing=living.filter(f=>countryForHome(f.housingUnitId,{x:f.homeX,z:f.homeZ})===COUNTRY_IDS.hawaii).length;
 const count=Math.max(0,HAWAII_RESIDENT_TARGET-existing),visitors=(state.cityVisitors?.visitors||[]).filter(f=>f.alive&&!f.departed).length;
 if(living.length+count>RESIDENT_CAP||living.length+visitors+count>COMBINED_CAP)throw Error('Hawaii permanent settlement exceeds resident capacity');
 const homes=HAWAII_APARTMENTS.filter(b=>b.primaryResidence),blocks=state.housing.apartmentBlocks;
 for(const b of homes)if(!blocks.some(h=>h.id===b.id))blocks.push({...b,capacityUnit:'households',occupants:[]});
 const choices=homes.map(b=>blocks.find(h=>h.id===b.id)),slots=choices.flatMap(b=>Array.from({length:Math.max(0,b.capacity-(b.occupants||[]).length)},()=>b));
 if(slots.length<count)throw Error('Hawaii settlement needs permanent housing before new residents');
 const at=state.simulationAgeSeconds,before=liquidMoneySupply(),ids=[];
 for(let i=0;i<count;i++){
  const f=createResident(),hh=state.housing.households[f.householdId],home=slots[i],job=jobs[i%Math.max(1,jobs.length)];
  if(!hh)throw Error('Hawaii resident constructor must supply a household');
  releaseHousingUnit(hh);home.occupants||=[];home.occupants.push(hh.id);
  Object.assign(hh,{unitId:home.id,housingType:'apartment',homeX:home.x,homeZ:home.z,monthlyHousingCost:home.rent,propertyValue:0});
  Object.assign(f,{homeDistrict:'hawaii',homeId:home.id,housingUnitId:home.id,housingType:'apartment',homeX:home.x,homeZ:home.z,x:home.x,y:1.1,z:home.z,currentLocationId:home.id,targetLocationId:home.id,targetX:home.x,targetZ:home.z,finalTargetX:home.x,finalTargetZ:home.z,ownsHome:false,homeEquity:0,indoors:true,traveling:false,onPlane:false,onTrain:false,routeWaypoints:[],routeIndex:0,movementTrace:[],transitMode:'walk',transitStage:null,citizenshipCountryId:COUNTRY_IDS.hawaii,residencyCountryId:COUNTRY_IDS.hawaii,originCountryId:COUNTRY_IDS.hawaii,countryPresence:{countryId:COUNTRY_IDS.hawaii,enteredAt:at,entryId:'hawaii-settlement-'+f.id,legacyAdmission:true},nationalityHistory:[{at,type:'initial citizenship',countryId:COUNTRY_IDS.hawaii}],action:'settling into a permanent Hawaii home',actionUntil:at+600});
  if(job)Object.assign(f,{jobId:job.id,jobTitle:job.title,wage:job.wage,preferredWorkStart:job.shiftStart,preferredWorkHours:8});
  f.parkedCar=f.vehicle?parkingPoint(f):null;state.flies.push(f);ids.push(f.id);remember(f,'hawaii_settlement',{buildingId:home.id,at});
 }
 state.hawaiiSettlement={version:1,at,target:HAWAII_RESIDENT_TARGET,existing,added:ids.length,arrivalIds:ids,externalCapital:liquidMoneySupply()-before};
 emit('hawaii_settlement',`${ids.length} permanent residents received Hawaii homes.`,{...state.hawaiiSettlement});return ids.length;
}
