import * as THREE from 'three';
type FacadeBuilding={id:string;x:number;z:number;w:number;d:number;h:number;name?:string};
const unit=new THREE.BoxGeometry(1,1,1);
const slate=new THREE.MeshStandardMaterial({color:0x465361,roughness:.82,metalness:.13});
const iron=new THREE.LineBasicMaterial({color:0x283432});
const shopGlass=new THREE.MeshBasicMaterial({color:0x426b74,toneMapped:false});
/** A low-cost Haussmann facade: shared instanced stonework, tall windows, iron balconies and a mansard roof. */
export function buildParisBuilding(b:FacadeBuilding,stride=2){
 const g=new THREE.Group();g.position.set(b.x,0,b.z);g.userData.architecture='paris';
 const seed=Math.abs(Math.round(b.x*7+b.z*13)),roofH=Math.min(4.2,b.h*.2),wallH=b.h-roofH;
 const stone=new THREE.MeshStandardMaterial({color:[0xd9cfba,0xcfc4af,0xe2d8c8,0xc8c5b8][seed%4],roughness:.9});
 const trim=new THREE.MeshStandardMaterial({color:0xe9dfcb,roughness:.9});
 const warm=new THREE.MeshBasicMaterial({color:seed%3?0xffd28b:0xa9c4cc,toneMapped:false});
 const shapes:THREE.Matrix4[]=[],windows:THREE.Matrix4[]=[],shops:THREE.Matrix4[]=[],dummy=new THREE.Object3D(),rails:number[]=[];
 const matrix=(out:THREE.Matrix4[],x:number,y:number,z:number,w:number,h:number,d:number)=>{dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.rotation.set(0,0,0);dummy.updateMatrix();out.push(dummy.matrix.clone());};
 const batch=(list:THREE.Matrix4[],material:THREE.Material)=>{if(!list.length)return;const m=new THREE.InstancedMesh(unit,material,list.length);list.forEach((v,i)=>m.setMatrixAt(i,v));m.instanceMatrix.needsUpdate=true;g.add(m);};
 const body=new THREE.Mesh(new THREE.BoxGeometry(b.w,wallH,b.d),stone);body.position.y=wallH/2;g.add(body);
 const floors=Math.max(3,Math.floor((wallH-3.5)/3.5));
 for(const y of [3.6,wallH-.25])matrix(shapes,0,y,0,b.w+.35,.32,b.d+.35);
 const rail=(x1:number,y1:number,z1:number,x2:number,y2:number,z2:number)=>rails.push(x1,y1,z1,x2,y2,z2);
 for(const front of [true,false])for(const side of [-1,1]){
  const length=front?b.w:b.d,depth=front?b.d:b.w,cols=Math.max(2,Math.floor(length/3.5));
  for(let floor=0;floor<floors;floor++){
   if(floor%Math.max(1,stride)&&floor!==floors-1)continue;const y=5+floor*(wallH-6)/Math.max(1,floors-1);if(y+1.3>wallH)continue;
   for(let col=0;col<cols;col++){
    const u=-length/2+2+(length-4)*col/Math.max(1,cols-1),x=front?u:side*(depth/2+.06),z=front?side*(depth/2+.06):u;
    matrix(windows,x,y,z,front?1.15:.035,2.05,front?.035:1.15);
    matrix(shapes,front?u:x,y-1.13,front?z:u,front?1.6:.18,.18,front?.18:1.6);
   }
  }
  for(const y of [4.05,wallH-3.2]){
   matrix(shapes,front?0:side*(depth/2+.35),y,front?side*(depth/2+.35):0,front?length:.8,.15,front?.8:length);
   const outside=side*(depth/2+.72),line=(u:number,v:number)=>front?[u,v,outside]:[outside,v,u];
   for(const railY of [y+.18,y+.95]){const a=line(-length/2,railY),c=line(length/2,railY);rail(...a as [number,number,number],...c as [number,number,number]);}
   for(let u=-length/2;u<=length/2;u+=.8){const a=line(u,y+.15),c=line(u,y+.95);rail(...a as [number,number,number],...c as [number,number,number]);}
  }
  for(let col=0;col<cols;col++){
   const u=-length/2+2+(length-4)*col/Math.max(1,cols-1);matrix(shops,front?u:side*(depth/2+.07),1.7,front?side*(depth/2+.07):u,front?1.8:.04,2.5,front?.04:1.8);
  }
 }
 batch(shapes,trim);batch(windows,warm);batch(shops,shopGlass);
 const roof=new THREE.BoxGeometry(b.w+.12,roofH,b.d+.12),pos=roof.getAttribute('position');
 for(let i=0;i<pos.count;i++)if(pos.getY(i)>0){pos.setX(i,pos.getX(i)*.74);pos.setZ(i,pos.getZ(i)*.74);}roof.computeVertexNormals();
 const mansard=new THREE.Mesh(roof,slate);mansard.position.y=wallH+roofH/2;g.add(mansard);
 // Dormer windows sit slightly proud of the steep front/back roof slope.
 const dormers:THREE.Matrix4[]=[];for(const side of [-1,1])for(let x=-b.w/2+3;x<b.w/2-2;x+=4){matrix(dormers,x,wallH+roofH*.43,side*(b.d*.447+.08),1.15,1.4,.1);}batch(dormers,warm);
 const railGeo=new THREE.BufferGeometry();railGeo.setAttribute('position',new THREE.Float32BufferAttribute(rails,3));g.add(new THREE.LineSegments(railGeo,iron));
 return g;
}
