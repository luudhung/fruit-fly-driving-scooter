import {BUILDINGS,LOCATIONS,entrance} from './city-map.mjs';
import {districtProfile} from './district-economy.mjs';
const OPEN='planning a clothing shop',BUY='shopping for clothes',DAY=86400;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Resident-owned shops buy actual delivered garments and sell only on the premises. */
export function createGarmentRetail({world,eligible,unavailable,account,transfer,spendResident,remember=()=>{},emit=()=>{},neuralDrive=()=>.5,committed=()=>false}){
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),location=id=>LOCATIONS.find(l=>l.id===id);
 const shops=()=>Object.values(raw().enterprises||{}).filter(b=>b.garmentRetail&&b.status==='operating');
 function ready(b){const site=location(b.locationId);if(!site)return false;const owner=raw().flies.find(f=>f.id===b.ownerId);return owner?.alive&&!owner.traveling&&!owner.onTrain&&!owner.onPlane&&!committed(owner)&&owner.currentLocationId===b.locationId&&distance(owner,site)<18&&now()>=b.openingAt&&!unavailable(b.locationId);}
 function sites(f){const occupied=new Set(Object.values(raw().enterprises||{}).filter(b=>b.status==='operating').map(b=>b.locationId)),homes=new Set(Object.values(raw().housing?.households||{}).map(h=>h.unitId));return BUILDINGS.filter(b=>(b.kind==='block'||b.kind==='civic'&&raw().urbanWorld?.buildings?.[b.id]?.ownerId===f?.id&&['commercial','retail','shop'].includes(raw().urbanWorld.buildings[b.id].usage))&&!occupied.has(b.id)&&!homes.has(b.id)&&!unavailable(b.id)).sort((a,b)=>distance(a,f)-distance(b,f));}
 function ensureLocation(b){const site=BUILDINGS.find(s=>s.id===b.locationId);if(site){const p=entrance(site),pin={id:site.id,name:b.name,type:'clothing-shop',x:p.x,z:p.z},existing=location(site.id);if(existing)Object.assign(existing,pin);else LOCATIONS.push(pin);}}
 function init(){for(const b of shops()){b.inventory=Number(b.inventory||0);b.industrialPayrollManaged=true;ensureLocation(b);}}
 function open(f){
  if(!eligible(f)||f.traveling||f.currentLocationId!=='bank'||now()<Number(f.nextClothingStartupAt||0))return null;
  const alive=raw().flies.filter(f=>f.alive).length;if(shops().length>=Math.max(2,Math.ceil(alive/45)))return null;
  const site=sites(f).find(s=>Math.ceil(180+s.w*s.d*.9)<=800),capital=1300,available=Number(f.money||0)+Number(f.savings||0);if(!site||available<capital||Number(f.traits?.ambition??.5)+neuralDrive(f,'exploreDrive')<.85)return null;
  const fitout=Math.ceil(180+site.w*site.d*.9);if(capital-fitout<500)return null;
  const id=`BIZ-${String(raw().nextEnterpriseId++).padStart(5,'0')}`,b={id,name:`${f.name||f.id} · Thời trang`,ownerId:f.id,sector:'retail',garmentRetail:true,industrialPayrollManaged:true,status:'operating',locationId:site.id,cash:0,inventory:0,targetStock:36,employees:[],loanBalance:0,assetValue:fitout,openingAt:now()+21600,nextFinanceAt:now()+DAY,nextStockAt:now(),revenueLifetime:0,expensesLifetime:fitout,salesCount:0,lease:{buildingId:site.id,hourlyRent:Math.max(1,site.w*site.d*.004)},garmentPrice:Math.round(14*districtProfile(site).food*(.95+Number(f.traits?.ambition??.5)*.15)*100)/100};
  if(!spendResident(f,capital,b))return null;transfer(b,account('industrial-equipment-supplier'),fitout);raw().enterprises[id]=b;ensureLocation(b);Object.assign(f,{businessId:id,jobId:null,wage:0,industrialPayrollManaged:true,jobTitle:'clothing shop proprietor',enterpriseLocationId:site.id,nextClothingStartupAt:now()+DAY});remember(f,'clothing_shop_opened',{businessId:id,buildingId:site.id,capital});emit('clothing_shop',`${f.id} invested private savings in a clothing shop.`,{flyId:f.id,businessId:id});return b;
 }
 function purchase(f,b){
  if(!b?.garmentRetail||!ready(b)||f.traveling||f.currentLocationId!==b.locationId||distance(f,location(b.locationId))>18||b.inventory<1||now()<Number(f.nextClothesPurchaseAt||0)||Number(f.money||0)<b.garmentPrice)return false;
  f.money-=b.garmentPrice;b.cash+=b.garmentPrice;b.inventory--;b.revenueLifetime+=b.garmentPrice;b.salesCount++;raw().totalTransactions=Number(raw().totalTransactions||0)+1;f.clothingCondition=1;f.clothesWearAt=now();f.nextClothesPurchaseAt=now()+DAY;f.clothesOwned=Number(f.clothesOwned||0)+1;remember(f,'clothing_purchase',{businessId:b.id,price:b.garmentPrice});return true;
 }
 function addChoices(f,clock,add){
  if(!f?.alive||f.traveling||f.onTrain||f.onPlane||committed(f))return;
  const elapsed=Math.max(0,now()-Number(f.clothesWearAt??now()));f.clothingCondition=Math.max(0,Number(f.clothingCondition??.75)-elapsed/(DAY*12));f.clothesWearAt=now();
  if(eligible(f)&&Number(clock.hour)>=7&&Number(clock.hour)<19&&Number(f.money||0)+Number(f.savings||0)>=1300&&shops().length<Math.max(2,Math.ceil(raw().flies.filter(f=>f.alive).length/45)))add('bank',OPEN,35+Number(f.traits?.ambition??.5)*25+neuralDrive(f,'exploreDrive')*25);
  if(Number(clock.hour)>=7&&Number(clock.hour)<22&&f.clothingCondition<.65&&now()>=Number(f.nextClothesPurchaseAt||0))for(const b of shops().filter(b=>ready(b)&&b.inventory>=1&&Number(f.money||0)>=b.garmentPrice).sort((a,b)=>distance(f,location(a.locationId))-distance(f,location(b.locationId))).slice(0,2))add(b.locationId,BUY,40+(1-f.clothingCondition)*55-distance(f,location(b.locationId))*.015);
 }
 function handleResident(f){if((f.action===OPEN||f.pendingAction===OPEN)&&!f.traveling)open(f);if((f.action===BUY||f.pendingAction===BUY)&&!f.traveling){const b=shops().find(b=>b.locationId===f.currentLocationId);if(b)purchase(f,b);}return false;}
 function tick(requestSale,factories){for(const b of shops()){
  const owner=raw().flies.find(f=>f.id===b.ownerId);if(!owner?.alive){b.status='closed';b.closedAt=now();if(owner){owner.money=Number(owner.money||0)+b.cash;owner.businessId=null;}else raw().treasury.cash+=b.cash;b.cash=0;continue;}
  if(now()<b.openingAt||unavailable(b.locationId))continue;
  if(now()>=Number(b.nextStockAt||0)){b.nextStockAt=now()+1800;const inbound=(raw().industrialEconomy?.orders||[]).filter(o=>o.buyerId===b.id&&!o.paid).reduce((n,o)=>n+o.quantity,0);if(b.inventory+inbound<b.targetStock)for(const factory of factories.filter(f=>f.industrialSector==='garments'&&f.inventory.finished>=4).sort((a,c)=>distance(location(a.locationId),location(b.locationId))-distance(location(c.locationId),location(b.locationId))))if(requestSale(factory.id,b.id,Math.min(60,b.targetStock-b.inventory-inbound)))break;}
  if(now()>=b.nextFinanceAt){b.nextFinanceAt=now()+DAY;transfer(b,raw().treasury,Math.min(b.cash,b.lease.hourlyRent*24));const dividend=Math.max(0,b.cash-900)*.1;b.cash-=dividend;owner.money=Number(owner.money||0)+dividend;}
 }}
 return{init,open,purchase,addChoices,handleResident,tick,shops,snapshot:()=>shops().map(b=>({id:b.id,ownerId:b.ownerId,locationId:b.locationId,name:b.name,cash:b.cash,inventory:b.inventory,price:b.garmentPrice,sales:b.salesCount,revenueLifetime:b.revenueLifetime,open:ready(b)}))};
}
