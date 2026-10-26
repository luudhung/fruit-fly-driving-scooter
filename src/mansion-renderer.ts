import * as THREE from 'three';
import {mansionBoxes,mansionRooms,MANSION_FLOOR,MANSION_UPPER} from './mansion-layout.ts';
type Sign=(text:string,width:number,height:number)=>THREE.Sprite;
export function buildMansion(parent:THREE.Group,_sign:Sign){
 const sign:Sign=(text,w,h)=>{
  const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d')!;
  ctx.fillStyle='rgba(25,35,30,.7)';ctx.fillRect(0,0,1024,128);ctx.fillStyle='#f0e2b8';ctx.font=`600 ${Math.min(62,950/(text.length*.58))}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,64);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:true}));s.scale.set(w,h,1);return s;
 };
 const root=new THREE.Group();root.name='Hansdrex Mansion · fully walkable interiors';parent.add(root);
 const groups=new Map<string,typeof mansionBoxes>();
 for(const b of mansionBoxes){const key=`${b.color}:${b.finish||''}`;if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(b);}
 const transform=new THREE.Object3D(),geometry=new THREE.BoxGeometry(1,1,1);
 for(const boxes of groups.values()){
  const b=boxes[0],glass=b.finish==='glass',glow=b.finish==='glow';
  const material=new THREE.MeshStandardMaterial({color:b.color,roughness:glass?.16:b.finish==='gold'?.3:.7,metalness:b.finish==='gold'?.65:glass?.2:0,transparent:glass,opacity:glass?.26:1,depthWrite:!glass,emissive:b.color,emissiveIntensity:glow?.8:glass?0:.14});
  const mesh=new THREE.InstancedMesh(geometry,material,boxes.length);mesh.name='Mansion architecture and furniture';
  for(let i=0;i<boxes.length;i++){const a=boxes[i];transform.position.set(a.x,a.y,a.z);transform.scale.set(a.w,a.h,a.d);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);}
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);
 }
 const title=sign('HANSDREX MANSION',14,1.4);title.position.set(110,5.1,831.5);root.add(title);
 for(const r of mansionRooms){const s=sign(r.name,Math.min(9,r.name.length*.3),.8);s.position.set(r.x,(r.floor?MANSION_UPPER:MANSION_FLOOR)+3.7,r.z);root.add(s);}
 return root;
}
