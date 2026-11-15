import {privateHelicopterPose} from './sports-luxury.mjs';
import {helicopterPose} from './aviation.mjs';
import {COUNTRY_IDS,countryAt} from './country-map.mjs';
import {BUILDINGS} from './city-map.mjs';

const TOUR_ID='HANSDREX-TOUR-HELICOPTER';
const live=f=>Boolean(f?.alive&&!f.departed);
const near=(f,p)=>Math.hypot(f.x-p.x,(f.y??1.1)-p.y,f.z-p.z)<=20;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
export const tourHelicopterFlightId=flight=>flight?.id||`TOUR-HELI-${flight.startsAt}-${flight.endsAt}`;

/** Connect bounded defense projectiles to existing aircraft, citizens and civic work.
 * Titles, wallets, households and brains remain owned by their existing lifecycles. */
export function createNationalDefenseIntegration({world,urbanWorld,countryAccount,remember=()=>{},emit=()=>{}}){
 const now=()=>Number(world().simulationAgeSeconds||0);
 const actors=()=>[...(world().flies||[]),...(world().cityVisitors?.visitors||[])];
 const ledger=()=>world().nationalDefenseIntegration||={version:1,injuryReceipts:{},crashes:{}};
 const privateAircraft=()=>world().sportsLuxury?.helicopters||[];
 function init(){
  const d=ledger();if(d.legacyTourClearanceMigrated)return;
  const tour=world().helicopterFlight,international=world().internationalLife;
  if(tour&&!tour.destroyed&&tour.endsAt>now()&&international){
   const flightId=tourHelicopterFlightId(tour);international.airClearances||={};
   international.airClearances[flightId]||={flightId,operatorCountryId:tour.operatorCountryId||COUNTRY_IDS.hansdrex,countries:[COUNTRY_IDS.hansdrex],kind:'sightseeing',issuedAt:now(),legacy:true};
  }
  d.legacyTourClearanceMigrated=true;
 }
 function getAircraft(){
  const time=now(),people=actors(),result=[];
  for(const h of privateAircraft()){
   const flight=h.flight;if(h.destroyed||!flight?.id||flight.paid===false||!point(flight.from)||!point(flight.to)||time<flight.departure||time>=flight.arrival)continue;
   const pose=privateHelicopterPose(time,flight),owner=people.find(f=>f.id===h.ownerId);
   const occupantIds=people.filter(f=>live(f)&&f.onPrivateHelicopter&&f.privateFlight?.id===flight.id&&f.privateFlight?.helicopterId===h.id&&near(f,pose)).map(f=>f.id);
   result.push({id:h.id,flightId:flight.id,kind:'helicopter',ownerCountryId:h.ownerCountryId||flight.operatorCountryId||owner?.citizenshipCountryId||countryAt(flight.from)||COUNTRY_IDS.hansdrex,occupantIds,airborne:true,x:pose.x,y:pose.y,z:pose.z});
  }
  const tour=world().helicopterFlight;
  if(tour&&!tour.destroyed&&Number.isFinite(tour.startsAt)&&Number.isFinite(tour.endsAt)&&time>=tour.startsAt&&time<tour.endsAt){
   const pose=helicopterPose(time,tour.startsAt,tour.endsAt),occupantIds=people.filter(f=>live(f)&&f.heliPassenger&&f.heliTourStartedAt===tour.startsAt&&f.heliTourUntil===tour.endsAt&&near(f,pose)).map(f=>f.id);
   result.push({id:TOUR_ID,flightId:tourHelicopterFlightId(tour),kind:'helicopter',ownerCountryId:tour.operatorCountryId||COUNTRY_IDS.hansdrex,occupantIds,airborne:true,x:pose.x,y:pose.y,z:pose.z});
  }
  return result;
 }
 function injureActor(actor,amount,{cause='missile impact',projectileId,countryId}={}){
  if(!live(actor)||!actors().includes(actor)||!Number.isFinite(amount)||amount<=0||!projectileId)return false;
  const receipts=ledger().injuryReceipts,key=`${projectileId}:${actor.id}`;if(receipts[key])return false;
  const damage=Math.min(Math.max(0,Number(actor.health)||0),amount);
  receipts[key]={actorId:actor.id,projectileId,at:now(),damage};
  const keys=Object.keys(receipts);for(const key of keys.slice(0,-512))delete receipts[key];
  actor.health=Math.max(0,(Number(actor.health)||0)-amount);
  actor.stress=Math.min(100,(Number(actor.stress)||0)+25);
  remember(actor,'national_defense_injury',{projectileId,cause,countryId:countryId||countryAt(actor),damage});
  if(actor.health<=0){
   actor.alive=false;actor.causeOfDeath=cause;actor.diedAtSimulationSeconds=now();
   actor.traveling=false;actor.sleeping=false;actor.vx=actor.vz=0;actor.routeWaypoints=[];
   actor.onPrivateHelicopter=false;actor.heliPassenger=false;actor.privateFlight=null;
   actor.heliTourStartedAt=actor.heliTourUntil=0;
   world().deaths=Number(world().deaths||0)+1;
   emit('death',`${actor.id} died from ${cause}.`,{flyId:actor.id,cause,projectileId,countryId:countryId||countryAt(actor)});
  }
  return true;
 }
 function crashAircraft(id,details){
  if(!details?.flightId||!details.projectileId)return false;
  const actual=getAircraft().find(a=>a.id===id&&a.flightId===details.flightId);if(!actual)return false;
  const key=`${id}:${actual.flightId}`,receipts=ledger().crashes;if(receipts[key])return false;
  const aircraft=id===TOUR_ID?world().helicopterFlight:privateAircraft().find(h=>h.id===id);
  if(!aircraft)return false;
  receipts[key]={aircraftId:id,flightId:actual.flightId,projectileId:details.projectileId,at:now(),point:{x:actual.x,y:actual.y,z:actual.z},occupantIds:[...actual.occupantIds]};
  const keys=Object.keys(receipts);for(const key of keys.slice(0,-128))delete receipts[key];
  aircraft.destroyed=true;aircraft.destroyedAt=now();aircraft.crashFlightId=actual.flightId;aircraft.crashPoint={x:actual.x,y:actual.y,z:actual.z};
  if(id!==TOUR_ID){aircraft.flight=null;aircraft.condition=0;aircraft.nextTripAt=Number.MAX_SAFE_INTEGER;}
  // Only people whose persisted boarding task and physical position match the
  // actual aircraft can be injured. Distant owners and ground staff remain safe.
  for(const actor of actors().filter(f=>actual.occupantIds.includes(f.id)))injureActor(actor,160,{cause:details.cause||'helicopter interception',projectileId:details.projectileId,countryId:countryAt(actual)});
  emit('aircraft_crash',`${id} crashed after an air-defense interception.`,{aircraftId:id,flightId:actual.flightId,projectileId:details.projectileId,...aircraft.crashPoint,occupantIds:[...actual.occupantIds]});
  return true;
 }
 function damageBuilding(details){
  if(!details?.buildingId||!details.projectileId)return false;
  const b=world().urbanWorld?.buildings?.[details.buildingId]||BUILDINGS.find(b=>b.id===details.buildingId);if(!b)return false;
  const countryId=countryAt(b);if(!countryId)return false;
  countryAccount(countryId);
  return urbanWorld.applyWarDamage({...details,countryId,fundingAccountId:countryId===COUNTRY_IDS.hansdrex?'treasury':`treasury:${countryId}`});
 }
 return {init,getAircraft,crashAircraft,damageBuilding,injureActor};
}
