import * as THREE from 'three';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
/** Artistic, deliberately long 16:00–20:00 sunset. This is not an astronomical ephemeris. */
export function skyLight(hour:number){
 const t=((hour%24)+24)%24;
 const daylight=t<6||t>=20?.04:t<8?.15+.85*(t-6)/2:t<16?1:.04+.96*(20-t)/4;
 return {daylight,dusk:t>=16&&t<20?Math.sin((t-16)/4*Math.PI)*.85+.15:0};
}
export class CitySky{
 private root=new THREE.Group();
 private moon:THREE.Mesh;
 private saturn=new THREE.Group();
 private stars:THREE.Points;
 private sun:THREE.Mesh;
 private glow:THREE.Sprite;
 constructor(scene:THREE.Scene,count=700){
  const basic=(color:number)=>new THREE.MeshBasicMaterial({color,fog:false,toneMapped:false,depthWrite:false});
  this.moon=new THREE.Mesh(new THREE.SphereGeometry(34,20,12),basic(0xe9e9dd));this.moon.position.set(-200,900,-1650);this.moon.renderOrder=-20;this.root.add(this.moon);
  // Fixed shallow craters, no orbit or per-frame noise.
  for(let i=0;i<8;i++){
   const a=i*2.399,r=8+i*2.3,x=Math.cos(a)*r,y=Math.sin(a)*r;
   const crater=new THREE.Mesh(new THREE.CircleGeometry(2.5+i%3,10),basic(0xbfc4bd));
   crater.position.set(x,y,Math.sqrt(34*34-x*x-y*y)+.1);this.moon.add(crater);
  }
  this.moon.lookAt(0,0,0);
  this.saturn.position.set(-850,640,-1370);this.saturn.rotation.set(.5,0,-.38);
  this.saturn.add(new THREE.Mesh(new THREE.SphereGeometry(29,20,12),basic(0xdcc99e)));
  const rings=new THREE.Mesh(new THREE.RingGeometry(37,62,64),new THREE.MeshBasicMaterial({color:0xd6bb89,side:THREE.DoubleSide,fog:false,toneMapped:false,transparent:true,opacity:.8,depthWrite:false}));rings.rotation.x=1.12;this.saturn.add(rings);
  const gap=new THREE.Mesh(new THREE.RingGeometry(49,51,64),new THREE.MeshBasicMaterial({color:0x5b5363,side:THREE.DoubleSide,fog:false,toneMapped:false,depthWrite:false}));gap.rotation.copy(rings.rotation);this.saturn.add(gap);
  this.saturn.renderOrder=-20;this.root.add(this.saturn);
  const positions:number[]=[];let seed=74927;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<count;i++){const az=random()*Math.PI*2,y=.06+random()*.94,r=Math.sqrt(1-y*y);positions.push(Math.cos(az)*r*2200,y*2200,Math.sin(az)*r*2200);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  this.stars=new THREE.Points(geo,new THREE.PointsMaterial({color:0xe9eaff,size:2.8,sizeAttenuation:true,fog:false,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));this.stars.renderOrder=-25;this.root.add(this.stars);
  this.sun=new THREE.Mesh(new THREE.SphereGeometry(39,24,12),basic(0xffecd1));this.sun.renderOrder=-20;this.root.add(this.sun);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d')!,g=c.createRadialGradient(64,64,9,64,64,64);g.addColorStop(0,'rgba(255,175,70,.7)');g.addColorStop(.3,'rgba(255,110,36,.3)');g.addColorStop(1,'rgba(255,90,35,0)');c.fillStyle=g;c.fillRect(0,0,128,128);
  this.glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false,fog:false,toneMapped:false}));this.glow.scale.set(240,240,1);this.glow.renderOrder=-21;this.root.add(this.glow);scene.add(this.root);
 }
 update(hour:number,origin:THREE.Vector3,cloud:number){
  this.root.position.copy(origin);const {daylight}=skyLight(hour),night=1-daylight;
  (this.stars.material as THREE.PointsMaterial).opacity=clamp((night-.3)/.65)*(1-cloud*.8);
  const angle=hour<12?(hour-6)/6*Math.PI/2:hour<16?Math.PI/2+(hour-12)/4*Math.PI*.34:Math.PI*.84+(hour-16)/4*Math.PI*.16;
  this.sun.visible=this.glow.visible=hour>=6&&hour<20;
  this.sun.position.set(Math.cos(angle)*1900,Math.sin(angle)*1900,-450);this.glow.position.copy(this.sun.position);
  (this.sun.material as THREE.MeshBasicMaterial).color.setHex(hour>=16?(hour>18?0xff582b:0xffb05b):0xfff0cc);
  (this.glow.material as THREE.SpriteMaterial).opacity=1-cloud*.8;
 }
}
