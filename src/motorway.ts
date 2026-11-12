import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {MOTORWAY,MOTORWAY_ROADS,MOTORWAY_ACCESS_ROADS,MOTORWAY_DECKS,motorwayMedianBlocked} from '../worker/motorway.mjs';
import {createRoadMaterial} from './road-lighting.ts';

/** The entire ring uses a handful of shared meshes; there are no real lights. */
export function buildMotorway(root:THREE.Object3D,makeSign?:(text:string,width:number,height:number)=>THREE.Sprite){
 const group=new THREE.Group();group.name='Hansdrex ring motorway';root.add(group);
 const layers=new Map<string,{material:THREE.Material;parts:THREE.BufferGeometry[]}>();
 const asphalt=createRoadMaterial(0x252c34),concrete=new THREE.MeshStandardMaterial({color:0xa9b0ac,roughness:.95}),paint=new THREE.MeshBasicMaterial({color:0xe6e7d6,toneMapped:false}),yellow=new THREE.MeshBasicMaterial({color:0xd9b853,toneMapped:false}),steel=new THREE.MeshStandardMaterial({color:0x80949d,roughness:.7,metalness:.3});
 const add=(key:string,material:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{
  let layer=layers.get(key);if(!layer){layer={material,parts:[]};layers.set(key,layer);}
  layer.parts.push(new THREE.BoxGeometry(w,h,d).translate(x,y,z));
 };
 for(const road of MOTORWAY_ROADS){
  add('base',concrete,road.x,.06,road.z,road.w+.7,.12,road.d+.7);
  add('road',asphalt,road.x,.14,road.z,road.w,.06,road.d);
  if(!road.motorway){
   const horizontal=road.w>road.d;add('yellow',yellow,road.x,.181,road.z,horizontal?road.w:.15,.012,horizontal?.15:road.d);continue;
  }
  const horizontal=road.w>road.d,start=horizontal?MOTORWAY.west:MOTORWAY.north,end=horizontal?MOTORWAY.east:MOTORWAY.south;
  for(let along=start+42;along<end-42;along+=4){
   const p={x:horizontal?along:road.x,z:horizontal?road.z:along};
   if(motorwayMedianBlocked(p))add('median',concrete,p.x,.6,p.z,horizontal?4:2,.85,horizontal?2:4);
  }
  for(const sign of [-1,1]){
   for(const offset of [1.15,14.05]){
    add(offset<2?'yellow':'paint',offset<2?yellow:paint,horizontal?road.x:road.x+sign*offset,.185,horizontal?road.z+sign*offset:road.z,horizontal?end-start:.13,.012,horizontal?.13:end-start);
   }
   for(const offset of [4.2,7.4,10.6])for(let along=start+16;along<end-16;along+=12){
    const merge=MOTORWAY_ACCESS_ROADS.some(r=>Math.abs((horizontal?r.x:r.z)-along)<20&&(horizontal?Math.abs(r.z-road.z)<100:Math.abs(r.x-road.x)<280));
    if(!merge)add('paint',paint,horizontal?along:road.x+sign*offset,.187,horizontal?road.z+sign*offset:along,horizontal?5:.13,.012,horizontal?.13:5);
   }
   for(let along=start+35;along<end-35;along+=28){
    const x=horizontal?along:road.x+sign*16,z=horizontal?road.z+sign*16:along;
    const opening=MOTORWAY_ACCESS_ROADS.some(r=>Math.hypot(Math.max(0,Math.abs(x-r.x)-r.w/2),Math.max(0,Math.abs(z-r.z)-r.d/2))<12);
    if(!opening)add('rail',steel,x,.65,z,horizontal?25:.12,.24,horizontal?.12:25);
   }
  }
 }
 for(const deck of MOTORWAY_DECKS){
  add('deck',concrete,deck.x,-.55,deck.z,deck.w,1.1,deck.d);
  if(deck.w>deck.d)for(let x=deck.x-deck.w/2+14;x<deck.x+deck.w/2;x+=32)for(const side of [-1,1])add('piers',concrete,x,-3.25,deck.z+side*(deck.d/2-5),2.4,5.4,2.4);
 }
 for(const {material,parts}of layers.values()){
  const geometry=mergeGeometries(parts);if(geometry)group.add(new THREE.Mesh(geometry,material));for(const part of parts)part.dispose();
 }
 if(makeSign)for(const [text,x,z]of [['AIRPORT GARDENS  ·  CITY RING',-430,MOTORWAY.north+18],['RIVERSIDE  ·  CITY RING',MOTORWAY.east-18,160],['WEST DISTRICT  ·  CITY RING',MOTORWAY.west+18,0],['CENTRAL CITY  ·  RING EXIT',122,MOTORWAY.south-18]] as const){
  const sign=makeSign(text,26,1.2);sign.position.set(x,7,z);group.add(sign);
 }
 return group;
}
