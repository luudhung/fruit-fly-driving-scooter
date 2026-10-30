import {PARKING_SPACES,parkingPoint,LOCATIONS,onIsland} from './city-map.mjs';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const ownsCar=f=>String(f.vehicle||'').includes('car');
export function ensureDrivingMemory(f){
 const b=f.brain;b.driving=b.driving||{carefulValue:.15,recklessValue:-.12,experiences:0,fines:0,damageEvents:0,style:'careful',lastDecisionTrip:null,lastObservedAt:0};return b.driving;
}
export function chooseDrivingStyle(f,drives,chaos,random){
 const d=ensureDrivingMemory(f),risk=Number(f.traits?.risk||0),awareness=Number(f.lawAwareness??.7);
 const score=(risk-.5)*2+(f.excitement||0)/100*.6+chaos*.65+(drives.motor||0)*.25-(drives.avoid||0)*.6-awareness*1.15+(d.recklessValue-d.carefulValue)*1.6;
 d.riskProbability=.01+.3/(1+Math.exp(-score*2));d.style=random<d.riskProbability?'reckless':'careful';return d.style;
}
export function learnDrivingOutcome(f,reward,outcome){
 const d=ensureDrivingMemory(f),key=d.style==='reckless'?'recklessValue':'carefulValue';d[key]=clamp(d[key]+.22*(reward-d[key]),-3,3);d.experiences++;d.lastOutcome=outcome;d.lastReward=reward;
 if(f.brain.dynamic)f.brain.dynamic.rewardExpectation=clamp((f.brain.dynamic.rewardExpectation||0)*.8+reward*.2,-1,1);
 return d;
}
export function createRoadLife({world,random,remember,emit,neuralDrive,startJourney}){
 const spaceIds=new Set(PARKING_SPACES.map(p=>p.id));
 const data=()=>{const s=world();return s.roadLife||(s.roadLife={version:1,incidents:[],nextChaosAt:s.simulationAgeSeconds+600,chaosUntil:0,totalIncidents:0,totalFines:0,totalRepairs:0,vehiclePurchases:0});};
 function occupied(skip){const taken=new Set();for(const f of world().flies){if(!f.alive||f.id===skip)continue;if(f.parkedCar?.spaceId&&(!f.traveling||f.transitMode!=='car'))taken.add(f.parkedCar.spaceId);if(f.destinationParking?.spaceId)taken.add(f.destinationParking.spaceId);}return taken;}
 function park(f,p=f){const point=parkingPoint(p,occupied(f.id));if(point)f.parkedCar=point;return point;}
 function destination(f,p){const point=parkingPoint(p,occupied(f.id));f.destinationParking=point;return point;}
 function normalizeParking(){
  const taken=new Set();for(const f of world().flies){if(!f.alive||!f.vehicle||f.traveling&&f.transitMode==='car')continue;
   const p=f.parkedCar;if(!p?.spaceId||!spaceIds.has(p.spaceId)||taken.has(p.spaceId))f.parkedCar=parkingPoint(p||f,taken);
   if(f.parkedCar)taken.add(f.parkedCar.spaceId);
  }
 }
 function buy(f,vehicle='compact car',financed=true){
  const s=world(),dealer=s.businesses['vehicle-showroom'];if(f.vehicle||f.ageYears<18||!dealer||dealer.inventory<1)return false;
  const prices={'scooter':420,'compact car':760,'premium car':1650},price=prices[vehicle]*Math.max(.6,Number(s.centralBank?.priceLevel||1));if(!price)return false;
  const deposit=financed&&vehicle==='compact car'?Math.min(10,price):price,principal=price-deposit;
  if(f.money+f.savings<deposit+5||s.bank.reserves<principal)return false;
  const cash=Math.min(f.money,deposit);f.money-=cash;f.savings-=deposit-cash;s.bank.reserves-=principal;dealer.cash+=price;dealer.inventory--;
  f.vehicle=vehicle;f.mobilityShopping=false;f.vehicleAssetValue=price;f.expensesLifetime=Number(f.expensesLifetime||0)+deposit;
  if(principal){f.vehicleLoan={balance:principal,originalPrincipal:principal,dailyPayment:5,annualRate:0,nextDueDay:Math.floor(s.simulationAgeSeconds/86400)+2,paid:0};s.bank.carLoansOutstanding=Number(s.bank.carLoansOutstanding||0)+principal;}
  park(f);s.totalTransactions++;data().vehiclePurchases++;remember(f,'vehicle_purchase',{vehicle,price,deposit,loan:principal,installment:principal?5:0});emit('vehicle_purchase',`${f.id} bought a ${vehicle}${principal?' with 10 H$ down and 5 H$/day, 0% interest':''}.`,{flyId:f.id,vehicle,price,deposit,loan:principal});return true;
 }
 function finance(f){
  const loan=f.vehicleLoan,s=world(),day=Math.floor(s.simulationAgeSeconds/86400)+1;if(!loan||loan.balance<=0||day<loan.nextDueDay)return;
  const due=Math.min(loan.balance,Math.min(3,day-loan.nextDueDay+1)*loan.dailyPayment),available=Math.max(0,f.money+f.savings-20),paid=Math.min(due,available),cash=Math.min(f.money,paid);
  f.money-=cash;f.savings-=paid-cash;loan.balance-=paid;loan.paid+=paid;loan.nextDueDay=day+1;loan.arrears=due-paid;s.bank.reserves+=paid;s.bank.carLoansOutstanding=Math.max(0,Number(s.bank.carLoansOutstanding||0)-paid);if(paid)s.totalTransactions++;
 }
 function arrived(f){
  if(f.drivingTripActive){const reward=ensureDrivingMemory(f).style==='reckless'?.14:.2;learnDrivingOutcome(f,reward,'trip completed');remember(f,'driving_outcome',{style:f.brain.driving.style,reward});
   const fee=Math.min(Math.max(0,f.money+f.savings),.3),cash=Math.min(f.money,fee);f.money-=cash;f.savings-=fee-cash;world().businesses['vehicle-showroom'].cash+=fee;f.drivingTripActive=false;
  }
  f.roadDuty=false;f.destinationParking=null;
 }
 function stepDriver(f){
  const s=world(),now=s.simulationAgeSeconds,d=ensureDrivingMemory(f),chaos=now<data().chaosUntil?1:0;
  if(d.lastDecisionTrip!==f.travelStartedAt){d.lastDecisionTrip=f.travelStartedAt;chooseDrivingStyle(f,{motor:neuralDrive(f,'motorDrive'),avoid:neuralDrive(f,'avoidDrive')},chaos,random(f));d.lastObservedAt=now;f.drivingTripActive=true;}
  if(now-Number(d.lastObservedAt||0)>=900){
   d.lastObservedAt=now;
   if(d.style==='reckless'&&random(f)<.035+chaos*.075){
    const fine=Math.min(Math.max(0,f.money),18+random(f)*24);f.money-=fine;s.treasury.cash+=fine;f.expensesLifetime+=fine;d.fines++;d.damageEvents++;f.lawAwareness=clamp((f.lawAwareness||.7)+.035);f.stress=clamp((f.stress||0)+6,0,100);f.trafficHoldUntil=now+360;
    const road=data();road.totalIncidents++;road.totalFines+=fine;const place=parkingPoint(f);road.incidents.push({id:`ROAD-${road.totalIncidents}`,x:place?.x??f.x,z:place?.z??f.z,repairAt:now+7200,driverId:f.id});road.incidents=road.incidents.slice(-24);
    learnDrivingOutcome(f,-1.8,'curbside damage and traffic fine');remember(f,'driving_outcome',{style:'reckless',reward:-1.8,fine,propertyDamage:true});emit('traffic_incident',`${f.id} clipped roadside furniture; paid ${fine.toFixed(0)} H$ and learned from the consequence.`,{flyId:f.id,fine,x:f.x,z:f.z});
   }else learnDrivingOutcome(f,d.style==='reckless'?.035:.12,'safe road segment');
  }
  return now<Number(f.trafficHoldUntil||0);
 }
 function tick(){
  const s=world(),r=data(),now=s.simulationAgeSeconds;if(!s.flies.some(f=>f.alive))return;normalizeParking();
  for(const f of s.flies)if(f.alive)finance(f);
  const dealer=s.businesses['vehicle-showroom'];if(dealer.inventory<15&&dealer.cash>12000&&now-Number(r.lastRestockAt||-86400)>=10800){dealer.cash-=9600;s.businesses['vehicle-supplier'].cash+=9600;dealer.inventory+=30;r.lastRestockAt=now;}
  if(now>=r.nextChaosAt){r.chaosUntil=now+1200;r.nextChaosAt=now+10800+random(s.flies.find(f=>f.alive))*18000;emit('road_life','A lively traffic period: each driver weighs temptation against rules and experience.',{});}
  r.incidents=r.incidents.filter(i=>{if(i.repairAt>now||s.treasury.cash<12)return true;s.treasury.cash-=12;s.businesses['vehicle-showroom'].cash+=12;s.treasury.spending=Number(s.treasury.spending||0)+12;r.totalRepairs++;return false;});
  const living=s.flies.filter(f=>f.alive),target=Math.max(1,Math.ceil(living.length*.1));
  const driving=living.filter(f=>f.traveling&&f.transitMode==='car').length;
  const committed=living.filter(f=>f.traveling&&(f.transitMode==='car'||f.routeWaypoints?.slice(f.routeIndex).some(p=>p.mode==='car'))).length;
  const wanted=Math.ceil(target*3);let missing=Math.max(0,wanted-committed),started=0;
  const owners=living.filter(ownsCar).length,buyersOnTheWay=living.filter(f=>f.mobilityShopping&&f.traveling).length;
  if(owners+buyersOnTheWay<target*4){
   let invited=0;for(const f of living){if(invited>=5||owners+buyersOnTheWay+invited>=target*4)break;
    if(f.vehicle||f.mobilityShopping||f.ageYears<18||f.sleeping||f.illness||f.health<50||f.energy<40||f.hunger>75||f.money+f.savings<20||f.traits.thrift>=.76||onIsland(f)||f.onPlane||f.onTrain||f.heliPassenger||f.arrestedUntil>now)continue;
    if(f.traveling)continue;f.mobilityShopping=true;startJourney(f,{id:'vehicle-showroom',action:'shopping for a vehicle'});invited++;
   }
  }
  const candidates=living.filter(f=>ownsCar(f)&&f.ageYears>=18&&f.health>40&&f.energy>35&&f.hunger<85&&!f.sleeping&&!f.illness&&!f.onTrain&&!f.onPlane&&!f.heliPassenger&&!f.islandHoliday&&!(f.arrestedUntil>now)&&(!f.traveling||f.transitMode==='walk')&&Number(f.traits?.thrift||0)<.76&&!onIsland(f));
  candidates.sort((a,b)=>(b.energy+Number(b.brain?.dynamic?.curiosity||0)*20-(b.thirst||0)*.2)-(a.energy+Number(a.brain?.dynamic?.curiosity||0)*20-(a.thirst||0)*.2));
  for(const f of candidates){if(!missing||started>=10)break;if(f.roadDuty||f.routeWaypoints?.slice(f.routeIndex).some(p=>p.mode==='car'))continue;
   const destinations=LOCATIONS.filter(p=>Math.abs(p.x)<300&&Math.abs(p.z)<300&&Math.hypot(p.x-f.x,p.z-f.z)>100&&Math.hypot(p.x-f.x,p.z-f.z)<500&&!['home','transit'].includes(p.type));if(!destinations.length)continue;
   const dest=destinations[Math.floor(random(f)*destinations.length)];f.roadDuty=true;startJourney(f,{id:dest.id,action:'driving on a personal errand'});
   if(f.traveling&&f.routeWaypoints.some(p=>p.mode==='car')){missing--;started++;}else f.roadDuty=false;
  }
  r.targetDrivingCars=target;r.drivingCars=driving;r.parkedCars=living.filter(f=>ownsCar(f)&&(!f.traveling||f.transitMode!=='car')).length;r.carOwners=living.filter(ownsCar).length;r.recklessDrivers=living.filter(f=>f.traveling&&f.transitMode==='car'&&f.brain?.driving?.style==='reckless').length;
 }
 function summary(){const r=data();return{targetDrivingCars:r.targetDrivingCars||Math.ceil(world().flies.filter(f=>f.alive).length*.1),drivingCars:r.drivingCars||0,parkedCars:r.parkedCars||0,carOwners:r.carOwners||0,recklessDrivers:r.recklessDrivers||0,chaosActive:world().simulationAgeSeconds<r.chaosUntil,incidents:r.incidents,totalIncidents:r.totalIncidents,totalFines:r.totalFines,totalRepairs:r.totalRepairs,financing:{downPayment:10,dailyPayment:5,annualRate:0}};}
 return{tick,stepDriver,arrived,buy,finance,park,destination,normalizeParking,summary};
}
