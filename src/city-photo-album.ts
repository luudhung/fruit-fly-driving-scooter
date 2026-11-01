type PhotoScene={gameSeconds:number;worldId:string;camera:{x:number;y:number;z:number};direction:number[]};
type CityPhoto={id:string;createdAt:number;scene:PhotoScene;blob:Blob};
const LIMIT=24;
/** Captures the just-rendered canvas; images stay on this device, bounded to 24 JPEGs. */
export class CityPhotoAlbum{
 private pending=false;
 private saving=false;
 private db:Promise<IDBDatabase>;
 private dialog=document.createElement('dialog');
 private gallery=document.createElement('div');
 private notice=document.createElement('p');
 private urls:string[]=[];
 constructor(private scene:()=>PhotoScene,private canvas:HTMLCanvasElement){
  this.db=new Promise((resolve,reject)=>{const request=indexedDB.open('hansdrex-city-photos',1);request.onupgradeneeded=()=>request.result.createObjectStore('photos',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  // Storage may be unavailable in a private browser. Handle it when the user opens the camera.
  void this.db.catch(()=>{});
  this.dialog.style.cssText='width:min(900px,92vw);max-height:82dvh;background:#172722;color:#e4eee7;border:1px solid #6d8c75;border-radius:16px;padding:20px;touch-action:pan-y;user-select:none';
  const title=document.createElement('h2');title.textContent='Album thành phố';title.style.cssText='margin:0;font:600 20px system-ui';
  const close=document.createElement('button');close.type='button';close.textContent='Đóng ✕';close.style.cssText='float:right;min-height:44px;padding:8px 18px';close.onclick=()=>this.dialog.close();
  this.notice.textContent='Tối đa 24 ảnh thật từ góc nhìn của bạn, lưu trên thiết bị này.';
  this.gallery.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px';
  this.dialog.append(close,title,this.notice,this.gallery);document.body.append(this.dialog);
  this.dialog.addEventListener('close',()=>this.clearURLs());
  document.getElementById('photo-capture')?.addEventListener('click',()=>{if(!this.saving){this.pending=true;this.label('ĐANG CHỤP…');}});
  document.getElementById('photo-album')?.addEventListener('click',()=>{this.dialog.showModal();void this.refresh();});
 }
 private label(text:string){const b=document.getElementById('photo-capture');if(b)b.textContent=text;}
 afterRender(){
  if(!this.pending||this.saving)return;this.pending=false;this.saving=true;const scene=this.scene();
  try{this.canvas.toBlob(blob=>{if(!blob){this.fail();return;}void this.save({id:crypto.randomUUID(),createdAt:Date.now(),scene,blob}).then(()=>{this.label('✓ ĐÃ LƯU ẢNH');if(this.dialog.open)void this.refresh();}).catch(()=>this.fail()).finally(()=>{this.saving=false;});},'image/jpeg',.82);}catch{this.fail();}
 }
 private fail(){this.saving=false;this.label('ẢNH CHƯA LƯU');this.notice.textContent='Trình duyệt chưa cho phép lưu ảnh trên thiết bị này.';}
 private async all():Promise<CityPhoto[]>{const db=await this.db;return new Promise((resolve,reject)=>{const r=db.transaction('photos').objectStore('photos').getAll();r.onsuccess=()=>resolve((r.result as CityPhoto[]).sort((a,b)=>b.createdAt-a.createdAt));r.onerror=()=>reject(r.error);});}
 private async save(photo:CityPhoto){
  const old=await this.all(),db=await this.db;
  await new Promise<void>((resolve,reject)=>{const t=db.transaction('photos','readwrite'),store=t.objectStore('photos');store.put(photo);for(const p of old.slice(LIMIT-1))store.delete(p.id);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});
 }
 private clearURLs(){for(const u of this.urls)URL.revokeObjectURL(u);this.urls=[];}
 private async refresh(){
  try{
   const photos=await this.all();if(!this.dialog.open)return;this.clearURLs();this.gallery.replaceChildren();
   this.notice.textContent=`${photos.length} / ${LIMIT} ảnh · lưu trên thiết bị này. Ảnh mới tự thay ảnh cũ nhất khi đầy.`;
   for(const p of photos){
    const figure=document.createElement('figure');figure.style.margin='0';const url=URL.createObjectURL(p.blob);this.urls.push(url);
    const img=document.createElement('img');img.src=url;img.alt='Thành phố tại thời điểm chụp';img.style.cssText='width:100%;border-radius:8px';
    const caption=document.createElement('figcaption'),day=Math.floor(p.scene.gameSeconds/86400)+1,minute=Math.floor(p.scene.gameSeconds%86400/60);
    caption.textContent=`Ngày ${day} · ${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
    const download=document.createElement('a');download.href=url;download.download=`hansdrex-${day}-${minute}.jpg`;download.textContent='Tải ảnh';download.style.cssText='display:inline-block;padding:12px;color:#b6efd0';
    const remove=document.createElement('button');remove.type='button';remove.textContent='Xóa';remove.style.cssText='min-height:44px;margin-left:12px';remove.onclick=()=>{void this.remove(p.id).then(()=>this.refresh()).catch(()=>{this.notice.textContent='Chưa xóa được ảnh.';});};
    figure.append(img,caption,download,remove);this.gallery.append(figure);
   }
  }catch{this.notice.textContent='Không mở được bộ nhớ ảnh trên trình duyệt này.';}
 }
 private async remove(id:string){const db=await this.db;await new Promise<void>((resolve,reject)=>{const t=db.transaction('photos','readwrite');t.objectStore('photos').delete(id);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}
}
