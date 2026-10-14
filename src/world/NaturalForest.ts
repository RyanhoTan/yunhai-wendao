import * as THREE from 'three';
import {FOREST_GROVES} from './ForestLayout';
import {createWoodlandMaterials} from './WoodlandMaterials';
import {createWoodlandPopulation,TREE_SPACING} from './WoodlandPopulation';
import {createWoodlandRenderCells} from './WoodlandRenderCells';
import {createWoodlandLodField} from './WoodlandLOD';
import {createGroundCover} from './GroundCover';
import {groundHabitat} from './GroundCoverPlacement';

/** Forest composition keeps distribution, materials and cell rendering separate. */
export function createNaturalForest(root:THREE.Group,heightAt:(x:number,z:number)=>number,isProtected:(x:number,z:number,extra:number)=>boolean,groundProtected=isProtected,groundBlocked:(x:number,y:number,z:number,r:number,bounds?:THREE.Box3)=>boolean=()=>false){
  const group=new THREE.Group();group.name='OriginalNaturalWoodland';root.add(group);
  const population=createWoodlandPopulation(heightAt,isProtected),field=createWoodlandLodField(population.cells.size+population.meadowCells.size);
  const materials=createWoodlandMaterials(field),{time}=materials;
  const {trees,colliders,prototypes,litter,expansionCount,placedFerns,placedLitter,placedGrass,meadowCount,eligibleGrassSites}=population;
  const replacementEligible=(x:number,z:number)=>{
    const habitat=groundHabitat(heightAt,x,z);
    return !!habitat&&!groundProtected(x,z,1)&&!groundBlocked(x,habitat.h,z,1);
  };
  const rendering=createWoodlandRenderCells(group,population,materials,heightAt,field,replacementEligible);
  const ground=createGroundCover(group,heightAt,groundProtected,trees.map(t=>({x:t.x,z:t.z,r:t.radius,canopyRadius:t.canopyRadius})),time,groundBlocked);
  prototypes.forEach(levels=>levels.slice(1).forEach(p=>{p.wood.dispose();p.leaves.dispose();}));litter.dispose();
  Object.assign(group.userData,{assetSource:'Original curved branching trees: three species and four age/health architectures, physical near leaves and porous cluster proxies. Existing grass, ferns and litter remain preliminary. LAAS visual reference only.',treeCount:trees.length,treePrototypeCount:prototypes.length,architectureCounts:Array.from({length:4},(_,age)=>trees.filter(p=>Math.floor(p.seed/3)===age).length),treeCellSize:24,meadowCellSize:32,groves:FOREST_GROVES.length,groveCounts:FOREST_GROVES.map((_,index)=>trees.filter(p=>p.grove===index).length),treePlacements:trees.map(({x,z,y,scale,kind,grove,radius})=>({x,z,y,scale,kind,grove,radius,groundY:heightAt(x,z)})),minimumTreeSpacing:TREE_SPACING,expansionTreeCount:expansionCount,fernCount:placedFerns,litterCount:placedLitter,meadowCount,eligibleGrassSites,grassSiteCoverage:meadowCount/Math.max(1,eligibleGrassSites),groundCover:{groveGrass:placedGrass,meadowGrass:meadowCount,ferns:placedFerns,litter:placedLitter},triangleBudget:'Shared physical-leaf near prototypes; complementary three-level forest fades and 128m distant batches. Meadow fades at 110m. Actual budgets must be checked in player views.'});
  return {colliders,cameraOccluders:population.cameraOccluders,prepareRender(camera:THREE.Camera){rendering.prepare(camera);materials.groundView.setFromMatrixPosition(camera.matrixWorld);ground.prepare(camera);},update(elapsed:number){time.value=elapsed;}};
}
