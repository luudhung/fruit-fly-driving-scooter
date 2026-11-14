import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {cityRiverSurfaces,buildDistrictRiverInfrastructure} from '../src/district-river-renderer.ts';
import {DISTRICT_RIVERS,DISTRICT_BRIDGES,contains} from '../worker/city-map.mjs';
import {intersection} from '../src/surface-rectangles.ts';
test('river junctions never submit overlapping water planes and preserve continuous separating canals',()=>{
 const surfaces=cityRiverSurfaces();for(let i=0;i<surfaces.length;i++)for(let j=i+1;j<surfaces.length;j++)assert.equal(intersection(surfaces[i],surfaces[j]),null);
 for(const r of DISTRICT_RIVERS)for(let i=0;i<50;i++){const p={x:r.x+(r.w>r.d?(i/50-.5)*r.w:0),z:r.z+(r.d>r.w?(i/50-.5)*r.d:0)};assert.ok(surfaces.some(s=>contains(s,p,.001)));}
});
test('bridge visuals stay in two static material batches with sidewalks and railings clear of all driving lanes',()=>{
 const root=new THREE.Group(),g=buildDistrictRiverInfrastructure(root);assert.equal(g.children.length,2);assert.equal(g.userData.bridgeCount,DISTRICT_BRIDGES.filter(b=>!b.motorway).length);assert.equal(g.userData.realLights,0);
 g.traverse(o=>{assert.ok(!(o instanceof THREE.Light));if(o instanceof THREE.Mesh){assert.equal(o.matrixAutoUpdate,false);assert.ok(o.geometry.getAttribute('position').array.every(Number.isFinite));}});
 const rail=(g.children[1] as THREE.Mesh).geometry.getAttribute('position');for(let i=0;i<rail.count;i++){const p={x:rail.getX(i),z:rail.getZ(i)};for(const b of DISTRICT_BRIDGES.filter(b=>!b.motorway))if(contains(b,p))assert.ok(Math.abs((b.axis==='x'?p.z-b.z:p.x-b.x))>b.roadWidth/2,'rail supports must stay outside carriageways');}
});
