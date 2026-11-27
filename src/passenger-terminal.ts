import * as THREE from 'three';
import {batchStaticMeshes} from './static-box-batches.ts';
import {AIRPORT_DEPARTURE_ROAD} from '../worker/airport-departure-roads.mjs';
type Airport={terminal:{x:number;z:number;w:number;d:number;floors?:number;floorHeight?:number;id?:string};gate:{x:number;z:number}};
type Sign=(text:string,width:number,height:number)=>THREE.Sprite;
/** Fixed, batched architecture with an open airside-to-landside arrivals hall. */
export function createPassengerTerminal(airport:Airport,makeSign:Sign,{name,modern=false,height=10}:{name:string;modern?:boolean;height?:number}){
 const t=airport.terminal,floors=t.floors||1,floorHeight=t.floorHeight||5.2;
 height=floors>1?floorHeight*2+.8:height;
 const sideways=Math.abs(airport.gate.x-t.x)>Math.abs(airport.gate.z-t.z);
 const width=sideways?t.d:t.w,depth=sideways?t.w:t.d,g=new THREE.Group();
 g.name=name;g.position.set(t.x,0,t.z);g.rotation.y=sideways?Math.PI/2:0;
 const stone=new THREE.MeshStandardMaterial({color:modern?0xd9ddd8:0xd7d6c6,roughness:.72});
 const roof=new THREE.MeshStandardMaterial({color:modern?0xced8dd:0x476668,roughness:.55,metalness:.35});
 const glass=new THREE.MeshStandardMaterial({color:modern?0x4d8190:0x46726f,roughness:.32,metalness:.25});
 const metal=new THREE.MeshStandardMaterial({color:0x8ba2ab,roughness:.36,metalness:.6});
 const trim=new THREE.MeshBasicMaterial({color:modern?0x9be4ec:0xd6e2bc,toneMapped:false});
 const box=(w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);g.add(m);};
 const sign=(text:string,x:number,y:number,z:number,w:number,h=1)=>{const sprite=makeSign(text,w,h);sprite.position.set(x,y,z);g.add(sprite);};
 box(width,.1,depth,0,.22,0,stone);
 // Walls stop below the roof; the central eight-metre arrival passage stays open.
 for(const side of [-1,1]){
  box(.3,height-.5,depth,side*(width/2-.15),(height-.5)/2,0,stone);
  const panel=(width-8)/2;
  for(const end of [-1,1]){
   const x=side*(4+panel/2),z=end*(depth/2-.16);
   box(panel,1,.3,x,.5,z,stone);box(panel,height-1.5,.22,x,1+(height-1.5)/2,z,glass);
  }
 }
 if(floors>1){
  // The upper deck has real stair openings at its two outer edges.
  box(width-18,.22,depth-.6,0,.22+floorHeight-.11,0,stone);
  for(const side of [-1,1]){
   const sx=side*(width/2-5);
   for(let i=0;i<26;i++)box(3,.2,12/26,sx,.22+(i+1)*floorHeight/26-.1,side*(6-(i+.5)*12/26),stone);
   box(8,.22,2,side*(width/2-5),.22+floorHeight-.11,-side*7,stone);
   box(3,.9,.12,sx,.22+floorHeight+.45,-side*8,metal);
  }
  // Upstairs check-in desks and real security lanes leave a central walking aisle.
  for(const side of [-1,1]){
   box(9,1.05,1.2,side*11,floorHeight+.75,4,stone);
   box(9.1,.08,1.3,side*11,floorHeight+1.3,4,metal);
   box(2.2,1.4,.2,-20,floorHeight+.92,6+side*1.1,metal);
  }
  sign('CHECK-IN · SECURITY · DEPARTURES',0,floorHeight+3.1,0,38,.9);
  // Open central doors serve both floors; bridge connects the free train platform.
  const start=depth/2-1,end=depth/2+17,road=AIRPORT_DEPARTURE_ROAD;
  const bridges=modern&&/^T[1-4]$/.test(t.id||'')?[[start,road.z-road.width/2-t.z],[road.z+road.width/2-t.z,end]]:[[start,end]];
  // A marked crossing replaces the bridge slab and handrails over the road;
  // continuous bridge railings here would physically fence in every taxi.
  for(const [a,b]of bridges)if(b>a){
   box(6,.22,b-a,0,.22+floorHeight-.11,(a+b)/2,stone);
   // The curb sidewalk joins the hall laterally before the crossing.
   if(bridges.length===1||a>=road.z+road.width/2-t.z-.01)for(const side of [-1,1])box(.12,.9,b-a,side*2.94,.22+floorHeight+.45,(a+b)/2,metal);
  }
  for(const side of [-1,1]){
   const px=side*width*.26;
   box(3,.65,2.4,px,floorHeight+.55,0,stone);
   box(.24,1.9,.24,px,floorHeight+1.75,0,metal);
   box(3.6,.28,2.8,px,floorHeight+2.8,0,glass);
  }
  sign('FLOOR 2 · DEPARTURES · FREE T1–T4 TRAIN',0,floorHeight+2.5,depth/2+.3,Math.min(width-4,44),.9);
 }
 box(width+.8,.3,depth+.8,0,height-.15,0,roof);
 for(const end of [-1,1]){
  box(width+.9,.1,.14,0,height-.48,end*(depth/2+.42),trim);
  box(Math.min(width-2,modern?42:32),.25,6,0,4.9,end*(depth/2+2.7),roof);
  for(const x of [-7,7])box(.23,4.7,.23,x,2.35,end*(depth/2+4.7),metal);
 }
 // Counters, seating and vertical fins add detail without closing the centre aisle.
 for(const side of [-1,1]){
  const edge=side*(width/2-3);
  box(3,1.05,1.3,edge,.77,0,stone);
  box(3.1,.09,1.4,edge,1.34,0,metal);
  for(const end of [-1,1])box(5,.5,1,edge,.58,end*depth*.22,glass);
 }
 for(let x=-width/2+3;x<width/2-2;x+=6)if(Math.abs(x)>4)for(const end of [-1,1])box(.14,height-.8,.42,x,(height-.8)/2,end*(depth/2-.42),metal);
 sign(name.toUpperCase(),0,height+1.8,0,Math.min(55,width),1.6);
 sign('FLOOR 1 · ARRIVALS → IMMIGRATION · H$ 50',0,3.8,-depth/2-1,Math.min(33,width-2),1.05);
 sign('EXIT  ·  TAXI / METRO',0,3.6,depth/2+3,Math.min(27,width-2),1.05);
 g.userData={terminalId:t.id||null,floors,stairs:floors>1?2:0,lights:0};
 if(modern)sign('HANSDREX AIRLINE · CITY HOLIDAYS',0,height-1.2,depth/2+.18,Math.min(44,width-2),1.1);
 batchStaticMeshes(g);return g;
}
