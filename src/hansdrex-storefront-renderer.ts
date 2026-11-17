import * as THREE from 'three';
import {HANSDREX_STOREFRONTS} from '../worker/city-map.mjs';

type Piece={buildingId:string;matrix:THREE.Matrix4;color:number};
type Batch={mesh:THREE.InstancedMesh;pieces:Piece[]};
const boxGeometry=new THREE.BoxGeometry(1,1,1);
const deckMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.63,metalness:.14});
const paneMaterial=new THREE.MeshLambertMaterial({color:0xffffff,emissive:0xab8a63,emissiveIntensity:.38});
const warmPanes={food:0xddb984,retail:0xb7d1d8,entertainment:0xbfc8ee,experience:0xd3ccb5};

/** Spatial instance batches keep street retail independent of individual facades. */
export class HansdrexStorefrontRenderer {
 private batches:Batch[]=[];
 private buildingIds=new Set(HANSDREX_STOREFRONTS.map(s=>s.buildingId));
 private signature:string|null=null;
 constructor(parent:THREE.Object3D){
  const cells=new Map<string,{facade:Piece[];windows:Piece[]}>();
  const dummy=new THREE.Object3D();
  for(const shop of HANSDREX_STOREFRONTS){
   const key=`${Math.floor(shop.x/145)}:${Math.floor(shop.z/145)}`,cell=cells.get(key)||{facade:[],windows:[]};
   cells.set(key,cell);
   const yaw=shop.axis==='x'?shop.side*Math.PI/2:shop.side>0?0:Math.PI;
   const outward={x:Math.sin(yaw),z:Math.cos(yaw)},right={x:Math.cos(yaw),z:-Math.sin(yaw)};
   const base={x:shop.buildingX+outward.x*(shop.depth/2+.14),z:shop.buildingZ+outward.z*(shop.depth/2+.14)};
   const width=Math.min(9.5,shop.span*.83),pane=(width-2.25)/2;
   function piece(group:Piece[],w:number,h:number,d:number,x:number,y:number,z:number,color:number){
    dummy.position.set(base.x+right.x*x+outward.x*z,y,base.z+right.z*x+outward.z*z);
    dummy.rotation.y=yaw;dummy.scale.set(w,h,d);dummy.updateMatrix();
    group.push({buildingId:shop.buildingId,matrix:dummy.matrix.clone(),color});
   }
   piece(cell.facade,width,2.88,.14,0,1.49,0,0x352f2d);
   piece(cell.facade,width,.30,.46,0,2.85,.12,shop.color);
   piece(cell.facade,width+.10,.15,shop.europe?.95:.76,0,2.58,.35,shop.color);
   piece(cell.facade,width,.17,.2,0,.23,.075,0x928479);
   piece(cell.facade,1.22,2.12,.05,0,1.24,.10,0x48545a);
   piece(cell.windows,.85,1.48,.05,0,1.48,.14,0xb0a7a3);
   for(const side of [-1,1]){
    const x=side*(pane/2+.91);
    piece(cell.windows,pane,1.62,.06,x,1.42,.125,warmPanes[shop.kind]);
    piece(cell.facade,.06,1.62,.04,x,1.42,.165,0x5a4b43);
    for(const y of [.61,2.23])piece(cell.facade,pane,.055,.05,x,y,.15,0xc2a992);
   }
   if(shop.europe||shop.kind==='food')for(let stripe=0;stripe<5;stripe++){
    piece(cell.facade,width*.065,.025,.7,(stripe-2)*width*.16,2.66,.35,0xe6dbbc);
   }
  }
  for(const [key,cell] of cells){
   for(const [pieces,material] of [[cell.facade,deckMaterial],[cell.windows,paneMaterial]] as const){
    const mesh=new THREE.InstancedMesh(boxGeometry,material,pieces.length);
    mesh.name=`Hansdrex ground-floor venues ${key}`;
    parent.add(mesh);this.batches.push({mesh,pieces});
   }
  }
  this.sync([]);
 }
 sync(records:Array<{id:string;stage:string}>){
  const hidden=new Set(records.filter(b=>this.buildingIds.has(b.id)&&['cleared','collapsed','construction'].includes(b.stage)).map(b=>b.id));
  const signature=[...hidden].sort().join('|');
  if(signature===this.signature)return;
  this.signature=signature;
  const tint=new THREE.Color();
  for(const {mesh,pieces} of this.batches){
   let i=0;
   for(const piece of pieces)if(!hidden.has(piece.buildingId)){
    mesh.setMatrixAt(i,piece.matrix);mesh.setColorAt(i++,tint.setHex(piece.color));
   }
   mesh.count=i;
   mesh.visible=i>0;mesh.instanceMatrix.needsUpdate=true;
   if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
   if(i)mesh.computeBoundingSphere();
  }
 }
}
