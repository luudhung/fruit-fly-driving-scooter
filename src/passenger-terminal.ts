import * as THREE from 'three';
import {batchStaticMeshes} from './static-box-batches.ts';
import {AIRPORT_DEPARTURE_ROAD} from '../worker/airport-departure-roads.mjs';
import {airportTerminalPassengerLayout} from '../worker/airport-terminal-layout.mjs';
import {subtractRects,type Rect} from './surface-rectangles.ts';
type Airport={terminal:{x:number;z:number;w:number;d:number;floors?:number;floorHeight?:number;id?:string};gate:{x:number;z:number}};
type Sign=(text:string,width:number,height:number)=>THREE.Sprite;
/** Fixed, batched architecture with an open airside-to-landside arrivals hall. */
export function createPassengerTerminal(airport:Airport,makeSign:Sign,{name,modern=false,height=10}:{name:string;modern?:boolean;height?:number}){
 const t=airport.terminal,floors=t.floors||1,floorHeight=t.floorHeight||5.2;
 height=floors>1?floorHeight*2+.8:height;
 const sideways=Math.abs(airport.gate.x-t.x)>Math.abs(airport.gate.z-t.z);
 const width=sideways?t.d:t.w,depth=sideways?t.w:t.d,g=new THREE.Group();
 const separated=modern&&floors>1&&!sideways&&/^T[1-4]$/.test(t.id||'');
 const layout=airportTerminalPassengerLayout(t);
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
  const sideDoors:Rect[]=separated&&side>0?[{x:layout.landside.door.z-t.z,z:layout.upperFloor+1.6,w:3.6,d:3.2}]:[];
  for(const p of subtractRects([{x:0,z:(height-.5)/2,w:depth,d:height-.5}],sideDoors))box(.3,p.d,p.w,side*(width/2-.15),p.z,p.x,stone);
  const panel=(width-8)/2;
  for(const end of [-1,1]){
   const x=side*(4+panel/2),z=end*(depth/2-.16);
   box(panel,1,.3,x,.5,z,stone);
   const backDoors:Rect[]=separated&&end<0?[{x:layout.airside.door.x-t.x,z:layout.upperFloor+1.6,w:3.6,d:3.2}]:[];
   for(const p of subtractRects([{x,z:1+(height-1.5)/2,w:panel,d:height-1.5}],backDoors))box(p.w,p.d,.22,p.x,p.z,z,glass);
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
  if(separated){
   const local=(p:{x:number;y:number;z:number})=>new THREE.Vector3(p.x-t.x,p.y-1.1,p.z-t.z);
   const beam=(a:THREE.Vector3,b:THREE.Vector3)=>{const delta=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,delta.length()),metal);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),delta.normalize());g.add(mesh);};
   const stairs=(top:{x:number;y:number;z:number},foot:{x:number;y:number;z:number})=>{
    const a=local(foot),b=local(top),count=28;
    for(let i=0;i<count;i++){const u=(i+.5)/count,p=a.clone().lerp(b,u),level=a.y+(b.y-a.y)*(i+1)/count;box(layout.stairWidth,.20,Math.abs(b.z-a.z)/count+.005,p.x,level-.10,p.z,stone);}
    for(const side of [-1,1]){
     const offset=new THREE.Vector3(side*(layout.stairWidth/2-.08),.92,0);beam(a.clone().add(offset),b.clone().add(offset));
     for(let j=0;j<=6;j++){const p=a.clone().lerp(b,j/6);box(.08,.92,.08,p.x+offset.x,p.y+.46,p.z,metal);}
    }
   };
   stairs(layout.landside.top,layout.landside.foot);stairs(layout.airside.landing,layout.airside.foot);
   // A public upper bridge reaches the side door without crossing downstairs
   // immigration. The secure rear landing leads straight onto exterior stairs.
   const right=width/2,publicEnd=layout.landside.top.x-t.x+layout.stairWidth/2;
   const stairShaft={x:layout.landside.top.x-t.x,z:(layout.landside.top.z+layout.landside.foot.z)/2-t.z,w:layout.stairWidth+.08,d:layout.landside.foot.z-layout.landside.top.z};
   for(const p of subtractRects([{x:(publicEnd+right-9)/2,z:3,w:publicEnd-(right-9),d:6.8}],[stairShaft]))box(p.w,.22,p.d,p.x,layout.upperFloor-.11,p.z,stone);
   box(layout.stairWidth,.22,2.4,layout.airside.door.x-t.x,layout.upperFloor-.11,layout.airside.door.z-t.z-.9,stone);
   const px=layout.departureControls.find(p=>p.stage==='departure-emigration')!;
   for(const side of [-1,1]){
    const x=px.x-t.x+side*.94,z=px.z-t.z;
    box(.26,1.4,2.1,x,layout.upperFloor+.7,z,metal);
    box(.28,.40,.35,x,layout.upperFloor+1.35,z+.6,glass);
    box(.28,.06,.36,x,layout.upperFloor+1.59,z+.6,trim);
   }
   sign('EXIT PASSPORT CONTROL',px.x-t.x,layout.upperFloor+2.7,px.z-t.z,21,.65);
   sign(`${t.id} · DEPARTURE GATES ↓`,layout.airside.door.x-t.x,layout.upperFloor+2.9,-depth/2-.6,22,.7);
   sign('DEPARTURES ↑ FLOOR 2',layout.landside.foot.x-t.x,3.1,layout.landside.foot.z-t.z,22,.7);
  }
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
   let px=side*width*.26;if(separated&&Math.abs(px-(layout.airside.door.x-t.x))<4)px-=8;
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
 for(let x=-width/2+3;x<width/2-2;x+=6)if(Math.abs(x)>4)for(const end of [-1,1]){
  const h=separated&&end<0&&Math.abs(x-(layout.airside.door.x-t.x))<2?layout.upperFloor-.25:height-.8;
  box(.14,h,.42,x,h/2,end*(depth/2-.42),metal);
 }
 sign(name.toUpperCase(),0,height+1.8,0,Math.min(55,width),1.6);
 sign('FLOOR 1 · ARRIVALS → IMMIGRATION · H$ 50',0,3.8,-depth/2-1,Math.min(33,width-2),1.05);
 sign('ARRIVALS EXIT · TAXI / METRO',0,3.6,depth/2+3,Math.min(32,width-2),1.05);
 g.userData={terminalId:t.id||null,floors,stairs:floors>1?(separated?4:2):0,lights:0,departurePassportFloor:separated?2:null,arrivalImmigrationFloor:1};
 if(modern)sign('HANSDREX AIRLINE · CITY HOLIDAYS',0,height-1.2,depth/2+.18,Math.min(44,width-2),1.1);
 batchStaticMeshes(g);return g;
}
