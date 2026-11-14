import {apartmentHouseholdCapacity,occupiedHouseholdCount} from './housing-capacity.mjs';
import {DISTRICT_SETTLEMENTS} from './expansion-settlement.mjs';
import {COMBINED_CAP,RESIDENT_CAP,RESIDENT_TARGET} from './population-limits.mjs';

export const THOUSAND_SETTLEMENT_VERSION=1;
export const SETTLEMENT_FURNISHINGS=Object.freeze({bed:1,wardrobe:1,diningTable:1,chairs:2,kitchen:1,refrigerator:1,bathroom:1,lighting:1});
const furnishingValue=480;
const alive=f=>f.alive&&!f.departed;

/** Plan every home before invoking the ordinary brain/resident constructor. */
export function thousandSettlementPlan(state){
 if(state.thousandSettlement?.version>=THOUSAND_SETTLEMENT_VERSION)return null;
 const living=state.flies.filter(alive).length,needed=Math.max(0,RESIDENT_TARGET-living),visitors=(state.cityVisitors?.visitors||[]).filter(alive).length;
 if(needed&& (living+needed>RESIDENT_CAP||living+needed+visitors>COMBINED_CAP))throw Error('The thousand-resident settlement exceeds resident/visitor admission capacity');
 const operational=id=>!state.urbanWorld?.buildings?.[id]||state.urbanWorld.buildings[id].stage==='operational';
 const europeanVacancies=(state.housing?.apartmentBlocks||[]).filter(b=>b.x>480&&!b.luxury&&operational(b.id)).reduce((n,b)=>n+Math.max(0,apartmentHouseholdCapacity(b.h)-occupiedHouseholdCount(b)),0);
 const army=(state.flies||[]).filter(f=>alive(f)&&(f.publicServiceRole==='army'||f.jobId==='military')).length,militaryNeeded=Math.min(needed,Math.max(0,50-army)),europeCount=Math.min(militaryNeeded,Math.max(0,needed-200),europeanVacancies),remainder=needed-europeCount;
 const counts={airport:Math.floor(remainder/2),west:Math.ceil(remainder/2),europe:europeCount},groups=[];
 for(const district of [...DISTRICT_SETTLEMENTS,{id:'europe',homeId:'riverside-homes'}]){
  const count=counts[district.id],homes=[],reserved=new Map();
  if(district.housePrefix)for(const house of (state.housing?.houseLots||[]).filter(h=>h.id.startsWith(district.housePrefix)&&!h.ownerHouseholdId&&operational(h.id)).slice(0,Math.min(24,count)))homes.push({type:'house',id:house.id});
  const blocks=(state.housing?.apartmentBlocks||[]).filter(b=>(district.id==='europe'?b.x>480:b.id.startsWith(district.apartmentPrefix))&&!b.luxury&&operational(b.id));
  while(homes.length<count){
   const available=blocks.filter(b=>occupiedHouseholdCount(b)+(reserved.get(b.id)||0)<apartmentHouseholdCapacity(b.h)).sort((a,b)=>(occupiedHouseholdCount(a)+(reserved.get(a.id)||0))-(occupiedHouseholdCount(b)+(reserved.get(b.id)||0))||a.id.localeCompare(b.id));
   if(!available.length)throw Error(`${district.id} needs ${count} reserved operational homes before the thousand-resident settlement`);
   const block=available[0];reserved.set(block.id,(reserved.get(block.id)||0)+1);homes.push({type:'apartment',id:block.id});
  }
  groups.push({...district,district:district.id==='airport'?'north':district.id,homes});
 }
 return {living,target:RESIDENT_TARGET,needed,militaryNeeded,groups};
}

/** Immigration imports personal capital and prefurnished assets. It is neither a
 * birth grant nor domestic production: existing wallets and property titles stay intact. */
export function settleThousandResidents(state,{createResident,releaseHousingUnit,parkingPoint=()=>null,liquidMoneySupply,remember=()=>{},emit=()=>{}}){
 const plan=thousandSettlementPlan(state);if(!plan)return 0;
 const at=Number(state.simulationAgeSeconds||0),beforeMoney=liquidMoneySupply(),blocks=new Map((state.housing?.apartmentBlocks||[]).map(b=>[b.id,b])),houses=new Map((state.housing?.houseLots||[]).map(b=>[b.id,b]));
 const commuterCadres=plan.militaryNeeded-(plan.groups.find(g=>g.id==='europe')?.homes.length||0);
 const result={version:THOUSAND_SETTLEMENT_VERSION,at,target:plan.target,beforeLiving:plan.living,afterLiving:plan.living,added:0,arrivalIds:[],externalCapital:0,externalHousingValue:0,externalFurnishingValue:0,militaryCadreIds:[],fundingSource:'Immigrants bring personal savings and imported prefurnished home assets; no domestic business revenue or public cash is fabricated.'};
 for(const group of plan.groups){
  const arrivalIds=[],moneyBefore=liquidMoneySupply();let housingValue=0;
  for(const reservation of group.homes){
   const militaryCadre=group.district==='europe'||result.militaryCadreIds.length<commuterCadres,cadetAge=23+(result.militaryCadreIds.length%18);
   const f=createResident({militaryCadre,ageYears:militaryCadre?cadetAge:undefined}),hh=state.housing.households[f.householdId],home=(reservation.type==='house'?houses:blocks).get(reservation.id);if(!hh||!home)throw Error('Settlement constructor failed to provide its reserved household/home');
   releaseHousingUnit(hh);const house=reservation.type==='house',value=house?Number(home.baseValue||0):0;
   if(house)home.ownerHouseholdId=hh.id;else{home.occupants||=[];home.occupants.push(hh.id);}
   Object.assign(hh,{housingType:reservation.type,unitId:home.id,homeX:home.x,homeZ:home.z,monthlyHousingCost:house?Math.round(value*.003):home.rent,propertyValue:value,furnishings:{...SETTLEMENT_FURNISHINGS},furnishingValue,furnishedAt:at,furnishingSource:'immigrant-import'});
   Object.assign(f,{homeDistrict:group.district,housingType:reservation.type,housingUnitId:home.id,homeX:home.x,homeZ:home.z,homeId:group.homeId,currentLocationId:group.homeId,targetLocationId:group.homeId,x:home.x,y:1.1,z:home.z,targetX:home.x,targetZ:home.z,finalTargetX:home.x,finalTargetZ:home.z,ownsHome:house,homeTier:house?1:0,homeEquity:value,indoors:true,traveling:false,onTrain:false,onPlane:false,routeWaypoints:[],routeIndex:0,movementTrace:[],transitMode:'walk',transitStage:null,action:`settling into ${group.district==='north'?'North City':group.district==='west'?'West City':'Europe military homes'}`,actionUntil:at+600});
   if(militaryCadre){Object.assign(f,{ageYears:cadetAge,bornAtGameYears:at/(86400*12)-cadetAge,militaryCadreArrival:true,jobId:null,jobTitle:'volunteer military cadet',wage:0,health:Math.max(85,Number(f.health||0)),energy:Math.max(80,Number(f.energy||0)),hunger:Math.min(40,Number(f.hunger||0))});result.militaryCadreIds.push(f.id);}
   f.parkedCar=f.vehicle?parkingPoint(f):null;state.flies.push(f);arrivalIds.push(f.id);result.arrivalIds.push(f.id);housingValue+=value;
   remember(f,'thousand_settlement',{district:group.district,buildingId:home.id,at,prefurnished:true});
  }
  result[group.district]={added:arrivalIds.length,arrivalIds,externalCapital:liquidMoneySupply()-moneyBefore,externalHousingValue:housingValue,externalFurnishingValue:arrivalIds.length*furnishingValue};
  result.added+=arrivalIds.length;result.externalHousingValue+=housingValue;result.externalFurnishingValue+=arrivalIds.length*furnishingValue;
 }
 result.afterLiving=state.flies.filter(alive).length;result.externalCapital=liquidMoneySupply()-beforeMoney;state.thousandSettlement=result;
 if(result.added)emit('population_settlement',`${result.added} immigrants settled into prefurnished northern and western homes, bringing the living population to ${result.afterLiving}.`,{added:result.added,northAdded:result.north.added,westAdded:result.west.added,europeAdded:result.europe.added,militaryCadreIds:result.militaryCadreIds,externalCapital:result.externalCapital,externalFurnishingValue:result.externalFurnishingValue,target:result.target});
 return result.added;
}
