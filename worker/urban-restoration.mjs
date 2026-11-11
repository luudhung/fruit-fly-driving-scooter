/** One owner-requested repair of the damage already present at this release.
 * Later fires retain the ordinary paid, physical reconstruction process. */
export function restoreInitialFireDamage(state,{completeProject,reopen,report=()=>{}}){
 const world=state.urbanWorld;if(!world)return;
 const now=Number(state.simulationAgeSeconds||0);
 if(!world.ownerRestoration){
  const activeFires=new Set((world.fires||[]).filter(f=>!f.containedAt).map(f=>f.buildingId));
  const repairs=new Set((world.projects||[]).filter(p=>['repair','rebuild'].includes(p.kind)&&!['complete','cancelled'].includes(p.stage)).map(p=>p.buildingId));
  const pending=Object.values(world.buildings||{}).filter(b=>(Number(b.lastDamageAt||0)>0||activeFires.has(b.id)||repairs.has(b.id))&&
   (Number(b.health)<100||b.stage!=='operational')).map(b=>b.id);
  world.ownerRestoration={version:1,requestedAt:now,pending,completed:[]};
 }
 const campaign=world.ownerRestoration,remaining=[],restored=[];
 for(const id of campaign.pending){
  const b=world.buildings[id];if(!b)continue;
  if((world.fires||[]).some(f=>f.buildingId===id&&!f.containedAt)){remaining.push(id);continue;}
  const project=(world.projects||[]).find(p=>p.buildingId===id&&['repair','rebuild'].includes(p.kind)&&!['complete','cancelled'].includes(p.stage));
  if(project){
   project.targetHeight=Number(b.kind==='landmark'?b.h:b.originalHeight||project.targetHeight||b.h);
   completeProject(project);
  }else{
   b.h=Number(b.kind==='landmark'?b.h:b.originalHeight||b.h);reopen(b);
  }
  b.recovery={...(b.recovery||{}),status:'restored',restoredAt:now,source:'owner-requested restoration'};
  campaign.completed.push(id);restored.push(id);
 }
 campaign.pending=remaining;
 if(!remaining.length)campaign.completedAt??=now;
 if(restored.length)report('city_restoration',`${restored.length} previously fire-damaged buildings were restored at the city owner's request.`,{buildingIds:restored});
}
