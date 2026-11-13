import {districtProfile} from './district-economy.mjs';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));

/** Owners post offers; capacity is a physical ceiling, never a command to fill jobs. */
export function planIndustrialLabour(b,plant,owner,state,at){
 if(at<Number(b.nextLabourDecisionAt||0)&&b.labourPlan)return b.labourPlan;
 const employees=b.employees||[],traits=owner?.traits||{},capacity=Number(plant.capacity||50);
 const pending=(state.industrialEconomy?.orders||[]).filter(o=>o.companyId===b.id&&o.kind==='output'&&!o.paid).reduce((n,o)=>n+o.quantity,0);
 const shops=Object.values(state.enterprises||{}).filter(s=>s.garmentRetail&&s.status==='operating');
 const garments=b.industrialSector==='garments',demand=garments?shops.reduce((n,s)=>n+Math.max(0,Number(s.targetStock||36)-Number(s.inventory||0)),0):pending+Math.max(0,80-Number(b.inventory?.finished||0));
 const base=4.6*districtProfile(plant.zone).wage,localWorkers=(state.flies||[]).filter(f=>f.alive&&!f.businessId&&!f.businessEmployeeOf&&!f.jobId&&f.ageYears>=23&&f.ageYears<67).length;
 const scarcity=clamp(1-localWorkers/Math.max(1,capacity),0,1),ambition=Number(traits.ambition??.5),thrift=Number(traits.thrift??.5);
 const oldOffer=Number(b.wageOffer||base),affordable=Math.max(0,Number(b.cash||0)-350),wageBudget=affordable*(.3+ambition*.15-thrift*.08);
 const desired=clamp(Math.ceil(demand/(garments?10:18))+(b.industrialSector==='freight-logistics'?4:1),1,capacity);
 const offer=base*(1+scarcity*ambition*.45+Math.max(0,desired-employees.length)/capacity*.15);
 // Reserve at least two shifts' payroll before advertising a position; no unpaid mass hiring.
 const wageOffer=Math.round(clamp(offer,base*.9,Math.max(base,affordable/Math.max(16,(employees.length+1)*16)))*100)/100;
 const target=Math.min(capacity,desired,Math.floor(wageBudget/Math.max(1,wageOffer*16)));
 const shifts=target>=24&&demand>160?3:target>=10&&demand>70?2:1;
 const plan={capacity,targetWorkers:target,wageOffer,shifts,shiftStarts:shifts===3?[0,8,16]:shifts===2?[6,14]:[8],shiftHours:8,outputTarget:clamp(demand+24,36,480),demand,decidedAt:at};
 b.wageOffer=wageOffer;b.labourPlan=plan;b.nextLabourDecisionAt=at+3600;
 // A raised offer also applies to retained staff; owners never silently cut agreed wages.
 if(wageOffer>oldOffer)for(const f of state.flies||[])if(f.businessEmployeeOf===b.id)f.wage=Math.max(Number(f.wage||0),wageOffer);
 return plan;
}
