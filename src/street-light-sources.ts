import * as THREE from 'three';
type Lamp={x:number;y:number;z:number};
/** A fixed light budget keeps real PBR illumination local to the visible street, entirely on the viewer. */
export class StreetLightSources{
 private lights:THREE.SpotLight[]=[];private activeCount=0;private elapsed=Infinity;private oldX=Infinity;private oldZ=Infinity;
 private direction=new THREE.Vector3();private focus=new THREE.Vector3();private previousLamps:readonly Lamp[]=[];
 constructor(scene:THREE.Scene,private anchors:()=>readonly Lamp[],budget:number){
  for(let i=0;i<budget;i++){
   const light=new THREE.SpotLight(0xffd091,0,25,.87,.68,2);light.castShadow=false;light.visible=false;scene.add(light,light.target);this.lights.push(light);
  }
 }
 update(dt:number,camera:THREE.Camera,night:number,force=false){
  const strength=THREE.MathUtils.smoothstep(night,.18,.82),on=strength>.01;
  this.lights.forEach((light,i)=>{light.visible=on&&i<this.activeCount;light.intensity=i<this.activeCount?145*strength:0;});
  if(!on)return;this.elapsed+=Math.max(0,dt);const lamps=this.anchors();
  camera.getWorldDirection(this.direction);this.focus.copy(camera.position);
  if(camera.position.y>20&&this.direction.y<-.15){const distance=Math.min(900,-camera.position.y/this.direction.y);this.focus.addScaledVector(this.direction,distance);}
  if(!force&&lamps===this.previousLamps&&this.elapsed<.45&&Math.hypot(this.focus.x-this.oldX,this.focus.z-this.oldZ)<12)return;
  this.elapsed=0;this.oldX=this.focus.x;this.oldZ=this.focus.z;this.previousLamps=lamps;
  const nearby=lamps.map(p=>({p,d:(p.x-this.focus.x)**2+(p.z-this.focus.z)**2})).sort((a,b)=>a.d-b.d).slice(0,this.lights.length);
  this.activeCount=nearby.length;this.lights.forEach((light,i)=>{light.visible=on&&i<this.activeCount;light.intensity=i<this.activeCount?145*strength:0;const entry=nearby[i];if(!entry){light.intensity=0;return;}const p=entry.p;light.position.set(p.x,p.y,p.z);light.target.position.set(p.x,.12,p.z);});
 }
}
