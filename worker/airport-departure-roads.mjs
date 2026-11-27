import {HANSDREX_AIRPORT} from './hansdrex-airport-map.mjs';

// A separate slip road leaves the factory street; its straight carriageway stays
// at ground level. Sample the same rounded centerline for rendering and taxis.
const points=[{x:-398,y:1.1,z:-400}];
for(let i=1;i<=16;i++){
 const t=i/16,u=1-t;
 points.push({x:u*u*u*-398+3*u*u*t*-390+3*u*t*t*-390+t*t*t*-380,y:1.1,z:u*u*u*-400+3*u*u*t*-400+3*u*t*t*-414+t*t*t*-414});
}
points.push({x:-305,y:6.27,z:-414});
const arc=(x,z,r,from,to)=>{for(let i=1;i<=16;i++){const a=from+(to-from)*i/16;points.push({x:x+Math.cos(a)*r,y:6.27,z:z+Math.sin(a)*r});}};
arc(-305,-404,10,-Math.PI/2,0);
points.push({x:-295,y:6.27,z:-389.5});
arc(-281,-389.5,14,Math.PI,Math.PI/2);
const deckStartIndex=points.length-1;
points.push({x:344,y:6.27,z:-375.5});
const deckEndIndex=points.length-1;
arc(344,-359.5,16,-Math.PI/2,0);
points.push({x:360,y:1.1,z:-285});
// The down ramp also has its own lane beside the riverside street, then merges
// tangentially at ground level. Straight-through traffic never climbs its deck.
for(let i=1;i<=20;i++){
 const t=i/20,u=1-t;
 points.push({x:u*u*u*360+3*u*u*t*360+3*u*t*t*372+t*t*t*372,y:1.1,z:u*u*u*-285+3*u*u*t*-270+3*u*t*t*-272+t*t*t*-257});
}
/** Landside one-way departures loop. Curves and ramps stay beyond the rail ends;
 * no public vehicle enters an apron, runway or immigration hall. */
export const AIRPORT_DEPARTURE_ROAD={id:'HCA-DEPARTURES',version:2,width:7.2,deckTop:5.42,baseTop:.25,carOffset:.85,z:-375.5,walkY:6.52,
 entry:points[0],exit:points.at(-1),points,deckStartIndex,deckEndIndex};
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
 return drive(exiting?[b,{x:b.x+10,y:b.y,z:AIRPORT_DEPARTURE_ROAD.z},...p.slice(AIRPORT_DEPARTURE_ROAD.deckEndIndex)]:[...p.slice(0,AIRPORT_DEPARTURE_ROAD.deckStartIndex+1),{x:b.x-10,y:b.y,z:AIRPORT_DEPARTURE_ROAD.z},b]);
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
