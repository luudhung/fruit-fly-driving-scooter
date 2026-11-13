import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {CivicFacilityType} from '../worker/civic-development.mjs';

export type CivicFacilityVisualRecord={x:number;z:number;w:number;d:number;h:number;id?:string;facilityType?:string;usage?:string};
const material=(color:number,roughness=.8,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
// Shared opaque finishes: no per-site shaders, textures, lights or frame updates.
const finishes={hall:material(0xa6b1aa),clinic:material(0xe5e2d5),school:material(0xc4a47e),roof:material(0x45545b,.7,.25),steel:material(0x75828a,.55,.4),glass:material(0x385e70,.35,.45),white:material(0xede9db),red:material(0xc64e43),yellow:material(0xe4b84f),paving:material(0x8d9691),door:material(0x536c7a,.7,.3)};
const types=new Set<CivicFacilityType>(['factory','workshop','warehouse','power-plant','clinic','school']);

/** A completed symbolic facility stays within its authoritative footprint and height.
 * Damage, construction scaling and visibility remain the UrbanWorldRenderer's job. */
export function buildCivicFacility(record:CivicFacilityVisualRecord):THREE.Group|null{
 const type=record.facilityType||record.usage;if(!types.has(type as CivicFacilityType)||![record.x,record.z,record.w,record.d,record.h].every(Number.isFinite)||Math.min(record.w,record.d,record.h)<=0)return null;
 const {w,d,h}=record,group=new THREE.Group();group.name=record.id||`Civic ${type}`;group.position.set(record.x,0,record.z);group.userData.facilityType=type;
 const batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),features:string[]=[];
 const collect=(geometry:THREE.BufferGeometry,finish:THREE.Material)=>{const part=geometry.index?geometry.toNonIndexed():geometry;if(part!==geometry)geometry.dispose();let list=batches.get(finish);if(!list){list=[];batches.set(finish,list);}list.push(part);};
 const box=(x:number,y:number,z:number,width:number,height:number,depth:number,finish:THREE.Material)=>collect(new THREE.BoxGeometry(width*w,height*h,depth*d).translate(x*w,y*h,z*d),finish);
 const cylinder=(x:number,y:number,z:number,r:number,height:number,finish:THREE.Material)=>collect(new THREE.CylinderGeometry(r*Math.min(w,d),r*Math.min(w,d),height*h,8).translate(x*w,y*h,z*d),finish);
 const roof=(x:number,y:number,z:number,width:number,height:number,depth:number,finish=finishes.roof)=>{
  const shape=new THREE.Shape().moveTo(-width*w/2,0).lineTo(0,height*h).lineTo(width*w/2,0).closePath();
  collect(new THREE.ExtrudeGeometry(shape,{depth:depth*d,bevelEnabled:false,steps:1}).translate(x*w,y*h,(z-depth/2)*d),finish);
 };
 const windows=(front:number,rows:number,columns:number,startY=.25,spacing=.23)=>{
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++)box((col-(columns-1)/2)*(.74/columns),startY+row*spacing,front,.45/columns,.12,.012,finishes.glass);
 };
 const loadingDoors=(count:number,front=.367)=>{
  features.push('loading-doors');
  for(let i=0;i<count;i++){
   const x=(i-(count-1)/2)*(.76/count),width=.54/count;
   box(x,.20,front,width,.32,.014,finishes.door);
   for(let row=0;row<5;row++)box(x,.075+row*.057,front+.009,width,.009,.008,finishes.steel);
   box(x,.025,front+.065,width+.03,.025,.10,finishes.paving);
   for(const side of [-1,1])box(x+side*(width/2+.016),.09,front+.07,.012,.14,.014,finishes.yellow);
  }
 };
 box(0,.014,0,.98,.028,.98,finishes.paving);
 if(type==='factory'||type==='workshop'||type==='warehouse'){
  box(0,.355,-.045,.90,.67,.77,finishes.hall);
  roof(0,.69,-.045,.92,.14,.79);
  loadingDoors(type==='warehouse'?4:type==='factory'?3:2,.347);
  windows(-.435,1,type==='factory'?7:5,.48);
  for(const side of [-1,1])for(let col=0;col<4;col++)box(side*.456,.48,-.30+col*.16,.012,.15,.10,finishes.glass);
  features.push('pitched-hall');
  if(type==='factory'){
   features.push('industrial-stacks','roof-vents');
   for(const x of [-.32,.32]){cylinder(x,.68,-.26,.037,.56,finishes.steel);cylinder(x,.955,-.26,.043,.035,finishes.roof);}
   for(const x of [-.22,0,.22])box(x,.82,0,.09,.09,.18,finishes.steel);
  }else if(type==='workshop'){
   features.push('workshop-canopy');box(0,.46,.39,.79,.035,.14,finishes.roof);box(.31,.76,-.18,.11,.13,.16,finishes.steel);
  }else{
   features.push('loading-apron');for(const x of [-.36,-.12,.12,.36])box(x,.031,.44,.012,.005,.09,finishes.yellow);
   box(.32,.79,-.20,.15,.07,.19,finishes.steel);
  }
 }else if(type==='power-plant'){
  features.push('turbine-hall','chimneys','transformers','lightning-mark');
  box(-.10,.30,-.10,.72,.55,.68,finishes.hall);roof(-.10,.575,-.10,.74,.12,.70);
  for(const x of [-.31,.12]){
   cylinder(x,.65,-.27,.047,.66,finishes.steel);
   cylinder(x,.85,-.27,.048,.055,finishes.white);cylinder(x,.94,-.27,.048,.045,finishes.red);
  }
  for(const x of [-.28,0,.28]){
   box(x,.12,.34,.19,.18,.21,finishes.steel);
   for(const side of [-1,1])for(let fin=0;fin<4;fin++)box(x+side*.10,.12,.265+fin*.045,.012,.14,.02,finishes.roof);
   for(const pin of [-1,1])cylinder(x+pin*.055,.25,.34,.014,.11,finishes.glass);
  }
  box(.32,.24,-.09,.20,.43,.51,finishes.door);
  const bolt=new THREE.Shape().moveTo(-.028*w,.50*h).lineTo(.030*w,.50*h).lineTo(-.006*w,.405*h).lineTo(.028*w,.405*h).lineTo(-.035*w,.285*h).lineTo(-.010*w,.38*h).lineTo(-.042*w,.38*h).closePath();
  collect(new THREE.ExtrudeGeometry(bolt,{depth:d*.012,bevelEnabled:false,steps:1}).translate(-.10*w,0,.244*d),finishes.yellow);
  windows(-.447,1,5,.34);
 }else{
  const clinic=type==='clinic',wall=clinic?finishes.clinic:finishes.school;
  features.push(clinic?'medical-cross':'school-clock','public-entrance','classroom-windows');
  box(0,.37,-.05,.90,.68,.76,wall);box(0,.725,-.05,.93,.04,.79,clinic?finishes.roof:finishes.red);
  windows(-.438,2,5,.25,.25);windows(.337,2,5,.25,.25);
  for(const side of [-1,1])for(let row=0;row<2;row++)for(let col=0;col<3;col++)box(side*.457,.25+row*.25,-.27+col*.22,.014,.12,.13,finishes.glass);
  box(0,.18,.346,.16,.30,.016,finishes.door);box(0,.352,.39,.38,.025,.14,finishes.white);
  box(0,.036,.43,.30,.035,.11,finishes.paving);
  if(clinic){
   box(0,.55,.349,.075,.23,.022,finishes.red);box(0,.55,.350,.22,.075,.023,finishes.red);
   box(.31,.17,.40,.20,.12,.11,finishes.white);box(.31,.235,.40,.20,.015,.11,finishes.roof);
  }else{
   box(0,.815,-.05,.23,.16,.25,wall);box(0,.91,-.05,.25,.03,.27,finishes.red);
   const clock=new THREE.CylinderGeometry(.055*Math.min(w,h),.055*Math.min(w,h),.012*d,12);clock.rotateX(Math.PI/2);clock.translate(0,.815*h,.082*d);collect(clock,finishes.white);
   box(0,.834,.091,.009,.055,.009,finishes.roof);box(.013,.81,.091,.037,.009,.009,finishes.roof);
   for(const x of [-.29,.29]){box(x,.067,.425,.18,.055,.07,finishes.red);for(const side of [-1,1])box(x+side*.065,.04,.425,.012,.055,.045,finishes.steel);}
  }
 }
 let triangles=0;
 for(const [finish,parts]of batches){const geometry=mergeGeometries(parts);for(const part of parts)part.dispose();if(!geometry)continue;geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,finish);mesh.name=`${type} opaque batch`;group.add(mesh);triangles+=geometry.getAttribute('position').count/3;}
 group.userData.features=features;group.userData.facilityStats={meshes:group.children.length,triangles};return group;
}
