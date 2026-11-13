import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMansionMeshes} from '../src/mansion-renderer.ts';
import {mansionBoxes} from '../src/mansion-layout.ts';
test('shared mansion finishes preserve every room surface, color, glow and glass transparency',()=>{
 const meshes=createMansionMeshes(),matrix=new THREE.Matrix4(),color=new THREE.Color(),actual:string[]=[];
 const key=(e:number[],hex:string)=>[...e.map(n=>n.toFixed(4)),hex].join(':');
 for(const mesh of meshes){
  const material=mesh.material as THREE.MeshStandardMaterial;
  for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);if(mesh.instanceColor)mesh.getColorAt(i,color);else color.copy(material.color);actual.push(key(matrix.elements,color.getHexString()));}
  if(!material.transparent){const shader={fragmentShader:'#include <emissivemap_fragment>',vertexShader:'',uniforms:{}};material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms,{} as THREE.WebGLRenderer);assert.match(shader.fragmentShader,/totalEmissiveRadiance\*=vColor\.rgb/);assert.equal(material.emissive.getHex(),0xffffff);}
  else{assert.equal(material.opacity,.26);assert.equal(material.depthWrite,false);assert.equal(material.emissiveIntensity,0);}
 }
 const dummy=new THREE.Object3D(),expected=mansionBoxes.map(b=>{dummy.position.set(b.x,b.y,b.z);dummy.scale.set(b.w,b.h,b.d);dummy.updateMatrix();return key(dummy.matrix.elements,new THREE.Color(b.color).getHexString());});
 assert.deepEqual(actual.sort(),expected.sort());assert.ok(meshes.length<12,'all original colored room surfaces share a few finish draws');
});
