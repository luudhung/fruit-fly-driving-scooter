export type ResidentPhotoRecord={id:string;at:number;photographerId:string;photographerName?:string;subjectId:string;subjectName?:string;camera:{x:number;y:number;z:number};target?:{x:number;y:number;z:number};weather?:string;daylightAt?:number;kind?:string;rendered?:boolean};
type StoredPhoto={id:string;createdAt:number;record:ResidentPhotoRecord;blob:Blob;reconstructed:boolean};
const LIMIT=24;
/** Resident-owned photos. Rendering occurs locally; the world stores only camera records. */
export class ResidentPhotoAlbum{
 private db:Promise<IDBDatabase>;private dialog=document.createElement('dialog');private gallery=document.createElement('div');private notice=document.createElement('p');private urls:string[]=[];private records:ResidentPhotoRecord[]=[];private seen=new Set<string>();private initialized=false;private busy=false;private renderVersion=0;private memory=new Map<string,StoredPhoto>();
 constructor(private capture:(record:ResidentPhotoRecord)=>Promise<Blob>){
  // Keep the previous personal album database intact; resident photographs have their own archive.
  this.db=new Promise((resolve,reject)=>{const r=indexedDB.open('hansdrex-resident-photos',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});void this.db.catch(()=>{});
  this.dialog.style.cssText='width:min(940px,92vw);max-height:82dvh;background:#172722;color:#e4eee7;border:1px solid #6d8c75;border-radius:16px;padding:20px;touch-action:pan-y;user-select:none';
  const title=document.createElement('h2');title.textContent='Ảnh do cư dân chụp';title.style.cssText='margin:0;font:600 20px system-ui';
  const close=document.createElement('button');close.type='button';close.textContent='Đóng ✕';close.style.cssText='float:right;min-height:44px;padding:8px 18px';close.onclick=()=>this.dialog.close();
  this.notice.textContent='Cư dân tự mua máy ảnh và ghi lại thành phố trong các chuyến đi.';this.gallery.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px';
  this.dialog.append(close,title,this.notice,this.gallery);document.body.append(this.dialog);this.dialog.addEventListener('close',()=>{this.renderVersion++;this.clearURLs();});document.getElementById('resident-photo-album')?.addEventListener('click',()=>this.open());
 }
 sync(records:ResidentPhotoRecord[]=[]){
  const valid=records.filter(p=>p?.id&&p.camera&&Number.isFinite(p.camera.x)&&Number.isFinite(p.camera.z)).slice(-64);this.records=valid;
  const fresh=this.initialized?valid.filter(p=>!this.seen.has(p.id)):[];for(const p of valid)this.seen.add(p.id);if(this.seen.size>128)this.seen=new Set([...this.seen].slice(-128));this.initialized=true;
  // At most two new poses per observer update; never attempt an offline render loop.
  if(!this.busy&&fresh.length){this.busy=true;void(async()=>{for(const p of fresh.slice(-2))await this.create(p,false);})().finally(()=>{this.busy=false;if(this.dialog.open)void this.refresh();});}
 }
 open(){if(!this.dialog.open)this.dialog.showModal();void this.refresh();}
 private async all():Promise<StoredPhoto[]>{try{const db=await this.db;return await new Promise((resolve,reject)=>{const r=db.transaction('photos').objectStore('photos').getAll();r.onsuccess=()=>resolve((r.result as StoredPhoto[]).sort((a,b)=>b.record.at-a.record.at));r.onerror=()=>reject(r.error);});}catch{return [...this.memory.values()].sort((a,b)=>b.record.at-a.record.at);}}
 private async save(p:StoredPhoto){this.memory.set(p.id,p);for(const old of [...this.memory.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(LIMIT))this.memory.delete(old.id);try{const old=await this.all(),db=await this.db;await new Promise<void>((resolve,reject)=>{const t=db.transaction('photos','readwrite'),s=t.objectStore('photos');s.put(p);for(const item of old.filter(x=>x.id!==p.id).slice(LIMIT-1))s.delete(item.id);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}catch{/* Memory-only viewing remains available when storage is blocked. */}}
 private async create(record:ResidentPhotoRecord,reconstructed:boolean){try{const blob=await this.capture(record);if(!blob?.size)return null;const p={id:record.id,createdAt:Date.now(),record,blob,reconstructed};await this.save(p);return p;}catch{return null;}}
 private clearURLs(){for(const u of this.urls)URL.revokeObjectURL(u);this.urls=[];}
 private caption(p:ResidentPhotoRecord){const minute=Math.floor(p.at%86400/60);return `${p.photographerName||p.photographerId} · ${p.subjectName||p.subjectId} · Ngày ${Math.floor(p.at/86400)+1} ${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;}
 private async refresh(){
  const version=++this.renderVersion;let stored=await this.all();if(!this.dialog.open||version!==this.renderVersion)return;this.clearURLs();this.gallery.replaceChildren();
  const byId=new Map(stored.map(p=>[p.id,p])),latest=[...this.records].reverse().slice(0,12),items=[...latest,...stored.filter(p=>!latest.some(r=>r.id===p.id)).map(p=>p.record)].slice(0,LIMIT);
  this.notice.textContent=items.length?'Góc máy của cư dân · ảnh lưu trên thiết bị (tối đa 24). Ảnh cũ dựng lại được ghi rõ bên dưới.':'Cư dân chưa có ảnh. Họ cần mua máy ảnh rồi đi chụp phong cảnh.';
  let generated=0;
  for(const record of items){if(!this.dialog.open||version!==this.renderVersion)return;let p=byId.get(record.id);if(!p&&generated<12){generated++;p=await this.create(record,true)||undefined;}if(!this.dialog.open||version!==this.renderVersion)return;
   const figure=document.createElement('figure');figure.style.cssText='margin:0;padding:8px;background:#21372e;border-radius:10px';
   if(p){const url=URL.createObjectURL(p.blob);this.urls.push(url);const img=document.createElement('img');img.src=url;img.alt=`Thành phố qua góc máy ${record.photographerName||record.photographerId}`;img.loading='lazy';img.style.cssText='width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px';figure.append(img);const download=document.createElement('a');download.href=url;download.download=`resident-${record.id}.jpg`;download.textContent='Tải ảnh';download.style.cssText='display:inline-block;padding:12px;color:#b6efd0';figure.append(download);}
   const caption=document.createElement('figcaption');caption.textContent=this.caption(record)+(p?p.reconstructed?' · Dựng lại từ vị trí chụp đã lưu':' · Ghi hình khi đang trực tuyến':' · Chỉ có dữ liệu góc máy, chưa có hình');caption.style.cssText='font:13px/1.5 system-ui';figure.append(caption);this.gallery.append(figure);
  }
 }
}
