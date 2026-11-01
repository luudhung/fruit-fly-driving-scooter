import * as THREE from 'three';
type Footprint={x:number;z:number;w:number;d:number};
/** A single instanced pass grounds buildings without allocating a shadow map. */
export function buildContactShadows(root:THREE.Object3D,footprints:Footprint[]){
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
  uniforms:{uOpacity:{value:.24}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float uOpacity;varying vec2 vUv;void main(){vec2 edge=abs(vUv-.5)*2.;float alpha=(1.-smoothstep(.55,1.,max(edge.x,edge.y)))*uOpacity;gl_FragColor=vec4(.035,.045,.065,alpha);}`,
 });
 const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,footprints.length),dummy=new THREE.Object3D();
 footprints.forEach((b,i)=>{dummy.position.set(b.x,.102,b.z);dummy.rotation.x=-Math.PI/2;dummy.scale.set(b.w+5,b.d+5,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
 mesh.instanceMatrix.needsUpdate=true;mesh.renderOrder=1;root.add(mesh);return mesh;
}
