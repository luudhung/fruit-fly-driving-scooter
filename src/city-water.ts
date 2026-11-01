import * as THREE from 'three';

/** Sky and sun reflections are analytic: one surface pass, no reflection camera or render target. */
export class CityWater {
 readonly material:THREE.ShaderMaterial;
 constructor(){
  this.material=new THREE.ShaderMaterial({
   uniforms:{uTime:{value:0},uDay:{value:1},uCloud:{value:0},uSky:{value:new THREE.Color(0x9cbdd6)},uHorizon:{value:new THREE.Color(0xc8d8df)},uSun:{value:new THREE.Vector3(-.7,.5,-.2)},uSunColor:{value:new THREE.Color(0xffd49f)}},
   vertexShader:`varying vec3 vWorld;void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
   fragmentShader:`
    uniform float uTime,uDay,uCloud;uniform vec3 uSky,uHorizon,uSun,uSunColor;varying vec3 vWorld;
    void main(){
     vec2 p=vWorld.xz;
     float a=p.x*.13+p.y*.071+uTime*.48,b=p.x*.047-p.y*.19-uTime*.37,c=p.x*.31+p.y*.23+uTime*.23;
     vec3 normal=normalize(vec3(-.035*cos(a)-.017*cos(c),1.,-.043*cos(b)-.013*cos(c)));
     vec3 viewDir=normalize(cameraPosition-vWorld),reflected=reflect(-viewDir,normal);
     float fresnel=.16+.84*pow(1.-max(viewDir.y,0.),3.);
     vec3 deep=mix(vec3(.025,.055,.105),vec3(.055,.19,.22),uDay);
     vec3 sky=mix(uHorizon,uSky,smoothstep(0.,.7,max(reflected.y,0.)));
     vec3 color=mix(deep,sky,fresnel*.78);
     float sunVisible=smoothstep(-.03,.08,uSun.y)*(1.-uCloud*.85);
     float reflection=pow(max(dot(reflected,normalize(uSun)),0.),180.);
     float wideGlint=pow(max(dot(reflected,normalize(uSun)),0.),28.);
     float ripples=.68+.32*sin(a*2.+sin(b)*1.6);
     color+=uSunColor*(reflection*1.5+wideGlint*.16)*ripples*sunVisible;
     color+=vec3(.025,.038,.045)*sin(a+b)*(.15+uDay*.85);
     float distanceFade=smoothstep(900.,2500.,length(cameraPosition-vWorld));
     color=mix(color,uHorizon,distanceFade*.75);
     gl_FragColor=vec4(color,1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`,
  });
 }
 update(seconds:number,daylight:number,cloud:number,sky:THREE.Color,horizon:THREE.Color,sun:THREE.Vector3,sunColor:THREE.Color){
  const u=this.material.uniforms;u.uTime.value=seconds%10000;u.uDay.value=daylight;u.uCloud.value=cloud;u.uSky.value.copy(sky);u.uHorizon.value.copy(horizon);u.uSun.value.copy(sun);u.uSunColor.value.copy(sunColor);
 }
}
