/** Deterministic land surface shared by the offline builder and game loader.
 * Float64 world vertices remain authoritative for body SAT; GPU positions are
 * converted to Float32 in both paths, exactly as before. */
export type GeologicalSurfaceTile={name:string;positions:Float64Array;normals:Float32Array;indices:Uint32Array};
export type GeologicalSurfaceData={tiles:GeologicalSurfaceTile[];rainBounds:Float64Array;userData:Record<string,unknown>};
const MAGIC=0x59484731;
const aligned=(n:number)=>Math.ceil(n/8)*8;

export function encodeGeologicalSurface(data:GeologicalSurfaceData):ArrayBuffer{
  const arrays:ArrayBufferView[]=[];
  const tiles=data.tiles.map(tile=>{
    arrays.push(tile.positions,tile.normals,tile.indices);
    return {name:tile.name,vertices:tile.positions.length/3,indices:tile.indices.length};
  });
  arrays.push(data.rainBounds);
  const header=new TextEncoder().encode(JSON.stringify({version:1,tiles,rainBounds:data.rainBounds.length,userData:data.userData}));
  let size=aligned(8+header.length);for(const array of arrays)size=aligned(size+array.byteLength);
  const buffer=new ArrayBuffer(size),view=new DataView(buffer);view.setUint32(0,MAGIC,true);view.setUint32(4,header.length,true);
  new Uint8Array(buffer,8,header.length).set(header);let offset=aligned(8+header.length);
  for(const array of arrays){new Uint8Array(buffer,offset,array.byteLength).set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));offset=aligned(offset+array.byteLength);}
  return buffer;
}

export function decodeGeologicalSurface(buffer:ArrayBuffer):GeologicalSurfaceData{
  if(buffer.byteLength<8)throw new Error('Truncated geological surface');
  const view=new DataView(buffer),headerSize=view.getUint32(4,true);
  if(view.getUint32(0,true)!==MAGIC||headerSize>buffer.byteLength-8)throw new Error('Invalid geological surface header');
  const header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,headerSize)));
  if(header.version!==1||!Array.isArray(header.tiles)||header.tiles.length>1024)throw new Error('Unsupported geological surface');
  let offset=aligned(8+headerSize);
  const take=(count:number,bytes:number)=>{
    if(!Number.isSafeInteger(count)||count<0||count*bytes>buffer.byteLength-offset)throw new Error('Invalid geological surface array');
    const start=offset;offset=aligned(offset+count*bytes);return start;
  };
  const tiles:GeologicalSurfaceTile[]=header.tiles.map((tile:{name:string;vertices:number;indices:number})=>{
    if(typeof tile.name!=='string'||!Number.isSafeInteger(tile.vertices)||tile.vertices<0||tile.indices%3!==0)throw new Error('Invalid geological tile');
    const positions=new Float64Array(buffer,take(tile.vertices*3,8),tile.vertices*3);
    const normals=new Float32Array(buffer,take(tile.vertices*3,4),tile.vertices*3);
    const indices=new Uint32Array(buffer,take(tile.indices,4),tile.indices);
    for(const index of indices)if(index>=tile.vertices)throw new Error('Geological index outside tile');
    return {name:tile.name,positions,normals,indices};
  });
  if(header.rainBounds%6!==0)throw new Error('Invalid geological rain bounds');
  const rainBounds=new Float64Array(buffer,take(header.rainBounds,8),header.rainBounds);
  if(offset!==buffer.byteLength)throw new Error('Unexpected geological surface payload');
  return {tiles,rainBounds,userData:header.userData};
}
