import * as THREE from 'three';

const LABEL_HEIGHT=128;
const LABEL_MIN_WIDTH=256;
const LABEL_MAX_WIDTH=1024;
const SHADOW_MARGIN=13;
const labelFont=(size:number)=>`700 ${Math.max(10,Math.min(92,size))}px system-ui, Apple Color Emoji, Segoe UI Emoji`;

function labelTexture(text:string,size:number,old:THREE.Texture|null){
 const previous=old?.image instanceof HTMLCanvasElement?old.image:null;
 const measure=previous||document.createElement('canvas');
 const context=measure.getContext('2d')!;
 const font=labelFont(size);
 context.font=font;
 const metrics=context.measureText(text);
 const inkWidth=Math.max(metrics.width,(metrics.actualBoundingBoxLeft||0)+(metrics.actualBoundingBoxRight||0));
 const width=Math.ceil(Math.min(LABEL_MAX_WIDTH,Math.max(LABEL_MIN_WIDTH,inkWidth+SHADOW_MARGIN*2))/8)*8;
 // Reallocate only when dimensions change. Uploaded WebGL textures keep their dimensions.
 const canvas=previous?.width===width&&previous.height===LABEL_HEIGHT?previous:document.createElement('canvas');
 if(canvas!==previous){canvas.width=width;canvas.height=LABEL_HEIGHT;}
 const ctx=canvas.getContext('2d')!;
 ctx.clearRect(0,0,width,LABEL_HEIGHT);ctx.font=font;
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='white';
 ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=8;
 ctx.fillText(text,width/2,LABEL_HEIGHT/2,width-2*SHADOW_MARGIN);
 const texture=old&&canvas===previous?old:new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
 return {texture,aspect:width/LABEL_HEIGHT};
}

export function setCityLabelText(sprite:THREE.Sprite,text:string){
 if(sprite.userData.text===text)return;
 const {material}=sprite,old=material.map;
 const {texture,aspect}=labelTexture(text,Number(sprite.userData.labelFontSize||54),old);
 if(texture!==old){
  material.map=texture;
  if(!old)material.needsUpdate=true;
  old?.dispose();
 }
 sprite.scale.x=sprite.scale.y*aspect;
 sprite.userData.text=text;
}

export function createCityLabelSprite(text:string,fontSize:number,scale:number){
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthTest:false,depthWrite:false}));
 sprite.userData.labelFontSize=fontSize;
 sprite.scale.set(scale*2,scale,1);
 setCityLabelText(sprite,text);
 return sprite;
}
