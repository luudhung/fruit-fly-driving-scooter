import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bridgeAccessCorridors,bridgeAccessAtGrade,bridgeRailPieces,bridgeRailPosts,type BridgeAccess} from '../src/bridge-rail-layout.ts';
import {intersection,type Rect} from '../src/surface-rectangles.ts';
import {buildDistrictRiverInfrastructure} from '../src/district-river-renderer.ts';
import {buildRiverBridges} from '../src/city-district.ts';
import {buildMotorway} from '../src/motorway.ts';
import {ROADS,WALKWAYS,DISTRICT_BRIDGES,BRIDGES,roadTravelY,clearSegment} from '../worker/city-map.mjs';
const accesses=bridgeAccessCorridors(ROADS,WALKWAYS),accept=(a:BridgeAccess,p:{x:number;z:number})=>bridgeAccessAtGrade(a,p,roadTravelY,clearSegment);
function auditRails(rails:readonly Rect[]){
 for(const rail of rails){const axis=rail.w>=rail.d?'x':'z';assert.ok(rail.w>0&&rail.d>0);for(const c of accesses){if(c.axis===axis)continue;const p=axis==='x'?{x:c.x,z:rail.z}:{x:rail.x,z:c.z};if(intersection(rail,c)&&accept(c,p))assert.equal(intersection(rail,c),null,`bar across ${c.kind} at ${c.x},${c.z}`);}}
}
test('rail openings clip both bars and posts at transverse roads and footpaths while keeping the parallel pedestrian edge',()=>{
 const rail={x:0,z:8,w:100,d:.12},roads=[{x:-35,z:0,w:10,d:40}],walks=[{a:{x:22,z:-10},b:{x:22,z:20}},{a:{x:-50,z:6.2},b:{x:50,z:6.2}}],corridors=bridgeAccessCorridors(roads,walks),pieces=bridgeRailPieces(rail,'x',corridors),posts=bridgeRailPosts(pieces,'x');
 assert.equal(pieces.length,3);assert.ok(pieces.some(p=>p.x-p.w/2<0&&p.x+p.w/2>0),'midspan edge stays protected');
 for(const p of pieces)for(const c of corridors)if(c.axis==='z')assert.equal(intersection(p,c),null);
 for(const p of posts)for(const c of corridors)if(c.axis==='z')assert.equal(intersection({...p,w:.11,d:.11},c),null);
 const rotated=bridgeRailPieces({x:8,z:0,w:.12,d:100},'z',bridgeAccessCorridors([{x:0,z:-35,w:40,d:10}],[]));assert.equal(rotated.length,2);assert.ok(rotated.every(p=>p.w===.12));
});
test('underpass streets do not remove bridge protection and disconnected water paths are not side entrances',()=>{
 const rail={x:430,z:7.4,w:160,d:.6},below:BridgeAccess={x:372,z:0,w:8,d:820,axis:'z',kind:'road'},walk:BridgeAccess={x:400,z:0,w:2.4,d:820,axis:'z',kind:'walk'};
 assert.ok(roadTravelY({x:372,z:7.4},'z')<0);assert.equal(accept(below,{x:372,z:7.4}),false);assert.equal(accept(walk,{x:400,z:7.4}),false);
 assert.deepEqual(bridgeRailPieces(rail,'x',[below,walk],{accept}),[rail]);
});
test('every district bridge opens all legal bank junctions and keeps its mid-river guardrails in two static batches',()=>{
 const root=new THREE.Group(),g=buildDistrictRiverInfrastructure(root),rails=g.userData.bridgeRails as Rect[];assert.equal(g.children.length,2);auditRails(rails);
 for(const b of DISTRICT_BRIDGES.filter(b=>!b.motorway))for(const side of [-1,1]){const point=b.axis==='x'?{x:b.x,z:b.z+side*(b.d/2-.25)}:{x:b.x+side*(b.w/2-.25),z:b.z};assert.ok(rails.some(p=>Math.abs(point.x-p.x)<=p.w/2&&Math.abs(point.z-p.z)<=p.d/2),'each water-side midspan retains a guard');}
 for(const x of [-520,-380,50])for(const side of [-1,1]){const at={x:x+side*7.75,z:-600};if(ROADS.some(r=>r.w>r.d&&Math.abs(at.x-r.x)<r.w/2&&Math.abs(at.z-r.z)<r.d/2))assert.equal(rails.some(p=>Math.abs(at.x-p.x)<=p.w/2&&Math.abs(at.z-p.z)<p.d/2),false,'every actual North bank turn is open');}
 for(const p of g.userData.bridgeRailPosts as Array<{x:number;z:number}>)for(const c of accesses)if(c.kind==='road'&&accept(c,p))assert.equal(intersection({...p,w:.11,d:.11},c),null,'rail post cannot remain inside an opened carriageway');
});
test('main bridge low rails and ground hangers leave valid shore access while arches and grade-separated protection remain',()=>{
 const root=new THREE.Group();buildRiverBridges(root);const rails=root.userData.archBridgeRails as Rect[];auditRails(rails);
 for(const b of BRIDGES)for(const side of [-1,1])assert.ok(rails.some(p=>Math.abs(430-p.x)<=p.w/2&&Math.abs(b.z+side*7.4-p.z)<.01));
 const barMeshes=root.children.filter(o=>o instanceof THREE.InstancedMesh&&(o.geometry as THREE.CylinderGeometry).parameters?.radiusTop===1) as THREE.InstancedMesh[];assert.equal(barMeshes.length,BRIDGES.length,'one steel instance batch per arch bridge');
 const matrix=new THREE.Matrix4(),a=new THREE.Vector3(),b=new THREE.Vector3();
 for(const mesh of barMeshes)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const radius=new THREE.Vector3().setFromMatrixScale(matrix).x;a.set(0,-.5,0).applyMatrix4(matrix);b.set(0,.5,0).applyMatrix4(matrix);for(let j=0;j<=20;j++){const t=j/20,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},y=a.y+(b.y-a.y)*t;if(y>=5.6)continue;for(const c of accesses){if(c.axis==='x')continue;const inside=Math.abs(p.x-c.x)<c.w/2-.05&&Math.abs(p.z-c.z)<c.d/2-.05;if(!inside||y-radius>=(c.kind==='road'?5.6:2.1)||!accept(c,p))continue;assert.equal(inside,false,JSON.stringify({issue:'a low arch support closes a real ground entrance',a:{x:a.x,y:a.y,z:a.z},b:{x:b.x,y:b.y,z:b.z},p,y,c}));}}}
 assert.equal(root.children.some(o=>o instanceof THREE.Light),false);
});
test('all ring motorway guardrail fragments clear actual entry roads without dropping their shared material batch',()=>{
 const root=new THREE.Group(),g=buildMotorway(root);auditRails(g.userData.guardrails as Rect[]);assert.ok(g.userData.guardrails.length>100);assert.ok(g.children.length<=9);assert.equal(g.children.some(o=>o instanceof THREE.Light),false);
});
