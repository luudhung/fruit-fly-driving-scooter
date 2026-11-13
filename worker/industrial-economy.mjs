import {migrateNorthIndustry} from './industry-relocation.mjs';
import {planIndustrialLabour} from './industrial-labor.mjs';
import {createGarmentRetail} from './garment-retail.mjs';
import {createRegionalFreight} from './regional-freight.mjs';
import {LOCATIONS,parkingPoint,pedestrianRoute,clearSegment} from './city-map.mjs';
import {signalBarrier,createVehicleIndex} from './traffic.mjs';
import {motorwaySpeedMultiplier} from './motorway.mjs';
import {districtProfile} from './district-economy.mjs';
import {INDUSTRIAL_PLANTS,INDUSTRIAL_DEPOT,INDUSTRIAL_ZONES,INDUSTRIAL_LOADING_BAYS,MAX_FREIGHT_TRUCKS} from './industry-map.mjs';
const DAY=86400,dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const essential=new Set(['doctor','hospital-central','hospital-east','school','power','power-evening','power-night','grid-dispatch','firefighter','paramedic','transit','police','military']);
const products={garments:{raw:'fabric',input:1,output:1,price:8,buyers:['corner-shop','night-market']},'food-production':{raw:'grain',input:1,output:2,price:3.8,buyers:['market','grocery','bakery','riverside-market']},'building-materials':{raw:'aggregate',input:1,output:1.5,price:5,buyers:['civic-materials']}};
const sourceId='industrial-raw-depot',escrowId='industrial-freight-escrow',supplierId='industrial-equipment-supplier';
const launchAction='planning an industrial company',hireAction='applying for industrial work';

/** Finite inputs, on-site labour, funded contracts and physical freight. No rendering or extra brains. */
export function createIndustrialEconomy({world,neuralDrive=()=>.5,emit=()=>{},remember=()=>{},startJourney,moveFly,needsAndActivities=()=>{},payAndFinance=()=>{},isWorkCommitted=()=>false,urbanWorld,regionalDistribution=true}){
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),loc=id=>LOCATIONS.find(l=>l.id===id);
 let cachedState,cachedAt=-1,cachedLength=-1,actors=new Map();
 const actor=id=>{if(cachedState!==raw()||cachedAt!==now()||cachedLength!==raw().flies.length){cachedState=raw();cachedAt=now();cachedLength=raw().flies.length;actors=new Map(raw().flies.map(f=>[f.id,f]));}return actors.get(id);};
 const account=id=>{raw().businesses||={};return raw().businesses[id]||={cash:0,inventory:0,sector:'industrial-supply'};};
 const companies=()=>Object.values(raw().enterprises||{}).filter(b=>b.industrial&&b.status==='operating');
 let dynamicPlants=[];
 const allPlants=()=>[...INDUSTRIAL_PLANTS,...dynamicPlants];
 const plant=id=>allPlants().find(p=>p.id===id);
 function syncDynamicPlants(){dynamicPlants=Object.values(raw().urbanWorld?.buildings||{}).filter(p=>['factory','workshop','warehouse'].includes(p.usage)&&(p.stage==='operational'||Object.values(raw().enterprises||{}).some(b=>b.status==='operating'&&b.industrialPlantId===p.id))&&p.frontage).map(p=>({...p,name:p.name||'Cơ sở sản xuất tư nhân',zone:p.district||'west',sector:p.industrySector||'freight-logistics',capacity:Math.min(50,Number(p.capacity||50))}));}
 const loadingBay=id=>INDUSTRIAL_LOADING_BAYS[id]||parkingPoint(plant(id)?.frontage||loc(id));
 const unavailable=id=>Boolean(urbanWorld?.isUnavailable?.(id));
 const committed=f=>f.facilityEmployment||f.publicServiceRole||f.publicServiceDuty||f.industrialFreightDuty||f.socialTask||f.civicDuty||f.urbanTask||f.cityService||f.taxiJobId||f.taxiPassenger||f.privateFlight||f.onPrivateHelicopter||f.fireEngineDuty||f.ambulanceDuty||f.airTrip||f.heliPassenger||f.arrested||Number(f.arrestedUntil||0)>now()||f.emergencyTask||f.sportsSession||f.urbanFloodEscape;
 const driverDiverted=f=>Boolean(f?.fireEngineDuty||f?.ambulanceDuty||f?.urbanFloodEscape||f?.civicDuty||f?.emergencyTask||f?.onPlane||f?.onTrain);
 function data(){return raw().industrialEconomy||={version:1,plants:{},orders:[],trucks:[],nextOrderId:1,nextTruckId:1,lastTickAt:now(),nextDecisionAt:now(),nextRestockAt:now()+DAY,rawStock:{fabric:0,grain:0,aggregate:0},rawRestock:null,seeded:false,wagesPaid:0,revenue:0,unitsProduced:0,delivered:0,cancelled:0,externalOutflow:0,history:[]};}
 function note(type,text,payload={}){const d=data();d.history.push({type,text,at:now(),...payload});d.history=d.history.slice(-24);emit(type,text,payload);}
 function transfer(from,to,amount){amount=Math.max(0,Number(amount)||0);if(Number(from.cash||0)+1e-7<amount)return false;from.cash=Number(from.cash||0)-amount;to.cash=Number(to.cash||0)+amount;raw().totalTransactions=Number(raw().totalTransactions||0)+1;return true;}
 function spendResident(f,amount,to){if(Number(f.money||0)+Number(f.savings||0)+1e-7<amount)return false;const cash=Math.min(Number(f.money||0),amount);f.money-=cash;f.savings=Number(f.savings||0)-(amount-cash);to.cash=Number(to.cash||0)+amount;return true;}
 function refreshPlants(){const d=data();for(const p of allPlants()){const b=companies().find(b=>b.industrialPlantId===p.id);d.plants[p.id]={id:p.id,district:p.zone,zone:p.zone,sector:p.sector,businessId:b?.id||null,status:b?(unavailable(p.id)?'suspended':now()<b.openingAt?'fitting-out':'operating'):'vacant',capacity:p.capacity,wageOffer:b?.wageOffer||null,targetWorkers:b?.labourPlan?.targetWorkers||0,shifts:b?.labourPlan?.shifts||0,workers:b?.employees?.length||0,productionUnits:Number(b?.productionUnits||0),lastProducedAt:b?.lastProducedAt||null};}}
 const clothingRetail=createGarmentRetail({world,eligible,unavailable,account,transfer,spendResident,remember,emit,neuralDrive,committed});
 const regionalFreight=createRegionalFreight({world,account,transfer,roadPath,moveTruck,unavailable});
 function init(){
  migrateNorthIndustry(raw());syncDynamicPlants();
  const d=data();raw().enterprises||={};raw().nextEnterpriseId=Number(raw().nextEnterpriseId||1);for(const id of [sourceId,escrowId,supplierId,'industrial-fuel'])account(id);
  // A paid, finite public wholesale reserve bootstraps private factories; no free enterprise is spawned.
  if(!d.seeded&&loc(sourceId)){const units=Math.floor(Math.min(6000,Math.max(0,Number(raw().treasury?.cash||0)))/2);if(units>0){transfer(raw().treasury,account(supplierId),units*2);for(const key of ['fabric','grain','aggregate'])d.rawStock[key]=Math.floor(units/3);d.externalOutflow+=units*2;d.seeded=true;}}
  for(const b of companies()){b.inventory||={raw:0,finished:0};b.employees||=[];b.industrialPayrollManaged=true;}
  for(const truck of d.trucks){truck.alive=true;truck.vehicleLength=6.4;truck.transitMode='car';if(truck.boarding&&!loc(`FREIGHT-BOARD-${truck.id}`))LOCATIONS.push({id:`FREIGHT-BOARD-${truck.id}`,name:'Freight truck loading bay',type:'industrial-duty',x:truck.x,z:truck.z});if(truck.driverId){const f=actor(truck.driverId);if(f?.alive)f.industrialFreightDuty={truckId:truck.id,orderId:truck.orderId};}}
  clothingRetail.init();if(regionalDistribution)regionalFreight.init();
  for(const t of d.trucks)if(t.industryRouteRelocated){const o=d.orders.find(o=>o.id===t.orderId&&!o.paid);if(o){const destination=t.phase==='collecting'?o.sourceLocationId:o.destinationId;routeTruck(t,destination,t.phase==='collecting'?raw().enterprises[t.ownerBusinessId]?.locationId:o.sourceLocationId);}delete t.industryRouteRelocated;}
  for(const t of raw().regionalFreight?.trucks||[])if(t.industryRouteRelocated){const job=raw().regionalFreight.jobs.find(j=>j.id===t.jobId&&!j.paid),destination=t.routeDestination||(job?(t.phase==='collecting'?job.from:job.to):t.homeId),bay=loadingBay(destination);if(bay){const points=roadPath(t,bay,t.locationId,destination);if(points.length)Object.assign(t,{routeWaypoints:points,routeIndex:0,traveling:true,routeDestination:destination,motionSpeed:0,lastProgressAt:now()});}delete t.industryRouteRelocated;}
  refreshPlants();return d;
 }
 function availablePlants(owner){const used=new Set(companies().map(b=>b.industrialPlantId));return allPlants().filter(p=>(!p.ownerId||p.ownerId===owner?.id)&&loc(p.id)&&!used.has(p.id)&&!unavailable(p.id));}
 function eligible(f){return f?.alive&&f.ageYears>=23&&f.ageYears<67&&!f.businessId&&!f.businessEmployeeOf&&!essential.has(f.jobId)&&!committed(f)&&!isWorkCommitted(f)&&!f.onTrain&&!f.onPlane&&f.energy>30&&f.health>50;}
 function canApply(f){const employer=raw().enterprises?.[f?.businessEmployeeOf];return eligible(f)||Boolean(employer?.industrial&&employer.status==='operating'&&f.alive&&f.ageYears>=23&&f.ageYears<67&&!f.businessId&&!committed(f)&&!isWorkCommitted(f)&&!f.onTrain&&!f.onPlane&&f.energy>30&&f.health>50);}
 function desire(f,p){const spec=products[p.sector],market=spec?spec.buyers.reduce((n,id)=>n+clamp((800-Number(raw().businesses?.[id]?.inventory??800))/800),0)/spec.buyers.length:clamp(data().orders.filter(o=>!o.paid).length/Math.max(1,companies().filter(b=>b.industrialSector==='freight-logistics').length*4));const t=f.traits||{},skill=Number(f.professionSkills?.[p.sector]||0),distance=Math.hypot((f.homeX??f.x)-p.x,(f.homeZ??f.z)-p.z);return Number(t.ambition??.5)*.4+neuralDrive(f,'approachDrive')*.25+Number(t.thrift??.5)*.15+skill*.2-distance*.00008+(p.zone==='west'?.12:0)+market*.18;}
 function foundCompany(f,preferredPlantId){
  if(!eligible(f)||f.traveling||f.currentLocationId!=='bank'||now()<Number(f.nextIndustrialStartupAt||0))return null;
  const choices=availablePlants(f).filter(p=>!preferredPlantId||p.id===preferredPlantId).sort((a,b)=>desire(f,b)-desire(f,a));const p=choices[0];if(!p)return null;
  const readiness=desire(f,p);if(readiness<.46)return null;
  const capital=p.zone==='west'?2800:3400,own=Math.min(capital*.6,Math.max(0,Number(f.money||0))+Math.max(0,Number(f.savings||0))*.5),loan=capital-own;
  if(own<capital*.3||loan>0&&(Number(f.creditScore||600)<520||Number(raw().bank?.reserves||0)<loan))return null;
  const id=`BIZ-${String(raw().nextEnterpriseId++).padStart(5,'0')}`,b={id,name:`${p.name} · ${f.name||f.id}`,ownerId:f.id,sector:p.sector==='freight-logistics'?'logistics':'manufacturing',locationId:p.id,
   industrial:true,industrialPayrollManaged:true,industrialPlantId:p.id,industrialZone:p.zone,industrialSector:p.sector,status:'operating',cash:0,employees:[],loanBalance:loan,assetValue:1200,baseCapital:capital,
   inventory:{raw:0,finished:0},productionUnits:0,lastProducedAt:null,revenueLifetime:0,expensesLifetime:0,profitToday:0,reputation:.5,openingAt:now()+14400,lastProductionAt:now(),nextOrderAt:now(),nextFinanceAt:now()+DAY,lease:{hourlyRent:p.zone==='west'?1.1:1.8},badDays:0};
  spendResident(f,own,b);if(loan>0){raw().bank.reserves-=loan;raw().bank.loansOutstanding=Number(raw().bank.loansOutstanding||0)+loan;b.cash+=loan;f.bankLoan=Number(f.bankLoan||0)+loan;}
  transfer(b,raw().treasury,500);transfer(b,account(supplierId),700);b.expensesLifetime+=1200;
  raw().enterprises[id]=b;Object.assign(f,{businessId:id,jobId:null,jobTitle:'industrial founder / owner',wage:0,industrialPayrollManaged:true,nextIndustrialStartupAt:now()+DAY});
  planIndustrialLabour(b,p,f,raw(),now());const bay=loadingBay(p.id)||p.frontage;if(data().trucks.length<MAX_FREIGHT_TRUCKS)data().trucks.push({id:`FREIGHT-${data().nextTruckId++}`,ownerBusinessId:id,x:bay.x,z:bay.z,y:Number(bay.y??1.1),alive:true,vehicleLength:6.4,traveling:false,transitMode:'car',routeWaypoints:[],routeIndex:0,driverId:null,orderId:null,phase:'parked',heading:0,lastProgressAt:now()});
  remember(f,'industrial_startup',{businessId:id,plantId:p.id,sector:p.sector,loan});note('industrial_startup',`${f.id} opened ${p.name} using private capital and a bank loan.`,{flyId:f.id,businessId:id,plantId:p.id});refreshPlants();return b;
 }
 function acceptsOffer(f,p,wage){const home={x:Number(f.homeX??f.x),z:Number(f.homeZ??f.z)},oldWork=loc(raw().enterprises?.[f.businessEmployeeOf]?.locationId)||loc(f.jobId)||loc('bank')||home;const commuteSaving=Math.max(-1,Math.min(1,(dist(home,oldWork)-dist(home,p))*.001));return !f.jobId&&!f.businessEmployeeOf||wage+commuteSaving>=Number(f.wage||0)*(f.businessEmployeeOf?1.05:.9);}
 function applyJob(f,id){
  const b=raw().enterprises?.[id],p=plant(b?.industrialPlantId);if(!p||!canApply(f)||b.id===f.businessEmployeeOf||f.traveling||b.status!=='operating'||unavailable(p.id)||b.cash<180||b.employees.length>=p.capacity||f.currentLocationId!==p.id&&dist(f,loc(p.id))>16)return false;
  const plan=planIndustrialLabour(b,p,actor(b.ownerId),raw(),now()),wage=plan.wageOffer;if(b.employees.length>=plan.targetWorkers||!acceptsOffer(f,p,wage))return false;
  const shift=plan.shiftStarts.map(start=>({start,count:b.employees.map(actor).filter(e=>e?.preferredWorkStart===start).length})).sort((a,b)=>a.count-b.count)[0].start;
  const previous=raw().enterprises?.[f.businessEmployeeOf];if(previous)previous.employees=previous.employees.filter(id=>id!==f.id);
  b.employees.push(f.id);Object.assign(f,{businessEmployeeOf:b.id,jobId:null,jobTitle:p.sector==='freight-logistics'?'freight driver':'industrial production worker',wage,industrialPayrollManaged:true,enterpriseLocationId:p.id,preferredWorkStart:shift,preferredWorkHours:plan.shiftHours,industrialPaySampleAt:now(),industrialAttending:false});remember(f,'industrial_hire',{businessId:id,wage});return true;
 }
 function addChoices(f,clock,add){
  if(!f?.alive||f.traveling||f.onPlane||f.onTrain||committed(f))return;clothingRetail.addChoices(f,clock,add);
  if(canApply(f)&&Number(clock.hour)>=7&&Number(clock.hour)<19){
   const choices=availablePlants(f);if(eligible(f)&&choices.length&&Number(f.money||0)+Number(f.savings||0)*.5>=840&&now()>=Number(f.nextIndustrialStartupAt||0))add('bank',launchAction,55+Math.max(...choices.map(p=>desire(f,p)))*65+(f.jobId?0:10));
   const offers=companies().filter(b=>b.id!==f.businessEmployeeOf&&!unavailable(b.locationId)&&b.cash>180&&b.employees.length<planIndustrialLabour(b,plant(b.industrialPlantId),actor(b.ownerId),raw(),now()).targetWorkers).sort((a,b)=>dist(f,loc(a.locationId))-dist(f,loc(b.locationId))).slice(0,2);
   for(const b of offers){const wage=b.wageOffer;if(acceptsOffer(f,plant(b.industrialPlantId),wage))add(b.locationId,hireAction,65+Math.max(0,wage-Number(f.wage||0))*10);}
  }
 }
 function care(f,clock){if(f.industrialCareAt===now())return;f.industrialCareAt=now();needsAndActivities(f,clock);payAndFinance(f,clock);}
 function onShift(f,clock){return ((Number(clock.hour||0)+Number(clock.minute||0)/60-Number(f.preferredWorkStart??8)+24)%24)<Number(f.preferredWorkHours||8);}
 function present(f,b,clock){return f?.alive&&!f.traveling&&!f.onTrain&&!f.onPlane&&!committed(f)&&onShift(f,clock)&&f.currentLocationId===b.locationId&&dist(f,loc(b.locationId))<18&&f.energy>10&&f.health>30;}
 function wage(f,b,seconds){const due=Number(f.wage||0)*seconds/3600,gross=Math.min(Math.max(0,b.cash),due);if(gross<due){f.wageArrears=Number(f.wageArrears||0)+due-gross;b.wageArrears=Number(b.wageArrears||0)+due-gross;}if(!(gross>0))return;const tax=gross*.05;b.cash-=gross;f.money=Number(f.money||0)+gross-tax;raw().treasury.cash+=tax;b.expensesLifetime+=gross;data().wagesPaid+=gross-tax;f.salaryLifetime=Number(f.salaryLifetime||0)+gross-tax;f.salaryEarnedToday=Number(f.salaryEarnedToday||0)+gross-tax;raw().totalTransactions=Number(raw().totalTransactions||0)+1;}
 function handleResident(f,clock){
  clothingRetail.handleResident(f);
  if(f.industrialFreightDuty){const truck=data().trucks.find(t=>t.id===f.industrialFreightDuty.truckId);if(!truck||truck.driverId!==f.id){f.industrialFreightDuty=null;return false;}if(driverDiverted(f)){const order=data().orders.find(o=>o.id===truck.orderId);if(order)finishOrder(order,true);return false;}if(truck.boarding){moveFly?.(f);care(f,clock);if(f.traveling||dist(f,truck)>5)return true;truck.boarding=false;}Object.assign(f,{x:truck.x,y:truck.y,z:truck.z,indoors:true,traveling:false,currentLocationId:null,action:'driving a freight delivery',actionUntil:now()+600});care(f,clock);return true;}
  if((f.action===launchAction||f.pendingAction===launchAction)&&!f.traveling)foundCompany(f);
  if((f.action===hireAction||f.pendingAction===hireAction)&&!f.traveling){const b=companies().find(b=>b.locationId===f.currentLocationId);if(b)applyJob(f,b.id);}
  const b=raw().enterprises?.[f.businessEmployeeOf];if(!b?.industrial||b.status!=='operating')return false;
  if(f.traveling||f.onTrain||f.onPlane||committed(f))return false;
  if(!present(f,b,clock)){f.industrialAttending=false;f.industrialPaySampleAt=now();return false;}
  const elapsed=Math.min(1800,Math.max(0,now()-Number(f.industrialPaySampleAt??now())));if(f.industrialAttending)wage(f,b,elapsed);f.industrialPaySampleAt=now();f.industrialAttending=true;f.action=`working as ${f.jobTitle}`;f.actionUntil=now()+600;care(f,clock);return true;
 }
 function order(company,{kind,quantity,buyerId,sellerId,sourceLocationId,destinationId,product,unitPrice}){
  const d=data();if(d.orders.filter(o=>!['complete','cancelled'].includes(o.phase)).length>=32)return null;
  const buyer=raw().enterprises?.[buyerId]||raw().businesses?.[buyerId],seller=raw().enterprises?.[sellerId]||raw().businesses?.[sellerId];if(!buyer||!seller||!loc(sourceLocationId)||!loc(destinationId))return null;
  const source=kind==='input'?d.rawStock:company.inventory,key=kind==='input'?product:'finished',qty=Math.min(60,quantity,Math.floor(Number(source[key]||0)));if(qty<4)return null;
  const distance=dist(loc(sourceLocationId),loc(destinationId)),fee=12+distance*.028,total=qty*unitPrice+fee;if(Number(buyer.cash||0)<total)return null;
  if(!transfer(buyer,account(escrowId),total))return null;source[key]-=qty;
  const o={id:`CARGO-${d.nextOrderId++}`,companyId:company.id,kind,quantity:qty,product,buyerId,sellerId,sourceLocationId,destinationId,unitPrice,fee,total,phase:'queued',createdAt:now(),paid:false,deadline:now()+DAY*3};d.orders.push(o);return o;
 }
 function requestInput(id,quantity=60){const b=raw().enterprises?.[id],spec=products[b?.industrialSector];if(!b||!spec||data().orders.some(o=>o.companyId===id&&o.kind==='input'&&!['complete','cancelled'].includes(o.phase)))return null;return order(b,{kind:'input',quantity,buyerId:id,sellerId:sourceId,sourceLocationId:sourceId,destinationId:b.locationId,product:spec.raw,unitPrice:2});}
 function requestSale(id,buyerId,quantity=60){const b=raw().enterprises?.[id],spec=products[b?.industrialSector];if(!b||!spec||data().orders.some(o=>o.companyId===id&&o.kind==='output'&&!['complete','cancelled'].includes(o.phase)))return null;const destinationId=raw().enterprises?.[buyerId]?.locationId||(buyerId==='civic-materials'?'construction':buyerId);return order(b,{kind:'output',quantity,buyerId,sellerId:id,sourceLocationId:b.locationId,destinationId,product:b.industrialSector,unitPrice:spec.price});}
 function zone(id){if(id===sourceId)return 'west';return plant(id)?.zone||((loc(id)?.x||0)>480?'europe':(loc(id)?.z||0)<-440?'north':null);}
 function roadPath(a,b,sourceLocationId,destId){
  const za=zone(sourceLocationId),zb=zone(destId),anchors=[a];if(za&&zb&&za!==zb)anchors.push(INDUSTRIAL_ZONES[za].gateway,INDUSTRIAL_ZONES[zb].gateway);else if(za&&zb===null)anchors.push(INDUSTRIAL_ZONES[za].gateway);anchors.push(b);const points=[];
  for(let i=1;i<anchors.length;i++){const leg=pedestrianRoute({...anchors[i-1],motorwayLane:a.motorwayLane},anchors[i],'car');if(!leg.length)return [];for(const p of leg)if(!points.length||dist(points.at(-1),p)>.02)points.push({...p,mode:'car'});}return points;
 }
 function routeTruck(t,destinationId,sourceLocationId){const bay=loadingBay(destinationId);if(!bay)return false;const points=roadPath(t,bay,sourceLocationId,destinationId);if(!points.length)return false;t.routeWaypoints=points;t.routeIndex=0;t.traveling=true;t.motionSpeed=0;t.lastProgressAt=now();return true;}
 function driverFor(b,clock){return [actor(b.ownerId),...(b.employees||[]).map(actor)].find(f=>present(f,b,clock));}
 function dispatch(clock){
  const d=data();for(const o of d.orders.filter(o=>o.phase==='queued')){
   const principal=raw().enterprises[o.companyId];if(!principal||principal.status!=='operating'){finishOrder(o,true);continue;}
   const carriers=companies().filter(b=>b.industrialSector==='freight-logistics').concat(principal);let assigned=false;
   for(const b of carriers){const t=d.trucks.find(t=>t.ownerBusinessId===b.id&&!t.orderId);if(!t)continue;const f=driverFor(b,clock);if(!f)continue;
    if(!routeTruck(t,o.sourceLocationId,b.locationId))continue;t.driverId=f.id;t.orderId=o.id;t.phase='collecting';o.phase='collecting';o.truckId=t.id;o.carrierId=b.id;f.industrialFreightDuty={truckId:t.id,orderId:o.id};const boardingId=`FREIGHT-BOARD-${t.id}`;let boarding=loc(boardingId);if(!boarding){boarding={id:boardingId,name:'Freight truck loading bay',type:'industrial-duty',x:t.x,z:t.z};LOCATIONS.push(boarding);}else Object.assign(boarding,{x:t.x,z:t.z});t.boarding=dist(f,t)>5;if(t.boarding){startJourney?.(f,{id:boardingId,action:'walking to the freight truck'});if(!f.traveling){t.boarding=false;finishOrder(o,true);continue;}}else{f.indoors=true;f.traveling=false;f.routeWaypoints=[];f.vx=f.vz=0;}assigned=true;break;
   }if(assigned)continue;
  }
 }
 function finishOrder(o,cancel=false){
  if(o.paid)return false;const d=data(),b=raw().enterprises[o.companyId],buyer=raw().enterprises[o.buyerId]||raw().businesses[o.buyerId],seller=raw().enterprises[o.sellerId]||raw().businesses[o.sellerId],escrow=account(escrowId),t=d.trucks.find(t=>t.orderId===o.id);
  if(!cancel&&(!buyer||buyer.status==='closed'||!seller||!b||b.status!=='operating'))cancel=true;
  if(cancel){transfer(escrow,buyer||raw().treasury,o.total);if(o.kind==='input')d.rawStock[o.product]+=o.quantity;else if(b)b.inventory.finished+=o.quantity;d.cancelled++;}
  else{transfer(escrow,seller,o.quantity*o.unitPrice);const carrier=raw().enterprises[o.carrierId]||seller;transfer(escrow,carrier,o.fee);const fuel=Math.min(carrier.cash,o.fee*.2);transfer(carrier,account('industrial-fuel'),fuel);carrier.expensesLifetime=Number(carrier.expensesLifetime||0)+fuel;if(carrier.id!==o.buyerId){carrier.revenueLifetime=Number(carrier.revenueLifetime||0)+o.fee;carrier.freightRevenue=Number(carrier.freightRevenue||0)+o.fee;}if(o.kind==='input'){b.inventory.raw+=o.quantity;b.expensesLifetime+=o.quantity*o.unitPrice+(carrier.id===b.id?fuel:o.fee);}else{buyer.inventory=Number(buyer.inventory||0)+o.quantity;b.revenueLifetime+=o.quantity*o.unitPrice;d.revenue+=o.quantity*o.unitPrice;}d.delivered++;remember(actor(b.ownerId)||{},'industrial_delivery',{orderId:o.id,kind:o.kind,quantity:o.quantity});}
  o.phase=cancel?'cancelled':'complete';o.paid=true;o.completedAt=now();
  if(t){const f=actor(t.driverId);if(f){f.industrialFreightDuty=null;if(!driverDiverted(f)){const point=cancel&&t.boarding?{x:f.x,z:f.z}:{x:t.x,z:t.z};Object.assign(f,{indoors:false,traveling:false,...point,y:1.1,routeWaypoints:[],routeIndex:0,currentLocationId:cancel?null:o.destinationId,action:cancel?'freight contract cancelled':'completed a freight delivery',actionUntil:now()+600});}}Object.assign(t,{driverId:null,orderId:null,phase:'parked',boarding:false,traveling:false,motionSpeed:0,routeWaypoints:[],routeIndex:0});}
  return true;
 }
 function moveTruck(t,seconds,headway){
  let left=seconds/Math.max(1,Number(raw().timeScale||120));for(let hop=0;left>1e-7&&hop<64;hop++){
   const p=t.routeWaypoints[t.routeIndex];if(!p){t.traveling=false;t.vx=t.vz=0;return;}
   const dx=p.x-t.x,dz=p.z-t.z,length=Math.hypot(dx,dz);if(length<.06){Object.assign(t,{x:p.x,z:p.z,y:p.y??1.1});t.routeIndex++;continue;}
   const ux=dx/length,uz=dz/length;t.targetX=p.x;t.targetZ=p.z;t.heading=Math.atan2(ux,uz);const speed=10*motorwaySpeedMultiplier(t),requested=Math.min(length,left*speed),end={x:t.x+ux*requested,z:t.z+uz*requested};let step=requested;
   const barrier=signalBarrier(t,end,now()/Math.max(1,Number(raw().timeScale||120)));if(barrier)step=Math.min(step,barrier.distance);step=Math.min(step,headway(t,{x:t.x+ux*step,z:t.z+uz*step}));
   const next={x:t.x+ux*step,z:t.z+uz*step};if(!clearSegment(t,next)){t.motionSpeed=0;return;}t.vx=ux*step;t.vz=uz*step;t.x=next.x;t.z=next.z;t.y=p.y??1.1;t.motionSpeed=step<requested-.01?0:speed;if(step>.1)t.lastProgressAt=now();left-=step/speed;if(step<requested-.001)break;if(step>=length-.001)t.routeIndex++;
  }
  if(t.routeIndex>=t.routeWaypoints.length)t.traveling=false;
 }
 function tickTrucks(seconds,clock){
  const d=data(),drivers=raw().flies.filter(f=>!f.industrialFreightDuty);const headway=createVehicleIndex([...drivers,...d.trucks,...(raw().regionalFreight?.trucks||[])]);for(const t of d.trucks){if(!t.orderId)continue;const o=d.orders.find(o=>o.id===t.orderId),f=actor(t.driverId),carrier=raw().enterprises[t.ownerBusinessId];if(!o||o.paid)continue;if(driverDiverted(f)){finishOrder(o,true);continue;}if(t.boarding){if(f?.alive&&now()-o.createdAt<DAY)continue;finishOrder(o,true);continue;}
   if(!f?.alive||f.fireEngineDuty||f.ambulanceDuty||f.urbanFloodEscape||f.civicDuty||f.emergencyTask||f.onPlane||f.onTrain||!carrier||carrier.status!=='operating'||unavailable(o.sourceLocationId)||unavailable(o.destinationId)||now()>o.deadline){finishOrder(o,true);continue;}
   const before=now()-Number(t.lastProgressAt||now());moveTruck(t,seconds,headway);const hours=Math.min(1800,seconds);if(f.businessEmployeeOf===carrier.id)wage(f,carrier,hours);
   Object.assign(f,{x:t.x,y:t.y,z:t.z,indoors:true,traveling:false});
   if(before>7200){t.replans=Number(t.replans||0)+1;if(t.replans>3){finishOrder(o,true);continue;}if(routeTruck(t,t.phase==='collecting'?o.sourceLocationId:o.destinationId,t.phase==='collecting'?carrier.locationId:o.sourceLocationId))t.lastProgressAt=now();}
   if(!t.traveling){if(t.phase==='collecting'){t.phase='delivering';o.phase='delivering';if(!routeTruck(t,o.destinationId,o.sourceLocationId))finishOrder(o,true);}else finishOrder(o);}
  }
 }
 function production(b,clock){
  const previous=Number(b.lastProductionAt??now()),elapsed=Math.min(1800,Math.max(0,now()-previous));b.lastProductionAt=now();if(!elapsed||now()<b.openingAt||unavailable(b.locationId))return;
  const staff=[actor(b.ownerId),...(b.employees||[]).map(actor)].filter(f=>present(f,b,clock)),spec=products[b.industrialSector];if(!spec||!staff.length)return;
  const labour=staff.reduce((n,f)=>n+clamp(f.energy/100,.1,1)*clamp(f.health/100,.1,1),0),units=Math.min(b.inventory.raw/spec.input,Math.max(0,Number(b.labourPlan?.outputTarget||240)-b.inventory.finished)/spec.output,labour*5*elapsed/3600);if(!(units>0))return;
  b.inventory.raw-=units*spec.input;b.inventory.finished+=units*spec.output;b.productionUnits+=units*spec.output;b.lastProducedAt=now();data().unitsProduced+=units*spec.output;for(const f of staff){f.professionSkills||={};f.professionSkills[b.industrialSector]=clamp(Number(f.professionSkills[b.industrialSector]||0)+elapsed/3600*.002);}
 }
 function decisions(b){
  if(now()<Number(b.nextOrderAt||0)||now()<b.openingAt||unavailable(b.locationId))return;b.nextOrderAt=now()+1800;planIndustrialLabour(b,plant(b.industrialPlantId),actor(b.ownerId),raw(),now());
  if(products[b.industrialSector]){if(b.inventory.raw<30&&b.cash>200)requestInput(b.id);const spec=products[b.industrialSector];if(b.inventory.finished>=12){const buyer=(b.industrialSector==='garments'?[]:spec.buyers).filter(id=>raw().businesses?.[id]&&loc(id==='civic-materials'?'construction':id)).sort((a,c)=>Number(raw().businesses[a].inventory||0)-Number(raw().businesses[c].inventory||0))[0];if(buyer&&Number(raw().businesses[buyer].inventory||0)<800)requestSale(b.id,buyer);}}
  if(now()>=Number(b.nextFinanceAt||0)){
   b.nextFinanceAt=now()+DAY;const rent=Math.min(b.cash,Number(b.lease.hourlyRent||1)*24);const landlord=actor(plant(b.industrialPlantId)?.ownerId);if(landlord?.alive){b.cash-=rent;landlord.money=Number(landlord.money||0)+rent;}else transfer(b,raw().treasury,rent);const loan=Math.min(Math.max(0,b.cash-450)*.08,Number(b.loanBalance||0));if(loan>0){b.cash-=loan;raw().bank.reserves+=loan;raw().bank.loansOutstanding=Math.max(0,raw().bank.loansOutstanding-loan);b.loanBalance-=loan;const owner=actor(b.ownerId);if(owner)owner.bankLoan=Math.max(0,Number(owner.bankLoan||0)-loan);}
   const owner=actor(b.ownerId),dividend=Math.max(0,b.cash-1900)*.08;if(owner?.alive&&dividend>0){b.cash-=dividend;owner.money=Number(owner.money||0)+dividend;owner.businessEquity=b.cash+b.assetValue;}
  }
 }
 function close(b){
  if(b.status!=='operating')return;b.status='closed';for(const o of data().orders.filter(o=>(o.companyId===b.id||o.carrierId===b.id)&&!o.paid))finishOrder(o,true);for(const id of b.employees||[]){const f=actor(id);if(f?.businessEmployeeOf===b.id)Object.assign(f,{businessEmployeeOf:null,jobId:null,jobTitle:null,wage:0,industrialPayrollManaged:false});}
  const owner=actor(b.ownerId),repay=Math.min(b.cash,b.loanBalance);b.cash-=repay;raw().bank.reserves+=repay;raw().bank.loansOutstanding=Math.max(0,raw().bank.loansOutstanding-b.loanBalance);raw().bank.defaults=Number(raw().bank.defaults||0)+Math.max(0,b.loanBalance-repay);if(owner){owner.businessId=null;owner.industrialPayrollManaged=false;owner.money=Number(owner.money||0)+b.cash;owner.bankLoan=Math.max(0,Number(owner.bankLoan||0)-b.loanBalance);}else raw().treasury.cash+=b.cash;b.cash=0;b.loanBalance=0;data().trucks=data().trucks.filter(t=>t.ownerBusinessId!==b.id);note('industrial_closure',`${b.name} released its lease after its owner became unavailable.`,{businessId:b.id});
 }
 function restock(){
  const d=data();if(d.rawRestock&&now()>=d.rawRestock.arrival){for(const key of ['fabric','grain','aggregate'])d.rawStock[key]+=d.rawRestock.units;d.rawRestock=null;}
  if(!d.rawRestock&&now()>=d.nextRestockAt){const regional=Boolean(raw().regionalFreight?.funded);d.nextRestockAt=now()+(regional?21600:DAY);const units=Math.min(regional?800:400,Math.floor(account(sourceId).cash/6));if(units>0&&Object.values(d.rawStock).some(v=>v<(regional?1400:600))){transfer(account(sourceId),account(supplierId),units*6);d.externalOutflow+=units*6;d.rawRestock={units,arrival:now()+(regional?3600:21600)};}}
 }
 function tick(seconds,clock){syncDynamicPlants();const d=data();if(!loc(sourceId))return;const elapsed=Math.max(0,Math.min(1800,now()-Number(d.lastTickAt??now())));d.lastTickAt=now();for(const b of companies()){if(!actor(b.ownerId)?.alive){close(b);continue;}b.employees=b.employees.filter(id=>actor(id)?.alive&&actor(id).businessEmployeeOf===b.id);production(b,clock);decisions(b);}clothingRetail.tick(requestSale,companies());for(const o of d.orders)if(!o.paid&&now()>o.deadline)finishOrder(o,true);dispatch(clock);tickTrucks(elapsed,clock);if(regionalDistribution)regionalFreight.tick(elapsed);restock();d.orders=[...d.orders.filter(o=>!o.paid),...d.orders.filter(o=>o.paid&&now()-Number(o.completedAt||0)<DAY).slice(-32)];refreshPlants();}
 function snapshot(){const d=data(),regional=regionalFreight.snapshot();refreshPlants();return{clothingShops:clothingRetail.snapshot(),regionalFreight:regional,version:2,plants:Object.values(d.plants),rawStock:{...d.rawStock},companies:companies().map(b=>({id:b.id,name:b.name,ownerId:b.ownerId,plantId:b.industrialPlantId,zone:b.industrialZone,sector:b.industrialSector,cash:b.cash,inventory:{...b.inventory},employees:[...b.employees],productionUnits:b.productionUnits,revenueLifetime:b.revenueLifetime,wageOffer:b.wageOffer,labourPlan:b.labourPlan})),trucks:[...regional.trucks,...d.trucks.map(t=>({id:t.id,x:t.x,y:t.y,z:t.z,heading:t.heading,phase:t.phase,driverId:t.driverId,orderId:t.orderId,motionSpeed:t.motionSpeed||0,routeWaypoints:t.routeWaypoints.slice(t.routeIndex,t.routeIndex+12),at:now()}))],orders:d.orders.filter(o=>!o.paid).map(o=>({...o})),wagesPaid:d.wagesPaid,revenue:d.revenue,unitsProduced:d.unitsProduced,delivered:d.delivered,cancelled:d.cancelled,history:d.history,algorithmOnly:true};}
 return{clothingRetail,init,tick,addChoices,handleResident,snapshot,foundCompany,applyJob,requestInput,requestSale,finishOrder,roadPath};
}
