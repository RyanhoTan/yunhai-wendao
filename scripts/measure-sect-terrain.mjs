import {readTerrain,sourcePixelSurface} from './terrain-glb.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const directory='artifacts/terrain-pipeline/assembly/sect-v1';await mkdir(directory,{recursive:true});
const mountainPath='artifacts/terrain-pipeline/concepts/sect-mountain-v1/mountain-body/meshy-models/runtime-candidate.glb';
const summitPath='artifacts/terrain-pipeline/concepts/sect-summit-v1/summit-plateau/meshy-models/runtime-candidate.glb';
const mountain=await readTerrain(mountainPath),summit=await readTerrain(summitPath);
// Manually selected AI landmarks in the saved, verified top-view render. Actual
// coordinates are ray/triangle intersections, never dimensions inferred from pixels.
const roadPixels=[[377,264],[401,255],[432,247],[456,247],[466,262],[469,291],[458,320],[451,351],[456,370],[473,383],[487,381],[510,368],[538,345],[570,323],[593,318],[607,326],[610,343],[596,369],[579,393],[569,410],[571,426],[583,434],[596,431],[619,415],[643,397],[666,395],[679,403],[679,420],[665,438],[640,460],[630,478],[630,496],[639,507],[655,509],[674,500],[698,486],[718,484],[734,490],[736,505],[727,523],[714,543],[704,564],[700,580],[691,595]];
const report={scope:'source coordinate measurements; assembly/runtime clearance not yet accepted',mountain:{path:mountainPath,sha256:createHash('sha256').update(mountain.raw).digest('hex'),road:sourcePixelSurface(mountain.geometry,roadPixels)},summit:{path:summitPath,sha256:createHash('sha256').update(summit.raw).digest('hex'),landmarks:sourcePixelSurface(summit.geometry,[[600,340],[420,610],[470,565],[500,530],[530,460],[600,450],[690,335],[500,335]])}};
await writeFile(directory+'/source-measurements.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
