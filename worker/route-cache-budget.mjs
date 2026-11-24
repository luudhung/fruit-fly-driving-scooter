/** Route geometry is a cache, not a resident record. Keep every itinerary still
 * referenced by a guest; finished/replanned paths can be recomputed on demand. */
export function trimF1RouteCaches(state){
 let removed=0;
 for(const event of [state.northF1?.event,...(state.northF1?.previousTours||[]),state.worldCup?.event,...(state.worldCup?.previousTours||[])]){
  if(!event?.tourPaths)continue;
  const needed=new Set((event.charters||[]).flatMap(f=>(f.guests||[]).map(g=>g.leg?.key)).filter(Boolean));
  for(const key of Object.keys(event.tourPaths))if(!needed.has(key)){delete event.tourPaths[key];removed++;}
 }
 return removed;
}
