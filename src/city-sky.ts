import * as THREE from 'three';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const x=clamp(v);return x*x*(3-2*x);};
/** Artistic, deliberately long 16:00–20:00 sunset. This is not an astronomical ephemeris. */
export function skyLight(hour:number){
 const t=((hour%24)+24)%24;
 const daylight=t<6||t>=20?.04:t<8?.04+.96*smooth((t-6)/2):t<16?1:.04+.96*(1-smooth((t-16)/4));
 return {daylight,dusk:t>=16&&t<20?Math.sin((t-16)/4*Math.PI):t>=5&&t<8?Math.sin((t-5)/3*Math.PI)*.45:0};
}
/** Shared atmospheric colors keep the distant city, fog, lighting and river in the same scene. */
export function citySkyPalette(hour:number,cloud=0,day=0){
 const t=((hour%24)+24)%24,{daylight,dusk}=skyLight(t),night=1-daylight,c=clamp(cloud);
 const variant=(Math.sin(Math.floor(day)*12.9898+47.123)*43758.5453)%1;
 const sunset=new THREE.Color(0xffbd85).lerp(new THREE.Color(0xf292bb),Math.abs(variant));
 const nightBlend=smooth((night-.26)/.7),horizonNight=t>=16?smooth((t-18.8)/1.2):t>=5&&t<8?1-smooth((t-5.3)/1.3):nightBlend;
 const blend=(dayColor:number,evening:number|THREE.Color,dark:number,late=false)=>new THREE.Color(dayColor).lerp(new THREE.Color(evening),dusk).lerp(new THREE.Color(dark),late?horizonNight:nightBlend);
 const zenith=blend(0x71a2d3,0x7773aa,0x10182e);
 const horizon=blend(0xdbe5e6,sunset,0x30334c,true);
 const antiHorizon=blend(0xcbddec,0xa4b1d7,0x30334c,true);
 const fog=blend(0xc3d4df,new THREE.Color(0xd7b29c).lerp(new THREE.Color(0xc69ab6),Math.abs(variant)),0x262e43,true);
 const water=blend(0x4b8095,new THREE.Color(0x947f73).lerp(new THREE.Color(0x916f8a),Math.abs(variant)),0x14283d,true);
 const keyLight=blend(0xfff4df,0xffb777,0x869bc4);
 const fill=blend(0xcbdff7,0xc4a7d5,0x586d99);
 const sunColor=new THREE.Color(0xfff5ce).lerp(new THREE.Color(0xff7850),dusk);
 const grey=new THREE.Color().copy(fog).lerp(new THREE.Color(0x7e8c9e),daylight*.45);
 zenith.lerp(grey,c*.62);horizon.lerp(grey,c*.4);fog.lerp(grey,c*.45);water.lerp(grey,c*.22);
 return {zenith,horizon,antiHorizon,fog,water,keyLight,fill,sunColor,daylight,dusk,night};
}
/** Sun drops slowly through the western sky during the four-hour sunset. */
export function sunDirection(hour:number){
 const t=((hour%24)+24)%24;
 const angle=t<12?(t-6)/6*Math.PI/2:t<16?Math.PI/2+(t-12)/4*Math.PI*.34:Math.PI*.84+(t-16)/4*Math.PI*.16;
 return new THREE.Vector3(Math.cos(angle),Math.sin(angle),-.18*Math.sin(angle)).normalize();
}
const skyVertex=`varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const skyFragment=`
 precision highp float;
 varying vec3 vDirection;
 uniform vec3 zenith,horizon,antiHorizon,sunDirection,sunColor;
 uniform float daylight,dusk,cloud,time;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
 float wisps(vec2 p){return noise(p)*.57+noise(p*2.13)*.28+noise(p*4.07)*.15;}
 void main(){
  vec3 dir=normalize(vDirection);float h=max(0.,dir.y);
  float solarSide=pow(clamp(.5+.5*dot(normalize(dir.xz+vec2(.0001)),normalize(sunDirection.xz+vec2(.0001))),0.,1.),1.4);
  vec3 localHorizon=mix(antiHorizon,horizon,mix(.5,solarSide,clamp(dusk*1.3,0.,1.)));
  vec3 color=mix(localHorizon,zenith,smoothstep(0.,.82,pow(h,.6)));
  float towardSun=pow(max(0.,dot(dir,sunDirection)),5.);
  color=mix(color,sunColor,towardSun*dusk*.22*(1.-smoothstep(.1,.7,h)));
  // A single inexpensive sky pass: layered noise stretched into high, thin cloud ribbons.
  vec2 p=dir.xz/(h+.24)*vec2(2.4,7.2)+vec2(time*.002,0.);
  float n=wisps(p),ribbon=smoothstep(.49-.12*cloud,.76-.08*cloud,n);
  ribbon*=smoothstep(.015,.16,h)*(1.-smoothstep(.55,.96,h));
  vec3 cloudTint=mix(vec3(.86,.9,.97),mix(localHorizon,vec3(1.,.77,.65),.35),dusk);
  cloudTint=mix(zenith*1.1,cloudTint,daylight);
  color=mix(color,cloudTint,ribbon*(.17+.38*cloud)*(.25+.75*daylight));
  gl_FragColor=vec4(color,1.);
  #include <colorspace_fragment>
 }`;

export class CitySky{
 private root=new THREE.Group();
 private moon:THREE.Mesh;
 private saturn=new THREE.Group();
 private stars:THREE.Points;
 private sun:THREE.Mesh;
 private glow:THREE.Sprite;
 private dome:THREE.Mesh<THREE.SphereGeometry,THREE.ShaderMaterial>;
 private horizonRoot=new THREE.Group();
 private horizonMaterials:THREE.MeshBasicMaterial[]=[];
 private palette=citySkyPalette(12);
 private paletteKey='';
 constructor(scene:THREE.Scene,count=700){
  const basic=(color:number)=>new THREE.MeshBasicMaterial({color,fog:false,toneMapped:false,depthWrite:false,depthTest:false});
  const p=this.palette;
  this.dome=new THREE.Mesh(new THREE.SphereGeometry(2850,32,16),new THREE.ShaderMaterial({vertexShader:skyVertex,fragmentShader:skyFragment,side:THREE.BackSide,depthWrite:false,depthTest:false,toneMapped:false,uniforms:{zenith:{value:p.zenith.clone()},horizon:{value:p.horizon.clone()},antiHorizon:{value:p.antiHorizon.clone()},sunDirection:{value:sunDirection(12)},sunColor:{value:p.sunColor.clone()},daylight:{value:1},dusk:{value:0},cloud:{value:0},time:{value:0}}}));
  this.dome.renderOrder=-100;this.dome.frustumCulled=false;this.root.add(this.dome);
  this.moon=new THREE.Mesh(new THREE.SphereGeometry(34,20,12),basic(0xe9e9dd));this.moon.position.set(-200,900,-1650);this.moon.renderOrder=-94;this.root.add(this.moon);
  for(let i=0;i<8;i++){
   const a=i*2.399,r=8+i*2.3,x=Math.cos(a)*r,y=Math.sin(a)*r;
   const crater=new THREE.Mesh(new THREE.CircleGeometry(2.5+i%3,10),basic(0xbfc4bd));
   crater.position.set(x,y,Math.sqrt(34*34-x*x-y*y)+.1);crater.renderOrder=-93;this.moon.add(crater);
  }
  this.moon.lookAt(0,0,0);
  this.saturn.position.set(-850,640,-1370);this.saturn.rotation.set(.5,0,-.38);
  const planet=new THREE.Mesh(new THREE.SphereGeometry(29,20,12),basic(0xdcc99e));planet.renderOrder=-94;this.saturn.add(planet);
  const rings=new THREE.Mesh(new THREE.RingGeometry(37,62,64),new THREE.MeshBasicMaterial({color:0xd6bb89,side:THREE.DoubleSide,fog:false,toneMapped:false,transparent:true,opacity:.8,depthWrite:false,depthTest:true}));rings.rotation.x=1.12;rings.renderOrder=-93;this.saturn.add(rings);
  const gap=new THREE.Mesh(new THREE.RingGeometry(49,51,64),new THREE.MeshBasicMaterial({color:0x5b5363,side:THREE.DoubleSide,fog:false,toneMapped:false,depthWrite:false,depthTest:false}));gap.rotation.copy(rings.rotation);gap.renderOrder=-92;this.saturn.add(gap);this.root.add(this.saturn);
  const positions:number[]=[];let seed=74927;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<count;i++){const az=random()*Math.PI*2,y=.06+random()*.94,r=Math.sqrt(1-y*y);positions.push(Math.cos(az)*r*2200,y*2200,Math.sin(az)*r*2200);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  this.stars=new THREE.Points(geo,new THREE.PointsMaterial({color:0xe9eaff,size:2.8,sizeAttenuation:true,fog:false,transparent:true,opacity:0,depthWrite:false,depthTest:true,toneMapped:false}));this.stars.renderOrder=-95;this.root.add(this.stars);
  this.sun=new THREE.Mesh(new THREE.SphereGeometry(24,24,12),basic(0xffecd1));this.sun.renderOrder=-94;this.root.add(this.sun);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d')!,g=c.createRadialGradient(64,64,2,64,64,64);g.addColorStop(0,'rgba(255,204,139,.65)');g.addColorStop(.15,'rgba(255,159,86,.22)');g.addColorStop(1,'rgba(255,124,68,0)');c.fillStyle=g;c.fillRect(0,0,128,128);
  this.glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false,depthTest:true,fog:false,toneMapped:false}));this.glow.scale.set(290,290,1);this.glow.renderOrder=-94;this.root.add(this.glow);
  // Three static silhouette strips give a far horizon without extra simulated land or buildings.
  const strip=(radius:number,heights:number[],order:number)=>{
   const vertices:number[]=[];const n=heights.length;
   for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2,x=Math.cos(a)*radius,z=Math.sin(a)*radius,nx=Math.cos(b)*radius,nz=Math.sin(b)*radius;
    vertices.push(x,-80,z,nx,-80,nz,x,heights[i],z,nx,-80,nz,nx,heights[(i+1)%n],nz,x,heights[i],z);}
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const material=basic(0xb9c6d1);material.side=THREE.DoubleSide;material.transparent=true;material.depthTest=true;
   const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=order;mesh.frustumCulled=false;this.horizonRoot.add(mesh);this.horizonMaterials.push(material);
  };
  const mountain=(offset:number)=>Array.from({length:192},(_,i)=>{const a=i/192*Math.PI*2;return 45+Math.pow(.5+.5*Math.sin(a*7+offset)*Math.cos(a*3+.4),1.6)*125+Math.sin(a*19+offset)*11;});
  strip(3700,mountain(.5),-91);strip(3450,mountain(2.3).map(v=>v*.62),-90);
  // Paired angles create vertical building edges, with occasional distant landmark towers.
  const city:number[]=[];for(let i=0;i<192;i++){const h=18+random()*37+(i%23===0?40:0);city.push(h,h);}
  strip(3250,city,-89);scene.add(this.horizonRoot);scene.add(this.root);
 }
 update(hour:number,origin:THREE.Vector3,cloud:number,day=0){
  const t=((hour%24)+24)%24,c=clamp(cloud),key=`${Math.floor(day)}:${Math.floor(t*60)}:${Math.floor(c*100)}`;
  this.root.position.copy(origin);
  if(key!==this.paletteKey){this.paletteKey=key;this.palette=citySkyPalette(t,c,day);const p=this.palette,u=this.dome.material.uniforms;
   u.zenith.value.copy(p.zenith);u.horizon.value.copy(p.horizon);u.antiHorizon.value.copy(p.antiHorizon);u.sunColor.value.copy(p.sunColor);u.daylight.value=p.daylight;u.dusk.value=p.dusk;u.cloud.value=c;
   this.horizonMaterials[0].color.copy(p.horizon).lerp(p.fog,.22);
   this.horizonMaterials[1].color.copy(p.fog).lerp(p.zenith,.12);
   this.horizonMaterials[2].color.copy(p.fog).lerp(p.zenith,.22);
  }
  const p=this.palette,direction=sunDirection(t);this.dome.material.uniforms.sunDirection.value.copy(direction);this.dome.material.uniforms.time.value=t*60;
  (this.stars.material as THREE.PointsMaterial).opacity=smooth((p.night-.3)/.65)*(1-c*.8);
  this.sun.visible=this.glow.visible=t>=6&&t<20;this.sun.position.copy(direction).multiplyScalar(1900);this.glow.position.copy(this.sun.position);
  (this.sun.material as THREE.MeshBasicMaterial).color.copy(p.sunColor);(this.glow.material as THREE.SpriteMaterial).opacity=(.45+p.dusk*.4)*(1-c*.8);
  // The horizon stays at sea level when flying, then gently disappears at very high altitude.
  this.horizonRoot.position.set(0,0,0);
  const opacity=1-smooth((origin.y-250)/550);for(const m of this.horizonMaterials)m.opacity=opacity;
 }
}
