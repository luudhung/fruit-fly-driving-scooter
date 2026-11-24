import {trimF1RouteCaches}from'./route-cache-budget.mjs';
export function ancestorNameRecord(f){return{id:f.id,name:f.name||f.id,alive:false,parents:f.parents||[],estateSettled:true,historyPruned:true};}
/** Bounded disposable history; cumulative financial/population totals remain. */
export function cleanupPastWorld(state){
 for(const f1 of [state.northF1,state.worldCup])if(f1){
  for(const e of f1.previousTours||[])e.charters=(e.charters||[]).filter(f=>!f.departed);
  f1.previousTours=(f1.previousTours||[]).filter(e=>e.charters.length);
  if(f1.history?.length>8)f1.history=f1.history.slice(-8);
 }
 trimF1RouteCaches(state);
 if(state.cityVisitors?.visitors)state.cityVisitors.visitors=state.cityVisitors.visitors.filter(f=>!f.departed);
 if(state.events?.length>100)state.events=state.events.slice(-100);
 if(state.flies)state.flies=state.flies.filter(f=>{if(f.alive||!f.estateSettled)return true;(state.ancestors||={})[f.id]={name:f.name||f.id,parents:f.parents||[]};return false;});
 state.historyCleanupVersion=1;
 return state;
}
