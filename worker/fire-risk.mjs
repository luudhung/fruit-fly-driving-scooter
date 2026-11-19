/** Building use controls accidental fire eligibility, independently of the map
 * generator's country-specific naming (North housing is "apartment"). */
const combustibleUses=new Set(['block','house','apartment','destination','civic','industrial','country-service','farm-service','resort','resort-cottage','resort-apartment','education','government']);
export function accidentalFireCandidates(buildings,urban={}){
 const unavailable=new Set((urban.projects||[]).filter(p=>!['complete','cancelled'].includes(p.stage)).map(p=>p.buildingId));
 for(const fire of urban.fires||[])unavailable.add(fire.buildingId);
 const records=urban.buildings||{};
 return buildings.filter(b=>combustibleUses.has(b.kind)&&!unavailable.has(b.id)&&(!records[b.id]||records[b.id].stage==='operational'));
}
