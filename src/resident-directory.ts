export type Resident = { id:string; name:string; alive:boolean; ageYears:number; money:number; savings:number; action:string; indoors?:boolean; onTrain?:boolean };
export type ResidentSort = 'money'|'age-desc'|'age-asc'|'id';
const idOrder = (a:Resident,b:Resident) => a.id.localeCompare(b.id,'en',{numeric:true});
const finite = (value:number) => Number.isFinite(value)?value:0;
export function sortResidents<T extends Resident>(residents:readonly T[],sort:ResidentSort):T[]{
 return residents.filter(f=>f.alive).slice().sort((a,b)=>{
  if(sort==='money')return (finite(b.money)+finite(b.savings))-(finite(a.money)+finite(a.savings))||idOrder(a,b);
  if(sort==='age-desc')return finite(b.ageYears)-finite(a.ageYears)||idOrder(a,b);
  if(sort==='age-asc')return finite(a.ageYears)-finite(b.ageYears)||idOrder(a,b);
  return idOrder(a,b);
 });
}
export function createResidentDirectory(onSelect:(id:string)=>void){
 const dialog=document.getElementById('resident-directory') as HTMLDialogElement;
 const sort=document.getElementById('resident-sort') as HTMLSelectElement;
 const rows=document.getElementById('resident-rows')!;
 const summary=document.getElementById('resident-summary')!;
 const connection=document.getElementById('resident-connection')!;
 const query=document.getElementById('resident-search') as HTMLInputElement;
 const close=document.getElementById('resident-close')!;
 let causes:Record<string,number>|undefined;
 let residents:Resident[]=[],deaths=0,births=0,online=false,loaded=false,lastUpdated='';
 const number=(v:number)=>finite(v).toLocaleString('en-US',{maximumFractionDigits:1});
 function render(){
  summary.textContent=loaded?`${residents.length} alive now · ${deaths} deaths since the city began · ${births} births`:'Waiting for the first city snapshot…';
  connection.textContent=loaded?`${online?'Live census':'Offline — last known census'} · Updated ${lastUpdated}. Money = cash + savings (H$).`:'Connecting…';
  const mortality=document.getElementById('resident-mortality')!;
  mortality.textContent=causes?`Recorded causes: ${Object.entries(causes).sort((a,b)=>b[1]-a[1]).map(([cause,n])=>`${cause}: ${n}`).join(' · ')||'No deaths recorded'}.`:'Historical causes unavailable from this server version.';
  if(!dialog.open)return;
  const activeId=(document.activeElement as HTMLElement)?.dataset.residentId;
  const scroll=rows.parentElement!.scrollTop;
  const filter=query.value.trim().toLowerCase();
  const ranked=sortResidents(residents,sort.value as ResidentSort);
  const visible=ranked.map((f,i)=>({f,rank:i+1})).filter(({f})=>!filter||`${f.id} ${f.name}`.toLowerCase().includes(filter));
  const fragment=document.createDocumentFragment();
  for(const {f,rank}of visible){
   const row=document.createElement('tr');
   const rankCell=document.createElement('td');rankCell.textContent=String(rank);
   const nameCell=document.createElement('td'),button=document.createElement('button');
   button.type='button';button.dataset.residentId=f.id;button.textContent=f.id;button.className='resident-select';
   button.setAttribute('aria-label',`Inspect ${f.id}, ${f.name}`);
   button.addEventListener('click',()=>{dialog.close();onSelect(f.id);});
   const name=document.createElement('small');name.textContent=f.name;nameCell.append(button,name);
   const age=document.createElement('td');age.textContent=number(f.ageYears);
   const money=document.createElement('td');money.textContent=number(f.money+f.savings);
   const activity=document.createElement('td');activity.textContent=`${f.indoors?'Inside · ':f.onTrain?'On train · ':''}${f.action}`;
   row.append(rankCell,nameCell,age,money,activity);fragment.append(row);
  }
  if(!visible.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=5;cell.textContent=loaded?(residents.length?'No matching residents.':'No living residents remain in the city.'):'Waiting for census data…';row.append(cell);fragment.append(row);}
  rows.replaceChildren(fragment);rows.parentElement!.scrollTop=scroll;
  if(activeId)Array.from(rows.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.dataset.residentId===activeId)?.focus({preventScroll:true});
 }
 const open=()=>{if(!dialog.open)dialog.showModal();render();};
 document.getElementById('connection')!.addEventListener('click',open);
 document.getElementById('population-button')!.addEventListener('click',open);
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
 sort.addEventListener('change',render);query.addEventListener('input',render);
 return {update(flies:Resident[],dead:number,born:number,deathCauses?:Record<string,number>){causes=deathCauses;residents=flies.filter(f=>f.alive);deaths=dead;births=born;online=true;loaded=true;lastUpdated=new Date().toLocaleTimeString();render();},offline(){online=false;render();},get count(){return residents.length;}};
}
