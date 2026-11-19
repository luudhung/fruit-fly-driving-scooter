import {HANSDREX_FRUIT_FARM as FARM} from './fruit-farm-map.mjs';
import {LOCATIONS} from './city-map.mjs';
import {countryAt} from './country-map.mjs';
import {hasCountryCommitment} from './country-commitments.mjs';
import {provisionDutyMeal} from './duty-meals.mjs';
const DAY=86400,FIELD='HANSDREX-FRUIT-FIELD',JOB='hansdrex-fruit-grower';
const live=f=>f?.alive&&!f.departed;
const busy=f=>f.publicServiceRole||f.facilityEmployment||f.businessId||f.businessEmployeeOf||f.internationalWork||f.industrialFreightDuty||f.fireEngineDuty||f.ambulanceDuty||f.urbanTask||f.civicDuty||f.socialTask||f.cityService||f.onTrain||f.onPlane||f.privateFlight||f.taxiJobId||f.taxiPassenger||f.arrested;
/** A public orchard employs existing people in three shifts. Each mature plant
 * yields exactly ten fruit: nine enter paid trade and one stays as seed. */
export function createFruitFarm({world,countryAccount,transfer,startJourney,moveFly,needsAndActivities=()=>{},payAndFinance=()=>{},remember=()=>{},emit=()=>{},isWorkCommitted=()=>false,requestShipment}){
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),actor=id=>raw().flies.find(f=>f.id===id);
 const data=()=>raw().fruitFarm||={version:1,employees:[],beds:[],seeds:0,harvested:0,saleFruit:0,retainedSeed:0,replanted:0,wagesPaid:0,nextRecruitAt:0,nextOrderAt:0,lastProductionAt:now()};
 const account=()=>{raw().businesses||={};return raw().businesses[FARM.accountId]||={cash:0,inventory:0,price:2.5,sector:'fruit-farming',countryId:'hansdrex',locationId:FARM.id};};
 function shift(f,clock){const h=Number(clock?.hour??now()%DAY/3600)+Number(clock?.minute||0)/60;return ((h-Number(f.preferredWorkStart||0)+24)%24)<8;}
 function available(f){return live(f)&&f.ageYears>=18&&f.ageYears<68&&countryAt(f)==='hansdrex'&&!busy(f)&&!hasCountryCommitment(f,now())&&!isWorkCommitted(f)&&f.health>40&&f.energy>15&&(!f.jobId||['farm','construction','delivery','warehouse'].includes(f.jobId));}
 function assign(f){const d=data();if(!available(f)||d.employees.length>=FARM.capacity||account().cash<8*6)return false;const slot=d.employees.length,previous=f.jobId;
  d.employees.push(f.id);Object.assign(f,{fruitFarmDuty:{farmId:FARM.id,joinedAt:now(),previousJob:previous},jobId:JOB,jobTitle:'fruit grower',wage:6,preferredWorkStart:(slot%3)*8,preferredWorkHours:8,fruitFarmSampleAt:now(),fruitFarmAttending:false});
  remember(f,'fruit_farm_job',{farmId:FARM.id,shiftStart:f.preferredWorkStart,wage:6});emit('fruit_farm_hire',`${f.id} joined the Hansdrex fruit cooperative.`,{flyId:f.id,farmId:FARM.id});return true;
 }
 function init(){const d=data(),a=account();
  // Establish the requested orchard with a paid finite seed purchase. No fruit
  // is stocked before a planted crop matures and actual staff harvest it.
  if(!d.capitalized&&Number(countryAccount('hansdrex')?.cash||0)>=6500){
   transfer(countryAccount('hansdrex'),a,6500);raw().businesses['orchard-seed-supplier']||={cash:0,inventory:0,sector:'agricultural-capital'};
   transfer(a,raw().businesses['orchard-seed-supplier'],1500);d.seeds=FARM.trees;d.capitalized=true;d.capitalizedAt=now();
  }
  d.employees=d.employees.filter(id=>live(actor(id))&&actor(id).fruitFarmDuty?.farmId===FARM.id&&actor(id).jobId===JOB);return d;
 }
 function atField(f){const site=LOCATIONS.find(l=>l.id===FIELD);return live(f)&&!f.traveling&&f.currentLocationId===FIELD&&Math.hypot(f.x-site.x,f.z-site.z)<24;}
 function care(f,clock){needsAndActivities(f,clock);payAndFinance(f,clock);}
 function atFarm(f){return !f.traveling&&[FARM.id,FIELD].includes(f.currentLocationId)&&Math.hypot(f.x-FARM.x,f.z-FARM.z)<100;}
 function farmMeal(f){if(!atFarm(f)||Number(f.hunger||0)<=45)return false;
  if(provisionDutyMeal(raw(),f,'hansdrex'))return true;
  const a=account(),budget=countryAccount('hansdrex');if(a.inventory<1||Number(budget?.cash||0)<4)return false;
  transfer(budget,a,4);a.inventory--;f.hunger=Math.max(0,f.hunger-60);f.thirst=Math.max(0,Number(f.thirst||0)-30);f.lastDutyMeal={at:now(),countryId:'hansdrex',vendorId:FARM.accountId,price:4};return true;
 }
 function handleResident(f,clock){if(!f.fruitFarmDuty)return false;
  if(!live(f)||f.jobId!==JOB){data().employees=data().employees.filter(id=>id!==f.id);f.fruitFarmDuty=null;return false;}
  if(busy(f)||!shift(f,clock)){f.fruitFarmAttending=false;f.fruitFarmSampleAt=now();return false;}
  if(atFarm(f))farmMeal(f);
  if(f.health<=35||f.energy<=15){f.fruitFarmAttending=false;return false;}
  if(!atField(f)){
   f.fruitFarmAttending=false;f.fruitFarmSampleAt=now();
   if(!f.traveling||f.targetLocationId!==FIELD)startJourney?.(f,{id:FIELD,action:'reporting for the orchard shift',mode:'walk'});
   if(f.traveling)moveFly?.(f);care(f,clock);return true;
  }
  const elapsed=Math.min(1800,Math.max(0,now()-Number(f.fruitFarmSampleAt??now())));f.fruitFarmSampleAt=now();
  if(f.fruitFarmAttending){const due=6*elapsed/3600,paid=Math.min(account().cash,due);if(paid>0){account().cash-=paid;f.money=Number(f.money||0)+paid;data().wagesPaid+=paid;raw().totalTransactions=Number(raw().totalTransactions||0)+1;}}
  f.fruitFarmAttending=true;f.action='harvesting and replanting orchard fruit';f.actionUntil=now()+600;f.indoors=false;care(f,clock);farmMeal(f);return true;
 }
 function tick(seconds,clock){const d=init(),a=account();if(!d.capitalized)return;
  if(now()>=d.nextRecruitAt){d.nextRecruitAt=now()+1800;
   // The requested staffed public farm recruits a few existing, free workers at
   // a time. They keep their identity and must walk to the field before work.
   for(const f of raw().flies.filter(available).sort((a,b)=>Number(Boolean(a.jobId))-Number(Boolean(b.jobId))||Math.hypot(a.x-FARM.x,a.z-FARM.z)-Math.hypot(b.x-FARM.x,b.z-FARM.z)).slice(0,3))assign(f);
  }
  const elapsed=Math.min(1800,Math.max(0,now()-d.lastProductionAt));d.lastProductionAt=now();
  const onsite=d.employees.map(actor).filter(f=>atField(f)&&shift(f,clock)&&!busy(f)&&f.health>35&&f.energy>15);
  let labour=onsite.reduce((n,f)=>n+Math.max(.15,Math.min(1,f.energy/100))*Math.min(1,f.health/100),0)*elapsed/3600;
  // A worker may tend up to four whole plants per hour; no fractional harvest
  // can leak the seed fruit into the sale inventory.
  d.labour=Number(d.labour||0)+labour;let actions=Math.floor(d.labour*4);d.labour-=actions/4;
  for(const bed of d.beds){if(!actions)break;if(bed.readyAt===null||bed.readyAt>now())continue;actions--;
   a.inventory+=9;d.seeds+=1;d.harvested+=10;d.saleFruit+=9;d.retainedSeed+=1;bed.readyAt=null;
  }
  for(const bed of d.beds){if(!actions||d.seeds<1)break;if(bed.readyAt!==null)continue;actions--;d.seeds--;bed.plantedAt=now();bed.readyAt=now()+DAY;d.replanted++;}
  while(actions>0&&d.beds.length<FARM.trees&&d.seeds>=1){actions--;d.seeds--;d.beds.push({id:d.beds.length+1,plantedAt:now(),readyAt:now()+DAY});d.replanted++;}
  // Keep only bounded unfinished labour. Idle staff cannot bank months of work
  // and instant-harvest future crops when the clock crosses maturity.
  d.labour=Math.min(.25,d.labour+Math.min(actions,1)/4);
  if(now()>=d.nextOrderAt){d.nextOrderAt=now()+1800;
   const buyers=['market','grocery','bakery','riverside-market','north-market','north-restaurant'];
   for(const buyerId of buyers){const buyer=raw().businesses?.[buyerId];if(!buyer||buyer.inventory>=160||a.inventory<1||raw().urbanWorld?.buildings?.[buyerId]&&raw().urbanWorld.buildings[buyerId].stage!=='operational')continue;
    const destination=LOCATIONS.find(l=>l.id===buyerId);if(!destination)continue;const country=countryAt(destination),need=Math.max(0,Math.min(120,Math.ceil((raw().flies.filter(f=>live(f)&&countryAt(f)===country).length||100)/3)));
    if(buyer.inventory>=need)continue;const quantity=Math.min(60,Math.floor(a.inventory),need-Math.floor(buyer.inventory));if(quantity<1)continue;
    const bill=quantity*2.5+12+Math.hypot(destination.x-FARM.gate.x,destination.z-FARM.gate.z)*.02;
    if(buyer.cash<bill&&Number(countryAccount(country)?.cash||0)>=bill-buyer.cash)transfer(countryAccount(country),buyer,bill-buyer.cash);
    requestShipment?.({sellerId:FARM.accountId,buyerId,sourceLocationId:FARM.id,destinationId:buyerId,product:'fruit',quantity,unitPrice:2.5});
   }
  }
 }
 function addChoices(f,clock,add){if(available(f)&&data().employees.length<FARM.capacity)add(FARM.id,'applying for fruit-growing work',110);}
 const committed=f=>Boolean(f.fruitFarmDuty&&f.jobId===JOB&&shift(f)&&!busy(f)&&f.health>35&&f.energy>15);
 function snapshot(){const d=data();return {id:FARM.id,countryId:'hansdrex',workers:d.employees.length,capacity:FARM.capacity,shifts:[0,8,16].map(start=>({start,workers:d.employees.map(actor).filter(f=>f?.preferredWorkStart===start).length})),trees:FARM.trees,planted:d.beds.length,ripe:d.beds.filter(b=>b.readyAt!==null&&b.readyAt<=now()).length,inventory:account().inventory,seeds:d.seeds,harvested:d.harvested,saleFruit:d.saleFruit,retainedSeed:d.retainedSeed,replanted:d.replanted,wagesPaid:d.wagesPaid,cash:account().cash};}
 return {init,tick,handleResident,addChoices,isWorkCommitted:committed,snapshot};
}
