/** Select top-level fields before parsing large persisted JSON envelopes.
 * Skipped observer/archive branches never become a second object graph. */
export function parseJsonFields(text,names){
 const keep=new Set(names),parts=[];let i=0;
 const whitespace=()=>{while(i<text.length&&/\s/.test(text[i]))i++;};
 const stringEnd=()=>{i++;while(i<text.length){const c=text[i++];if(c==='\\')i++;else if(c==='"')return;}throw Error('Unterminated JSON string');};
 whitespace();if(text[i++]!=='{')throw Error('Expected JSON object');
 while(i<text.length){
  whitespace();if(text[i]==='}'){i++;whitespace();if(i!==text.length)throw Error('Trailing JSON data');return JSON.parse('{'+parts.join(',')+'}');}
  if(text[i]!=='"')throw Error('Expected JSON key');const keyStart=i;stringEnd();const key=JSON.parse(text.slice(keyStart,i));whitespace();if(text[i++]!==':')throw Error('Expected JSON colon');whitespace();
  const start=i;let depth=0;
  while(i<text.length){const c=text[i];if(c==='"'){stringEnd();continue;}if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){if(depth===0)break;depth--;}else if(c===','&&depth===0)break;i++;}
  if(depth!==0||i===start)throw Error('Incomplete JSON value');
  if(keep.has(key))parts.push(JSON.stringify(key)+':'+text.slice(start,i));
  whitespace();if(text[i]===','){i++;continue;}if(text[i]!=='}')throw Error('Invalid JSON delimiter');
 }
 throw Error('Incomplete JSON object');
}
