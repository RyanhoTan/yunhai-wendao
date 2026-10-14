import type {Texture} from 'three';

/** Scanned 2.1m CC0 soil/leaf litter. Three continuous barycentric samples
 * decorrelate repeats while colour, normals and roughness share the same UVs.
 * This is a surface under the actual plants, not replacement vegetation. */
export function loadForestFloorTextures(load:(name:string,color?:boolean,directory?:string)=>Texture){
  return {forestFloorColor:load('forest_floor_diff_1k.jpg',true,'forest-floor'),forestFloorNormal:load('forest_floor_nor_gl_1k.jpg',false,'forest-floor'),forestFloorRoughness:load('forest_floor_rough_1k.jpg',false,'forest-floor')};
}

export const FOREST_FLOOR_GLSL=`
uniform sampler2D uForestFloorColor;uniform sampler2D uForestFloorNormal;uniform sampler2D uForestFloorRoughness;
uniform float uForestFloorEnabled;
vec2 floorOffset(vec2 cell){return vec2(landHash(cell+13.7),landHash(cell+vec2(57.4,-19.2)));}
vec3 floorSample(sampler2D tex,vec2 uv){
  vec2 skew=vec2(uv.x-uv.y*.57735027,uv.y*1.15470054),cell=floor(skew),f=fract(skew);
  vec2 a=cell,b=cell+vec2(1.,0.),c=cell+vec2(0.,1.);vec3 w=vec3(1.-f.x-f.y,f.x,f.y);
  if(f.x+f.y>1.){a=cell+vec2(1.,1.);w=vec3(f.x+f.y-1.,1.-f.y,1.-f.x);}
  w=w*w*w;w/=max(.00001,w.x+w.y+w.z);
  // Explicit common gradients avoid derivative discontinuities at hash cells.
  vec2 dx=dFdx(uv),dy=dFdy(uv);
  return textureGrad(tex,uv+floorOffset(a),dx,dy).rgb*w.x+textureGrad(tex,uv+floorOffset(b),dx,dy).rgb*w.y+textureGrad(tex,uv+floorOffset(c),dx,dy).rgb*w.z;
}
`;

export const FOREST_FLOOR_COLOR=`
  float floorBlend=forest*(1.-road)*(1.-clamp(stony,0.,1.))*geology*uForestFloorEnabled;
  vec2 floorUv=lp.xz/2.1;
  if(floorBlend>.001){
    vec3 floorColor=floorSample(uForestFloorColor,floorUv);
    float damp=smoothstep(.48,.75,soil)*(1.-smoothstep(.12,.38,slope));
    floorColor*=mix(vec3(.92,.96,1.),vec3(.72,.80,.73),damp*.45);
    // Soil is brown under the canopy; only interrupted moist patches are green.
    floorColor=mix(floorColor,floorColor*vec3(.62,1.05,.65),smoothstep(.62,.82,closeDetail)*.17);
    diffuseColor.rgb=mix(diffuseColor.rgb,floorColor,floorBlend*.93);
  }
`;

export const FOREST_FLOOR_NORMAL=`
  if(floorBlend>.001){
    vec3 floorN=normalize(floorSample(uForestFloorNormal,floorUv)*2.-1.);
    vec3 tangent=normalize(vec3(ln.y,-ln.x,0.)),bitangent=normalize(cross(tangent,ln));
    vec3 surfaceN=normalize(tangent*floorN.x+bitangent*floorN.y+ln*floorN.z);
    normal=normalize(mix(normal,normalize(mat3(viewMatrix)*surfaceN),floorBlend*nearDetail*.48));
  }
`;

export const FOREST_FLOOR_ROUGHNESS=`
  if(floorBlend>.001){float floorRough=floorSample(uForestFloorRoughness,floorUv).r;
    roughnessFactor=mix(roughnessFactor,clamp(floorRough,.72,.98),floorBlend*.85);}
`;
