/** Also accepts the extra gzip layer served by older city Worker deployments. */
export async function readCitySnapshot(response:Response):Promise<unknown>{
 const body=new Uint8Array(await response.arrayBuffer());
 if(body[0]===0x1f&&body[1]===0x8b){
  const stream=new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).json();
 }
 return JSON.parse(new TextDecoder().decode(body));
}
