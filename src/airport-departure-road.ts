import * as THREE from 'three';
import {AIRPORT_DEPARTURE_ROAD as ROAD,AIRPORT_DEPARTURE_DROPOFFS as BAYS} from '../worker/airport-departure-roads.mjs';
import {HANSDREX_AIRPORT} from '../worker/hansdrex-airport-map.mjs';
import {ROADS,contains} from '../worker/city-map.mjs';
import {batchStaticMeshes} from './static-box-batches.ts';
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
 // One continuous strip shares every cross-section, including the rounded
 // corners. Overlapping rectangular slabs leave gaps and flickering at bends.
 const ribbon=(width:number,top:number,bottom:number,material:THREE.Material)=>{
  const positions:number[]=[],indices:number[]=[],uv:number[]=[];
  for(let i=0;i<ROAD.points.length;i++){
   const p=ROAD.points[i],a=ROAD.points[Math.max(0,i-1)],b=ROAD.points[Math.min(ROAD.points.length-1,i+1)];
   const before=new THREE.Vector2(p.x-a.x,p.z-a.z).normalize(),after=new THREE.Vector2(b.x-p.x,b.z-p.z).normalize();
   if(!i)before.copy(after);if(i===ROAD.points.length-1)after.copy(before);
   const tangent=before.clone().add(after).normalize(),normal=new THREE.Vector2(-tangent.y,tangent.x),scale=width/2/Math.max(.5,normal.dot(new THREE.Vector2(-after.y,after.x)));
   for(const height of [top,bottom])for(const side of [1,-1]){const x=p.x+normal.x*scale*side,z=p.z+normal.y*scale*side;positions.push(x,p.y-ROAD.carOffset+height,z);uv.push(x/8,z/8);}
   if(i){const a=(i-1)*4,b=i*4;indices.push(a,b,a+1,a+1,b,b+1,a+2,a+3,b+2,a+3,b+3,b+2,a,a+2,b,a+2,b+2,b,a+1,b+1,a+3,a+3,b+1,b+3);}
  }
  const end=(ROAD.points.length-1)*4;indices.push(0,1,2,1,3,2,end,end+2,end+1,end+1,end+2,end+3);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  root.add(new THREE.Mesh(geometry,material));
 };
 ribbon(ROAD.width,0,-.30,concrete);ribbon(ROAD.width-.24,.04,.005,asphalt);
 const crossing=(x:number,side:number)=>HANSDREX_AIRPORT.terminals.some(t=>Math.abs(x-t.x)<5)||(side<0&&BAYS.some(b=>Math.abs(x-b.x)<11));
 let travelled=0,nextPost=12,nextColumn=15;
 for(let i=1;i<ROAD.points.length;i++){
  const a=ROAD.points[i-1],b=ROAD.points[i],length=Math.hypot(b.x-a.x,b.z-a.z),flat=i===ROAD.deckEndIndex;
  const at=(d:number)=>({x:a.x+(b.x-a.x)*d/length,y:a.y+(b.y-a.y)*d/length,z:a.z+(b.z-a.z)*d/length});
  for(const side of [-1,1]){
   const count=Math.ceil(length/3);
   for(let j=0;j<count;j++){
    const u=(j+.5)/count,x=a.x+(b.x-a.x)*u;
    // The ground-level fork and merge have open edges: rails there would cut
    // across the factory street or trap traffic at the bottom of the ramp.
    if(a.y+(b.y-a.y)*u<1.55)continue;
    const start=j/count,end=(j+1)/count,at=(t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
    segment(at(start),at(end),.20,.16,concrete,side*(ROAD.width/2-.1),.08);
    if(flat&&crossing(x,side))continue;
    segment(at(start),at(end),.09,.10,rail,side*(ROAD.width/2-.35),.85);
   }
  }
  for(;nextPost<travelled+length;nextPost+=9){const p=at(nextPost-travelled),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;if(p.y<1.55)continue;for(const side of [-1,1])if(!flat||!crossing(p.x,side))box(p.x-dz*side*(ROAD.width/2-.35),p.y-ROAD.carOffset+.43,p.z+dx*side*(ROAD.width/2-.35),.10,.86,.10,rail);}
  // Dash boundaries use cumulative distance, so paint follows short arc samples.
  for(let d=0;d<length;){const phase=(travelled+d)%12,step=Math.min(length-d,phase<5?5-phase:12-phase);if(step<1e-6){d+=1e-5;continue;}if(phase<5)segment(at(d),at(d+step),.13,.025,white,0,.055);d+=step;}
  // Columns avoid the public streets and the four ground-floor arrival exits.
  for(;nextColumn<travelled+length;nextColumn+=32){const p=at(nextColumn-travelled),x=p.x,z=p.z,top=p.y-ROAD.carOffset-.3;
   if(top<1||ROADS.some(r=>contains(r,{x,z},1))||HANSDREX_AIRPORT.terminals.some(t=>Math.abs(x-t.x)<7))continue;
   box(x,top/2,z,.65,top,.65,concrete);
  }
  travelled+=length;
 }
 const first=ROAD.points[ROAD.deckStartIndex],last=ROAD.points[ROAD.deckEndIndex];
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
 const straight=makeSign('STRAIGHT → CITY / INDUSTRIAL DISTRICT',29,1);straight.position.set(-370,4,-391);root.add(straight);
 batchStaticMeshes(root);root.userData={level:2,oneWay:true,dropoffs:4,lights:0};return root;
}
