import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export type KhalifaLayout={x:number;z:number;h?:number};
type SignMaker=(text:string,width:number,height:number)=>THREE.Sprite;
const HEIGHT=190;

function facadeIllumination(){
 const width=64,height=256,pixels=new Uint8Array(width*height*4);
 const blue=new THREE.Color(0x4f6dff),violet=new THREE.Color(0x9e57f0),cyan=new THREE.Color(0x69e4ff),white=new THREE.Color(0xdaf5ff);
 const color=new THREE.Color(),base=new THREE.Color();
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const stripe=.5+.5*Math.sin(x*2.17+Math.sin(y*.035)*1.4);
  const wave=.5+.5*Math.sin(y*.049+x*.46);
  base.copy(blue).lerp(violet,.5+.5*Math.sin(y*.022+x*.25));
  color.copy(base).lerp(cyan,stripe*.68).lerp(white,Math.pow(wave,8)*.77);
  color.multiplyScalar(.46+stripe*.54).convertLinearToSRGB();
  const at=(y*width+x)*4;
  pixels[at]=color.r*255;pixels[at+1]=color.g*255;pixels[at+2]=color.b*255;pixels[at+3]=255;
 }
 const texture=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat);
 texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
 texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
 return texture;
}

const illumination=facadeIllumination();
const glass=new THREE.MeshStandardMaterial({color:0x729cad,roughness:.26,metalness:.58,emissive:0xffffff,emissiveMap:illumination,emissiveIntensity:0});
const steel=new THREE.MeshStandardMaterial({color:0xc6d4dc,roughness:.32,metalness:.7,emissive:0xffffff,emissiveMap:illumination,emissiveIntensity:0});
const ribbons=new THREE.MeshStandardMaterial({color:0xc2d8df,roughness:.38,metalness:.42,emissive:0xffffff,emissiveMap:illumination,emissiveIntensity:0});
const podium=new THREE.MeshStandardMaterial({color:0xa3aead,roughness:.88});

/** Facade LEDs are one texture and three material intensities, without real lights.
 * The optional time moves the light-show texture rather than rebuilding geometry. */
export function updateKhalifaLighting(night:number,elapsed?:number){
 const amount=THREE.MathUtils.smoothstep(night,.13,.92);
 glass.emissiveIntensity=amount*.48;
 steel.emissiveIntensity=amount*.48;
 ribbons.emissiveIntensity=amount*2.15;
 if(elapsed!==undefined&&Number.isFinite(elapsed))illumination.offset.y=((elapsed*.004)%1+1)%1;
}

// Each lobe has a broad glazed side and a rounded outer tip. Three lobes form
// the actual tower's buttressed Y; successive setbacks rotate around the core.
const WING_PROFILE:THREE.Vector2[]=[new THREE.Vector2(0,-1.55),new THREE.Vector2(1.6,-1.55),new THREE.Vector2(3.1,-1.55),new THREE.Vector2(4.7,-1.55)];
for(let i=1;i<=10;i++){
 const angle=-Math.PI/2+i*Math.PI/10;
 WING_PROFILE.push(new THREE.Vector2(4.7+Math.cos(angle)*1.55,Math.sin(angle)*1.55));
}
WING_PROFILE.push(new THREE.Vector2(3.1,1.55),new THREE.Vector2(1.6,1.55),new THREE.Vector2(0,1.55));

const WING_TIERS=[
 [[.7,28,1],[28,59,.79],[59,88,.61],[88,116,.44],[116,141,.30],[141,159,.17]],
 [[.7,39,.94],[39,70,.73],[70,99,.55],[99,128,.38],[128,150,.23],[150,164,.12]],
 [[.7,49,.86],[49,80,.66],[80,110,.48],[110,138,.32],[138,157,.18],[157,167,.08]],
] as const;

function wingGeometry(angle:number,bottom:number,top:number,scale:number,capped=true){
 const sin=Math.sin(angle),cos=Math.cos(angle),vertices:number[]=[],uvs:number[]=[];
 const point=(p:THREE.Vector2,y:number)=>[(p.x*cos-p.y*sin)*scale,y,(p.x*sin+p.y*cos)*scale];
 const vertex=(p:number[],u:number)=>{vertices.push(...p);uvs.push(u,p[1]/HEIGHT);};
 const triangle=(a:number[],b:number[],c:number[],u:number,v:number,w:number)=>{vertex(a,u);vertex(b,v);vertex(c,w);};
 for(let i=0;i<WING_PROFILE.length;i++){
  const a=WING_PROFILE[i],b=WING_PROFILE[(i+1)%WING_PROFILE.length],u=i/WING_PROFILE.length+angle/(Math.PI*2),v=(i+1)/WING_PROFILE.length+angle/(Math.PI*2);
  const la=point(a,bottom),lb=point(b,bottom),ua=point(a,top),ub=point(b,top);
  triangle(la,ua,lb,u,u,v);triangle(ua,ub,lb,u,v,v);
  if(capped){const center=point(new THREE.Vector2(2.9,0),top);triangle(center,ub,ua,(u+v)/2,v,u);}
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
 return geometry;
}

function addPart(parts:THREE.BufferGeometry[],geometry:THREE.BufferGeometry){parts.push(geometry);}
function box(parts:THREE.BufferGeometry[],x:number,y:number,z:number,w:number,h:number,d:number){
 addPart(parts,new THREE.BoxGeometry(w,h,d).translate(x,y,z));
}
function cylinder(parts:THREE.BufferGeometry[],bottom:number,top:number,lowerRadius:number,upperRadius:number,segments=18){
 addPart(parts,new THREE.CylinderGeometry(upperRadius,lowerRadius,top-bottom,segments).translate(0,(bottom+top)/2,0));
}

function addBatch(group:THREE.Group,parts:THREE.BufferGeometry[],material:THREE.Material,scale:number){
 const geometries=parts.map(part=>part.index?part.toNonIndexed():part);
 for(const geometry of geometries){
  const positions=geometry.getAttribute('position');
  if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.count*2),2));
  const uv=geometry.getAttribute('uv');
  // World-height UVs make all facade pieces share a coherent vertical light show.
  for(let i=0;i<positions.count;i++)uv.setY(i,positions.getY(i)/HEIGHT);
 }
 const geometry=mergeGeometries(geometries);
 if(!geometry)throw new Error('Unable to batch Khalifa facade');
 geometry.scale(1,scale,1);group.add(new THREE.Mesh(geometry,material));
 for(const part of new Set([...parts,...geometries]))part.dispose();
}

export function buildKhalifa(layout:KhalifaLayout,makeSign:SignMaker){
 const group=new THREE.Group();group.name='Burj Khalifa';group.position.set(layout.x,0,layout.z);
 const height=layout.h??HEIGHT,scale=height/HEIGHT;
 const bases:THREE.BufferGeometry[]=[],panes:THREE.BufferGeometry[]=[],bands:THREE.BufferGeometry[]=[],leds:THREE.BufferGeometry[]=[];
 cylinder(bases,.02,.38,6.7,6.7,36);
 cylinder(bases,.38,.72,5.8,5.8,30);
 cylinder(panes,.65,151,1.7,.62,24);
 for(const [wing,tiers]of WING_TIERS.entries()){
  const angle=-Math.PI/2+wing*Math.PI*2/3,sin=Math.sin(angle),cos=Math.cos(angle);
  for(const [bottom,top,radius]of tiers){
   panes.push(wingGeometry(angle,bottom,top,radius));
   bands.push(wingGeometry(angle,top-.13,top+.04,radius*1.012));
   for(let floor=Math.ceil(bottom/1.35)*1.35;floor<top-.2;floor+=1.35)
    bands.push(wingGeometry(angle,floor,floor+.055,radius*1.008,false));
   for(const [index,p]of WING_PROFILE.entries()){
    if(index===0||index===WING_PROFILE.length-1)continue;
    const x=(p.x*cos-p.y*sin)*radius,z=(p.x*sin+p.y*cos)*radius;
    box(bands,x,(bottom+top)/2,z,.042,top-bottom,.042);
    if(index%2===0)box(leds,x*1.007,(bottom+top)/2,z*1.007,.035,top-bottom,.035);
   }
  }
 }
 // A sequence of round setbacks becomes a fine, continuous spire.
 for(const [bottom,top,lower,upper]of [[150,159,.82,.69],[159,167,.69,.47],[167,173,.47,.32],[173,177,.32,.24]]){
  cylinder(panes,bottom,top,lower,upper,20);
  cylinder(bands,top-.13,top+.03,upper*1.1,upper*1.1,20);
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4;
   box(leds,Math.cos(a)*(lower+upper)/2,(bottom+top)/2,Math.sin(a)*(lower+upper)/2,.035,top-bottom,.035);
  }
 }
 cylinder(bands,177,190,.24,.018,12);
 cylinder(leds,177,189.4,.085,.018,8);
 // Three open entrance porticoes sit inside the original reserved footprint.
 for(let wing=0;wing<3;wing++){
  const angle=-Math.PI/2+wing*Math.PI*2/3,x=Math.cos(angle)*4.4,z=Math.sin(angle)*4.4;
  const canopy=new THREE.BoxGeometry(2.6,.16,2).rotateY(-angle).translate(x,2.4,z);bases.push(canopy);
 }
 addBatch(group,bases,podium,scale);addBatch(group,panes,glass,scale);addBatch(group,bands,steel,scale);addBatch(group,leds,ribbons,scale);
 const sign=makeSign('BURJ KHALIFA · HANSDREX',26,1.35);sign.position.y=height+4;group.add(sign);
 return group;
}
