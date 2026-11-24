export const CONSTRUCTION_SCHEDULE_VERSION=2;
export const GAME_DAY_SECONDS=86400;
export const CONSTRUCTION_HOURLY_WAGE=3;

const positive=(value,fallback)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
const nonnegative=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const boundedProgress=value=>Math.min(1,nonnegative(value));

/**
 * A structural schedule uses the undamaged blueprint, never the burnt shell.
 * Two game days is the floor for a small, low house (up to 120 m² and 6 m).
 * More floors and a larger footprint require more time, capped at ten game days.
 * targetCrew is both the planned crew and the maximum productive structural
 * crew: adding workers cannot compress this minimum building duration.
 */
export function constructionSchedule(building={},options={}){
 const blueprint=building.originalBlueprint||building;
 const width=positive(blueprint.w,positive(building.w,10));
 const depth=positive(blueprint.d,positive(building.d,12));
 const height=positive(options.targetHeight,positive(blueprint.h,positive(building.originalHeight,positive(building.h,6))));
 const footprint=width*depth;
 const structureSeconds=Math.min(10*GAME_DAY_SECONDS,Math.ceil(2*GAME_DAY_SECONDS*Math.sqrt(Math.max(1,footprint/120))*Math.sqrt(Math.max(1,height/6))));
 const crewLimit=Math.max(1,Math.floor(positive(options.crewLimit,25)));
 const targetCrew=Math.min(crewLimit,Math.max(2,Math.ceil(footprint/120)+Math.ceil(height/6)));
 const workerSeconds=structureSeconds*targetCrew;
 const kind=options.kind||'repair';
 const roadMaterialsRequired=nonnegative(options.roadMaterialsRequired);
 const materialsRequired=options.materialsRequired==null
  ?Math.max(20,Math.ceil(footprint*(['new','rebuild'].includes(kind)?.45:.18)))+roadMaterialsRequired
  :nonnegative(options.materialsRequired);
 const materialCost=materialsRequired*2;
 const clearanceWorkerSeconds=(options.needsClearance??kind==='rebuild')?18000:0;
 const roadWorkerSeconds=nonnegative(options.roadArea)>0||nonnegative(options.roadLength)>0
  ?Math.max(7200,nonnegative(options.roadLength||options.roadArea)*240):0;
 const workerHours=(workerSeconds+clearanceWorkerSeconds+roadWorkerSeconds)/3600;
 const laborCost=workerHours*CONSTRUCTION_HOURLY_WAGE;
 // Leave room for clearance/road tick rounding and dispatch variations. Escrow
 // refunds any unused reserve; this estimate never creates or moves money.
 const reserve=Math.max(targetCrew*CONSTRUCTION_HOURLY_WAGE,Math.ceil(laborCost*.1));
 return {version:CONSTRUCTION_SCHEDULE_VERSION,structureSeconds,targetCrew,workerSeconds,workerHours,
  clearanceWorkerSeconds,roadWorkerSeconds,materialsRequired,materialCost,laborCost,
  minimumBudget:Math.ceil(materialCost+laborCost+reserve)};
}

/** Pure, paid structural labor step. The caller performs actual wage transfers. */
export function constructionWorkStep(schedule,{progress=0,onsiteCount=0,dt=0,availableWages=Infinity}={}){
 const current=boundedProgress(progress);
 const targetCrew=positive(schedule?.targetCrew,1);
 const activeWorkers=Math.min(Math.floor(nonnegative(onsiteCount)),targetCrew);
 const planned=positive(schedule?.structureSeconds,2*GAME_DAY_SECONDS);
 // A smaller paid crew may take longer, but even the largest structure has a
 // ten-day productive work ceiling once people and materials are on site.
 const duration=activeWorkers?Math.min(10*GAME_DAY_SECONDS,planned*targetCrew/activeWorkers):planned;
 const required=duration*Math.max(1,activeWorkers);
 const budget=availableWages===Infinity?Infinity:nonnegative(availableWages);
 const remaining=(1-current)*required;
 const workerSeconds=Math.min(remaining,activeWorkers*nonnegative(dt),budget*3600/CONSTRUCTION_HOURLY_WAGE);
 const increment=Math.min(1-current,workerSeconds/required);
 return {progress:Math.min(1,current+increment),increment,activeWorkers,workerSeconds,
  wages:workerSeconds*CONSTRUCTION_HOURLY_WAGE/3600,
  elapsedSeconds:activeWorkers?workerSeconds/activeWorkers:0};
}
