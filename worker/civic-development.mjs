const DAY=86400;
const finite=n=>Math.max(0,Number(n)||0);
const clamp=n=>Math.max(0,Math.min(1.5,Number(n)||0));
/** Adding a category does not add a timer, worker or renderer to the background world. */
export const CIVIC_FACILITY_CATALOG=Object.freeze({
 workshop:Object.freeze({id:'workshop',name:'Xưởng sản xuất',usage:'workshop',funding:'resident',w:24,d:20,h:12,capacity:20,industrySector:'building-materials'}),
 factory:Object.freeze({id:'factory',name:'Nhà máy',usage:'factory',funding:'resident',w:42,d:28,h:18,capacity:50,industrySector:'garments'}),
 warehouse:Object.freeze({id:'warehouse',name:'Kho phân phối',usage:'warehouse',funding:'resident',w:34,d:26,h:12,capacity:50,serviceCapacity:500,industrySector:'freight-logistics'}),
 'power-plant':Object.freeze({id:'power-plant',name:'Nhà máy điện',usage:'power-plant',funding:'power-grid',w:38,d:30,h:16,capacity:240,staff:2,shifts:[0,8,16],wage:6,skill:'electrical',minimumSkill:.25}),
 clinic:Object.freeze({id:'clinic',name:'Phòng khám cộng đồng',usage:'clinic',funding:'treasury',w:20,d:18,h:12,capacity:12,staff:2,shifts:[7],hours:12,wage:6,skill:'medicine',minimumSkill:.3}),
 school:Object.freeze({id:'school',name:'Trường cộng đồng',usage:'school',funding:'treasury',w:24,d:20,h:14,capacity:30,staff:2,shifts:[7],hours:8,wage:5.5,skill:'teaching',minimumSkill:.25}),
});
export const facilitySpec=id=>CIVIC_FACILITY_CATALOG[id]||null;
export const isNonResidentialUsage=usage=>['hotel','restaurant',...Object.keys(CIVIC_FACILITY_CATALOG)].includes(usage);
export function civicFacilities(state,{includePlanned=false}={}){
 return Object.values(state.urbanWorld?.buildings||{}).filter(b=>facilitySpec(b.facilityType)&&b.stage!=='cancelled'&&(includePlanned||b.stage==='operational'));
}
/** Pure demand review: existing leases, planned facilities and paid grid modules all count.
 * Labour shortages alone do not trigger speculative construction of another building. */
export function nationalDevelopmentDemand(state){
 const people=(state.flies||[]).filter(f=>f.alive),adults=people.filter(f=>f.ageYears>=18),children=people.filter(f=>f.ageYears>=5&&f.ageYears<18);
 const facilities=civicFacilities(state,{includePlanned:true}),capacity=id=>facilities.filter(b=>b.facilityType===id).reduce((n,b)=>n+finite(b.capacity),0);
 const grid=state.utilities?.powerPlant||{},demand=finite(grid.demand),installed=finite(grid.installedCapacity||grid.capacity);
 const patients=people.filter(f=>f.illness||f.health<65).length;
 const doctors=adults.filter(f=>['doctor','hospital-central','hospital-east','clinic','riverside-clinic'].includes(f.jobId)).length;
 const teachers=adults.filter(f=>['school','riverside-school'].includes(f.jobId)).length;
 const companies=Object.values(state.enterprises||{}).filter(b=>b.industrial&&b.status==='operating');
 const leases=Object.values(state.industrialEconomy?.plants||{}),vacant=leases.filter(p=>p.status==='vacant').length;
 const unemployed=adults.filter(f=>f.ageYears<67&&!f.jobId&&!f.businessId&&!f.businessEmployeeOf&&!f.facilityEmployment).length;
 const jobs=companies.reduce((n,b)=>n+(b.employees?.length||0),0),jobCapacity=leases.length*50+capacity('factory')+capacity('workshop');
 const orders=(state.industrialEconomy?.orders||[]).filter(o=>!['complete','cancelled'].includes(o.phase)),queued=orders.filter(o=>o.phase==='queued').length;
 const materials=finite(state.businesses?.['civic-materials']?.inventory),work=state.urbanWorld?.projects?.filter(p=>!['complete','cancelled'].includes(p.stage))||[];
 const materialShortfall=work.reduce((n,p)=>n+Math.max(0,finite(p.materialsRequired)-finite(p.materialsOrdered)),0)-materials;
 const needs=[
  {type:'power-plant',score:demand>0&&installed>0?clamp((demand*1.25-installed-capacity('power-plant'))/240):0,reason:'reserve generating capacity below demand',unmet:Math.max(0,demand*1.25-installed-capacity('power-plant'))},
  {type:'clinic',score:clamp((patients-Math.max(12,doctors*10)-capacity('clinic'))/12),reason:'patients exceed existing clinical places',unmet:Math.max(0,patients-Math.max(12,doctors*10)-capacity('clinic'))},
  {type:'school',score:clamp((children.length-Math.max(30,teachers*24)-capacity('school'))/30),reason:'children exceed existing school places',unmet:Math.max(0,children.length-Math.max(30,teachers*24)-capacity('school'))},
  {type:'workshop',score:vacant>1?0:clamp(materialShortfall/300-capacity('workshop')/20),reason:'construction material orders exceed supplier stock',unmet:Math.max(0,materialShortfall)},
  {type:'factory',score:vacant>1?0:clamp(Math.max(jobs-Math.max(40,jobCapacity)*.75,unemployed*.4-vacant*50-capacity('factory')-capacity('workshop'))/30),reason:'production workplaces and unmet employment demand',unmet:Math.max(0,jobs-Math.max(40,jobCapacity)*.75,unemployed*.4-vacant*50-capacity('factory')-capacity('workshop'))},
  {type:'warehouse',score:clamp((queued-8-companies.filter(b=>b.industrialSector==='freight-logistics').length*5-capacity('warehouse')/10)/8),reason:'unserved freight queue exceeds depot capacity',unmet:Math.max(0,queued-8-capacity('warehouse')/10)},
 ];
 return needs.filter(n=>n.score>.15).sort((a,b)=>b.score-a.score||a.type.localeCompare(b.type));
}
/** Staff must be physically present at a commissioned, safe facility. Used by the grid hook. */
export function civicServiceCapacity(state,clock={hour:12,minute:0}){
 const out={power:0,clinic:0,school:0,staffedFacilities:0},age=finite(state.simulationAgeSeconds),hour=finite(clock.hour)+finite(clock.minute)/60;
 for(const b of civicFacilities(state)){
  const spec=facilitySpec(b.facilityType);if(!spec.staff)continue;
  const onsite=(state.flies||[]).filter(f=>{
   const job=f.facilityEmployment;if(!job||job.buildingId!==b.id||!f.alive||f.jobId||f.businessId||f.businessEmployeeOf||f.traveling||f.onPlane||f.onTrain||f.sleeping||f.urbanTask||f.civicDuty||f.fireEngineDuty||f.ambulanceDuty||f.health<30||f.energy<8||(!job.wasPresent||Number(job.lastPaidAt)<0||Number(job.lastPaidAt)<age-1800))return false;
   return (hour-Number(job.shiftStart)+24)%24<Number(spec.hours||8)&&f.currentLocationId===b.id&&Math.hypot(f.x-(b.frontage||b).x,f.z-(b.frontage||b).z)<24;
  }).length;
  const amount=finite(b.capacity)*Math.min(1,onsite/spec.staff);if(!amount)continue;
  out[b.facilityType==='power-plant'?'power':b.facilityType]+=amount;out.staffedFacilities++;
 }
 return out;
}
export const DEVELOPMENT_REVIEW_INTERVAL=DAY/4;
