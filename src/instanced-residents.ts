import * as THREE from 'three';

// Every resident uses the same fixed pose. Only the instance position/age scale changes.
// Five hundred residents cost three body draw calls, with no per-fly wing/body animation.
export class InstancedResidents {
  readonly thorax:THREE.InstancedMesh;
  readonly abdomen:THREE.InstancedMesh;
  readonly wings:THREE.InstancedMesh;
  readonly pickables:THREE.Object3D[];
  private readonly poses:THREE.Matrix4[]=[];
  private readonly slots:Array<{x:number;y:number;z:number;scale:number}>=[];
  private dirty=false;
  private readonly ids:string[]=[];
  private count=0;
  readonly capacity:number;
  constructor(scene:THREE.Scene,capacity=640){
    this.capacity=capacity;
    this.thorax=new THREE.InstancedMesh(new THREE.SphereGeometry(.45,7,5),new THREE.MeshStandardMaterial({color:0x33261f,roughness:.55}),capacity);
    this.abdomen=new THREE.InstancedMesh(new THREE.SphereGeometry(.38,7,5),new THREE.MeshStandardMaterial({color:0x5a3f2a,roughness:.65}),capacity);
    this.wings=new THREE.InstancedMesh(new THREE.CircleGeometry(.58,7),new THREE.MeshStandardMaterial({color:0xdcecff,transparent:true,opacity:.48,roughness:.15,side:THREE.DoubleSide,depthWrite:false}),capacity*2);
    for(const mesh of [this.thorax,this.abdomen,this.wings]){
      mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);
    }
    this.pickables=[this.thorax,this.abdomen];
    // Keep rotation coefficients in double precision, matching Object3D.compose before float upload.
    const pose=new THREE.Object3D();
    this.poses.push(new THREE.Matrix4(),new THREE.Matrix4());
    for(const side of [-1,1]){
      pose.rotation.set(Math.PI/2.7,0,side*.72);pose.updateMatrix();this.poses.push(pose.matrix.clone());
    }
  }
  begin(){this.count=0;this.ids.length=0;this.dirty=false;}
  private write(mesh:THREE.InstancedMesh,index:number,pose:THREE.Matrix4,x:number,y:number,z:number,sx:number,sy:number,sz:number){
    const array=mesh.instanceMatrix.array,e=pose.elements,offset=index*16;
    for(let k=0;k<4;k++){array[offset+k]=e[k]*sx;array[offset+4+k]=e[4+k]*sy;array[offset+8+k]=e[8+k]*sz;}
    array[offset+12]=x;array[offset+13]=y;array[offset+14]=z;array[offset+15]=1;
  }
  add(id:string,x:number,y:number,z:number,scale:number,visible=true){
    if(!visible||this.count>=this.capacity)return;
    const i=this.count++;this.ids[i]=id;
    // The cached slot owns geometry only; picking IDs must still follow the current census order.
    const previous=this.slots[i];
    if(previous&&previous.x===x&&previous.y===y&&previous.z===z&&previous.scale===scale)return;
    if(previous){previous.x=x;previous.y=y;previous.z=z;previous.scale=scale;}
    else this.slots[i]={x,y,z,scale};
    this.dirty=true;
    this.write(this.thorax,i,this.poses[0],x,y,z,scale,.82*scale,1.12*scale);
    this.write(this.abdomen,i,this.poses[1],x,y,z+.55*scale,.88*scale,.74*scale,1.45*scale);
    for(let side=0;side<2;side++){
      const sx=side===0?-1:1;
      this.write(this.wings,i*2+side,this.poses[2+side],x+sx*.42*scale,y+.26*scale,z+.06*scale,1.35*scale,.55*scale,scale);
    }
  }
  finish(){
    this.thorax.count=this.abdomen.count=this.count;this.wings.count=this.count*2;
    for(const mesh of [this.thorax,this.abdomen,this.wings]){if(this.dirty)mesh.instanceMatrix.needsUpdate=true;mesh.boundingSphere=null;}
  }
  flyId(instanceId:number|undefined){return instanceId===undefined?undefined:this.ids[instanceId];}
}
