import * as THREE from 'three';
import {nationalProjectilePose,type NationalDefenseSnapshot} from '../worker/national-defense.mjs';
import {nationalTrainingAircraftPose,type NationalServicesSnapshot} from '../worker/national-services.mjs';
/** Three bounded instance batches. Actual snapshot IDs are the only sources of
 * aircraft, projectiles and impacts; effects never create population or lights. */
export class NationalDefenseRenderer{
 readonly root=new THREE.Group();
 readonly stats={missiles:0,impacts:0,aircraft:0};
 private defense:NationalDefenseSnapshot|undefined;
 private services:NationalServicesSnapshot|undefined;
 private readonly missiles:THREE.InstancedMesh;
 private readonly impacts:THREE.InstancedMesh;
 private readonly aircraft:THREE.InstancedMesh;
 private readonly dummy=new THREE.Object3D();
 private readonly axis=new THREE.Vector3(0,0,1);
 private readonly direction=new THREE.Vector3();
 constructor(parent:THREE.Object3D){
  this.root.name='National defense events';parent.add(this.root);
  this.missiles=new THREE.InstancedMesh(new THREE.ConeGeometry(.24,2.5,5).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:0xffc77e,toneMapped:false}),32);
  this.impacts=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshBasicMaterial({color:0xe8a765,transparent:true,opacity:.65,depthWrite:false,toneMapped:false}),32);
  const geometry=new THREE.BufferGeometry(),body=new THREE.BoxGeometry(1.5,1,8),wing=new THREE.BoxGeometry(10,.15,2.3),tail=new THREE.BoxGeometry(4,.15,1.4);tail.translate(0,.3,-3);
  const arrays=[body,wing,tail].map(g=>g.toNonIndexed()),vertices=arrays.flatMap(g=>[...g.getAttribute('position').array]);geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();for(const g of [...arrays,body,wing,tail])g.dispose();
  this.aircraft=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:0x788d89,roughness:.7}),4);
  for(const mesh of [this.missiles,this.impacts,this.aircraft]){mesh.count=0;mesh.frustumCulled=false;mesh.userData.dynamicCity=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(mesh);}
 }
 sync(defense?:NationalDefenseSnapshot,services?:NationalServicesSnapshot){this.defense=defense;this.services=services;}
 update(now:number,timeScale=120){const d=this.dummy;let missiles=0,impacts=0,aircraft=0;
  for(const p of this.defense?.projectiles||[]){if(missiles>=32)break;if(p.cancelledAt||p.resolvedAt||now<p.launchedAt||now>=p.impactAt)continue;const a=nationalProjectilePose(now,p),b=nationalProjectilePose(Math.min(p.impactAt,now+1),p);d.position.set(a.x,a.y,a.z);this.direction.set(b.x-a.x,b.y-a.y,b.z-a.z);if(this.direction.lengthSq()<1e-8)this.direction.set(p.to.x-p.from.x,p.to.y-p.from.y,p.to.z-p.from.z);d.quaternion.setFromUnitVectors(this.axis,this.direction.normalize());d.scale.set(1,1,1);d.updateMatrix();this.missiles.setMatrixAt(missiles++,d.matrix);}
  for(const e of this.defense?.events||[]){if(impacts>=32)break;const age=(now-e.at)/Math.max(1,timeScale);if(e.type!=='impact'||age<0||age>2||![e.x,e.y,e.z].every(Number.isFinite))continue;d.position.set(e.x,e.y+1,e.z);d.rotation.set(0,0,0);d.scale.setScalar(1+age*3);d.updateMatrix();this.impacts.setMatrixAt(impacts++,d.matrix);}
  for(const plane of this.services?.aircraft||[]){if(aircraft>=4)break;if(!plane.owned)continue;const p=nationalTrainingAircraftPose(now,plane);d.position.set(p.x,p.y,p.z);d.rotation.set(0,p.heading,0);d.scale.set(1,1,1);d.updateMatrix();this.aircraft.setMatrixAt(aircraft++,d.matrix);}
  for(const [mesh,count]of [[this.missiles,missiles],[this.impacts,impacts],[this.aircraft,aircraft]] as const){mesh.count=count;mesh.visible=count>0;if(count)mesh.instanceMatrix.needsUpdate=true;}
  this.stats.missiles=missiles;this.stats.impacts=impacts;this.stats.aircraft=aircraft;
 }
}
