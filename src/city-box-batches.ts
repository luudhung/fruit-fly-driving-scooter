import * as THREE from 'three';
import {SceneViewBudget} from './view-budget.ts';

type BuildingView={group:THREE.Group;sources:Source[];extras:Array<{object:THREE.Object3D;visible:boolean}>;localBounds:THREE.Box3;center:THREE.Vector3;radius:number;signature:string;active:boolean;windowStep:number;baked:boolean;sideX:number;sideZ:number;dirty:boolean};
type Source={mesh:THREE.Mesh<THREE.BoxGeometry,THREE.Material>;building:BuildingView;matrices:THREE.Matrix4[];colors:THREE.Color[];faces:Int8Array;start:number;signature:string;window:boolean};
type Batch={mesh:THREE.InstancedMesh<THREE.BoxGeometry,THREE.Material>;sources:Source[];facadeWindows?:THREE.InstancedBufferAttribute};

/** Source geometry remains available for restoration. After setView, only the
 * selected visible instances are submitted to the GPU. */
export class CityBoxBatches{
 readonly stats={sourceDraws:0,batchDraws:0,instances:0};
 readonly viewStats={activeInstances:0,activeBuildings:0,bakedBuildings:0,activeBatches:0};
 private batches:Batch[]=[];private buildings:BuildingView[]=[];
 private view=new SceneViewBudget({enterDistance:1400,leaveDistance:1530,frustumMargin:18,retainedMargin:34});
 private budgeted=false;private lastCamera=new THREE.Vector3(Infinity,Infinity,Infinity);private lastDirection=new THREE.Vector3();private direction=new THREE.Vector3();private lastRefresh=-Infinity;
 private matrix=new THREE.Matrix4();private inverse=new THREE.Matrix4();private color=new THREE.Color();private worldBounds=new THREE.Box3();private sphere=new THREE.Sphere();private localCamera=new THREE.Vector3();
 constructor(root:THREE.Group,groups:THREE.Group[],cellSize=192,onMaterial?:(material:THREE.Material)=>void){
  const buckets=new Map<string,{material:THREE.Material;sources:Source[]}>(),local=new THREE.Matrix4(),color=new THREE.Color(),unit=new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5)),bounds=new THREE.Box3();
  for(const group of groups){
   group.updateMatrix();
   const building:BuildingView={group,sources:[],extras:[],localBounds:new THREE.Box3(),center:new THREE.Vector3(),radius:1,signature:'',active:true,windowStep:1,baked:false,sideX:0,sideZ:0,dirty:true};this.buildings.push(building);
   for(const object of group.children){
    if(!(object instanceof THREE.Mesh)||!(object.geometry instanceof THREE.BoxGeometry)||Array.isArray(object.material)||(object.material.userData.cityFacade&&!object.material.userData.normalizedFacade)){building.extras.push({object,visible:object.visible});continue;}
    const material=object.material as THREE.Material&{color?:THREE.Color};if(material.transparent||!material.color){building.extras.push({object,visible:object.visible});continue;}
    const json=material.toJSON() as unknown as Record<string,unknown>;for(const field of ['uuid','color','metadata'])delete json[field];
    const key=`${Math.floor(group.position.x/cellSize)}:${Math.floor(group.position.z/cellSize)}:${JSON.stringify(json)}`;
    let bucket=buckets.get(key);if(!bucket){const copy=material.clone() as typeof material;copy.color!.setHex(0xffffff);if(material.userData.normalizedFacade){copy.onBeforeCompile=material.onBeforeCompile;copy.customProgramCacheKey=material.customProgramCacheKey;}bucket={material:copy,sources:[]};buckets.set(key,bucket);onMaterial?.(copy);}
    object.updateMatrix();const p=object.geometry.parameters,dimensions=new THREE.Matrix4().makeScale(p.width,p.height,p.depth),matrices:THREE.Matrix4[]=[],colors:THREE.Color[]=[];
    const instances=object instanceof THREE.InstancedMesh?object.count:1,faces=new Int8Array(instances);
    for(let i=0;i<instances;i++){
     if(object instanceof THREE.InstancedMesh)object.getMatrixAt(i,local);else local.identity();
     const transform=new THREE.Matrix4().multiplyMatrices(object.matrix,local).multiply(dimensions);matrices.push(transform);building.localBounds.union(bounds.copy(unit).applyMatrix4(transform));
     color.setHex(0xffffff);if(object instanceof THREE.InstancedMesh&&object.instanceColor)object.getColorAt(i,color);colors.push(color.clone());
     const e=transform.elements,w=Math.hypot(e[0],e[1],e[2]),d=Math.hypot(e[8],e[9],e[10]);
     if(w<.15&&d>w*3)faces[i]=e[12]>=0?1:-1;else if(d<.15&&w>d*3)faces[i]=e[14]>=0?2:-2;
    }
    const source:Source={mesh:object as Source['mesh'],building,matrices,colors,faces,start:0,signature:'',window:Boolean(material.userData.cityWindow)};
    building.sources.push(source);bucket.sources.push(source);object.visible=false;this.stats.sourceDraws++;this.stats.instances+=instances;
   }
   if(building.localBounds.isEmpty())building.localBounds.set(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,1,1));
  }
  for(const bucket of buckets.values()){
   let count=0;for(const source of bucket.sources){source.start=count;count+=source.matrices.length;}
   const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),bucket.material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);this.batches.push({mesh,sources:bucket.sources});this.stats.batchDraws++;
  }
  this.sync();
 }
 /** Far windows are painted on an existing facade, rather than hundreds of boxes. */
 private enableFacadeWindows(batch:Batch){
  if(!batch.mesh.material.userData.normalizedFacade)return;
  const material=batch.mesh.material,compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{
   compile.call(material,shader,renderer);
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute float instanceFacadeWindows;varying float vBakedWindows;varying vec3 vBakedPosition;varying vec3 vBakedNormal;varying vec3 vBakedExtent;`)
    .replace('#include <begin_vertex>',`#include <begin_vertex>
vBakedWindows=instanceFacadeWindows;vBakedPosition=position;vBakedNormal=normal;
vBakedExtent=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying float vBakedWindows;varying vec3 vBakedPosition;varying vec3 vBakedNormal;varying vec3 vBakedExtent;`)
    .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
if(vBakedWindows>.5&&abs(vBakedNormal.y)<.5){
 float facadeWidth=abs(vBakedNormal.x)>.5?vBakedExtent.z:vBakedExtent.x;
 float horizontal=abs(vBakedNormal.x)>.5?vBakedPosition.z:vBakedPosition.x;
 vec2 p=vec2((horizontal+.5)*facadeWidth,(vBakedPosition.y+.5)*vBakedExtent.y);
 float columns=max(2.,floor(facadeWidth/2.7)),spacing=max(.5,(facadeWidth-2.5)/(columns-1.));
 vec2 cell=floor(vec2((p.x-1.25)/spacing,(p.y-1.8)/2.9)+.5);
 vec2 delta=abs(p-vec2(1.25+cell.x*spacing,1.8+cell.y*2.9)),aa=max(fwidth(p)*.6,vec2(.02));
 float windowMask=(1.-smoothstep(.46-aa.x,.46+aa.x,delta.x))*(1.-smoothstep(.56-aa.y,.56+aa.y,delta.y));
 windowMask*=step(0.,cell.x)*step(cell.x,columns-1.)*step(0.,cell.y)*step(cell.y,max(1.,floor(vBakedExtent.y/3.1))-1.);
 float room=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
 vec3 lit=room<.18?vec3(.035,.075,.12):room<.30?vec3(.36,.56,.66):room<.67?vec3(1.,.69,.34):vec3(.81,.51,.25);
 diffuseColor.rgb=mix(diffuseColor.rgb,lit,windowMask*.65);totalEmissiveRadiance+=lit*windowMask*.65;
}`);
  };
  material.customProgramCacheKey=()=>key()+'-baked-windows-v1';material.needsUpdate=true;
  batch.facadeWindows=new THREE.InstancedBufferAttribute(new Float32Array(batch.mesh.instanceMatrix.count),1);batch.mesh.geometry.setAttribute('instanceFacadeWindows',batch.facadeWindows);
 }
 setView(camera:THREE.Camera){
  camera.updateMatrixWorld();const now=performance.now(),position=this.localCamera.setFromMatrixPosition(camera.matrixWorld);camera.getWorldDirection(this.direction);
  if(this.budgeted&&position.distanceToSquared(this.lastCamera)<64&&this.direction.dot(this.lastDirection)>.98&&now-this.lastRefresh<90)return;
  if(!this.budgeted){this.budgeted=true;for(const batch of this.batches)this.enableFacadeWindows(batch);}
  this.lastRefresh=now;this.lastCamera.copy(position);this.lastDirection.copy(this.direction);this.view.setCamera(camera);this.updateBuildingViews();this.rebuildVisibleBatches();
 }
 isGroupVisible(group:THREE.Group){return this.buildings.find(b=>b.group===group)?.active??group.visible;}
 isBuildingVisible(id:string){return this.buildings.find(b=>b.group.userData.buildingId===id)?.active??true;}
 private updateBuildingViews(){
  for(const building of this.buildings){
   const {group}=building;this.worldBounds.copy(building.localBounds).applyMatrix4(group.matrix).getBoundingSphere(this.sphere);building.center.copy(this.sphere.center);building.radius=this.sphere.radius;
   const active=group.visible&&this.view.visible(building.center,building.active,building.radius),distance=Math.sqrt(this.view.distanceSquared(building.center));
   const windowStep=distance<135?1:distance<225?3:0,baked=distance>=160;
   this.localCamera.copy(this.view.origin).applyMatrix4(this.inverse.copy(group.matrix).invert());
   const sideX=this.localCamera.x>building.localBounds.max.x?1:this.localCamera.x<building.localBounds.min.x?-1:0,sideZ=this.localCamera.z>building.localBounds.max.z?1:this.localCamera.z<building.localBounds.min.z?-1:0;
   if(active!==building.active||windowStep!==building.windowStep||baked!==building.baked||sideX!==building.sideX||sideZ!==building.sideZ)building.dirty=true;
   Object.assign(building,{active,windowStep,baked,sideX,sideZ});for(const extra of building.extras)extra.object.visible=extra.visible&&active;
  }
 }
 private rebuildVisibleBatches(){
  let activeInstances=0,activeBatches=0;
  for(const batch of this.batches){
   if(batch.sources.some(source=>source.building.dirty)){
    let index=0;
    for(const source of batch.sources){
     const building=source.building;if(!building.active||source.window&&!building.windowStep)continue;
     const material=source.mesh.material as THREE.Material&{color:THREE.Color},step=source.window?building.windowStep:1;
     for(let i=0;i<source.matrices.length;i+=step){
      const face=source.faces[i];if(source.window&&face&&(Math.abs(face)===1?building.sideX!==face:building.sideZ!==face/2))continue;
      this.matrix.multiplyMatrices(building.group.matrix,source.matrices[i]);batch.mesh.setMatrixAt(index,this.matrix);this.color.copy(source.colors[i]).multiply(material.color);batch.mesh.setColorAt(index,this.color);batch.facadeWindows?.setX(index,building.baked?1:0);index++;
     }
    }
    batch.mesh.count=index;batch.mesh.visible=index>0;batch.mesh.instanceMatrix.needsUpdate=true;if(batch.mesh.instanceColor)batch.mesh.instanceColor.needsUpdate=true;if(batch.facadeWindows)batch.facadeWindows.needsUpdate=true;batch.mesh.computeBoundingBox();batch.mesh.computeBoundingSphere();
   }
   activeInstances+=batch.mesh.count;if(batch.mesh.count)activeBatches++;
  }
  Object.assign(this.viewStats,{activeInstances,activeBatches,activeBuildings:this.buildings.filter(b=>b.active).length,bakedBuildings:this.buildings.filter(b=>b.active&&b.baked).length});for(const building of this.buildings)building.dirty=false;
 }
 sync(){
  if(!this.budgeted){
   const matrix=new THREE.Matrix4(),color=new THREE.Color(),hidden=new THREE.Matrix4().makeScale(0,0,0),updated=new Set<THREE.Group>();
   for(const batch of this.batches){let changed=false;
    for(const source of batch.sources){const group=source.building.group;if(!updated.has(group)){if(group.matrixAutoUpdate)group.updateMatrix();updated.add(group);}
     const material=source.mesh.material as THREE.Material&{color:THREE.Color},signature=`${group.visible}:${group.matrix.elements.join(',')}:${material.color.getHexString()}`;if(signature===source.signature)continue;source.signature=signature;changed=true;
     for(let i=0;i<source.matrices.length;i++){matrix.multiplyMatrices(group.matrix,source.matrices[i]);batch.mesh.setMatrixAt(source.start+i,group.visible?matrix:hidden);color.copy(source.colors[i]).multiply(material.color);batch.mesh.setColorAt(source.start+i,color);}
    }
    if(changed){batch.mesh.instanceMatrix.needsUpdate=true;if(batch.mesh.instanceColor)batch.mesh.instanceColor.needsUpdate=true;batch.mesh.computeBoundingBox();batch.mesh.computeBoundingSphere();}
   }
   return;
  }
  for(const building of this.buildings){
   if(building.group.matrixAutoUpdate)building.group.updateMatrix();
   const signature=`${building.group.visible}:${building.group.matrix.elements.join(',')}:${building.sources.map(source=>(source.mesh.material as THREE.Material&{color:THREE.Color}).color.getHexString()).join(',')}`;
   if(signature!==building.signature){building.signature=signature;building.dirty=true;}
  }
  this.updateBuildingViews();this.rebuildVisibleBatches();
 }
}
