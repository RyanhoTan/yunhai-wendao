import * as THREE from 'three';
import {FOREST_GROVES} from './ForestLayout';
import {createWoodlandMaterials} from './WoodlandMaterials';
import {createWoodlandPopulation,TREE_SPACING} from './WoodlandPopulation';
import {createWoodlandRenderCells} from './WoodlandRenderCells';
import {createWoodlandLodField} from './WoodlandLOD';

/** Forest composition keeps distribution, materials and cell rendering separate. */
export function createNaturalForest(root:THREE.Group,heightAt:(x:number,z:number)=>number,isProtected:(x:number,z:number,extra:number)=>boolean){
  const group=new THREE.Group();group.name='OriginalNaturalWoodland';root.add(group);
  const population=createWoodlandPopulation(heightAt,isProtected),field=createWoodlandLodField(population.cells.size+population.meadowCells.size);
  const materials=createWoodlandMaterials(field),{time}=materials;
  const {trees,colliders,prototypes,litter,expansionCount,placedFerns,placedLitter,placedGrass,meadowCount,eligibleGrassSites}=population;
  const rendering=createWoodlandRenderCells(group,population,materials,heightAt,field);
  prototypes.forEach(levels=>levels.slice(1).forEach(p=>{p.wood.dispose();p.leaves.dispose();}));litter.dispose();
  Object.assign(group.userData,{assetSource:'Original authored branching trees, folded geometric leaves, curved fern and meadow blades, bark Canvas and localized litter. LAAS visual principles only.',treeCount:trees.length,treeCellSize:24,meadowCellSize:32,groves:FOREST_GROVES.length,groveCounts:FOREST_GROVES.map((_,index)=>trees.filter(p=>p.grove===index).length),treePlacements:trees.map(({x,z,y,scale,kind,grove,radius})=>({x,z,y,scale,kind,grove,radius,groundY:heightAt(x,z)})),minimumTreeSpacing:TREE_SPACING,expansionTreeCount:expansionCount,fernCount:placedFerns,litterCount:placedLitter,meadowCount,eligibleGrassSites,grassSiteCoverage:meadowCount/Math.max(1,eligibleGrassSites),groundCover:{groveGrass:placedGrass,meadowGrass:meadowCount,ferns:placedFerns,litter:placedLitter},triangleBudget:'Shared near tree prototypes; small cells and three crown LODs. Dense meadow uses two shared instanced blade geometries and a 110m cull.'});
  return {colliders,cameraOccluders:population.cameraOccluders,prepareRender:rendering.prepare,update(elapsed:number){time.value=elapsed;}};
}
