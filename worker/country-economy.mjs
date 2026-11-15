import {LOCATIONS,parkingPoint,pedestrianRoute,clearSegment} from './city-map.mjs';
import {NORTH_FARM,COUNTRY_IDS,countryAt} from './country-map.mjs';
import {signalBarrier,createVehicleIndex} from './traffic.mjs';
import {motorwaySpeedMultiplier} from './motorway.mjs';
import {districtProfile} from './district-economy.mjs';
const DAY=86400,FARM='farm:north-city',ESCROW='international-trade-escrow',CARRIER='north-farm-carrier';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),alive=f=>f?.alive&&!f.departed,clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const essential=new Set(['doctor','hospital-central','hospital-east','school','power','power-evening','power-night','grid-dispatch','firefighter','paramedic','transit','police','military','clinic','pharmacy','riverside-clinic','riverside-school','grid-dispatch','pilot','pilot-evening','heli-pilot-day','heli-pilot-evening','heli-ground','heli-ground-evening']);
/** Domestic and international cargo use the same finite stock and escrow. No off-world buyer creates revenue. */
export function createCountryEconomy({world,countryAccount,transfer,interceptMovement,recordIncident,mayWork,startJourney,moveFly,neuralDrive=()=>.5,remember=()=>{},needsAndActivities=()=>{},payAndFinance=()=>{},isWorkCommitted=()=>false}={}){
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),loc=id=>LOCATIONS.find(p=>p.id===id),actor=id=>raw().flies.find(f=>f.id===id);
 const account=id=>{raw().businesses||={};return raw().businesses[id]||={cash:0,inventory:0,sector:id===FARM?'agriculture':'national-trade'};};
 const data=()=>raw().internationalEconomy||={version:1,seeded:false,employees:[],crops:[],stock:{rice:0,vegetables:0,seeds:0},orders:[],trucks:[],nextOrderId:1,planted:0,harvested:0,wagesPaid:0,tradeValue:0,delivered:0,cancelled:0,nextDecisionAt:0,lastProductionAt:now()};
 const busy=f=>f.publicServiceRole||f.facilityEmployment||f.businessId||f.businessEmployeeOf||essential.has(f.jobId)||f.fireEngineDuty||f.onFireEngine||f.ambulanceDuty||f.onAmbulance||f.urbanFloodEscape||f.civicDuty||f.emergencyTask||f.urbanTask||f.cityService||f.socialTask||f.arrested||f.industrialFreightDuty||f.onPlane||f.onTrain||f.privateFlight||f.airTrip||f.countryAirTrip||f.countryFlightPlan||f.nationalServiceDuty||f.nationalSupplyTask||f.nationalTrainingFlightId||f.warResponse?.active;
 function pin(id,p,name='North farm work site'){let l=loc(id);if(!l){l={...p,id,name,type:'country-work'};LOCATIONS.push(l);}else Object.assign(l,{x:p.x,z:p.z});return l;}
 function init(){const d=data();for(const id of [FARM,ESCROW,CARRIER,'north-market','industrial-fuel'])account(id);pin(NORTH_FARM.locationId,NORTH_FARM.gate,'North cooperative farm');for(let i=0;i<4;i++)pin(`NORTH-FARM-FIELD-${i}`,NORTH_FARM.fields[i],'North farm field');
  if(!d.seeded){transfer(countryAccount(COUNTRY_IDS.north),account(FARM),5000);transfer(countryAccount(COUNTRY_IDS.north),account('north-market'),1500);account('north-market').price||=3;account(FARM).countryId=COUNTRY_IDS.north;account(FARM).locationId=NORTH_FARM.locationId;account(FARM).employees=d.employees;d.seeded=true;d.capitalizedAt=now();}
  const dealer=raw().businesses?.['vehicle-showroom'];while(d.trucks.length<2&&dealer&&dealer.inventory>=1){const price=Math.max(1,Number(dealer.price||650));if(!transfer(account(FARM),dealer,price))break;dealer.inventory-=1;const i=d.trucks.length;d.trucks.push({id:`NORTH-FARM-TRUCK-${i+1}`,x:NORTH_FARM.gate.x-4,z:NORTH_FARM.gate.z+i*9,y:1.1,alive:true,vehicleLength:6.4,transitMode:'car',heading:0,traveling:false,phase:'parked',routeWaypoints:[],routeIndex:0,driverId:null,orderId:null,assetPrice:price});}
  for(const t of d.trucks)pin(`NORTH-FARM-BOARD-${t.id}`,t,'North farm carrier loading bay');d.wageOffer??=6;d.nextWageReviewAt??=now()+6*3600;return d;
 }
 const hour=clock=>Number(clock?.hour??(now()%DAY/3600))+Number(clock?.minute||0)/60;
 function workingNow(f,clock){const start=Number(f.preferredWorkStart??8),hours=Math.min(12,Math.max(1,Number(f.preferredWorkHours||8)));return ((hour(clock)-start+24)%24)<hours;}
 function eligible(f,clock){
  // A finished ordinary shift may retain its old action text until the next
  // decision. Real assignments and essential jobs remain exclusive.
  const staleWork=!f.traveling&&!f.recoveringEnergy&&!workingNow(f,clock)&&String(f.action||'').startsWith('working as');
  return alive(f)&&f.ageYears>=18&&f.ageYears<68&&!busy(f)&&!f.internationalWork&&(!isWorkCommitted(f)||staleWork)&&mayWork(f,COUNTRY_IDS.north)&&f.energy>25&&f.health>40;
 }
 function payrollReserve(){return data().employees.map(actor).filter(alive).reduce((n,f)=>n+Math.max(0,Number(f.wage||6))*16,0);}
 function offer(){
  const d=data(),cash=Math.max(0,Number(account(FARM).cash||0));
  d.wageOffer=Number.isFinite(d.wageOffer)?d.wageOffer:6;
  const available=Math.max(0,cash-300-payrollReserve()),additional=Math.floor(available/(Math.max(1,d.wageOffer)*16));
  return {wage:d.wageOffer,targetWorkers:Math.min(40,d.employees.length+additional),vacancies:Math.max(0,Math.min(40-d.employees.length,additional)),cashRequired:300+payrollReserve()+d.wageOffer*16};
 }
 function dailyValue(f,wage,site,{hours=8,tax=.05,regional=false}={}){
  const home={x:Number(f.homeX??f.x),z:Number(f.homeZ??f.z)},distance=dist(home,site),commuteHours=Math.min(6,distance/120);
  const visa=countryAt(home)!==countryAt(site)&&f.citizenshipCountryId!==countryAt(site)?50:0;
  const rate=wage*(regional?districtProfile(site).wage:1);
  return rate*hours*(1-tax)-visa-commuteHours*wage*.2;
 }
 function jobGain(f,wage){
  const oldSite=loc(f.workLocationId||f.jobId)||loc(String(f.jobId||'').replace(/-(?:day|evening|night)$/,''));
  const oldDaily=f.jobId?dailyValue(f,Math.max(0,Number(f.wage||0)),oldSite||{x:f.homeX??f.x,z:f.homeZ??f.z},{hours:Math.min(12,Math.max(1,Number(f.preferredWorkHours||8))),tax:.07,regional:Boolean(oldSite)}):0;
  const newDaily=dailyValue(f,wage,NORTH_FARM.gate);
  return {oldDaily,newDaily,gain:newDaily-oldDaily,worthwhile:!f.jobId||newDaily>oldDaily+.5};
 }
 function reviewOffer(){
  const d=data();if(now()<Number(d.nextWageReviewAt??Infinity))return;
  d.nextWageReviewAt=now()+6*3600;const current=offer();
  if(d.employees.length<Math.min(8,current.targetWorkers)&&current.vacancies>0){
   const proposed=Math.min(8,Math.round((current.wage+.25)*100)/100);
   if(Number(account(FARM).cash||0)>=300+payrollReserve()+proposed*16)d.wageOffer=proposed;
  }
 }
 function applyJob(f){const d=data(),job=offer();if(!eligible(f)||f.traveling||f.currentLocationId!==NORTH_FARM.locationId||dist(f,NORTH_FARM.gate)>20||!job.vacancies||!jobGain(f,job.wage).worthwhile)return false;
  const slot=d.employees.length%4,previous={id:f.jobId||null,title:f.jobTitle||null,wage:Number(f.wage||0)};d.employees.push(f.id);f.internationalWork={countryId:COUNTRY_IDS.north,employerId:FARM,role:'farmer',locationId:`NORTH-FARM-FIELD-${slot}`,shiftStart:6,hours:8,previousJob:previous};
  Object.assign(f,{jobId:'country-farm:north-city',jobTitle:'rice and vegetable farmer',wage:job.wage,preferredWorkStart:6,preferredWorkHours:8,countryFarmSampleAt:now(),countryFarmAttending:false});remember(f,'national_farm_job',{countryId:COUNTRY_IDS.north,wage:job.wage,previousJob:previous});return true;
 }
 const onShift=clock=>Number(clock?.hour||0)>=6&&Number(clock?.hour||0)<14;
 function shiftOrCommuteLead(f,clock){const site=loc(f.internationalWork?.locationId);if(!site)return false;const until=((6-hour(clock)+24)%24),lead=Math.min(8,Math.max(.5,dist(f,site)/2.5*Math.max(1,Number(raw().timeScale||120))/3600+.5));return onShift(clock)||until>0&&until<=lead;}
 function workCommitted(f){return Boolean(f?.internationalFreightDuty||f?.internationalWork?.employerId===FARM&&(shiftOrCommuteLead(f,{hour:now()%DAY/3600})||f.traveling&&f.targetLocationId===f.internationalWork.locationId));}

 function care(f,clock){if(f.countryCareAt===now())return;f.countryCareAt=now();needsAndActivities(f,clock);payAndFinance(f,clock);}
 function wage(f,seconds){const amount=Math.min(account(FARM).cash,Math.max(0,seconds)*Number(f.wage||4.2)/3600);if(amount<=0)return;account(FARM).cash-=amount;const tax=amount*.05;countryAccount(COUNTRY_IDS.north).cash+=tax;f.money=Number(f.money||0)+amount-tax;f.salaryLifetime=Number(f.salaryLifetime||0)+amount-tax;f.salaryEarnedToday=Number(f.salaryEarnedToday||0)+amount-tax;data().wagesPaid+=amount-tax;raw().totalTransactions=Number(raw().totalTransactions||0)+1;}
 function present(f,clock){return alive(f)&&f.internationalWork?.employerId===FARM&&!f.internationalFreightDuty&&!busy(f)&&onShift(clock)&&!f.traveling&&f.currentLocationId===f.internationalWork.locationId&&dist(f,loc(f.internationalWork.locationId))<20&&f.energy>20&&f.health>40&&Number(f.hunger||0)<85&&!f.illness;}
 function addChoices(f,clock,add){
  if(!alive(f)||f.traveling||f.onPlane||f.onTrain||busy(f))return;
  if(f.internationalWork?.employerId===FARM){if(onShift(clock))add(f.internationalWork.locationId,'working at the North farm',115);return;}
  const job=offer(),value=jobGain(f,job.wage);
  if(hour(clock)>=6&&hour(clock)<20&&eligible(f,clock)&&job.vacancies>0&&value.worthwhile){
   const improvement=Math.max(0,Math.min(1,value.gain/Math.max(12,Math.abs(value.oldDaily))));
   add(NORTH_FARM.locationId,'applying for agricultural work',75+neuralDrive(f,'approachDrive')*35+improvement*45+(!f.jobId?15:0));
  }
 }
 function handleResident(f,clock){if(f.fireEngineDuty||f.onFireEngine||f.ambulanceDuty||f.onAmbulance||f.emergencyTask||f.urbanFloodEscape){const o=data().orders.find(o=>!o.paid&&o.id===f.internationalFreightDuty?.orderId);if(o)finishOrder(o,true);return false;}if(f.internationalFreightDuty){const t=data().trucks.find(t=>t.id===f.internationalFreightDuty.truckId);if(!t||t.driverId!==f.id){f.internationalFreightDuty=null;return false;}if(t.boarding){moveFly?.(f);care(f,clock);if(f.traveling||dist(f,t)>5)return true;t.boarding=false;t.boardingStartedAt=null;}Object.assign(f,{x:t.x,y:t.y,z:t.z,indoors:true,traveling:false,action:'driving funded international cargo',actionUntil:now()+600});care(f,clock);return true;}
  if(f.action==='applying for agricultural work'&&!f.traveling)applyJob(f);if(f.internationalWork?.employerId!==FARM)return false;
  const conflictingEmployment=f.publicServiceRole||f.facilityEmployment||f.businessId||f.businessEmployeeOf||f.jobId&&f.jobId!=='country-farm:north-city';
  if(conflictingEmployment){if(f.jobId==='country-farm:north-city'){f.jobId=null;f.jobTitle=null;f.wage=0;}data().employees=data().employees.filter(id=>id!==f.id);f.internationalWork=null;return false;}
  if(busy(f)){f.countryFarmSampleAt=now();f.countryFarmAttending=false;return false;}
  if(!present(f,clock)){
   f.countryFarmSampleAt=now();f.countryFarmAttending=false;
   const site=loc(f.internationalWork.locationId),scheduled=shiftOrCommuteLead(f,clock),healthy=f.energy>20&&f.health>40&&Number(f.hunger||0)<85&&!f.illness&&!f.recoveringEnergy;
   // Keep paid rail journeys and their stairs intact. A personal ground outing
   // may yield to the next scheduled shift, but travel still uses real routes.
   if(scheduled&&healthy&&!f.onTrain&&!f.onPlane&&!(f.traveling&&f.metroLineId)){
    if(!f.traveling||f.targetLocationId!==site.id)startJourney?.(f,{id:site.id,action:'commuting to the scheduled North farm shift',mode:dist(f,site)<220?'walk':undefined});
    if(f.traveling&&f.targetLocationId===site.id){moveFly?.(f);care(f,clock);return true;}
   }
   return false;
  }
  const elapsed=Math.min(1800,Math.max(0,now()-Number(f.countryFarmSampleAt??now())));if(f.countryFarmAttending)wage(f,elapsed);f.countryFarmSampleAt=now();f.countryFarmAttending=true;f.action='working at the North farm';f.actionUntil=now()+600;care(f,clock);return true;
 }
 function sourceStock(o){return o.sellerId===FARM?data().stock:account(o.sellerId);}
 function requestShipment({sellerId,buyerId,sourceLocationId,destinationId,product='inventory',quantity=40,unitPrice=2.5}={}){const d=data(),seller=raw().businesses?.[sellerId],buyer=raw().businesses?.[buyerId],source=sourceStock({sellerId}),key=sellerId===FARM?product:'inventory';if(!seller||!buyer||!loc(sourceLocationId)||!loc(destinationId)||d.orders.filter(o=>!o.paid).length>=12||d.orders.some(o=>!o.paid&&o.buyerId===buyerId&&o.product===product))return null;const amount=Math.floor(Math.min(60,Math.max(0,quantity),Number(source[key]||0)));if(amount<1||!(unitPrice>0))return null;const fee=12+dist(loc(sourceLocationId),loc(destinationId))*.02,total=amount*unitPrice+fee;if(!transfer(buyer,account(ESCROW),total))return null;source[key]-=amount;const order={id:`NATIONAL-CARGO-${d.nextOrderId++}`,sellerId,buyerId,sourceLocationId,destinationId,sourceKey:key,product,quantity:amount,unitPrice,fee,total,phase:'queued',paid:false,createdAt:now(),deadline:now()+DAY*4};d.orders.push(order);return order;}
 function roadPath(t,destinationId){const bay=parkingPoint(loc(destinationId));if(!bay)return [];return pedestrianRoute(t,bay,'car').map(p=>({...p,mode:'car'}));}
 function route(t,destinationId){const points=roadPath(t,destinationId);if(!points.length)return false;Object.assign(t,{routeWaypoints:points,routeIndex:0,traveling:true,lastProgressAt:now(),destinationId});return true;}
 function finishOrder(o,cancel=false){if(o.paid)return false;const d=data(),seller=account(o.sellerId),buyer=account(o.buyerId),escrow=account(ESCROW),t=d.trucks.find(t=>t.orderId===o.id);if(cancel){transfer(escrow,buyer,o.total);sourceStock(o)[o.sourceKey]+=o.quantity;d.cancelled++;}else{transfer(escrow,seller,o.quantity*o.unitPrice);transfer(escrow,account(CARRIER),o.fee);transfer(account(CARRIER),account('industrial-fuel'),o.fee*.2);if(o.buyerId===FARM)d.stock.seeds+=o.quantity;else buyer.inventory=Number(buyer.inventory||0)+o.quantity;d.delivered++;const from=countryAt(loc(o.sourceLocationId)),to=countryAt(loc(o.destinationId));if(from!==to){d.tradeValue+=o.quantity*o.unitPrice;recordIncident(from,to,{kind:'settled trade',tradeValue:o.quantity*o.unitPrice});}if(o.sellerId===FARM){const tax=o.quantity*o.unitPrice*.05;transfer(seller,countryAccount(COUNTRY_IDS.north),tax);seller.revenueLifetime=Number(seller.revenueLifetime||0)+o.quantity*o.unitPrice;}}
  Object.assign(o,{paid:true,phase:cancel?'cancelled':'complete',completedAt:now()});if(t){const f=actor(t.driverId);if(f){f.internationalFreightDuty=null;if(!cancel||!busy(f)){const point=cancel?{x:f.x,y:f.y,z:f.z}:{x:t.x,y:1.1,z:t.z};Object.assign(f,{...point,indoors:false,traveling:false,currentLocationId:cancel?null:o.destinationId,routeWaypoints:[],routeIndex:0,action:cancel?'cargo contract cancelled':'cargo delivered',actionUntil:now()+600});}}Object.assign(t,{driverId:null,orderId:null,phase:'parked',traveling:false,boarding:false,boardingStartedAt:null,routeWaypoints:[],routeIndex:0,motionSpeed:0});}return true;
 }
 function dispatch(clock){const d=data();for(const o of d.orders.filter(o=>o.phase==='queued')){const f=d.employees.map(actor).find(f=>present(f,clock)),t=f?d.trucks.filter(t=>!t.orderId).sort((a,b)=>dist(f,a)-dist(f,b))[0]:null;if(!t||!f)break;if(!route(t,o.sourceLocationId))continue;Object.assign(t,{orderId:o.id,driverId:f.id,phase:'collecting',boarding:dist(f,t)>5,boardingStartedAt:now()});o.phase='collecting';o.truckId=t.id;f.internationalFreightDuty={truckId:t.id,orderId:o.id};if(t.boarding){pin(`NORTH-FARM-BOARD-${t.id}`,t);startJourney?.(f,{id:`NORTH-FARM-BOARD-${t.id}`,action:'walking to the farm cargo truck',mode:'walk'});if(!f.traveling){finishOrder(o,true);continue;}}else{f.routeWaypoints=[];f.traveling=false;}}}
 function moveTruck(t,seconds,headway){let left=seconds/Math.max(1,Number(raw().timeScale||120));for(let hop=0;left>1e-7&&hop<64;hop++){const p=t.routeWaypoints[t.routeIndex];if(!p){t.traveling=false;t.motionSpeed=0;return;}const dx=p.x-t.x,dz=p.z-t.z,len=Math.hypot(dx,dz);if(len<.06){t.x=p.x;t.z=p.z;t.routeIndex++;continue;}const ux=dx/len,uz=dz/len,speed=10*motorwaySpeedMultiplier(t),wanted=Math.min(len,left*speed);let step=wanted;t.targetX=p.x;t.targetZ=p.z;t.heading=Math.atan2(ux,uz);const end={x:t.x+ux*step,z:t.z+uz*step},barrier=signalBarrier(t,end,now()/Math.max(1,Number(raw().timeScale||120)));if(barrier)step=Math.min(step,barrier.distance);step=Math.min(step,headway(t,{x:t.x+ux*step,z:t.z+uz*step}));const next={x:t.x+ux*step,z:t.z+uz*step};if(!clearSegment(t,next))return;const o=data().orders.find(o=>o.id===t.orderId),admission=interceptMovement(null,t,next,{mode:'freight',occupantIds:t.driverId?[t.driverId]:undefined,manifest:{id:o.id,quantity:o.quantity},payerAccountId:FARM,entryId:`${o.id}:${t.phase}`} );if(!admission.allowed){t.motionSpeed=0;return;}Object.assign(t,{x:next.x,z:next.z,y:p.y??1.1,vx:ux*step,vz:uz*step,motionSpeed:step<wanted-.01?0:speed});if(step>.1)t.lastProgressAt=now();left-=step/speed;if(step<wanted-.001)break;if(step>=len-.001)t.routeIndex++;}if(t.routeIndex>=t.routeWaypoints.length)t.traveling=false;}
 function production(seconds,clock){const d=data(),elapsed=Math.min(1800,Math.max(0,now()-Number(d.lastProductionAt??now())));d.lastProductionAt=now();const staff=d.employees.map(actor).filter(f=>present(f,clock));if(!elapsed||!staff.length)return;let labour=staff.reduce((n,f)=>n+clamp(f.energy/100)*clamp(f.health/100),0)*elapsed/3600;for(const lot of d.crops.filter(l=>l.readyAt<=now()&&l.remaining>0)){const amount=Math.min(lot.remaining,labour*8,1600-d.stock[lot.crop]);if(amount<=0)continue;d.stock[lot.crop]+=amount;lot.remaining-=amount;labour-=amount/8;d.harvested+=amount;}
  if(labour>0&&d.stock.seeds>0&&d.crops.filter(l=>l.remaining>0).length<32){const seeds=Math.min(d.stock.seeds,labour*4,80),crop=Math.floor(now()/DAY)%2?'rice':'vegetables';d.stock.seeds-=seeds;const readyAt=now()+(crop==='rice'?2:1)*DAY;d.crops.push({crop,seeds,remaining:seeds*4,plantedAt:now(),readyAt});d.planted+=seeds;}
  d.crops=d.crops.filter(l=>l.remaining>1e-6);for(const f of staff){f.professionSkills||={};f.professionSkills.agriculture=clamp(Number(f.professionSkills.agriculture||0)+elapsed/3600*.002);}
 }
 function decisions(){const d=data();if(now()<d.nextDecisionAt)return;d.nextDecisionAt=now()+1800;d.employees=d.employees.filter(id=>alive(actor(id))&&actor(id).internationalWork?.employerId===FARM);account(FARM).employees=d.employees;reviewOffer();if(d.stock.seeds<40)requestShipment({sellerId:'farm',buyerId:FARM,sourceLocationId:'farm',destinationId:NORTH_FARM.locationId,quantity:60,product:'seed grain',unitPrice:Math.max(.5,Number(raw().businesses?.farm?.price||2))});if(Number(account('north-market').inventory||0)<100&&d.stock.rice+d.stock.vegetables<20)requestShipment({sellerId:'market',buyerId:'north-market',sourceLocationId:'market',destinationId:'north-market',quantity:60,unitPrice:Math.max(.5,Number(raw().businesses?.market?.price||3))});for(const product of ['rice','vegetables'])if(d.stock[product]>20){const buyers=['north-market','market','grocery'];for(const buyerId of buyers){const buyer=raw().businesses?.[buyerId];if(!buyer||Number(buyer.inventory||0)>300)continue;if(requestShipment({sellerId:FARM,buyerId,sourceLocationId:NORTH_FARM.locationId,destinationId:buyerId,product,quantity:60,unitPrice:2.5}))break;}}
 }
 function tick(seconds=0,clock={}){const d=data();for(const o of d.orders)if(!o.paid&&now()>o.deadline)finishOrder(o,true);if(d.orders.length>120)d.orders=[...d.orders.filter(o=>o.paid).slice(-80),...d.orders.filter(o=>!o.paid)];production(seconds,clock);decisions();dispatch(clock);const headway=createVehicleIndex([...raw().flies.filter(f=>!f.internationalFreightDuty),...d.trucks,...(raw().industrialEconomy?.trucks||[]),...(raw().regionalFreight?.trucks||[])]);for(const t of d.trucks){if(!t.orderId)continue;const o=d.orders.find(o=>o.id===t.orderId),f=actor(t.driverId);if(!o||o.paid)continue;if(!alive(f)||busy(f)&&!(t.boarding&&f.onTrain&&!busy({...f,onTrain:false}))||now()>o.deadline){finishOrder(o,true);continue;}if(t.boarding){t.boardingStartedAt??=now();if(now()-t.boardingStartedAt>DAY)finishOrder(o,true);continue;}moveTruck(t,seconds,headway);wage(f,Math.min(seconds,1800));Object.assign(f,{x:t.x,y:t.y,z:t.z,indoors:true,traveling:false});if(t.traveling){if(now()-Number(t.lastProgressAt||now())>7200&&now()>Number(t.nextReplanAt||0)){t.nextReplanAt=now()+7200;route(t,t.phase==='collecting'?o.sourceLocationId:o.destinationId);}continue;}if(t.phase==='collecting'){t.phase='loading';o.phase='loading';t.waitUntil=now()+300;}else if(t.phase==='loading'&&now()>=t.waitUntil){t.phase='delivering';o.phase='delivering';if(!route(t,o.destinationId))finishOrder(o,true);}else if(t.phase==='delivering'){t.phase='unloading';o.phase='unloading';t.waitUntil=now()+300;}else if(t.phase==='unloading'&&now()>=t.waitUntil)finishOrder(o);}}
 function snapshot(){const d=data();return {farm:{id:NORTH_FARM.id,workers:d.employees.length,capacity:40,wageOffer:offer().wage,targetWorkers:offer().targetWorkers,vacancies:offer().vacancies,stock:{...d.stock},crops:d.crops.map(l=>({...l})),cash:account(FARM).cash,planted:d.planted,harvested:d.harvested,wagesPaid:d.wagesPaid},trade:{delivered:d.delivered,cancelled:d.cancelled,value:d.tradeValue,pending:d.orders.filter(o=>!o.paid).length},trucks:d.trucks.map(t=>({id:t.id,x:t.x,y:t.y,z:t.z,heading:t.heading,phase:t.phase,traveling:t.traveling,speed:t.motionSpeed||0,driverId:t.driverId,orderId:t.orderId,routeWaypoints:t.routeWaypoints.slice(t.routeIndex,t.routeIndex+24)}))};}
 return {init,tick,addChoices,handleResident,applyJob,requestShipment,snapshot,isWorkCommitted:workCommitted};
}
