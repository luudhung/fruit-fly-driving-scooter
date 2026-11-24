/** Building use controls accidental fire eligibility, independently of the map
 * generator's country-specific naming (North housing is "apartment"). */
const combustibleUses=new Set(['block','house','apartment','destination','civic','industrial','country-service','farm-service','resort','resort-cottage','resort-apartment','education','government']);
export function accidentalFireCandidates(buildings,urban={}){
 const unavailable=new Set((urban.projects||[]).filter(p=>!['complete','cancelled'].includes(p.stage)).map(p=>p.buildingId));
 for(const fire of urban.fires||[])unavailable.add(fire.buildingId);
 const records=urban.buildings||{};
 return buildings.filter(b=>combustibleUses.has(b.kind)&&!unavailable.has(b.id)&&(!records[b.id]||records[b.id].stage==='operational'));
}

/** Structural size uses the intact blueprint, not a collapsed/rendered shell. */
export function largeFireBuilding(building={}){
 const b=building.originalBlueprint||building;
 return Number(b.h||building.originalHeight||building.h||0)>18||Number(b.w||building.w||0)*Number(b.d||building.d||0)>400;
}
export function buildingFireProfile(building,random=()=>.5){
 const source=building.originalBlueprint||building,height=Number(source.h||building.originalHeight||building.h||6),floors=Math.max(1,Math.ceil(height/3)),large=largeFireBuilding(building);
 const scope=large&&random()>=.005?'floor':'building',floor=scope==='floor'?Math.min(floors-1,Math.floor(random()*floors)):0;
 return {version:2,scope,largeBuilding:large,totalFloors:floors,floorStart:floor,floorCount:scope==='floor'?1:floors,floorHeight:3,baseY:scope==='floor'?Math.min(height-1,floor*3+1.2):Math.min(12,Math.max(1,height*.15)),offsetX:scope==='floor'?Number(source.w||building.w||10)/2+.3:0,offsetZ:0,initialHealth:Number(building.health??100)};
}
