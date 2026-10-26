import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

// Lossless transposition of the full incoming CSR graph to an event-driven outgoing CSR.
// An 18-bit target + 10-bit dictionary index fit in one uint32. Every original edge,
// including zero weights and repeated endpoints, is retained. Float32 bits are unchanged.
export function packConnectome(input){
 const bytes=new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(new TextDecoder().decode(bytes.subarray(0,8))!=='WGFLYBRN'||d.getUint32(8,true)!==1)throw Error('Invalid full FlyWire graph');
 const n=d.getUint32(12,true),e=d.getUint32(16,true);
 if(n>262144||n<1||e<1)throw Error('Unsupported graph dimensions');
 const rowOff=64+n*32,colOff=rowOff+(n+1)*4,weightOff=colOff+e*4;
 if(weightOff+e*4!==bytes.byteLength)throw Error('Truncated graph or unexpected trailing data');
 const row=new Uint32Array(bytes.buffer,bytes.byteOffset+rowOff,n+1);
 const col=new Uint32Array(bytes.buffer,bytes.byteOffset+colOff,e);
 const bits=new Uint32Array(bytes.buffer,bytes.byteOffset+weightOff,e);
 if(row[0]!==0||row[n]!==e)throw Error('Invalid CSR offsets');
 const paletteMap=new Map(),palette=[];
 for(const b of bits)if(!paletteMap.has(b)){paletteMap.set(b,palette.length);palette.push(b);}
 if(palette.length>1024)throw Error('Weight dictionary exceeds 10 bits; refusing lossy quantization');
 const outOff=new Uint32Array(n+1);
 for(let k=0;k<e;k++){if(col[k]>=n)throw Error('Invalid neuron index');outOff[col[k]+1]++;}
 for(let i=1;i<=n;i++)outOff[i]+=outOff[i-1];
 const cursor=outOff.slice(),edges=new Uint32Array(e);
 for(let post=0;post<n;post++){
  if(row[post]>row[post+1])throw Error('Nonmonotonic CSR');
  for(let k=row[post];k<row[post+1];k++)edges[cursor[col[k]]++]=post|(paletteMap.get(bits[k])<<18);
 }
 let sum=0,count=0;
 for(let i=0;i<n;i++){const x=d.getFloat32(64+i*32,true);if(x!==0){sum+=x;count++;}}
 const center=count?sum/count:0,flags=new Uint16Array(n);
 for(let i=0;i<n;i++){
  const base=64+i*32,x=d.getFloat32(base,true),sc=d.getUint32(base+20,true),hero=d.getUint32(base+16,true)&255;
  if(sc>15||hero>15)throw Error('Unsupported neuron metadata');
  flags[i]=sc|(hero<<4)|((x<center?1:0)<<8);
 }
 const sourceSha256=createHash('sha256').update(bytes).digest('hex');
 const sections=[new Uint8Array(outOff.buffer),new Uint8Array(edges.buffer),new Uint8Array(new Uint32Array(palette).buffer),new Uint8Array(flags.buffer)];
 const output=new Uint8Array(64+sections.reduce((s,v)=>s+v.byteLength,0)),h=new DataView(output.buffer);
 output.set(new TextEncoder().encode('WGFLYPK1'));h.setUint32(8,1,true);h.setUint32(12,n,true);h.setUint32(16,e,true);h.setUint32(20,palette.length,true);
 output.set(Buffer.from(sourceSha256,'hex'),24);
 let offset=64;for(const s of sections){output.set(s,offset);offset+=s.byteLength;}
 return {bytes:output,numNeurons:n,numEdges:e,weightCount:palette.length,sourceSha256};
}
export async function writePackedConnectome(inputFile,outputDirectory){
 const packed=packConnectome(typeof inputFile==='string'?await readFile(inputFile):inputFile);await mkdir(outputDirectory,{recursive:true});
 const sha256=createHash('sha256').update(packed.bytes).digest('hex'),parts=[],chunkSize=4*1024*1024;
 for(let offset=0,index=0;offset<packed.bytes.length;offset+=chunkSize,index++){
  const chunk=packed.bytes.subarray(offset,Math.min(offset+chunkSize,packed.bytes.length));
  const file=`flywire-${sha256.slice(0,16)}.part${String(index).padStart(2,'0')}`;
  await writeFile(path.join(outputDirectory,file),chunk);
  parts.push({file,size:chunk.byteLength,sha256:createHash('sha256').update(chunk).digest('hex')});
 }
 const manifest={format:'WGFLYPK1',version:1,numNeurons:packed.numNeurons,numEdges:packed.numEdges,weightCount:packed.weightCount,sourceSha256:packed.sourceSha256,sha256,totalBytes:packed.bytes.byteLength,parts};
 await writeFile(path.join(outputDirectory,'flywire.json'),JSON.stringify(manifest,null,2)+'\n');
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const manifest=await writePackedConnectome(process.argv[2]||'work/brain.bin',process.argv[3]||'public/neural');
 console.log(JSON.stringify({...manifest,parts:manifest.parts.length}));
}
