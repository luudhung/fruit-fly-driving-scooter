import {apartmentHouseholdCapacity,occupiedHouseholdCount} from './housing-capacity.mjs';
import {RESIDENT_CAP,COMBINED_CAP,NEW_DISTRICT_RESIDENTS} from './population-limits.mjs';

const DISTRICTS=[
 {id:'airport',apartmentPrefix:'AIRPORT-APT-',homeId:'airport-gardens-homes'},
 {id:'west',apartmentPrefix:'WEST-APT-',housePrefix:'WEST-HOUSE-',homeId:'west-gardens-homes'},
];

/** Reserve both whole settlement groups before creating a single new person.
 * Existing residents keep their household, wealth, home and brain identity. */
export function expansionSettlementPlan(state){
 if(state.expansionSettlement?.version>=1)return null;
 const living=state.flies.filter(f=>f.alive&&!f.departed).length;
 const visitors=(state.cityVisitors?.visitors||[]).filter(f=>f.alive&&!f.departed).length;
 const required=NEW_DISTRICT_RESIDENTS*DISTRICTS.length;
 if(living+required>RESIDENT_CAP||living+visitors+required>COMBINED_CAP)
  throw new Error('The two district settlements require capacity for 128 additional residents');
 const operational=id=>!state.urbanWorld?.buildings?.[id]||state.urbanWorld.buildings[id].stage==='operational';
 const plan=[];
 for(const district of DISTRICTS){
  const homes=[];
  if(district.housePrefix){
   const houses=(state.housing?.houseLots||[]).filter(h=>h.id.startsWith(district.housePrefix)&&!h.ownerHouseholdId&&operational(h.id));
   for(const house of houses.slice(0,16))homes.push({type:'house',id:house.id});
  }
  const blocks=(state.housing?.apartmentBlocks||[]).filter(b=>b.id.startsWith(district.apartmentPrefix)&&!b.luxury&&operational(b.id));
  const reserved=new Map();
  while(homes.length<NEW_DISTRICT_RESIDENTS){
   const available=blocks.filter(b=>occupiedHouseholdCount(b)+(reserved.get(b.id)||0)<apartmentHouseholdCapacity(b.h))
    .sort((a,b)=>(occupiedHouseholdCount(a)+(reserved.get(a.id)||0))-(occupiedHouseholdCount(b)+(reserved.get(b.id)||0))||a.id.localeCompare(b.id));
   if(!available.length)throw new Error(`${district.id} needs homes for 64 additional households before settlement`);
   const block=available[0];reserved.set(block.id,(reserved.get(block.id)||0)+1);homes.push({type:'apartment',id:block.id});
  }
  plan.push({...district,homes});
 }
 return plan;
}

/** The engine supplies its ordinary resident/brain seed function without the
 * unrelated estate settlement and household merging of population recovery. */
export function settleExpansionResidents(state,{createResident,releaseHousingUnit,parkingPoint=()=>null,liquidMoneySupply,emit=()=>{},remember=()=>{}}){
 const plan=expansionSettlementPlan(state);if(!plan)return 0;
 const beforeMoney=liquidMoneySupply(),at=Number(state.simulationAgeSeconds||0),result={version:1,at,added:0,arrivalIds:[],externalCapital:0,externalHousingValue:0};
 const blocks=new Map(state.housing.apartmentBlocks.map(b=>[b.id,b]));
 const houses=new Map(state.housing.houseLots.map(b=>[b.id,b]));
 for(const district of plan){
  const moneyBefore=liquidMoneySupply(),arrivalIds=[];let housingValue=0;
  for(const reservation of district.homes){
   const fly=createResident(),household=state.housing.households[fly.householdId],home=(reservation.type==='house'?houses:blocks).get(reservation.id);
   releaseHousingUnit(household);
   const house=reservation.type==='house',value=house?Number(home.baseValue||9000):0;
   if(house)home.ownerHouseholdId=household.id;
   else{home.occupants||=[];home.occupants.push(household.id);}
   Object.assign(household,{housingType:reservation.type,unitId:home.id,homeX:home.x,homeZ:home.z,
    monthlyHousingCost:house?Math.round(value*.003):home.rent,propertyValue:value});
   Object.assign(fly,{homeDistrict:district.id,housingType:reservation.type,housingUnitId:home.id,homeX:home.x,homeZ:home.z,
    homeId:district.homeId,currentLocationId:district.homeId,targetLocationId:district.homeId,
    x:home.x,y:1.1,z:home.z,targetX:home.x,targetZ:home.z,finalTargetX:home.x,finalTargetZ:home.z,
    ownsHome:house,homeTier:house?1:0,homeEquity:value,indoors:true,traveling:false,onTrain:false,onPlane:false,
    routeWaypoints:[],routeIndex:0,movementTrace:[],transitMode:'walk',transitStage:null,
    action:`settling into ${district.id==='airport'?'Airport Gardens':'Westborough'}`,actionUntil:at+600});
   fly.parkedCar=fly.vehicle?parkingPoint(fly):null;
   state.flies.push(fly);arrivalIds.push(fly.id);result.arrivalIds.push(fly.id);housingValue+=value;
   remember(fly,'district_settlement',{district:district.id,buildingId:home.id,at});
  }
  const externalCapital=liquidMoneySupply()-moneyBefore;
  result[district.id]={added:arrivalIds.length,arrivalIds,externalCapital,externalHousingValue:housingValue};
  result.added+=arrivalIds.length;result.externalHousingValue+=housingValue;
 }
 result.externalCapital=liquidMoneySupply()-beforeMoney;state.expansionSettlement=result;
 emit('district_settlement','64 new residents moved into Airport Gardens and 64 into Westborough.',{
  airportAdded:result.airport.added,westAdded:result.west.added,arrivalIds:result.arrivalIds,externalCapital:result.externalCapital,
 });
 return result.added;
}
