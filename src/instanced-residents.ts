import * as THREE from 'three';

// Every resident uses the same fixed pose. Only the instance position/age scale changes.
// Five hundred residents cost three body draw calls, with no per-fly wing/body animation.
export class InstancedResidents {
  readonly thorax:THREE.InstancedMesh;
  readonly abdomen:THREE.InstancedMesh;
  readonly wings:THREE.InstancedMesh;
  readonly pickables:THREE.Object3D[];
  private readonly dummy=new THREE.Object3D();
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
  }
  begin(){this.count=0;this.ids.length=0;}
  add(id:string,x:number,y:number,z:number,scale:number,visible=true){
    if(!visible||this.count>=this.capacity)return;
    const i=this.count++,d=this.dummy;this.ids[i]=id;
    d.rotation.set(0,0,0);d.position.set(x,y,z);d.scale.set(scale,.82*scale,1.12*scale);d.updateMatrix();this.thorax.setMatrixAt(i,d.matrix);
    d.position.set(x,y,z+.55*scale);d.scale.set(.88*scale,.74*scale,1.45*scale);d.updateMatrix();this.abdomen.setMatrixAt(i,d.matrix);
    for(let side=0;side<2;side++){
      const sx=side===0?-1:1;d.rotation.set(Math.PI/2.7,0,sx*.72);d.position.set(x+sx*.42*scale,y+.26*scale,z+.06*scale);d.scale.set(1.35*scale,.55*scale,scale);d.updateMatrix();this.wings.setMatrixAt(i*2+side,d.matrix);
    }
  }
  finish(){
    this.thorax.count=this.abdomen.count=this.count;this.wings.count=this.count*2;
    for(const mesh of [this.thorax,this.abdomen,this.wings]){mesh.instanceMatrix.needsUpdate=true;mesh.boundingSphere=null;}
  }
  flyId(instanceId:number|undefined){return instanceId===undefined?undefined:this.ids[instanceId];}
}
