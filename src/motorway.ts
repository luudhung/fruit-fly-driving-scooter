import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {MOTORWAY,MOTORWAY_ROADS,MOTORWAY_ACCESS_ROADS,MOTORWAY_DECKS,motorwayMedianBlocked} from '../worker/motorway.mjs';
import {createRoadMaterial} from './road-lighting.ts';

export type MotorwayDestination='Main City'|'European Quarter'|'North City'|'West City';
export type MotorwaySignPlan={kind:'exit'|'entry';accessRoadId:string;exitNumber:number;destination:MotorwayDestination;text:string;position:{x:number;y:number;z:number};facing:{x:number;z:number};travel:{x:number;z:number};junction:{x:number;z:number};post:{x:number;z:number};width:number;height:number;advance:number;arrow:'left'|'right'|'ahead'};
type Junction={id:string;edge:'north'|'east'|'south'|'west';along:number;point:{x:number;z:number};out:{x:number;z:number};city:{x:number;z:number};destination:MotorwayDestination};
const SIGN_COLOR='#55a9a0';

/** Derived from real access rectangles, clockwise from the northwestern corner. */
export function motorwaySignPlan():MotorwaySignPlan[]{
 const junctions:Junction[]=[];
 for(const r of MOTORWAY_ACCESS_ROADS){
  let edge:Junction['edge'],point:{x:number;z:number},city:{x:number;z:number};
  if(r.w>r.d){
   if(r.x-r.w/2<=MOTORWAY.west+.01){edge='west';point={x:MOTORWAY.west,z:r.z};city={x:r.x+r.w/2,z:r.z};}
   else if(r.x+r.w/2>=MOTORWAY.east-.01){edge='east';point={x:MOTORWAY.east,z:r.z};city={x:r.x-r.w/2,z:r.z};}else continue;
  }else{
   if(r.z-r.d/2<=MOTORWAY.north+.01){edge='north';point={x:r.x,z:MOTORWAY.north};city={x:r.x,z:r.z+r.d/2};}
   else if(r.z+r.d/2>=MOTORWAY.south-.01){edge='south';point={x:r.x,z:MOTORWAY.south};city={x:r.x,z:r.z-r.d/2};}else continue;
  }
  const length=Math.hypot(city.x-point.x,city.z-point.z);if(length<.1)continue;
  const destination:MotorwayDestination=edge==='north'?'North City':edge==='west'?'West City':edge==='east'?'European Quarter':point.x< -400?'West City':point.x>430?'European Quarter':'Main City';
  junctions.push({id:r.id,edge,point,city,along:edge==='north'||edge==='south'?point.x:point.z,out:{x:(city.x-point.x)/length,z:(city.z-point.z)/length},destination});
 }
 const order={north:0,east:1,south:2,west:3};junctions.sort((a,b)=>order[a.edge]-order[b.edge]||((a.edge==='south'||a.edge==='west')?-1:1)*(a.along-b.along));
 const plans:MotorwaySignPlan[]=[];
 for(const [index,j]of junctions.entries()){
  const horizontal=j.edge==='north'||j.edge==='south',lo=horizontal?MOTORWAY.west:MOTORWAY.north,hi=horizontal?MOTORWAY.east:MOTORWAY.south;
  for(const direction of [-1,1]){
   const travel={x:horizontal?direction:0,z:horizontal?0:direction},right={x:-travel.z,z:travel.x};
   const preceding=junctions.filter(o=>o.edge===j.edge&&(j.along-o.along)*direction>.01).map(o=>(j.along-o.along)*direction);
   const gap=Math.min(...preceding,direction>0?j.along-lo:hi-j.along),advance=Math.max(8,Math.min(54,gap*.45));
   const center={x:j.point.x-travel.x*advance,z:j.point.z-travel.z*advance},arrow=j.out.x*right.x+j.out.z*right.z>0?'right':'left';
   plans.push({kind:'exit',accessRoadId:j.id,exitNumber:index+1,destination:j.destination,text:`${j.destination.toUpperCase()} / EXIT ${index+1} / ${arrow.toUpperCase()} / ${Math.round(advance)} m`,position:{x:center.x+right.x*8.5,y:10.5,z:center.z+right.z*8.5},facing:{x:-travel.x,z:-travel.z},travel,junction:{...j.point},post:{x:center.x+right.x*20.5,z:center.z+right.z*20.5},width:14,height:5.8,advance,arrow});
  }
  const road=MOTORWAY_ACCESS_ROADS.find(r=>r.id===j.id)!,travel={x:-j.out.x,z:-j.out.z},right={x:-travel.z,z:travel.x},length=Math.hypot(j.city.x-j.point.x,j.city.z-j.point.z),distance=Math.min(46,Math.max(24,length*.6));
  const center={x:j.point.x+j.out.x*distance,z:j.point.z+j.out.z*distance},halfWidth=Math.min(road.w,road.d)/2;
  plans.push({kind:'entry',accessRoadId:j.id,exitNumber:index+1,destination:j.destination,text:`RING EXPRESSWAY / ENTRY / ${j.destination.toUpperCase()}`,position:{x:center.x+right.x*2.7,y:8.7,z:center.z+right.z*2.7},facing:{x:-travel.x,z:-travel.z},travel,junction:{...j.point},post:{x:center.x+right.x*(halfWidth+2),z:center.z+right.z*(halfWidth+2)},width:7.5,height:3.1,advance:distance,arrow:'ahead'});
 }
 return plans;
}
function signAtlas(plans:MotorwaySignPlan[]){
 const key=(p:MotorwaySignPlan)=>p.kind==='entry'?`entry:${p.destination}`:`exit:${p.exitNumber}:${p.arrow}`;
 const keys=[...new Set(plans.map(key))],tileW=384,tileH=160,columns=4,rows=Math.ceil(keys.length/columns),width=columns*tileW,height=rows*tileH;
 let texture:THREE.CanvasTexture|null=null;
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  if(ctx){
   ctx.fillStyle=SIGN_COLOR;ctx.fillRect(0,0,width,height);
   for(const [i,k]of keys.entries()){
    const p=plans.find(p=>key(p)===k)!,x=i%columns*tileW,y=Math.floor(i/columns)*tileH;ctx.save();ctx.translate(x,y);ctx.strokeStyle='#ffffff';ctx.lineWidth=2.5;ctx.strokeRect(6,6,tileW-12,tileH-12);ctx.fillStyle='#ffffff';ctx.textBaseline='middle';ctx.textAlign='left';
    ctx.font='700 22px Arial, sans-serif';ctx.fillText(p.kind==='entry'?'RING EXPRESSWAY':`EXIT ${p.exitNumber}`,19,29);
    let font=30;const label=p.destination.toUpperCase();do{ctx.font=`700 ${font--}px Arial, sans-serif`;}while(ctx.measureText(label).width>tileW-42&&font>17);ctx.fillText(label,19,76);
    ctx.font='700 21px Arial, sans-serif';ctx.fillText(p.kind==='entry'?'ENTRY':`${p.arrow.toUpperCase()} / ${Math.round(p.advance)} m`,19,126);
    const ax=338,ay=124;ctx.strokeStyle='#ffffff';ctx.lineWidth=5;ctx.lineCap='square';ctx.lineJoin='miter';ctx.beginPath();
    if(p.arrow==='ahead'){ctx.moveTo(ax,ay+14);ctx.lineTo(ax,ay-14);ctx.moveTo(ax-10,ay-4);ctx.lineTo(ax,ay-14);ctx.lineTo(ax+10,ay-4);}
    else{const sign=p.arrow==='right'?1:-1;ctx.moveTo(ax-sign*16,ay);ctx.lineTo(ax+sign*14,ay);ctx.moveTo(ax+sign*3,ay-11);ctx.lineTo(ax+sign*14,ay);ctx.lineTo(ax+sign*3,ay+11);}
    ctx.stroke();ctx.restore();
   }
   texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;texture.name='Motorway English guide sign atlas';
  }
 }
 return{texture,uv(p:MotorwaySignPlan){const index=keys.indexOf(key(p)),x=index%columns*tileW,y=Math.floor(index/columns)*tileH;return{u0:(x+2)/width,u1:(x+tileW-2)/width,v0:1-(y+tileH-2)/height,v1:1-(y+2)/height};}};
}

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
 const plans=motorwaySignPlan(),atlas=signAtlas(plans),faces:THREE.BufferGeometry[]=[];group.userData.motorwaySigns=plans;
 for(const p of plans){
  const rotation=Math.atan2(p.facing.x,p.facing.z),panel=new THREE.BoxGeometry(p.width,p.height,.18).rotateY(rotation).translate(p.position.x,p.position.y,p.position.z);
  let rail=layers.get('rail');if(!rail){rail={material:steel,parts:[]};layers.set('rail',rail);}rail.parts.push(panel);
  const top=p.position.y+p.height/2+.22;add('rail',steel,p.post.x,top/2,p.post.z,.45,top,.45);
  const right={x:-p.travel.z,z:p.travel.x},inner={x:p.position.x-right.x*p.width/2,z:p.position.z-right.z*p.width/2};
  const beamCenter={x:(p.post.x+inner.x)/2,z:(p.post.z+inner.z)/2},span=Math.hypot(p.post.x-inner.x,p.post.z-inner.z)+.3;
  add('rail',steel,beamCenter.x,top,beamCenter.z,Math.abs(p.travel.x)>.5?.35:span,.35,Math.abs(p.travel.x)>.5?span:.35);
  const face=new THREE.PlaneGeometry(p.width-.12,p.height-.12),uv=face.getAttribute('uv'),tile=atlas.uv(p);
  for(let i=0;i<uv.count;i++)uv.setXY(i,tile.u0+(tile.u1-tile.u0)*uv.getX(i),tile.v0+(tile.v1-tile.v0)*uv.getY(i));
  face.rotateY(rotation).translate(p.position.x+p.facing.x*.105,p.position.y,p.position.z+p.facing.z*.105);faces.push(face);
 }
 const frontGeometry=mergeGeometries(faces);if(frontGeometry){const fronts=new THREE.Mesh(frontGeometry,new THREE.MeshBasicMaterial({color:atlas.texture?0xffffff:SIGN_COLOR,map:atlas.texture,toneMapped:false}));fronts.name='English motorway exit and entry boards';group.add(fronts);}for(const face of faces)face.dispose();
 for(const {material,parts}of layers.values()){
  const geometry=mergeGeometries(parts);if(geometry)group.add(new THREE.Mesh(geometry,material));for(const part of parts)part.dispose();
 }
 return group;
}
