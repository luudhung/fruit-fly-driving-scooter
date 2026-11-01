import * as THREE from 'three';

type Point={x:number;y?:number;z:number};
type CityVisitorSnapshot={taxiJobs?:Array<{id:string;driverId:string;phase:string;x?:number;z?:number}>;photos?:Array<{id:string;at:number;camera:Point}>;communityEvent?:{locationId:string;endsAt:number;attendees:string[]}|null};
/** Presentation only. Visitor bodies come from the main shared resident renderer. */
export class CityVisitorsRenderer{
 private taxis:THREE.InstancedMesh;
 private flashes:THREE.InstancedMesh;
 private dummy=new THREE.Object3D();
 private data:CityVisitorSnapshot={};
 private positions=new Map<string,Point>();
 constructor(root:THREE.Object3D){
  this.taxis=new THREE.InstancedMesh(new THREE.BoxGeometry(.82,.26,.46),new THREE.MeshBasicMaterial({color:0xffdf60,toneMapped:false}),6);
  this.flashes=new THREE.InstancedMesh(new THREE.SphereGeometry(.38,6,4),new THREE.MeshBasicMaterial({color:0xfff2b2,toneMapped:false,transparent:true,opacity:.85}),16);
  for(const m of [this.taxis,this.flashes]){m.count=0;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;root.add(m);}
 }
 sync(data:CityVisitorSnapshot,actors:Array<Point&{id:string}> = []){this.data=data||{};this.positions=new Map(actors.map(a=>[a.id,a]));}
 updateActor(id:string,point:Point){this.positions.set(id,point);}
 update(_dt:number,gameNow:number){
  let n=0;
  for(const job of this.data.taxiJobs||[]){
   if(n>=6)break;const p=this.positions.get(job.driverId)||{x:job.x??0,z:job.z??0};
   this.dummy.position.set(p.x,1.86,p.z);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();this.taxis.setMatrixAt(n++,this.dummy.matrix);
  }
  this.taxis.count=n;this.taxis.instanceMatrix.needsUpdate=true;n=0;
  for(const photo of this.data.photos||[]){
   const age=gameNow-photo.at;if(age<0||age>90||n>=16)continue;
   const p=photo.camera;this.dummy.position.set(p.x,(p.y??1.1)+.9,p.z);this.dummy.scale.setScalar(Math.max(.05,1-age/90));this.dummy.updateMatrix();this.flashes.setMatrixAt(n++,this.dummy.matrix);
  }
  this.flashes.count=n;this.flashes.instanceMatrix.needsUpdate=true;
 }
 dispose(){for(const m of [this.taxis,this.flashes]){m.removeFromParent();m.geometry.dispose();(m.material as THREE.Material).dispose();}}
}
