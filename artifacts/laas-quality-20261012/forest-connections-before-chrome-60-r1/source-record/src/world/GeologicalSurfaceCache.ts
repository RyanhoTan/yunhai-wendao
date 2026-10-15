import {decodeGeologicalSurface,type GeologicalSurfaceData} from './GeologicalSurfaceData';

declare const __GEOLOGICAL_SOURCE_HASH__:string;
export async function loadGeologicalSurface():Promise<GeologicalSurfaceData>{
    const base=`${import.meta.env.BASE_URL}assets/terrain/geological/`;
    const response=await fetch(`${base}manifest.json?v=${__GEOLOGICAL_SOURCE_HASH__}`);
    if(!response.ok)throw new Error(`Geological manifest HTTP ${response.status}`);
    const manifest=await response.json();
    if(manifest.version!==1||manifest.sourceHash!==__GEOLOGICAL_SOURCE_HASH__||manifest.file!==`surface-${manifest.sourceHash}.bin`)throw new Error('Geological cache does not match this build');
    const binary=await fetch(`${base}${manifest.file}`);if(!binary.ok)throw new Error(`Geological surface HTTP ${binary.status}`);
    const buffer=await binary.arrayBuffer();
    if(buffer.byteLength!==manifest.byteLength)throw new Error('Truncated geological surface download');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==manifest.sha256)throw new Error('Geological surface checksum mismatch');
    return decodeGeologicalSurface(buffer);
}
