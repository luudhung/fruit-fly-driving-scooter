import {COUNTRY_IDS,countryAt} from './country-map.mjs';
import {LOCATIONS,parkingPoint,entrance} from './city-map.mjs';
import {hasCountryCommitment} from './country-commitments.mjs';

/** The visible workshop and the actual engine use this same south-facing bay. */
export const NORTH_FIRE_STATION=Object.freeze({id:'north-firestation',x:180,z:-620,w:34,d:24,garage:{x:173,z:-620},exit:{x:173,z:-600},heading:0});
export function createNorthFireDepot({world}){
 const north=COUNTRY_IDS.north,now=()=>Number(world().simulationAgeSeconds||0),role=kind=>kind==='fire'?'fire':'medical';
 return {
  id:north,countryId:north,stationId:NORTH_FIRE_STATION.id,operationsAccountId:'north-emergency-operations',fundingAccountId:'treasury:north-city',waterCapacity:1600,minimumFireCrew:2,
  budget:()=>world().businesses?.['treasury:north-city']||null,
  definitions:()=>{
   const clinic=LOCATIONS.find(l=>l.id==='north-hospital'),bay=clinic&&(parkingPoint(clinic)||entrance(clinic));
   return [{id:'NORTH-FIRE-ENGINE-1',kind:'fire',homeLocationId:NORTH_FIRE_STATION.id,bay:0,home:{...NORTH_FIRE_STATION.garage},exit:{...NORTH_FIRE_STATION.exit},heading:NORTH_FIRE_STATION.heading,purchaseCost:1800},
    ...(bay&&countryAt(bay)===north?[{id:'NORTH-AMBULANCE-1',kind:'ambulance',homeLocationId:'north-hospital',bay:0,home:{x:bay.x,z:bay.z},exit:{x:bay.x,z:bay.z},heading:bay.heading||0,purchaseCost:1100}]:[])];
  },
  staffIds:kind=>world().nationalServices?.rosters?.[role(kind)]||[],
  acceptsStaff:(f,kind)=>Boolean(f?.alive&&f.publicServiceCountryId===north&&f.nationalServiceRole===role(kind)&&f.citizenshipCountryId===north&&countryAt(f)!==COUNTRY_IDS.hawaii&&!hasCountryCommitment({...f,nationalServiceDuty:null,nationalServiceResting:false},now(),false)),
  onAssign:f=>{f.nationalServiceDuty=null;f.nationalServiceSampleAt=now();f.nationalServiceResting=false;},
  onWaterUsed:amount=>{if(world().nationalServices)world().nationalServices.fireWaterUsed=Number(world().nationalServices.fireWaterUsed||0)+amount;},
 };
}
