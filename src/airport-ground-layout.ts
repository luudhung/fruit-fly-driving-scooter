import {AIRPORT_TAXI_BAYS} from '../worker/airport-campus.mjs';
import {COUNTRY_AIRPORTS} from '../worker/country-map.mjs';
import {AIRPORT,ISLAND,ROADS} from '../worker/city-map.mjs';
import {subtractRects,unionRects,type Rect} from './surface-rectangles.ts';

export type AirportGroundMaterial='concrete'|'asphalt'|'white'|'yellow';
export type AirportGroundSurface=Rect&Readonly<{topY:number;material:AirportGroundMaterial}>;
const rect=(x:number,z:number,w:number,d:number):Rect=>Object.freeze({x,z,w,d});
const expanded=(r:Rect,w:number,d:number)=>rect(r.x,r.z,r.w+w,r.d+d);
export const AIRPORT_GROUND_LEVELS=Object.freeze({concrete:.20,asphalt:.25,paint:.30,islandOffset:.85});
// Compatibility aliases refer to bay8, rather than creating a ninth apron/plane.
export const AIRPORT_SPARE_APRON=rect(AIRPORT.stands[7].x,AIRPORT.stands[7].z,25,23);
export const AIRPORT_SPARE_PLANE=Object.freeze({...AIRPORT.stands[7],y:3});
export const AIRPORT_TAXI_AXIS=rect(AIRPORT.taxiways[0].x,AIRPORT.taxiways[0].z,AIRPORT.taxiways[0].w,AIRPORT.taxiways[0].d);
export const AIRPORT_TAXI_SPUR=rect(AIRPORT.taxiways[1].x,AIRPORT.taxiways[1].z,AIRPORT.taxiways[1].w,AIRPORT.taxiways[1].d);
export const AIRPORT_HELIPAD=rect(AIRPORT.helipad.x,AIRPORT.helipad.z,26,26);
export const AIRPORT_HELI_WALK=rect(AIRPORT.heliAccess.x,(AIRPORT.helipad.z+AIRPORT.heliAccess.z)/2,5,AIRPORT.heliAccess.z-AIRPORT.helipad.z);
const LAND_SIDE_WALK=rect(-180,-375,65,8),PARKING=rect(-245,-375,44,22);

/** Public streets and curb edges stop at airport-owned pavement/building boundaries. */
export const AIRPORT_ROAD_EXCLUSIONS:readonly Rect[]=Object.freeze([
 ...AIRPORT.aprons.map(a=>rect(a.x,a.z,a.w,a.d)),
 ...AIRPORT.runways.map(runway=>expanded(runway,12,10)),...AIRPORT.taxiways.map(t=>rect(t.x,t.z,t.w,t.d)),AIRPORT_HELIPAD,
 ...AIRPORT.terminals.map(t=>rect(t.x,t.z,t.w,t.d)),
 AIRPORT_SPARE_APRON,LAND_SIDE_WALK,PARKING,...AIRPORT_TAXI_BAYS.map(b=>rect(b.x,b.z,b.w,b.d)),
]);

/** Explicit top heights give all asphalt/paint real clearance without depth bias. */
export function createAirportGroundLayout(publicRoads:readonly Rect[]=ROADS):readonly AirportGroundSurface[]{
 const groups=new Map<string,{material:AirportGroundMaterial;topY:number;rects:Rect[]}>();
 function add(r:Rect,material:AirportGroundMaterial,topY:number){const key=`${material}:${topY}`;let group=groups.get(key);if(!group){group={material,topY,rects:[]};groups.set(key,group);}group.rects.push(r);}
 function runway(r:Rect,level:number){
  add(expanded(r,12,10),'concrete',level+.20);add(r,'asphalt',level+.25);
  for(let x=r.x-r.w/2+16;x<r.x+r.w/2-14;x+=18)add(rect(x,r.z,8,.55),'white',level+.30);
  for(const side of [-1,1])for(let i=0;i<5;i++)add(rect(r.x+side*(r.w/2-13),r.z+(i-2)*2.3,12,1.1),'white',level+.30);
 }
 for(const apron of AIRPORT.aprons)add(apron,'concrete',.20);
 for(const terminal of AIRPORT.terminals)for(const walk of subtractRects([rect(terminal.gate.x,-375,terminal.w,8)],publicRoads))add(walk,'concrete',.20);
 for(const taxiway of AIRPORT.taxiways){add(taxiway,'asphalt',.25);add(rect(taxiway.x,taxiway.z,taxiway.w>taxiway.d?taxiway.w:.3,taxiway.w>taxiway.d?.3:taxiway.d),'yellow',.30);}
 add(LAND_SIDE_WALK,'concrete',.20);
 for(const piece of subtractRects([AIRPORT_HELI_WALK],[...publicRoads,AIRPORT_HELIPAD]))add(piece,'concrete',.20);
 for(const bay of AIRPORT_TAXI_BAYS){
  add(rect(bay.x,bay.z,bay.w,bay.d),'asphalt',.25);
  for(const side of [-1,1])add(rect(bay.x+side*(bay.w/2-.3),bay.z,.25,bay.d-.4),'yellow',.30);
  add(rect(bay.access.x,(bay.z+bay.access.z)/2,5,bay.access.z-bay.z),'asphalt',.25);
 }
 add(PARKING,'asphalt',.25);for(let i=0;i<7;i++)add(rect(-262+i*6,-375,.3,18),'white',.30);
 add(AIRPORT_HELIPAD,'asphalt',.25);
 for(const x of [-2,2])add(rect(AIRPORT.helipad.x+x,AIRPORT.helipad.z,.65,6),'white',.30);
 add(rect(AIRPORT.helipad.x,AIRPORT.helipad.z,4,.65),'white',.30);
 for(const strip of AIRPORT.runways)runway(strip,0);runway(ISLAND.runway,.85);
 const island=COUNTRY_AIRPORTS.find(port=>port.id==='island')!,taxi=island.taxiwayZ!;
 add(island.apron,'concrete',1.05);
 add(rect(island.runway.x,taxi,192,10),'asphalt',1.10);
 add(rect(island.runway.x,taxi,192,.25),'yellow',1.15);
 for(const x of [49,241]){add(rect(x,(742+taxi)/2,10,taxi-742),'asphalt',1.10);add(rect(x,(751+taxi)/2,.25,taxi-751),'yellow',1.15);}
 for(const stand of island.stands){
  add(rect(stand.x,(taxi+stand.z)/2,10,stand.z-taxi),'asphalt',1.10);
  add(rect(stand.x,stand.z,25,22),'asphalt',1.10);
  add(rect(stand.x,(taxi+stand.z)/2,.25,stand.z-taxi),'yellow',1.15);
  for(const side of [-1,1])add(rect(stand.x+side*12,stand.z,.2,22),'yellow',1.15);
  add(rect(stand.x,stand.z+10.8,24,.2),'yellow',1.15);
 }
 add(rect(84,794,68,2),'concrete',1.05);add(rect(130,858,170,4),'concrete',1.05);add(rect(65,824,4,68),'concrete',1.05);
 const surfaces:AirportGroundSurface[]=[];
 for(const group of groups.values())for(const piece of unionRects(group.rects))surfaces.push(Object.freeze({...piece,topY:group.topY,material:group.material}));
 return Object.freeze(surfaces);
}
