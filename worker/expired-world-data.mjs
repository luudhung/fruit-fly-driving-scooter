import {trimF1RouteCaches}from'./route-cache-budget.mjs';
export function ancestorNameRecord(f){return{id:f.id,name:f.name||f.id,alive:false,parents:f.parents||[],estateSettled:true,historyPruned:true};}
/** Bounded disposable history; cumulative financial/population totals remain. */
export function cleanupPastWorld(state){
 const f1=state.northF1;
 if(f1){
  for(const e of f1.previousTours||[])e.charters=(e.charters||[]).filter(f=>!f.departed);
  f1.previousTours=(f1.previousTours||[]).filter(e=>e.charters.length);
  if(f1.history?.length>8)f1.history=f1.history.slice(-8);
 }
 trimF1RouteCaches(state);
 if(state.cityVisitors?.visitors)state.cityVisitors.visitors=state.cityVisitors.visitors.filter(f=>!f.departed);
 if(state.events?.length>100)state.events=state.events.slice(-100);
 if(state.flies)state.flies=state.flies.map(f=>!f.alive&&f.estateSettled&&!f.historyPruned?ancestorNameRecord(f):f);
 state.historyCleanupVersion=1;
 return state;
}
