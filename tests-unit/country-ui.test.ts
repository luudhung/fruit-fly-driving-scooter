import test from 'node:test';
import assert from 'node:assert/strict';
import {CountryUI,ConflictRequests,countryDashboardLines} from '../src/country-ui.ts';

const accepted = (id: string) => new Response(JSON.stringify({accepted: true, requestId: id, id: `CONFLICT-${id}`, status: 'queued'}), {headers: {'Content-Type': 'application/json'}});
function memory() {const values = new Map<string,string>();return {getItem:(key:string)=>values.get(key) ?? null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};}

test('each accepted click has a fresh identity and concurrent clicks cannot create duplicate commands',async()=>{
 const sent:string[]=[];let resolve!:(response:Response)=>void,serial=0;
 const requests=new ConflictRequests({apiBase:'/city',uuid:()=>`ID-${++serial}`,fetchImpl:async(url,options)=>{assert.equal(url,'/city/api/civilization/conflict');assert.equal(options?.method,'POST');const body=JSON.parse(String(options?.body));assert.equal(body.quick,true);sent.push(body.requestId);return new Promise<Response>(r=>{resolve=r;});}});
 const pending=requests.submit();assert.equal(requests.pending,true);await requests.submit();assert.deepEqual(sent,['ID-1']);resolve(accepted('ID-1'));await pending;assert.equal(requests.pending,false);assert.equal(requests.state,'accepted');
 const next=requests.submit();assert.deepEqual(sent,['ID-1','ID-2']);resolve(accepted('ID-2'));await next;
});

test('a lost POST response retries its original identity and survives a page reload without sending automatically',async()=>{
 const storage=memory(),sent:string[]=[];let call=0;
 const fetchImpl:typeof fetch=async(_url,options)=>{const id=JSON.parse(String(options?.body)).requestId;sent.push(id);if(++call===1)throw new TypeError('Network disconnected');return accepted(id);};
 const first=new ConflictRequests({apiBase:'https://local.test',storage,uuid:()=> 'LOST-RESPONSE',fetchImpl});await first.submit();assert.equal(first.state,'uncertain');assert.equal(first.pending,false);assert.equal(first.requestId,'LOST-RESPONSE');
 const reloaded=new ConflictRequests({apiBase:'https://local.test',storage,uuid:()=> 'NEW-ID',fetchImpl});assert.equal(reloaded.state,'uncertain');assert.deepEqual(sent,['LOST-RESPONSE']);await reloaded.submit();assert.deepEqual(sent,['LOST-RESPONSE','LOST-RESPONSE']);assert.equal(reloaded.state,'accepted');assert.equal(reloaded.requestId,null);
 const ready=new ConflictRequests({apiBase:'https://local.test',storage,fetchImpl});assert.equal(ready.state,'idle');
});

test('only a matching canonical active request reconciles an uncertain command',async()=>{
 const requests=new ConflictRequests({apiBase:'',uuid:()=> 'RECONCILE',fetchImpl:async()=>{throw new Error('Lost response');}});await requests.submit();requests.reconcile({requestId:'ANOTHER-USER',status:'active'});assert.equal(requests.state,'uncertain');assert.equal(requests.requestId,'RECONCILE');requests.reconcile({requestId:'RECONCILE',status:'active'});assert.equal(requests.state,'accepted');assert.equal(requests.requestId,null);
});

test('an explicit server rejection displays its reason and releases the rejected request identity',async()=>{
 let serial=0;const sent:string[]=[];
 const requests=new ConflictRequests({apiBase:'',uuid:()=>`REQUEST-${++serial}`,fetchImpl:async(_url,options)=>{sent.push(JSON.parse(String(options?.body)).requestId);return new Response(JSON.stringify({error:'Yêu cầu không hợp lệ'}),{status:400});}});await requests.submit();assert.equal(requests.state,'rejected');assert.equal(requests.error,'Yêu cầu không hợp lệ');assert.equal(requests.requestId,null);await requests.submit();assert.deepEqual(sent,['REQUEST-1','REQUEST-2']);
});

test('a failed refresh cannot undo a confirmed acceptance or cause an accidental command retry',async()=>{
 const requests=new ConflictRequests({apiBase:'',uuid:()=> 'CONFIRMED',fetchImpl:async()=>accepted('CONFIRMED'),onRefresh:()=>{throw new Error('Read unavailable');}});await requests.submit();assert.equal(requests.state,'accepted');assert.equal(requests.requestId,null);assert.equal(requests.error,'');
});

test('country cards distinguish actual homes from nationality and do not fabricate missing census or treasury numbers',()=>{
 const lines=countryDashboardLines({international:{countries:[{id:'north-city',residents:250,citizens:247,cash:3210,populationPolicy:{birthGrant:1600,housingHelp:900,immigrationSupport:300}}]}});assert.match(lines[1][1],/Nhà ở: 250 người · Quốc tịch: 247 người/);assert.match(lines[1][2],/3.210 H\$/);assert.match(lines[1][3],/1.600 H\$/);assert.match(lines[0][1],/—/);assert.match(lines[0][2],/—/);assert.equal(lines[2].at(-1),'Đảo nghỉ dưỡng theo mùa');
});

test('the settings view uses the server counter and disables the actual command control while sending',async(t)=>{
 class Element {
  textContent='';className='';title='';disabled=false;children:Element[]=[];attributes=new Map<string,string>();listeners=new Map<string,(event:{stopPropagation():void})=>void>();
  append(child:Element){this.children.push(child);}replaceChildren(...children:Element[]){this.children=children;this.textContent='';}
  setAttribute(key:string,value:string){this.attributes.set(key,value);}addEventListener(type:string,listener:(event:{stopPropagation():void})=>void){this.listeners.set(type,listener);}
  click(){if(!this.disabled)this.listeners.get('click')?.({stopPropagation(){}});}
 }
 const ids=['country-conflict-button','country-dashboard','country-conflict-status','country-hans-districts','country-visa-policy','country-selected-person'],elements=new Map(ids.map(id=>[id,new Element()]));
 const documentBefore=Object.getOwnPropertyDescriptor(globalThis,'document'),fetchBefore=globalThis.fetch;let resolve!:(response:Response)=>void,sent=0;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:(id:string)=>elements.get(id),createElement:()=>new Element()}});
 globalThis.fetch=async()=>{sent++;return new Promise<Response>(r=>{resolve=r;});};
 t.after(()=>{globalThis.fetch=fetchBefore;if(documentBefore)Object.defineProperty(globalThis,'document',documentBefore);else Reflect.deleteProperty(globalThis,'document');});
 const ui=new CountryUI({apiBase:'/local-mock'});ui.sync({international:{visaFee:50,ownNationalsExempt:true,conflicts:{requested:12,queued:1,completed:10}}});const button=elements.get('country-conflict-button')!,status=elements.get('country-conflict-status')!;assert.match(status.textContent,/Yêu cầu 12/);button.click();assert.equal(button.disabled,true);button.click();assert.equal(sent,1);assert.match(status.textContent,/Yêu cầu 12/);resolve(accepted('DOM-LOCAL'));await new Promise(r=>setTimeout(r,0));assert.equal(button.disabled,false);assert.match(status.textContent,/Yêu cầu 12/);assert.match(elements.get('country-visa-policy')!.textContent,/50 H\$/);assert.match(elements.get('country-visa-policy')!.textContent,/miễn phí/);
 ui.sync({international:{conflicts:{requested:13,queued:2,completed:10}}});assert.match(status.textContent,/Yêu cầu 13/);assert.equal(elements.get('country-dashboard')!.children.length,3);
});
