import * as THREE from 'three';
import {AIRPORT_DEPARTURE_ROAD as ROAD,AIRPORT_DEPARTURE_DROPOFFS as BAYS} from '../worker/airport-departure-roads.mjs';
import {HANSDREX_AIRPORT} from '../worker/hansdrex-airport-map.mjs';
import {ROADS,contains} from '../worker/city-map.mjs';
import {batchStaticMeshes} from './static-box-batches.ts';
import {unionRects,type Rect} from './surface-rectangles.ts';
type Point={x:number;y:number;z:number};
type Sign=(text:string,width:number,height:number)=>THREE.Sprite;

/** One fixed landside viaduct; all ramp heights match the actual taxi route. */
export function buildAirportDepartureRoad(parent:THREE.Object3D,makeSign:Sign){
 const root=new THREE.Group();root.name='Airport floor 2 departure road';parent.add(root);
 const asphalt=new THREE.MeshStandardMaterial({color:0x30383c,roughness:.94}),concrete=new THREE.MeshStandardMaterial({color:0xb8c4c3,roughness:.82}),rail=new THREE.MeshStandardMaterial({color:0x58737b,roughness:.65}),white=new THREE.MeshBasicMaterial({color:0xf4f1dc}),yellow=new THREE.MeshBasicMaterial({color:0xe9c85d});
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);root.add(mesh);return mesh;};
 const segment=(a:Point,b:Point,width:number,height:number,material:THREE.Material,offset=0,raise=0)=>{
  const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y,horizontal=Math.hypot(dx,dz),length=Math.hypot(horizontal,dy);
  if(length<.01)return;
  const mesh=box((a.x+b.x)/2-dz/horizontal*offset,(a.y+b.y)/2-ROAD.carOffset+raise,(a.z+b.z)/2+dx/horizontal*offset,length,height,width,material);
  mesh.rotation.set(0,Math.atan2(-dz,dx),Math.atan2(dy,horizontal),'YXZ');return mesh;
 };
 const crossing=(x:number,side:number)=>HANSDREX_AIRPORT.terminals.some(t=>Math.abs(x-t.x)<5)||(side<0&&BAYS.some(b=>Math.abs(x-b.x)<11));
 const flatConcrete:Rect[]=[],flatAsphalt:Rect[]=[];
 for(let i=1;i<ROAD.points.length;i++){
  const a=ROAD.points[i-1],b=ROAD.points[i],length=Math.hypot(b.x-a.x,b.z-a.z),flat=i===3;
  if(Math.abs(b.y-a.y)<1e-8){const horizontal=Math.abs(b.x-a.x)>Math.abs(b.z-a.z);flatConcrete.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:horizontal?length:ROAD.width,d:horizontal?ROAD.width:length});flatAsphalt.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:horizontal?length:ROAD.width-.24,d:horizontal?ROAD.width-.24:length});}
  else{segment(a,b,ROAD.width,.30,concrete,0,-.15);segment(a,b,ROAD.width-.24,.04,asphalt,0,.02);}
  for(const side of [-1,1]){
   const count=Math.ceil(length/3);
   for(let j=0;j<count;j++){
    const u=(j+.5)/count,x=a.x+(b.x-a.x)*u;
    if(i>1&&u*length<6||i<ROAD.points.length-1&&(1-u)*length<6)continue;
    const start=j/count,end=(j+1)/count,at=(t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
    segment(at(start),at(end),.20,.16,concrete,side*(ROAD.width/2-.1),.08);
    if(flat&&crossing(x,side))continue;
    segment(at(start),at(end),.09,.10,rail,side*(ROAD.width/2-.35),.85);
    if(j%3===0){const p=at(u),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;box(p.x-dz*side*(ROAD.width/2-.35),p.y-ROAD.carOffset+.43,p.z+dx*side*(ROAD.width/2-.35),.10,.86,.10,rail);}
   }
  }
  for(let j=6;j<length-3;j+=12){const at=(d:number)=>({x:a.x+(b.x-a.x)*d/length,y:a.y+(b.y-a.y)*d/length,z:a.z+(b.z-a.z)*d/length});segment(at(j),at(Math.min(length,j+5)),.13,.025,white,0,.055);}
  // Columns avoid the public streets and the four ground-floor arrival exits.
  for(let j=15;j<length-6;j+=32){const u=j/length,x=a.x+(b.x-a.x)*u,z=a.z+(b.z-a.z)*u,top=a.y+(b.y-a.y)*u-ROAD.carOffset-.3;
   if(top<1||ROADS.some(r=>contains(r,{x,z},1))||HANSDREX_AIRPORT.terminals.some(t=>Math.abs(x-t.x)<7))continue;
   box(x,top/2,z,.65,top,.65,concrete);
  }
 }
 for(const r of unionRects(flatConcrete))box(r.x,ROAD.deckTop-.15,r.z,r.w,.30,r.d,concrete);
 for(const r of unionRects(flatAsphalt))box(r.x,ROAD.deckTop+.02,r.z,r.w,.04,r.d,asphalt);
 const first=ROAD.points[2],last=ROAD.points[3];
 box((first.x+last.x)/2,ROAD.deckTop-.07,-379.55,last.x-first.x,.14,.9,concrete);
 for(const terminal of HANSDREX_AIRPORT.terminals){
  // Keep the central bridge to the free terminal train accessible on foot.
  for(let z=-378.5;z<=-372.5;z+=1)box(terminal.x,ROAD.deckTop+.07,z,6,.025,.45,white);
 }
 for(const bay of BAYS){
  for(const side of [-1,1])box(bay.x+side*bay.w/2,ROAD.deckTop+.08,bay.z,.16,.025,bay.d,yellow);
  const sign=makeSign(`${bay.terminalId} · DEPARTURES · TAXI DROP-OFF`,24,.75);sign.position.set(bay.x,ROAD.deckTop+2.8,-380.5);root.add(sign);
 }
 for(const [text,p]of [['DEPARTURES · T1 → T2 → T3 → T4',ROAD.entry],['EXIT → MAIN CITY',ROAD.exit]] as const){const sign=makeSign(text,30,1);sign.position.set(p.x,p.y+3,p.z);root.add(sign);}
 batchStaticMeshes(root);root.userData={level:2,oneWay:true,dropoffs:4,lights:0};return root;
}
