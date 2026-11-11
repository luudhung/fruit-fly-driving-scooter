import {BUILDINGS,LOCATIONS} from './city-map.mjs';

const sectors=new Set(['hotel','food','cafe']);
const alive=f=>f?.alive&&!f.departed;
const now=s=>Number(s.simulationAgeSeconds||0);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const hospitalityCache=new WeakMap();
function hospitalityBusinesses(state){
 let cached=hospitalityCache.get(state);
 if(!cached||cached.at!==now(state)){
  cached={at:now(state),businesses:Object.values(state.enterprises||{}).filter(b=>b.hospitality)};hospitalityCache.set(state,cached);
 }
 return cached.businesses;
}
export const isHospitalitySector=sector=>sectors.has(sector);
export const hospitalityAccount=(state,locationId)=>hospitalityBusinesses(state).find(b=>b.status==='operating'&&b.locationId===locationId)||null;

export function hospitalityReady(state,business){
 if(!business?.hospitality||business.status!=='operating'||business.urbanSuspended||now(state)<Number(business.openingAt||0))return false;
 const building=BUILDINGS.find(b=>b.id===business.locationId),record=state.urbanWorld?.buildings?.[business.locationId];
 return Boolean(building&&LOCATIONS.some(l=>l.id===building.id)&&(!record||record.stage==='operational')&&alive(state.flies.find(f=>f.id===business.ownerId)));
}

export function restoreHospitalityPremises(state){
 for(const b of hospitalityBusinesses(state))if(b.status==='operating'){
  const site=BUILDINGS.find(site=>site.id===b.locationId);
  if(site&&!LOCATIONS.some(l=>l.id===site.id))LOCATIONS.push({id:site.id,name:b.name,type:b.sector==='hotel'?'hotel':'food',x:site.x,z:site.z});
 }
}

/** Physical vacant commercial floors only: homes, public services and landmarks stay intact. */
export function hospitalityPremises(state,sector,owner){
 const occupied=new Set(Object.values(state.enterprises||{}).filter(b=>b.status==='operating').map(b=>b.locationId));
 for(const hotel of Object.values(state.cityVisitors?.hotels||{}))if(Object.keys(hotel.rooms||{}).length)occupied.add(hotel.id);
 const households=new Set(Object.values(state.housing?.households||{}).map(h=>h.unitId));
 const candidates=BUILDINGS.filter(b=>(b.kind==='block'||b.kind==='civic'&&state.urbanWorld?.buildings?.[b.id]?.ownerId===owner?.id)&&!occupied.has(b.id)&&!households.has(b.id)&&
   (!state.urbanWorld?.buildings?.[b.id]||state.urbanWorld.buildings[b.id].stage==='operational'));
 const anchor=owner||{x:0,z:0};
 return candidates.map(b=>({id:b.id,x:b.x,z:b.z,w:b.w,d:b.d,h:b.h,
   fitoutCost:Math.ceil((sector==='hotel'?400:180)+b.w*b.d*(sector==='hotel'?1.7:.9)),
   hourlyRent:Math.max(1.2,b.w*b.d*.006),capacity:sector==='hotel'?Math.max(4,Math.min(16,Math.floor(b.w*b.d/24))):Math.max(6,Math.min(36,Math.floor(b.w*b.d/5))),
 })).sort((a,b)=>(a.fitoutCost+Math.hypot(a.x-anchor.x,a.z-anchor.z)*.5)-(b.fitoutCost+Math.hypot(b.x-anchor.x,b.z-anchor.z)*.5));
}

/** Demand responds to occupied/reserved rooms, arriving passengers and competing supply. */
export function hospitalityDemand(state,sector){
 const visitors=(state.cityVisitors?.visitors||[]).filter(alive);
 const operating=Object.values(state.enterprises||{}).filter(b=>b.hospitality&&b.status==='operating');
 if(sector==='hotel'){
  const hotels=Object.values(state.cityVisitors?.hotels||{}).filter(h=>!h.closed);
  const capacity=hotels.reduce((n,h)=>n+Number(h.capacity||0),0);
  const occupied=hotels.reduce((n,h)=>n+Object.keys(h.rooms||{}).length,0);
  const pending=operating.filter(b=>b.sector==='hotel'&&!hotels.some(h=>h.enterpriseId===b.id)).reduce((n,b)=>n+Number(b.guestCapacity||0),0);
  const visitorLimit=Math.max(0,Math.min(Number(state.cityVisitors?.capacity||40),640-state.flies.filter(alive).length));
  if(capacity+pending>=Math.max(10,Math.ceil(visitorLimit*1.25)))return .15;
  const pressure=Number(state.cityVisitors?.airportTraffic?.unmetGuests||0);
  return clamp((occupied+pressure+10)/Math.max(10,capacity+pending)*1.5,.1,2.2);
 }
 const residents=state.flies.filter(alive),people=residents.length+visitors.length;
 const competitors=operating.filter(b=>b.sector===sector).length;
 const averageHunger=[...residents,...visitors].reduce((n,f)=>n+Number(f.hunger||0),0)/Math.max(1,people);
 const needed=Math.max(1,people/(sector==='food'?110:180));
 return clamp((.65+averageHunger/100+visitors.length/100)*needed/(needed+competitors*1.8),.15,2.2);
}

/** Reserve a unique lease and pay the fit-out; capital moves to a domestic counterparty. */
export function openHospitalityPremises(state,business,site){
 if(!site||business.cash<site.fitoutCost+200||hospitalityAccount(state,site.id))return false;
 business.cash-=site.fitoutCost;state.treasury.cash+=site.fitoutCost;
 state.totalTransactions=Number(state.totalTransactions||0)+1;
 Object.assign(business,{hospitality:true,locationId:site.id,lease:{buildingId:site.id,fitoutPaid:site.fitoutCost,hourlyRent:site.hourlyRent,startedAt:now(state)},
  openingAt:now(state)+21600,guestCapacity:business.sector==='hotel'?site.capacity:0,seats:business.sector==='hotel'?0:site.capacity,
  roomPrice:business.sector==='hotel'?22:0,mealPrice:business.sector==='cafe'?5:9,pendingSales:0,salesCount:0,stock:business.sector==='hotel'?0:24});
 hospitalityCache.delete(state);
 if(!LOCATIONS.some(l=>l.id===site.id))LOCATIONS.push({id:site.id,name:business.name,type:business.sector==='hotel'?'hotel':'food',x:site.x,z:site.z});
 return true;
}

export function syncHospitalityHotels(state,{isUnavailable=()=>false}={}){
 if(!state.cityVisitors)return [];
 const hotels=state.cityVisitors.hotels||={};
 for(const h of Object.values(hotels))if(h.enterpriseId){
  const b=state.enterprises?.[h.enterpriseId];h.closed=!hospitalityReady(state,b)||isUnavailable(h.id);
 }
 for(const b of hospitalityBusinesses(state))if(b.sector==='hotel'){
  const prior=hotels[b.locationId];
  if(prior?.enterpriseId&&prior.enterpriseId!==b.id&&Object.keys(prior.rooms||{}).length)continue;
  const h=hotels[b.locationId]||={id:b.locationId,enterpriseId:b.id,capacity:b.guestCapacity,pricePerNight:b.roomPrice,rooms:{}};
  h.enterpriseId=b.id;h.capacity=b.guestCapacity;h.pricePerNight=b.roomPrice;h.closed=!hospitalityReady(state,b)||isUnavailable(h.id);
 }
 return Object.values(hotels);
}

export function recordHospitalitySale(state,locationId,amount){
 const b=hospitalityAccount(state,locationId);if(!b||!(amount>0))return false;
 b.pendingSales=Number(b.pendingSales||0)+amount;b.revenueLifetime=Number(b.revenueLifetime||0)+amount;b.salesCount=Number(b.salesCount||0)+1;
 return true;
}

export function diningVenues(state,actor){
 return hospitalityBusinesses(state).filter(b=>['food','cafe'].includes(b.sector)&&hospitalityReady(state,b)&&Number(b.stock||0)>0)
  .map(b=>{const l=LOCATIONS.find(l=>l.id===b.locationId);return {id:b.locationId,enterpriseId:b.id,name:b.name,x:l.x,z:l.z,price:b.mealPrice,sector:b.sector};})
  .sort((a,b)=>Math.hypot(a.x-actor.x,a.z-actor.z)-Math.hypot(b.x-actor.x,b.z-actor.z));
}

/** One served meal per visit/cooldown; owner/staff must actually be on the premises. */
export function purchaseHospitalityMeal(state,actor,venueId){
 const b=hospitalityAccount(state,venueId);if(!b||!hospitalityReady(state,b)||actor.traveling||actor.currentLocationId!==venueId||now(state)-Number(actor.lastHospitalityMealAt??-3600)<1800||!(b.stock>0))return false;
 const staff=new Set([b.ownerId,...(b.employees||[])]);
 if(!state.flies.some(f=>alive(f)&&staff.has(f.id)&&!f.traveling&&!f.sleeping&&f.currentLocationId===venueId))return false;
 const price=Number(b.mealPrice||9)*clamp(Number(state.centralBank?.priceLevel||1),.6,8),cash=Math.max(0,Number(actor.money||0)),savings=Math.max(0,Number(actor.savings||0));
 if(cash+savings<price)return false;
 const paidCash=Math.min(cash,price);actor.money=cash-paidCash;actor.savings=savings-(price-paidCash);b.cash+=price;b.stock--;
 actor.hunger=Math.max(0,Number(actor.hunger||0)-55);actor.thirst=Math.max(0,Number(actor.thirst||0)-25);actor.happiness=Math.min(100,Number(actor.happiness||0)+4);
 actor.expensesLifetime=Number(actor.expensesLifetime||0)+price;actor.lastHospitalityMealAt=now(state);state.totalTransactions=Number(state.totalTransactions||0)+1;
 recordHospitalitySale(state,venueId,price);return true;
}
