import * as THREE from 'three';
import {BRIDGES,UNDERPASSES,WATER,PARKING_SPACES,METRO_LINES,metroStationGeometry,contains,type Rect,type Building} from '../worker/city-map.mjs';

/** Three instanced draws, independent of lamp count: posts, bulbs and soft ground pools. */
export class StreetLighting{
 private bulbs:THREE.MeshBasicMaterial;
 private pools:THREE.ShaderMaterial;
 private poolMesh:THREE.InstancedMesh;
 readonly count:number;
 readonly lightPositions:Array<{x:number;y:number;z:number}>;
 constructor(root:THREE.Group,roads:Rect[],buildings:Building[]){
  const lamps:Array<{x:number;z:number;dx:number;dz:number}>=[];
  const stairs=METRO_LINES.flatMap(l=>l.points.flatMap((_,i)=>metroStationGeometry(l,i).stairs));
  const clear=(x:number,z:number)=>!roads.some(r=>contains(r,{x,z},.25))&&!PARKING_SPACES.some(s=>contains(s,{x,z},.5))&&!stairs.some(s=>Math.hypot(s.x-x,s.z-z)<1.7)&&!buildings.some(b=>contains(b,{x,z},.8))&&!WATER.some(w=>contains(w,{x,z},.4))&&!BRIDGES.some(b=>contains(b,{x,z},3))&&!UNDERPASSES.some(u=>Math.abs(x-u.x)<u.w/2+5&&Math.abs(z-u.z)<u.halfLength+4);
  for(const r of roads){const ns=r.d>r.w,len=ns?r.d:r.w,width=ns?r.w:r.d;if(len<26||width<5.5)continue;
   // Place within each block, rather than sampling every 30m across the whole road.
   // A regular sample otherwise lands in every junction on the 26–29m core grid.
   const origin=ns?r.z:r.x,lo=origin-len/2,hi=origin+len/2;
   const cuts=[lo,...roads.filter(o=>(o.d>o.w)!==ns).filter(o=>ns?Math.abs(o.x-r.x)<=o.w/2:Math.abs(o.z-r.z)<=o.d/2).map(o=>ns?o.z:o.x).filter(v=>v>lo&&v<hi),hi].sort((a,b)=>a-b);
   const sites:number[]=[];
   for(let i=1;i<cuts.length;i++){const gap=cuts[i]-cuts[i-1];if(gap<16)continue;const count=Math.max(1,Math.floor(gap/32));for(let j=0;j<count;j++)sites.push(cuts[i-1]+(j+.5)*gap/count-origin);}
   for(const along of sites){
    const cx=r.x+(ns?0:along),cz=r.z+(ns?along:0);
    // Keep junction sightlines and all crossing road mouths clear.
    if(roads.some(other=>other!==r&&(other.d>other.w)!==ns&&contains(other,{x:cx,z:cz},3.5)))continue;
    for(const side of [-1,1]){const dx=ns?side:0,dz=ns?0:side,x=cx+dx*(width/2+1.65),z=cz+dz*(width/2+1.65);
     if(!clear(x,z)||lamps.some(l=>Math.hypot(l.x-x,l.z-z)<15))continue;lamps.push({x,z,dx,dz});
    }
   }
  }
  this.count=lamps.length;this.lightPositions=lamps.map(l=>({x:l.x-l.dx*1.3,y:5.96,z:l.z-l.dz*1.3}));
  const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x354047,roughness:.72,metalness:.36}),lamps.length*2);
  this.bulbs=new THREE.MeshBasicMaterial({color:0xffd695,toneMapped:false,transparent:true,opacity:.1});
  const bulbs=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),this.bulbs,lamps.length);
  this.pools=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,blending:THREE.AdditiveBlending,uniforms:{night:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float night;void main(){float d=length((vUv-.5)*2.);float a=pow(max(0.,1.-d),2.)*.31*night;gl_FragColor=vec4(vec3(1.,.66,.30),a);}' });
  const pools=this.poolMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),this.pools,lamps.length),dummy=new THREE.Object3D();pools.visible=false;
  lamps.forEach((l,i)=>{
   dummy.rotation.set(0,0,0);dummy.position.set(l.x,3.15,l.z);dummy.scale.set(.18,6,.18);dummy.updateMatrix();posts.setMatrixAt(i*2,dummy.matrix);
   dummy.position.set(l.x-l.dx*.65,6.06,l.z-l.dz*.65);dummy.scale.set(l.dx?1.5:.16,.15,l.dz?1.5:.16);dummy.updateMatrix();posts.setMatrixAt(i*2+1,dummy.matrix);
   dummy.position.set(l.x-l.dx*1.3,5.96,l.z-l.dz*1.3);dummy.scale.set(.37,.16,.37);dummy.updateMatrix();bulbs.setMatrixAt(i,dummy.matrix);
   dummy.rotation.x=-Math.PI/2;dummy.position.set(l.x-l.dx*1.6,.255,l.z-l.dz*1.6);dummy.scale.set(14,14,1);dummy.updateMatrix();pools.setMatrixAt(i,dummy.matrix);
  });
  posts.instanceMatrix.needsUpdate=bulbs.instanceMatrix.needsUpdate=pools.instanceMatrix.needsUpdate=true;posts.computeBoundingSphere();bulbs.computeBoundingSphere();pools.computeBoundingSphere();root.add(posts,bulbs,pools);
 }
 update(night:number){const n=Math.max(0,Math.min(1,night));this.bulbs.opacity=.08+n*.92;this.pools.uniforms.night.value=n*n;this.poolMesh.visible=n>.05;}
}
