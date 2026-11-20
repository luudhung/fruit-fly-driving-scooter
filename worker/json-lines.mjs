/** Decode framed JSON without repeatedly flattening/scanning a growing header.
 * A world header can span thousands of transport chunks. Join its fragments
 * once at the newline instead of copying the entire prefix for every chunk. */
export async function* readJsonLines(stream){
 let parts=[];
 for await(const text of stream.pipeThrough(new TextDecoderStream())){
  let start=0,end;
  while((end=text.indexOf('\n',start))!==-1){
   const last=text.slice(start,end),line=parts.length?(parts.push(last),parts.join('')):last;
   parts=[];yield line;start=end+1;
  }
  if(start<text.length)parts.push(text.slice(start));
 }
 if(parts.length)throw Error('incomplete framed JSON line');
}
