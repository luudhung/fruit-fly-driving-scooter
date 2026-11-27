import {HANSDREX_AIRPORT} from './hansdrex-airport-map.mjs';
import {airportTerminalPassengerLayout} from './airport-terminal-layout.mjs';
import {AIRPORT_TERMINAL_RAIL} from './airport-campus.mjs';
import {airportDepartureRoadLevels} from './airport-departure-roads.mjs';

const passengerPaths=HANSDREX_AIRPORT.terminals.flatMap(t=>{
 const l=airportTerminalPassengerLayout(t);
 return [[l.landside.approach,l.landside.entry,l.landside.foot,l.landside.top,l.landside.turn,l.landside.door,l.landside.inside,l.landside.corridor,l.landside.upperEntrance],
  [l.airside.door,l.airside.landing,l.airside.foot,l.airside.apron]];
});
function nearPassengerPath(p,margin,vertical){
 for(const path of passengerPaths)for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;
  const u=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l)):0;
  if(Math.hypot(p.x-a.x-dx*u,p.z-a.z-dz*u)>1.7+margin)continue;
  if(!vertical||Math.abs(p.y-(a.y+(b.y-a.y)*u))<2.4)return true;
 }
 return false;
}
/** A column runs through every height. Its foot must stay outside ramps,
 * passenger stairs and the lower free terminal railway, even above ground. */
export function airportMetroSupportBlocked(p,margin=.75){
 if(airportDepartureRoadLevels(p,margin).length||nearPassengerPath(p,margin,false))return true;
 const rail=AIRPORT_TERMINAL_RAIL,terminals=HANSDREX_AIRPORT.terminals;
 return p.x>terminals[0].x-16-margin&&p.x<terminals.at(-1).x+16+margin&&Math.abs(p.z-rail.z)<rail.trackOffset+2+margin;
}
/** A metro stair tread/rail and the person using it need headroom beside the
 * airport's vehicle deck and its physically separate terminal stairs. */
export function airportMetroStairBlocked(p,margin=.8){
 return airportDepartureRoadLevels(p,margin).some(floor=>p.y>=floor-.5&&p.y<=floor+4.2)||nearPassengerPath(p,margin,true);
}
