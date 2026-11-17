import {HANSDREX_STOREFRONTS,LOCATIONS,TOWER_OBSERVATION,entrance} from './city-map.mjs';
import {COUNTRY_IDS,countryAt} from './country-map.mjs';

export const HELI_TOUR_ACTION='taking a Hansdrex helicopter sightseeing tour';
const HOUR=3600;
const tower=TOWER_OBSERVATION;
const location=id=>LOCATIONS.find(l=>l.id===id);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const wallet=f=>Math.max(0,Number(f.money||0))+Math.max(0,Number(f.savings||0));
const storefronts=new Map(HANSDREX_STOREFRONTS.map(venue=>[venue.id,venue]));
const sightseeing=new Map([
 [tower.id,{name:tower.name,kind:'view',price:19,opens:8,closes:22}],
 ['bridge-view',{name:'Harbour Arch Skyline Walk',kind:'view',price:0,opens:7,closes:23}],
 ['rooftop',{name:'Hansdrex Sky Lounge',kind:'view',price:14,opens:15,closes:23}],
 ['night-market',{name:'Hansdrex Night Market',kind:'retail',price:12,opens:16,closes:23}],
 ['arcade',{name:'Hansdrex Arcade',kind:'entertainment',price:9,opens:10,closes:23}],
 ['riverside-cafe',{name:'Riverbank Café tasting',kind:'food',europe:true,price:13,opens:7,closes:21}],
]);
const accessible=(hour,opens,closes)=>hour>=opens&&hour<closes;
const stats=state=>state.hansdrexTourism||={storefrontVisits:0,towerVisits:0,skylineVisits:0,europeDining:0,helicopterTours:0,totalVisitorSales:0};
const ease=t=>t*t*(3-2*t);
function lerp(from,to,t){return from+(to-from)*t;}

export function createHansdrexTourism({world,isUnavailable=()=>false,transfer,emit=()=>{},remember=()=>{},advanceHeliTour}){
 const now=()=>Number(world().simulationAgeSeconds||0),level=()=>Math.min(8,Math.max(.6,Number(world().centralBank?.priceLevel||1)));
 const budget=(v,visitorReserve=v.visitorReservedBudget??65)=>Math.max(0,wallet(v)-visitorReserve);
 const sheltered=id=>id===tower.id?'toronto':storefronts.get(id)?.buildingId||id;
 function account(id,sector='tourism'){
  const businesses=world().businesses||={};
  return businesses[id]||={cash:0,inventory:0,sector};
 }
 function venue(id){
  const shop=storefronts.get(id);
  if(shop)return {...shop,opens:shop.kind==='entertainment'?12:8,closes:shop.kind==='retail'?21:22};
  const attraction=sightseeing.get(id),site=location(id);
  return attraction&&site?{...site,...attraction}:null;
 }
 function show(v,destination,action){
  v.hansdrexTourRecent=[...(v.hansdrexTourRecent||[]).filter(id=>id!==destination.id),destination.id].slice(-12);
  if(Array.isArray(v.placesVisited)&&!v.placesVisited.includes(destination.id))v.placesVisited.push(destination.id);
  v.happiness=Math.min(100,Number(v.happiness||70)+6);
  v.stress=Math.max(0,Number(v.stress||0)-4);
  v.action=action;v.nextVisitAt=now()+HOUR*1.5;
  remember(v,'hansdrex_visit',{locationId:destination.id,kind:destination.kind});
 }
 function moveTowerLift(v){
  const trip=v.hansTowerTrip;
  if(!trip)return false;
  const elapsed=now()-trip.startedAt,walk=360,lift=1320,deckTime=2200,duration=(walk+lift)*2+deckTime;
  if(elapsed>=duration||isUnavailable('toronto',v)){
   Object.assign(v,{x:tower.x,z:tower.z,y:1.1,targetX:tower.x,targetZ:tower.z,hansTowerTrip:null,indoors:false});
   show(v,{id:tower.id,kind:'view'},'returning from the Tower observation deck');
   return true;
  }
  const movingTime=Math.max(0,Math.min(walk+lift,elapsed,duration-elapsed)),inShaft=movingTime>=walk;
  v.x=tower.x;v.z=inShaft?tower.deck.z:lerp(tower.z,tower.deck.z,ease(movingTime/walk));
  v.y=inShaft?lerp(1.1,tower.deck.y,ease((movingTime-walk)/lift)):1.1;
  const viewing=elapsed>=walk+lift&&elapsed<walk+lift+deckTime;
  v.action=viewing?'watching the skyline from the Tower observation deck':'taking the Hansdrex Tower elevator';
  v.indoors=true;v.sleeping=false;v.vx=v.vz=0;
  if(elapsed>=walk+lift&&!trip.reached){
   trip.reached=true;const totals=stats(world());totals.towerVisits++;totals.skylineVisits++;
   emit('tower_observation_visit',`${v.id} reached the Hansdrex Tower observation deck.`,{visitorId:v.id,fee:trip.fee});
  }
  return true;
 }
 function advanceHelicopter(v,clock,requested){
  if(!advanceHeliTour)return false;
  if(v.heliPassenger){
   advanceHeliTour(v,clock);
   if(!v.heliPassenger){
    stats(world()).helicopterTours++;stats(world()).skylineVisits++;stats(world()).totalVisitorSales+=Number(v.lastHeliTicket||0);
    show(v,{id:'heliport',kind:'view'},'finished the paid Hansdrex skyline helicopter tour');
    v.hansOutingId=null;
   }
   return true;
  }
  if(!requested||v.currentLocationId!=='heliport'||v.traveling||v.onPlane||v.onTrain||
     !accessible(clock.hour,8,20)||isUnavailable('heliport',v)||Number(world().weather?.precipitation||0)>.25)return false;
  v.action=HELI_TOUR_ACTION;
  advanceHeliTour(v,clock);
  if(!v.heliPassenger)v.nextHelicopterOfferAt=now()+6*HOUR;
  return Boolean(v.heliPassenger);
 }
 function tryVisit(v,id,clock){
  if(moveTowerLift(v)||advanceHelicopter(v,clock,id==='heliport'))return true;
  const item=venue(id);
  if(!item||!v.alive||v.traveling||v.onPlane||v.onTrain||countryAt(v)!==COUNTRY_IDS.hansdrex||
     v.currentLocationId!==id||!accessible(clock.hour,item.opens,item.closes)||isUnavailable(sheltered(id),v)||
     distance(v,storefronts.has(id)||id===tower.id?item:entrance(item))>14)return false;
  // Admissions and shop sales are idempotent across a repeated tick or restore.
  if(v.lastHansTourSale?.id===id&&now()-v.lastHansTourSale.at<4*HOUR)return false;
  const fee=Math.round(item.price*level()*100)/100;
  if(budget(v)<fee)return false;
  const supplyId=item.kind==='food'?(item.europe?'riverside-market':'market'):item.kind==='retail'?'corner-shop':null;
  const supply=supplyId&&world().businesses?.[supplyId];
  if(supplyId&&(!supply||Number(supply.inventory||0)<1))return false;
  const seller=account(id,id===tower.id?'observation-deck':item.kind);
  if(fee&&!transfer(v,fee,seller))return false;
  if(supply){
   const wholesale=Math.min(fee*.55,Math.max(0,Number(supply.price||4))*level());
   seller.cash-=wholesale;supply.cash=Number(supply.cash||0)+wholesale;supply.inventory--;
  }
  const totals=stats(world());totals.totalVisitorSales+=fee;
  v.lastHansTourSale={id,at:now()};
  if(id===tower.id){
   v.hansTowerTrip={startedAt:now(),fee,reached:false};moveTowerLift(v);
  }else{
   if(storefronts.has(id))totals.storefrontVisits++;
   if(item.kind==='view')totals.skylineVisits++;
   if(item.kind==='food'){
    v.hunger=Math.max(0,Number(v.hunger||0)-55);v.thirst=Math.max(0,Number(v.thirst||0)-36);
    if(item.europe)totals.europeDining++;
   }
   const action=item.kind==='food'? `dining at ${item.name}`:item.kind==='retail'? `shopping at ${item.name}`: `visiting ${item.name}`;
   show(v,item,action);
  }
  return true;
 }
 function nextOuting(v,clock,roll){
  if(countryAt(v)!==COUNTRY_IDS.hansdrex||v.energy<27||clock.hour<7||clock.hour>=22)return null;
  const visited=new Set(v.hansdrexTourRecent||[]),ambition=Number(v.traits?.ambition??.5),sociable=Number(v.traits?.sociability??.5);
  if(advanceHeliTour&&!visited.has('heliport')&&now()>=Number(v.nextHelicopterOfferAt||0)&&budget(v)>=185*level()&&
     accessible(clock.hour,8,16)&&!isUnavailable('heliport',v)&&Number(world().weather?.precipitation||0)<.3&&roll<.21+ambition*.12)return 'heliport';
  if(!visited.has(tower.id)&&!isUnavailable('toronto',v)&&budget(v)>=19*level()&&accessible(clock.hour,8,19)&&v.hunger<64&&roll>.22)return tower.id;
  const choices=[];
  if(v.hunger>=33||roll<.33){
   for(const shop of HANSDREX_STOREFRONTS)if(shop.kind==='food')choices.push(shop.id);
   choices.push('riverside-cafe');
  }else{
   for(const shop of HANSDREX_STOREFRONTS)if(shop.kind!=='food')choices.push(shop.id);
   choices.push('bridge-view','night-market','rooftop','arcade');
  }
  const europeTrip=v.hunger>=28&&roll<.15+sociable*.14&&!v.hansdrexTourRecent?.some(id=>venue(id)?.europe);
  let best=null,bestValue=-Infinity;
  for(const id of choices){
   if(visited.has(id)||isUnavailable(sheltered(id),v))continue;
   const place=venue(id);
   if(!place||budget(v)<place.price*level()||!accessible(clock.hour,place.opens,place.closes-1))continue;
   const weight=(place.europe&&europeTrip?21:0)+(place.kind==='view'?5:0)-distance(v,place)*.027;
   if(weight>bestValue){best=place;bestValue=weight;}
  }
  return best?.id||null;
 }
 return {advance:(v,clock)=>moveTowerLift(v)||Boolean(v.heliPassenger&&advanceHelicopter(v,clock,false)),tryVisit,nextOuting,snapshot:()=>({...stats(world())})};
}
