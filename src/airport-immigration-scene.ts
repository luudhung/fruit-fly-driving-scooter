import * as THREE from 'three';
import {COUNTRY_AIRPORTS} from '../worker/country-map.mjs';
import {airportImmigrationLayout} from '../worker/airport-immigration.mjs';
import {batchStaticMeshes} from './static-box-batches.ts';

/** Shared interior furniture; screens glow without adding any real-time lights. */
export function createAirportImmigrationScene(make?:(text:string,w:number,h:number)=>THREE.Sprite){
 const root=new THREE.Group();root.name='airport-self-service-immigration';
 const frame=new THREE.MeshStandardMaterial({color:0xbccbd0,roughness:.58,metalness:.3});
 const screen=new THREE.MeshBasicMaterial({color:0x123c4b});
 const indicator=new THREE.MeshBasicMaterial({color:0x63edb2,toneMapped:false});
 const geometry=new THREE.BoxGeometry(1,1,1);let count=0;
 for(const airport of COUNTRY_AIRPORTS){
  const layout=airportImmigrationLayout(airport.id);if(!layout)continue;
  const floor=airport.id==='island'?1.1:.35;
  for(const gate of layout.gates){
   const station=new THREE.Group();station.name=gate.id;station.position.set(gate.x,floor,gate.z);station.rotation.y=gate.axis==='x'?Math.PI/2:0;
   station.userData={airportId:airport.id,kioskId:gate.id,queue:{...gate.queue},exit:{...gate.exit}};
   const box=(x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material)=>{const m=new THREE.Mesh(geometry,material);m.position.set(gate.x+(gate.axis==='x'?z:x),floor+y,gate.z+(gate.axis==='x'?-x:z));m.rotation.y=gate.axis==='x'?Math.PI/2:0;m.scale.set(w,h,d);root.add(m);};
   for(const side of [-1,1]){
    box(side*.8,.7,0,.24,1.4,2.1,frame);
    box(side*.8,1.28,-.62,.26,.36,.36,screen);
    box(side*.8,1.49,-.62,.24,.06,.34,indicator);
   }
   box(0,2.1,.35,1.34,.06,.12,indicator);box(0,.03,0,1.9,.06,2.4,frame);
   root.add(station);count++;
  }
  if(make){const sign=make('AUTOMATED IMMIGRATION · VISA H$ 50',Math.min(layout.terminal.w-2,35),1.1);sign.position.set(layout.terminal.x,floor+3.6,layout.terminal.z);root.add(sign);}
 }
 root.userData={gateCount:count,lights:0};batchStaticMeshes(root);return root;
}
