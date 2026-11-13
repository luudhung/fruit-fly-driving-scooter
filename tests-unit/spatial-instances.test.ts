import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {spatialInstanceCells,syncSpatialInstanceColors} from '../src/spatial-instances.ts';
test('spatial cells retain exact transforms, geometry and live per-instance colors without camera rewrites',()=>{
 const root=new THREE.Group(),source=new THREE.InstancedMesh(new THREE.SphereGeometry(1,7,5),new THREE.MeshBasicMaterial(),3),matrix=new THREE.Matrix4(),color=new THREE.Color();root.add(source);
 for(let i=0;i<3;i++){matrix.makeTranslation(i*400,3,-50);source.setMatrixAt(i,matrix);source.setColorAt(i,new THREE.Color().setHSL(i/3,.5,.5));}
 const cells=spatialInstanceCells(source,root,96);assert.equal(cells.length,3);assert.equal(source.parent,null);assert.equal(root.children.length,3);
 for(const{mesh,indices}of cells)for(let i=0;i<indices.length;i++){
  const expected=new THREE.Matrix4();source.getMatrixAt(indices[i],expected);mesh.getMatrixAt(i,matrix);assert.deepEqual(matrix,expected);
  source.getColorAt(indices[i],color);const actual=new THREE.Color();mesh.getColorAt(i,actual);assert.deepEqual(actual,color);
  assert.equal(mesh.geometry,source.geometry);assert.equal(mesh.material,source.material);assert.ok(mesh.frustumCulled&&mesh.boundingSphere!.radius<3);
 }
 const matrices=cells.map(c=>[...c.mesh.instanceMatrix.array]);source.setColorAt(1,new THREE.Color(0xff0000));syncSpatialInstanceColors(source,cells);
 const cell=cells.find(c=>c.indices.includes(1))!;cell.mesh.getColorAt(cell.indices.indexOf(1),color);assert.equal(color.getHex(),0xff0000);assert.deepEqual(cells.map(c=>[...c.mesh.instanceMatrix.array]),matrices);
});
