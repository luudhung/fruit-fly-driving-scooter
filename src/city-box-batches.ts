import * as THREE from 'three';

type Source={mesh:THREE.Mesh<THREE.BoxGeometry,THREE.Material>;group:THREE.Group;matrices:THREE.Matrix4[];colors:THREE.Color[];start:number;signature:string};
type Batch={mesh:THREE.InstancedMesh;sources:Source[]};
/** Spatial batches retain every original box, color and transform. Source objects remain available
 * to the urban damage/construction system, but only these batches submit their geometry. */
export class CityBoxBatches{
 readonly stats={sourceDraws:0,batchDraws:0,instances:0};
 private batches:Batch[]=[];
 constructor(root:THREE.Group,groups:THREE.Group[],cellSize=192,onMaterial?:(material:THREE.Material)=>void){
  const buckets=new Map<string,{material:THREE.Material;sources:Source[]}>(),local=new THREE.Matrix4(),color=new THREE.Color();
  for(const group of groups){
   group.updateMatrix();
   for(const object of group.children){
    if(!(object instanceof THREE.Mesh)||!(object.geometry instanceof THREE.BoxGeometry)||Array.isArray(object.material)||(object.material.userData.cityFacade&&!object.material.userData.normalizedFacade))continue;
    const material=object.material as THREE.Material&{color?:THREE.Color};if(material.transparent||!material.color)continue;
    const json=material.toJSON() as unknown as Record<string,unknown>;for(const field of ['uuid','color','metadata'])delete json[field];
    const key=`${Math.floor(group.position.x/cellSize)}:${Math.floor(group.position.z/cellSize)}:${JSON.stringify(json)}`;
    let bucket=buckets.get(key);if(!bucket){const copy=material.clone() as typeof material;copy.color!.setHex(0xffffff);if(material.userData.normalizedFacade){copy.onBeforeCompile=material.onBeforeCompile;copy.customProgramCacheKey=material.customProgramCacheKey;}bucket={material:copy,sources:[]};buckets.set(key,bucket);onMaterial?.(copy);}
    object.updateMatrix();const p=object.geometry.parameters,dimensions=new THREE.Matrix4().makeScale(p.width,p.height,p.depth),matrices:THREE.Matrix4[]=[],colors:THREE.Color[]=[];
    const instances=object instanceof THREE.InstancedMesh?object.count:1;
    for(let i=0;i<instances;i++){
     if(object instanceof THREE.InstancedMesh)object.getMatrixAt(i,local);else local.identity();
     matrices.push(new THREE.Matrix4().multiplyMatrices(object.matrix,local).multiply(dimensions));
     color.setHex(0xffffff);if(object instanceof THREE.InstancedMesh&&object.instanceColor)object.getColorAt(i,color);colors.push(color.clone());
    }
    bucket.sources.push({mesh:object as Source['mesh'],group,matrices,colors,start:0,signature:''});object.visible=false;this.stats.sourceDraws++;this.stats.instances+=instances;
   }
  }
  for(const bucket of buckets.values()){
   let count=0;for(const source of bucket.sources){source.start=count;count+=source.matrices.length;}
   const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),bucket.material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);this.batches.push({mesh,sources:bucket.sources});this.stats.batchDraws++;
  }
  this.sync();
 }
 sync(){
  const matrix=new THREE.Matrix4(),color=new THREE.Color(),hidden=new THREE.Matrix4().makeScale(0,0,0);
  const updated=new Set<THREE.Group>();
  for(const batch of this.batches){let changed=false;
   for(const source of batch.sources){
    if(!updated.has(source.group)){if(source.group.matrixAutoUpdate)source.group.updateMatrix();updated.add(source.group);}
    const material=source.mesh.material as THREE.Material&{color:THREE.Color};
    const signature=`${source.group.visible}:${source.group.matrix.elements.join(',')}:${material.color.getHexString()}`;if(signature===source.signature)continue;source.signature=signature;changed=true;
    for(let i=0;i<source.matrices.length;i++){
     matrix.multiplyMatrices(source.group.matrix,source.matrices[i]);batch.mesh.setMatrixAt(source.start+i,source.group.visible?matrix:hidden);color.copy(source.colors[i]).multiply(material.color);batch.mesh.setColorAt(source.start+i,color);
    }
   }
   if(changed){batch.mesh.instanceMatrix.needsUpdate=true;if(batch.mesh.instanceColor)batch.mesh.instanceColor.needsUpdate=true;batch.mesh.computeBoundingBox();batch.mesh.computeBoundingSphere();}
  }
 }
}
