/** One owner-requested recovery campaign. Active repairs continue unchanged;
 * unstarted queued contracts refund their unused escrow before reopening. */
export function repairHasStarted(project){
 return project.stage!=='queued'||Number(project.progress||0)>0||Number(project.clearance||0)>0||Number(project.materialsOrdered||0)>0||Number(project.spent||0)>0||Number.isFinite(project.crewArrivedAt)||Boolean(project.workerIds?.length);
}
export function restoreInitialFireDamage(state,{reopen,cancelUnstartedProject=()=>{},report=()=>{}}){
 const world=state.urbanWorld;if(!world)return;
 const now=Number(state.simulationAgeSeconds||0),ongoing=p=>['repair','rebuild'].includes(p.kind)&&!['complete','cancelled'].includes(p.stage);
 if(Number(world.ownerRestoration?.version||0)<2){
  const fires=new Set((world.fires||[]).filter(f=>!f.containedAt).map(f=>f.buildingId));
  const protectedIds=new Set((world.projects||[]).filter(p=>ongoing(p)&&repairHasStarted(p)).map(p=>p.buildingId));
  const pending=Object.values(world.buildings||{}).filter(b=>!protectedIds.has(b.id)&&(Number(b.lastDamageAt||0)>0||fires.has(b.id)||b.lastFireId)&&(Number(b.health)<100||b.stage!=='operational')).map(b=>b.id);
  world.ownerRestoration={version:2,requestedAt:now,pending,completed:[],untouched:[...protectedIds]};
 }
 const campaign=world.ownerRestoration,remaining=[],restored=[];
 for(const id of campaign.pending){
  const b=world.buildings[id];if(!b)continue;
  if((world.fires||[]).some(f=>f.buildingId===id&&!f.containedAt)){remaining.push(id);continue;}
  const projects=(world.projects||[]).filter(p=>p.buildingId===id&&ongoing(p));
  if(projects.some(repairHasStarted)){if(!campaign.untouched.includes(id))campaign.untouched.push(id);continue;}
  for(const project of projects)cancelUnstartedProject(project);
  reopen(b);b.recovery={...(b.recovery||{}),status:'restored',restoredAt:now,source:'owner-requested restoration'};
  campaign.completed.push(id);restored.push(id);
 }
 campaign.pending=remaining;if(!remaining.length)campaign.completedAt??=now;
 if(restored.length)report('city_restoration',`${restored.length} unstarted fire-damaged sites were restored at the city owner's request.`,{buildingIds:restored});
}
