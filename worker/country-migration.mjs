import {COUNTRY_IDS,countryForHome,countryAt} from './country-map.mjs';
import {apartmentHouseholdCapacity,occupiedHouseholdCount} from './housing-capacity.mjs';
const living=f=>f.alive&&!f.departed;
const unitCaches=new WeakMap();
function unitMap(housing){if(!housing)return new Map();let c=unitCaches.get(housing);const houses=housing.houseLots||[],blocks=housing.apartmentBlocks||[];if(!c||c.houses!==houses||c.blocks!==blocks||c.count!==houses.length+blocks.length){c={houses,blocks,count:houses.length+blocks.length,units:new Map([...houses,...blocks].map(b=>[b.id,b]))};unitCaches.set(housing,c);}return c.units;}
export function residenceCountry(state,person){const hh=state.housing?.households?.[person.householdId],id=hh?.unitId||person.housingUnitId,unit=unitMap(state.housing).get(id);return countryForHome(id,unit||{x:person.homeX,z:person.homeZ});}
export function ownsCountryHome(state,person,country){
 const hh=state.housing?.households?.[person.householdId];if(!hh||(hh.members||[]).includes(person.id)===false)return null;
 const house=(state.housing.houseLots||[]).find(b=>b.id===hh.unitId&&b.ownerHouseholdId===hh.id&&countryForHome(b.id,b)===country);
 if(house)return {unitId:house.id,householdId:hh.id,title:'house'};
 const block=(state.housing.apartmentBlocks||[]).find(b=>b.id===hh.unitId&&countryForHome(b.id,b)===country);
 if(block&&hh.housingType==='apartment'&&Number(hh.propertyValue||0)>0){
  const primaryOwner=(state.flies||[]).some(f=>f.householdId===hh.id&&f.housingUnitId===block.id&&(hh.members||[]).includes(f.id)&&(f.ownsHome||Number(f.homeEquity||0)>0));
  if(hh.luxuryPurchaseAt!=null||primaryOwner)return {unitId:block.id,householdId:hh.id,title:'purchased apartment'};
 }
 return null;
}

/** Whole rented households only. Old owned titles and every financial balance stay untouched. */
export function nationalResidencePlan(state,{targetNorth=250,targetTotal=1000,enforceDistrictRanking=true,minDistrictGap=20}={}){
 const people=state.flies.filter(living);if(people.length!==targetTotal)throw Error(`National census needs ${targetTotal} living residents before assigning countries (found ${people.length})`);
 const membersByHousehold=new Map();for(const person of people){let members=membersByHousehold.get(person.householdId);if(!members)membersByHousehold.set(person.householdId,members=[]);members.push(person);}
 const ownedLots=new Map();for(const b of state.housing.houseLots||[]){let owners=ownedLots.get(b.id);if(!owners)ownedLots.set(b.id,owners=new Set());owners.add(b.ownerHouseholdId);}
 const groups=Object.values(state.housing?.households||{}).map(hh=>{const members=membersByHousehold.get(hh.id)||[];return {hh,members,renter:hh.housingType==='apartment'&&!Number(hh.propertyValue||0)&&members.every(f=>!f.ownsHome)&&!ownedLots.get(hh.unitId)?.has(hh.id),security:members.some(f=>f.publicServiceRole==='army'||f.publicServiceRole==='police')};}).filter(g=>g.members.length);
 if(groups.reduce((n,g)=>n+g.members.length,0)!==people.length)throw Error('Every living resident needs a durable household before national assignment');
 const units=unitMap(state.housing),district=b=>b.x>480?'europe':b.x< -440?'west':'main';
 const rentalBlocks=(state.housing.apartmentBlocks||[]).filter(b=>!b.luxury).map(b=>({id:b.id,country:countryForHome(b.id,b),district:district(b),occupied:occupiedHouseholdCount(b),capacity:apartmentHouseholdCapacity(b.h),operational:!state.urbanWorld?.buildings?.[b.id]||state.urbanWorld.buildings[b.id].stage==='operational'}));
 const initialDistrictCounts={main:0,europe:0,west:0};for(const g of groups)if(residenceCountry(state,g.members[0])===COUNTRY_IDS.hansdrex)initialDistrictCounts[district(units.get(g.hh.unitId)||{x:g.members[0].homeX})]+=g.members.length;
 const assigned=new Map(groups.map(g=>[g.hh.id,residenceCountry(state,g.members[0])])),moves=[],moveByHousehold=new Map(),moved=new Set();
 const isRenter=g=>g.renter,isSecurity=g=>g.security;
 function move(g,to,toDistrict){if(!isRenter(g))throw Error(`Primary residence ${g.hh.id} has an owned title; national migration will not erase it`);const existing=moveByHousehold.get(g.hh.id);if(existing){existing.toCountryId=to;existing.toDistrict=toDistrict;}else{const record={toDistrict,householdId:g.hh.id,memberIds:g.members.map(f=>f.id),fromUnitId:g.hh.unitId,fromCountryId:assigned.get(g.hh.id),toCountryId:to};moves.push(record);moveByHousehold.set(g.hh.id,record);}assigned.set(g.hh.id,to);moved.add(g.hh.id);}
 for(const g of groups)if(assigned.get(g.hh.id)!==COUNTRY_IDS.hansdrex&&isSecurity(g))move(g,COUNTRY_IDS.hansdrex);
 for(const g of groups)if(assigned.get(g.hh.id)===COUNTRY_IDS.hawaii)move(g,COUNTRY_IDS.hansdrex);
 const north=()=>groups.reduce((n,g)=>n+(assigned.get(g.hh.id)===COUNTRY_IDS.north?g.members.length:0),0);
 let remaining=Math.abs(targetNorth-north()),from=north()<targetNorth?COUNTRY_IDS.hansdrex:COUNTRY_IDS.north,to=from===COUNTRY_IDS.hansdrex?COUNTRY_IDS.north:COUNTRY_IDS.hansdrex;
 const candidates=groups.filter(g=>assigned.get(g.hh.id)===from&&!moved.has(g.hh.id)&&!isSecurity(g)&&isRenter(g)).sort((a,b)=>a.members.length-b.members.length||a.hh.id.localeCompare(b.hh.id));
 for(const g of candidates)if(remaining>=g.members.length){move(g,to);remaining-=g.members.length;if(!remaining)break;}
 if(remaining)throw Error('Exact 750/250 census needs additional complete rented households; families and owned titles will not be split');
 const assignedDistrict=new Map(groups.map(g=>[g.hh.id,assigned.get(g.hh.id)===COUNTRY_IDS.hansdrex?(moveByHousehold.get(g.hh.id)?.toCountryId===COUNTRY_IDS.hansdrex?'main':district(units.get(g.hh.unitId)||{x:g.members[0].homeX})):null]));
 const districtCounts=()=>{const c={main:0,europe:0,west:0};for(const g of groups)if(assigned.get(g.hh.id)===COUNTRY_IDS.hansdrex)c[assignedDistrict.get(g.hh.id)]+=g.members.length;return c;};
 if(enforceDistrictRanking){
  const c=districtCounts(),total=c.main+c.europe+c.west,donors={main:0,europe:0,west:0},vacancies={main:0,europe:0,west:0};
  for(const g of groups)if(assigned.get(g.hh.id)===COUNTRY_IDS.hansdrex&&g.renter&&!g.security)donors[assignedDistrict.get(g.hh.id)]+=g.members.length;
  for(const b of rentalBlocks)if(b.country===COUNTRY_IDS.hansdrex)vacancies[b.district]+=Math.max(0,b.capacity-b.occupied);
  // The same ascending search and tie policy as the exhaustive census, bounded
  // by immutable donor/vacancy totals and the two required district gaps.
  const low={main:c.main-donors.main,europe:c.europe-donors.europe,west:c.west-donors.west},high={main:c.main+vacancies.main,europe:c.europe+vacancies.europe,west:c.west+vacancies.west};
  let best=null;
  for(let main=Math.max(0,low.main);main<=Math.min(total,high.main);main++){
   const first=Math.max(0,low.europe,total-main-high.west,Math.ceil((total-main+minDistrictGap)/2)),last=Math.min(main-minDistrictGap,total-main,high.europe,total-main-low.west);
   for(let europe=first;europe<=last;europe++){
    const west=total-main-europe,cost=(Math.abs(main-c.main)+Math.abs(europe-c.europe)+Math.abs(west-c.west))/2;
    if(best&&(cost>best.cost||cost===best.cost&&Math.abs(main-c.main)>=Math.abs(best.target.main-c.main)))continue;
    best={target:{main,europe,west},cost};
   }
  }
  if(!best)throw Error('Primary-home ordering Main > Europe > West needs available ordinary rental homes');
  const counts=districtCounts();for(const to of ['main','europe','west']){let need=best.target[to]-counts[to];if(need<=0)continue;for(const from of ['west','europe','main']){let supply=counts[from]-best.target[from];if(supply<=0)continue;const candidates=groups.filter(g=>assigned.get(g.hh.id)===COUNTRY_IDS.hansdrex&&assignedDistrict.get(g.hh.id)===from&&isRenter(g)&&!isSecurity(g)).sort((a,b)=>a.members.length-b.members.length||a.hh.id.localeCompare(b.hh.id));const wanted=Math.min(need,supply),dp=new Map([[0,[]]]);for(const g of candidates){for(const [sum,list]of [...dp.entries()].sort((a,b)=>b[0]-a[0]))if(sum+g.members.length<=wanted&&!dp.has(sum+g.members.length))dp.set(sum+g.members.length,[...list,g]);if(dp.has(wanted))break;}const selected=dp.get(wanted);if(!selected)throw Error('District ordering cannot split families or move owned primary homes');for(const g of selected){move(g,COUNTRY_IDS.hansdrex,to);assignedDistrict.set(g.hh.id,to);counts[from]-=g.members.length;counts[to]+=g.members.length;need-=g.members.length;}}}
 }
 for(const m of moves)if(m.toCountryId===COUNTRY_IDS.hansdrex)m.toDistrict=assignedDistrict.get(m.householdId);
 const reserved=new Map();
 for(const m of moves){
  let best=null,leastOccupied=Infinity;
  for(const b of rentalBlocks){
   if(b.country!==m.toCountryId||m.toDistrict&&b.district!==m.toDistrict||!b.operational)continue;
   const occupied=b.occupied+(reserved.get(b.id)||0);if(occupied>=b.capacity)continue;
   if(occupied<leastOccupied||occupied===leastOccupied&&b.id.localeCompare(best.id)<0){best=b;leastOccupied=occupied;}
  }
  if(!best)throw Error(`No safe reserved rental home in ${m.toCountryId}`);
  m.toUnitId=best.id;reserved.set(best.id,(reserved.get(best.id)||0)+1);
 }

 return {targetTotal,targetNorth,minDistrictGap,moves,initialDistrictCounts,districtCounts:districtCounts(),counts:{[COUNTRY_IDS.hansdrex]:targetTotal-targetNorth,[COUNTRY_IDS.north]:targetNorth,[COUNTRY_IDS.hawaii]:0}};
}

export function applyNationalResidences(state,{housingHomeLocation,remember=()=>{},targetNorth=250,targetTotal=1000,enforceDistrictRanking=true,minDistrictGap=20}={}){
 if(state.nationalResidenceMigration?.version===1)return state.nationalResidenceMigration;
 const plan=nationalResidencePlan(state,{targetNorth,targetTotal,enforceDistrictRanking,minDistrictGap}),at=Number(state.simulationAgeSeconds||0),blocks=new Map(state.housing.apartmentBlocks.map(b=>[b.id,b])),peopleById=new Map(state.flies.map(f=>[f.id,f]));
 for(const m of plan.moves){const hh=state.housing.households[m.householdId],old=blocks.get(hh.unitId),home=blocks.get(m.toUnitId);if(old)old.occupants=(old.occupants||[]).filter(id=>id!==hh.id);home.occupants||=[];home.occupants.push(hh.id);Object.assign(hh,{unitId:home.id,housingType:'apartment',homeX:home.x,homeZ:home.z,monthlyHousingCost:home.rent,propertyValue:0});
  for(const id of m.memberIds){const f=peopleById.get(id);Object.assign(f,{housingUnitId:home.id,housingType:'apartment',homeX:home.x,homeZ:home.z,homeId:housingHomeLocation?.(home)||(m.toCountryId===COUNTRY_IDS.north?'airport-gardens-homes':home.x>480?'riverside-homes':home.id.startsWith('WEST-')?'west-gardens-homes':'apt-west'),pendingCountryMove:{at,fromUnitId:m.fromUnitId,toUnitId:home.id}});remember(f,'national_residence_assigned',{...m,at});}
 }
 state.nationalResidenceMigration={version:1,at,...plan};return state.nationalResidenceMigration;
}

/** Existing people already abroad receive a one-time historical admission, never a retroactive charge. */
export function initializeNationality(state,person){
 if(person.citizenshipCountryId)return;
 const at=Number(state.simulationAgeSeconds||0),native=residenceCountry(state,person),physical=countryAt(person)||native;
 person.originCountryId=native;person.citizenshipCountryId=native;person.residencyCountryId=native;person.nationalityHistory=[{at,type:'initial citizenship',countryId:native}];
 person.countryPresence={countryId:physical,enteredAt:at,entryId:`legacy-${person.id}`,legacyAdmission:true};person.legalResidency={countryId:native,seconds:0,lastAt:at};
}
