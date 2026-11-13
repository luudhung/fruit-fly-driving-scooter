import * as THREE from 'three';
import {spatialInstanceCells,syncSpatialInstanceColors,type SpatialInstanceCell} from './spatial-instances.ts';
import {signalState} from '../worker/traffic.mjs';
import {signalPolePose} from '../worker/street-furniture.mjs';

type Junction={x:number;z:number};
const bulbColors={red:[0x3a0808,0xff2b2b],yellow:[0x302707,0xffc928],green:[0x07351c,0x35ef87]} as const;
/** Identical signal/crossing geometry in immutable spatial batches; no light sources. */
export class TrafficSignals{
 readonly poles:THREE.InstancedMesh;
 readonly heads:THREE.InstancedMesh;
 readonly bulbs:THREE.InstancedMesh;
 readonly crossings:THREE.InstancedMesh;
 private readonly signalAxes:Array<'ns'|'ew'>=[];
 readonly cells:SpatialInstanceCell[]=[];
 private bulbCells:SpatialInstanceCell[]=[];
 private lastPhase='';
 private disposed=false;
 constructor(root:THREE.Object3D,intersections:readonly Junction[],stride=1){
  const every=Number.isFinite(stride)?Math.max(1,Math.floor(stride)):1;
  const selected=intersections.filter((_,index)=>index%every===0),count=selected.length;
  this.poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(.07,.09,3.2,6),new THREE.MeshStandardMaterial({color:0x303638,roughness:.72,metalness:.42}),count*2);
  this.heads=new THREE.InstancedMesh(new THREE.BoxGeometry(.56,1.28,.34),new THREE.MeshStandardMaterial({color:0x111615,roughness:.82}),count*2);
  this.bulbs=new THREE.InstancedMesh(new THREE.SphereGeometry(.16,7,5),new THREE.MeshBasicMaterial({color:0xffffff}),count*6);
  this.crossings=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xf1f2ed,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-7,polygonOffsetUnits:-7}),count*8);
  this.poles.name='Traffic signal poles';this.heads.name='Traffic signal heads';this.bulbs.name='Traffic signal bulbs';this.crossings.name='Pedestrian crossings';
  const dummy=new THREE.Object3D();let headIndex=0,bulbIndex=0,crossingIndex=0;
  const place=(mesh:THREE.InstancedMesh,index:number,x:number,y:number,z:number,yaw=0,w=1,h=1,d=1)=>{
   dummy.position.set(x,y,z);dummy.rotation.set(0,yaw,0);dummy.scale.set(w,h,d);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
  };
  for(const junction of selected){
   for(const axis of ['ns','ew'] as const){
    const {x,z}=signalPolePose(junction,axis);
    place(this.poles,headIndex,x,1.6,z);
    place(this.heads,headIndex++,x,3.1,z,axis==='ew'?Math.PI/2:0);
    this.signalAxes.push(axis);
    for(let color=0;color<3;color++)place(this.bulbs,bulbIndex++,x+(axis==='ew'?.19:0),3.48-color*.39,z+(axis==='ns'?.19:0));
   }
   for(const dx of [-2.4,-.8,.8,2.4])place(this.crossings,crossingIndex++,junction.x+dx,.165,junction.z-6.1,0,.8,.008,3.2);
   for(const dz of [-2.4,-.8,.8,2.4])place(this.crossings,crossingIndex++,junction.x-6.2,.166,junction.z+dz,0,3.2,.008,.8);
  }
  for(const mesh of [this.poles,this.heads,this.bulbs,this.crossings]){
   mesh.instanceMatrix.needsUpdate=true;
   // Static bounds are computed once; signal changes only alter per-instance color.
   mesh.computeBoundingSphere();const cells=spatialInstanceCells(mesh,root,384);this.cells.push(...cells);if(mesh===this.bulbs)this.bulbCells=cells;
  }
  this.update(0);
  if(this.bulbs.instanceColor)this.bulbs.instanceColor.setUsage(THREE.DynamicDrawUsage);
 }
 update(seconds:number){
  if(this.disposed)return;
  const ns=signalState(seconds,'ns'),ew=signalState(seconds,'ew'),key=`${ns}:${ew}`;
  if(key===this.lastPhase)return;this.lastPhase=key;
  const color=new THREE.Color();let i=0;
  for(const axis of this.signalAxes){
   const state=axis==='ns'?ns:ew;
   for(const name of ['red','yellow','green'] as const){color.setHex(bulbColors[name][state===name?1:0]);this.bulbs.setColorAt(i++,color);}
  }
  if(this.bulbs.instanceColor)this.bulbs.instanceColor.needsUpdate=true;
  syncSpatialInstanceColors(this.bulbs,this.bulbCells);
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;
  for(const{mesh}of this.cells){mesh.removeFromParent();mesh.dispose();}
  for(const mesh of [this.poles,this.heads,this.bulbs,this.crossings]){
   mesh.removeFromParent();mesh.dispose();mesh.geometry.dispose();
   for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();
  }
 }
}
