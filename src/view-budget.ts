import * as THREE from 'three';

export type ViewPoint={x:number;y?:number;z:number};
export type ViewBudgetOptions={enterDistance?:number;leaveDistance?:number;frustumMargin?:number;retainedMargin?:number};
/** Presentation-only interest volume. Authoritative actor data is never removed. */
export class SceneViewBudget{
 readonly origin=new THREE.Vector3();
 private frustum=new THREE.Frustum();
 private projection=new THREE.Matrix4();
 private sphere=new THREE.Sphere();
 private ready=false;
 readonly enterDistance:number;
 readonly leaveDistance:number;
 private margin:number;
 private retainedMargin:number;
 constructor(options:ViewBudgetOptions={}){
  this.enterDistance=options.enterDistance??480;
  this.leaveDistance=Math.max(this.enterDistance,options.leaveDistance??540);
  this.margin=options.frustumMargin??12;
  this.retainedMargin=Math.max(this.margin,options.retainedMargin??28);
 }
 setCamera(camera:THREE.Camera){
  camera.updateMatrixWorld();this.origin.setFromMatrixPosition(camera.matrixWorld);
  this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  this.frustum.setFromProjectionMatrix(this.projection,THREE.WebGLCoordinateSystem,camera.reversedDepth);this.ready=true;
 }
 distanceSquared(point:ViewPoint){const dx=point.x-this.origin.x,dy=(point.y??1.1)-this.origin.y,dz=point.z-this.origin.z;return dx*dx+dy*dy+dz*dz;}
 visible(point:ViewPoint,retained=false,radius=0){
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z)||point.y!==undefined&&!Number.isFinite(point.y))return false;
  if(!this.ready)return true;
  const distance=retained?this.leaveDistance:this.enterDistance;
  if(this.distanceSquared(point)>(distance+radius)*(distance+radius))return false;
  this.sphere.center.set(point.x,point.y??1.1,point.z);this.sphere.radius=radius+(retained?this.retainedMargin:this.margin);
  return this.frustum.intersectsSphere(this.sphere);
 }
}

/** Existing IDs get eight metres of rank hysteresis at any viewing distance. */
export function selectViewBudget<T>(items:readonly T[],view:SceneViewBudget,point:(item:T)=>ViewPoint|null,id:(item:T)=>string,retained:ReadonlySet<string>,limit:number):T[]{
 const candidates:Array<{item:T;score:number;id:string}>=[];
 for(const item of items){const p=point(item);if(!p)continue;const key=id(item),held=retained.has(key);if(!view.visible(p,held))continue;
  const distance=Math.sqrt(view.distanceSquared(p));
  candidates.push({item,id:key,score:Math.max(0,distance-(held?8:0))});
 }
 candidates.sort((a,b)=>a.score-b.score||(a.id<b.id?-1:a.id>b.id?1:0));
 return candidates.slice(0,Math.max(0,limit)).map(c=>c.item);
}
