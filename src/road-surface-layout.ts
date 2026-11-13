import {subtractRects,unionRects,type Rect} from './surface-rectangles.ts';
export type SurfaceRoad=Rect&Readonly<{axis?:'x'|'z';id?:string}>;
export type RoadSurfaceOptions=Readonly<{
 /** Include other asphalt such as ramps/motorways even when another builder renders it. */
 allRoads?:readonly SurfaceRoad[];
 /** Already prepared ground-level airport, water or tunnel holes. */
 exclusions?:readonly Rect[];
 sidewalkWidth?:number;sidewalkGap?:number;foundationMargin?:number;markingWidth?:number;intersectionClearance?:number;markingInset?:number;
}>;
export type RoadSurfaceLayout=Readonly<{foundations:readonly Rect[];asphalt:readonly Rect[];sidewalks:readonly Rect[];markings:readonly Rect[]}>;
const axis=(r:SurfaceRoad)=>r.axis||(r.w>=r.d?'x':'z');
const valid=(r:Rect)=>[r.x,r.z,r.w,r.d].every(Number.isFinite)&&r.w>0&&r.d>0;
const option=(value:number|undefined,fallback:number)=>Number.isFinite(value)?Math.max(0,value!):fallback;

/** Pure rectangular layout. Logical streets, routes and caller-owned objects never change. */
export function buildRoadSurfaceLayout(roads:readonly SurfaceRoad[],options:RoadSurfaceOptions={}):RoadSurfaceLayout{
 const source=roads.filter(valid),complete=[...source,...(options.allRoads||[]).filter(valid)],holes=options.exclusions||[];
 const sidewalkWidth=option(options.sidewalkWidth,2.6),gap=option(options.sidewalkGap,.25),margin=option(options.foundationMargin,3),lineWidth=option(options.markingWidth,.16),clearance=option(options.intersectionClearance,1.2),inset=option(options.markingInset,0);
 const foundations:Rect[]=[],walks:Rect[]=[],horizontalLines:Rect[]=[],verticalLines:Rect[]=[];
 for(const road of source){
  const horizontal=axis(road)==='x',cross=horizontal?road.d:road.w,along=horizontal?road.w:road.d;
  // Only widen across the street: clipped tunnel mouths and dead ends get no extra cap.
  foundations.push({x:road.x,z:road.z,w:road.w+(horizontal?0:2*margin),d:road.d+(horizontal?2*margin:0)});
  if(sidewalkWidth>0)for(const side of [-1,1]){const offset=side*(cross/2+gap+sidewalkWidth/2);walks.push({x:road.x+(horizontal?0:offset),z:road.z+(horizontal?offset:0),w:horizontal?road.w:sidewalkWidth,d:horizontal?sidewalkWidth:road.d});}
  if(lineWidth>0&&along>inset*2){const line={x:road.x,z:road.z,w:horizontal?along-inset*2:Math.min(cross,lineWidth),d:horizontal?Math.min(cross,lineWidth):along-inset*2};(horizontal?horizontalLines:verticalLines).push(line);}
 }
 const horizontalAsphalt=unionRects(complete.filter(r=>axis(r)==='x')),verticalAsphalt=unionRects(complete.filter(r=>axis(r)==='z'));
 const horizontalCuts=verticalAsphalt.map(r=>({x:r.x,z:r.z,w:r.w+clearance*2,d:r.d})),verticalCuts=horizontalAsphalt.map(r=>({x:r.x,z:r.z,w:r.w,d:r.d+clearance*2}));
 return Object.freeze({
  foundations:subtractRects(foundations,holes),
  asphalt:subtractRects(source,holes),
  // COMPLETE asphalt is the obstacle, including streets handled by other renderers.
  sidewalks:subtractRects(walks,[...horizontalAsphalt,...verticalAsphalt,...holes]),
  markings:unionRects([...subtractRects(horizontalLines,[...horizontalCuts,...holes]),...subtractRects(verticalLines,[...verticalCuts,...holes])]),
 });
}
