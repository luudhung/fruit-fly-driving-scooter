import * as THREE from 'three';
type Sign=(text:string,size?:number,scale?:number)=>THREE.Sprite;
const box=new THREE.BoxGeometry(1,1,1);
/** Three curtain-wall hotel towers and a tapered sky garden within the authoritative 44×18 lot. */
export function buildMarinaBay(root:THREE.Group,makeSign:Sign){
 const g=new THREE.Group();g.position.set(340,0,320);g.userData.buildingId='marina-bay';root.add(g);
 const glass=new THREE.MeshStandardMaterial({color:0x6e94a5,roughness:.26,metalness:.4});
 const stone=new THREE.MeshStandardMaterial({color:0xe2d2b7,roughness:.7});
 const metal=new THREE.MeshStandardMaterial({color:0xaabcc1,roughness:.4,metalness:.6});
 const warm=new THREE.MeshBasicMaterial({color:0xffd59a,toneMapped:false});
 const cool=new THREE.MeshBasicMaterial({color:0x99dce8,toneMapped:false});
 const deck=new THREE.MeshStandardMaterial({color:0xa58a64,roughness:.8});
 const green=new THREE.MeshStandardMaterial({color:0x477b59,roughness:1});
 const pool=new THREE.MeshStandardMaterial({color:0x409eae,emissive:0x1a7f99,emissiveIntensity:.7,roughness:.18,metalness:.25});
 const batches=new Map<THREE.Material,THREE.Matrix4[]>(),d=new THREE.Object3D();
 const part=(material:THREE.Material,w:number,h:number,depth:number,x:number,y:number,z:number,angle=0)=>{d.position.set(x,y,z);d.rotation.set(0,angle,0);d.scale.set(w,h,depth);d.updateMatrix();const list=batches.get(material)||[];list.push(d.matrix.clone());batches.set(material,list);};
 const bend=(y:number,sx:number)=>-Math.sign(sx)*(.8*Math.sin(y/71*Math.PI)+y/71*.65);
 part(stone,43,4,17,0,2,0);part(glass,39,2.5,.1,0,2.2,8.56);part(stone,26,.3,3.1,0,4.3,8.3);
 for(const sx of [-14,0,14]){
  const geometry=new THREE.BoxGeometry(9.8,71,12.8,1,12,1),p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++)p.setX(i,p.getX(i)+bend(p.getY(i)+35.5,sx));geometry.computeVertexNormals();
  const tower=new THREE.Mesh(geometry,glass);tower.position.set(sx,35.5,0);g.add(tower);
  for(let floor=0;floor<21;floor++){
   const y=5.6+floor*3.05,cx=sx+bend(y,sx);
   for(const face of [-1,1]){
    part(metal,9.9,.08,.08,cx,y-1.4,face*6.47);
    for(let col=0;col<6;col++){const x=cx-3.8+col*1.52;part((floor+col+Math.abs(sx))%7<2?cool:warm,1.04,1.55,.035,x,y,face*6.49);}
   }
   for(const side of [-1,1]){part(metal,.09,.08,12.9,cx+side*4.94,y-1.4,0);for(const z of [-4.7,-2.35,0,2.35,4.7])part(warm,.035,1.55,1.25,cx+side*4.96,y,z);}
  }
  for(const face of [-1,1])for(const col of [-4.85,-3.04,-1.52,0,1.52,3.04,4.85])part(metal,.055,64,.07,sx+col,36,face*6.51);
  part(stone,10.6,1.1,13.4,sx+bend(71,sx),71.3,0);
 }
 // A boat-shaped, pointed hull replaces the former rectangular rooftop slab.
 const hullShape=new THREE.Shape();hullShape.moveTo(-21.8,0);hullShape.bezierCurveTo(-20.2,-6.8,-9,-7.9,10,-7.2);hullShape.bezierCurveTo(18.6,-6.6,21.7,-2.8,21.8,0);hullShape.bezierCurveTo(21.7,2.8,18.6,6.6,10,7.2);hullShape.bezierCurveTo(-9,7.9,-20.2,6.8,-21.8,0);
 const hull=new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape,{depth:2.8,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.28,bevelThickness:.25,curveSegments:24}),stone);hull.rotation.x=-Math.PI/2;hull.position.y=72.1;g.add(hull);
 const terrace=new THREE.Mesh(new THREE.ShapeGeometry(hullShape,24),deck);terrace.rotation.x=-Math.PI/2;terrace.position.y=75.22;g.add(terrace);
 const outline=new THREE.BufferGeometry().setFromPoints(hullShape.getSpacedPoints(90).map(p=>new THREE.Vector3(p.x,75.35,-p.y)));g.add(new THREE.LineLoop(outline,warm));
 part(stone,27.8,.22,5.6,-2,75.35,-.5);part(pool,26.8,.12,4.6,-2,75.52,-.5);
 for(const side of [-1,1]){part(cool,27,.06,.06,-2,75.64,-.5+side*2.3);for(let x=-16;x<=16;x+=2)part(metal,.045,1,.045,x,75.82,side*6);part(metal,32,.06,.06,0,76.3,side*6);}
 for(let x=-14;x<=10;x+=4){part(stone,1.3,.16,2.0,x,75.45,4.1);part(warm,.05,.05,2.05,x-.68,75.6,4.1);}
 for(const x of [-17,14,18])for(const z of [-3.9,3.9]){part(stone,2,.6,2,x,75.52,z);part(green,1.75,1.1,1.75,x,76.25,z);part(metal,.13,3,.13,x,77.4,z);part(green,3,.32,1,x,78.9,z,.4);part(green,1,.32,3,x,78.9,z,-.4);}
 // A sheltered roof lounge, smaller pool bar and warm lobby address the building at street level.
 part(glass,7,3,5,14,77,0);part(stone,8,.3,6,14,78.65,0);part(warm,7.4,.08,.08,14,78.45,3.02);
 for(const sx of [-14,0,14])for(const z of [-7.6,7.6])part(warm,8,.14,.1,sx,4.6,z);
 for(const[material,list]of batches){const mesh=new THREE.InstancedMesh(box,material,list.length);list.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;g.add(mesh);}
 const sign=makeSign('MARINA BAY · HOTEL & SKY GARDEN',24,5);sign.position.set(0,8,9.1);sign.material.depthTest=true;g.add(sign);
 return g;
}
