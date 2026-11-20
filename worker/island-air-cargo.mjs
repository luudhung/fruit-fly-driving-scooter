import {AVIATION,scheduledAircraft,flightPose,nextFlight} from './aviation.mjs';
import {COUNTRY_IDS,countryAt} from './country-map.mjs';

const DAY=86400,UNLOAD_SECONDS=300,CAPACITY=200;
export const HAWAII_SERVICE_WAGES=Object.freeze({'island-hotel-day':9.8,'island-hotel-evening':10,'island-retail':8.8,'island-food':9.2,'island-airport-staff':9.6});
const recipients=[['island-market',.6],['island-restaurant',.25],['island-resort',.15]];
const positive=n=>Math.max(0,Number(n)||0);

/** Food travels in the hold of an existing passenger flight; no cargo-only sorties. */
export function createIslandAirCargo({world,mayDepart=()=>true,emit=()=>{}}){
 const data=()=>world().islandAirCargo||={version:1,lastDispatchDay:-1,shipments:[],deliveredUnits:0,procurementCost:0,publicAdvances:{},publicAdvanceOutstanding:0};
 const account=id=>{world().businesses||={};return world().businesses[id]||={cash:0,inventory:0};};
 const transfer=(from,to,amount)=>{if(!(amount>0)||positive(from?.cash)+1e-8<amount)return false;from.cash=positive(from.cash)-amount;to.cash=positive(to.cash)+amount;world().totalTransactions=positive(world().totalTransactions)+1;return true;};
 function sources(){
  const s=world();
  // Keep mainland emergency meals and ordinary vendor stock available locally.
  return [['farm',50],['market',60],['grocery',40],['bakery',30]].flatMap(([id,floor])=>{
   const seller=s.businesses?.[id];return seller?[{id,seller,holder:seller,key:'inventory',floor,unitPrice:Math.max(1,positive(seller.price))}]:[];
  }).concat(s.treasury?[{id:'hansdrex-food-warehouse',seller:s.treasury,holder:s,key:'foodReserve',floor:1000,unitPrice:2}]:[]);
 }
 function dispatch(flight,at){
  const d=data(),day=Math.floor(flight.departure/DAY);
  if(d.shipments.some(p=>p.status!=='delivered')||d.lastDispatchDay>=day||flight.from!=='city'||flight.to!=='island'||at<flight.departure-3600||at>=flight.arrival||!mayDepart(flight))return;
  const s=world(),residents=(s.flies||[]).filter(f=>f.alive&&(f.residencyCountryId===COUNTRY_IDS.hawaii||!f.residencyCountryId&&countryAt(f)===COUNTRY_IDS.hawaii)).length;
  const visitors=[...(s.flies||[]),...(s.cityVisitors?.visitors||[])].filter(f=>f.alive&&f.residencyCountryId!==COUNTRY_IDS.hawaii&&countryAt(f)===COUNTRY_IDS.hawaii&&!f.onPlane).length;
  const daily=Math.min(CAPACITY,Math.max(100,residents*2+visitors*2)),manifest=[],suppliers=sources(),treasury=s.businesses?.['treasury:hawaii'];
  let remaining=CAPACITY;
  for(const [buyerId,share]of recipients){
   const buyer=account(buyerId),outstanding=positive(d.publicAdvances[buyerId]);
   const repayment=Math.min(outstanding,Math.max(0,positive(buyer.cash)-2000));
   if(treasury&&transfer(buyer,treasury,repayment)){d.publicAdvances[buyerId]-=repayment;d.publicAdvanceOutstanding-=repayment;}
   const target=buyerId==='island-market'?Math.max(Math.ceil(daily*share),residents*2):Math.ceil(daily*share);
   let needed=Math.min(remaining,Math.max(0,target-Math.floor(positive(buyer.inventory))));
   for(const source of suppliers){
    if(needed<1)break;
    const available=Math.floor(Math.max(0,positive(source.holder[source.key])-source.floor)),freight=.75,unitCost=source.unitPrice+freight;
    const wanted=Math.min(needed,available);
    if(wanted<1)continue;
    // An accountable advance comes only from Hawaii's own finite national budget.
    const advance=Math.min(Math.max(0,wanted*unitCost-positive(buyer.cash)),Math.max(0,1000-positive(d.publicAdvances[buyerId])),positive(treasury?.cash));
    if(transfer(treasury,buyer,advance)){d.publicAdvances[buyerId]=positive(d.publicAdvances[buyerId])+advance;d.publicAdvanceOutstanding+=advance;}
    const quantity=Math.min(wanted,Math.floor((positive(buyer.cash)+1e-8)/unitCost));
    if(quantity<1)continue;
    transfer(buyer,source.seller,quantity*source.unitPrice);transfer(buyer,account('regional-air'),quantity*freight);
    source.holder[source.key]-=quantity;
    manifest.push({buyerId,sellerId:source.id,quantity,unitPrice:source.unitPrice,freight:quantity*freight,total:quantity*unitCost});
    remaining-=quantity;needed-=quantity;d.procurementCost+=quantity*unitCost;
   }
  }
  if(!manifest.length)return;
  const shipment={id:`HAWAII-FOOD-${day}`,day,flight:{id:flight.id,from:flight.from,to:flight.to,departure:flight.departure,arrival:flight.arrival,regional:true},loadedAt:at,unloadAt:flight.arrival+UNLOAD_SECONDS,status:at<flight.departure?'loaded':'in-flight',manifest,quantity:manifest.reduce((n,line)=>n+line.quantity,0)};
  d.shipments.push(shipment);d.lastDispatchDay=day;
  d.shipments=d.shipments.filter(p=>p.status!=='delivered'||p.day>=day-14);
  emit('island_food_loaded','Paid Hawaii food supplies loaded onto the scheduled Hansdrex passenger aircraft.',{shipmentId:shipment.id,flightId:flight.id,quantity:shipment.quantity});
 }
 function tick(){
  const d=data();
  for(const [id,price]of [['island-market',6],['island-restaurant',10]])account(id).price=Math.max(price,positive(account(id).price));
  for(const f of world().flies||[])if(f.alive&&HAWAII_SERVICE_WAGES[f.jobId]&&!f.businessEmployeeOf)f.wage=Math.max(positive(f.wage),HAWAII_SERVICE_WAGES[f.jobId]);
  const at=positive(world().simulationAgeSeconds);
  for(const shipment of d.shipments){
   if(shipment.status==='loaded'&&at>=shipment.flight.departure){
    if(!mayDepart(shipment.flight)){const next=nextFlight(at+1,'city',0);shipment.flight={...next,regional:true};shipment.unloadAt=next.arrival+UNLOAD_SECONDS;continue;}
    shipment.status='in-flight';
   }
   if(shipment.status==='delivered'||at<shipment.unloadAt||flightPose(at,shipment.flight)?.phase!=='parked')continue;
   for(const line of shipment.manifest){const buyer=account(line.buyerId);buyer.inventory=positive(buyer.inventory)+line.quantity;buyer.lastAirImportAt=at;buyer.lastAirImportUnitCost=line.total/line.quantity;}
   shipment.status='delivered';shipment.deliveredAt=at;d.deliveredUnits+=shipment.quantity;
   emit('island_food_unloaded','The scheduled aircraft parked at Hawaii and unloaded its paid daily food shipment.',{shipmentId:shipment.id,flightId:shipment.flight.id,quantity:shipment.quantity});
  }
  const current=scheduledAircraft(at);dispatch(current,at);
  if(current.to==='city'&&current.phase==='parked')dispatch({...nextFlight(at,'city',0),regional:true},at);
 }
 return {init:data,tick,snapshot:()=>({...data(),capacity:CAPACITY,unloadSeconds:UNLOAD_SECONDS})};
}
