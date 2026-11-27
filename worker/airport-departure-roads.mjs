import {HANSDREX_AIRPORT} from './hansdrex-airport-map.mjs';

/** Landside one-way departures loop. Ramps pass beyond the terminal rail ends;
 * no public vehicle enters an apron, runway or immigration hall. */
export const AIRPORT_DEPARTURE_ROAD={id:'HCA-DEPARTURES',width:7.2,deckTop:5.42,baseTop:.25,carOffset:.85,z:-375.5,walkY:6.52,
 entry:{x:-430,y:1.1,z:-400},exit:{x:370,y:1.1,z:-305},
 points:[{x:-430,y:1.1,z:-400},{x:-345,y:6.27,z:-400},{x:-345,y:6.27,z:-375.5},{x:370,y:6.27,z:-375.5},{x:370,y:1.1,z:-305}]};
export const AIRPORT_DEPARTURE_DROPOFFS=HANSDREX_AIRPORT.terminals.map(t=>({id:`${t.id}-DEPARTURES-DROPOFF`,terminalId:t.id,kind:'dropoff',x:t.x+22,y:6.27,z:-377.5,w:18,d:3,heading:Math.PI/2,
 entrance:{x:t.x,y:6.52,z:t.z+6},
 walk:[{x:t.x+22,y:6.52,z:-377.5},{x:t.x+22,y:6.52,z:-379.4},{x:t.x,y:6.52,z:-379.4},{x:t.x,y:6.52,z:t.z+6}]}));
export function airportDepartureDropoff(terminalId='T1'){return AIRPORT_DEPARTURE_DROPOFFS.find(b=>b.terminalId===terminalId)||AIRPORT_DEPARTURE_DROPOFFS[0];}
function drive(points){
 const route=[];
 for(let i=0;i<points.length;i++){
  const b=points[i],a=points[Math.max(0,i-1)],steps=i?Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/8)):1;
  for(let j=i?1:0;j<=steps;j++){if(!i&&j)break;const u=i?j/steps:0;
   route.push({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u,mode:'car',stage:'airport-departure-road',airportDepartureRoad:true});
  }
 }
 return route;
}
export function airportDepartureDrive(terminalId='T1',exiting=false){
 const b=airportDepartureDropoff(terminalId),p=AIRPORT_DEPARTURE_ROAD.points;
 return drive(exiting?[b,{x:b.x+10,y:b.y,z:AIRPORT_DEPARTURE_ROAD.z},p[3],p[4]]:[p[0],p[1],p[2],{x:b.x-10,y:b.y,z:AIRPORT_DEPARTURE_ROAD.z},b]);
}
/** All connected surfaces at a point; underpasses can retain their ground level. */
export function airportDepartureRoadLevels(point,margin=0){
 const result=[],caps=[],p=AIRPORT_DEPARTURE_ROAD.points;
 for(let i=1;i<p.length;i++){
  const a=p[i-1],b=p[i],dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
  const u=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/len));
  if(Math.hypot(point.x-a.x-dx*u,point.z-a.z-dz*u)>AIRPORT_DEPARTURE_ROAD.width/2+margin)continue;
  (u>1e-8&&u<1-1e-8?result:caps).push(a.y+(b.y-a.y)*u-AIRPORT_DEPARTURE_ROAD.carOffset);
 }
 return result.length?result:caps;
}
