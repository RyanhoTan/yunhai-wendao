import * as THREE from 'three';

/** Moon appearance from joshtol/emotive-engine, ae2accddc8f3e65a024c38b55e71a54b7fb10a14.
 * Moon.js calibration and moonWithBlendLayers.js Full/default surface math.
 * Copyright Emotive Engine Team; MIT notice in public/assets/moon/. */
export async function loadEmotiveMoonTexture():Promise<THREE.Texture>{
  const texture=await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}assets/moon/moon-color-4k.jpg`);
  // The reference samples its TextureLoader map without a color-space annotation.
  texture.colorSpace=THREE.NoColorSpace;texture.wrapS=THREE.RepeatWrapping;
  texture.name='EmotiveMoonColor4k';return texture;
}

export function moonTextureRotation():THREE.Matrix3{
  // Reference: qX(55.5) * qY(-85) * qZ(-60.5 about camera-to-moon, i.e. -Z).
  const d=Math.PI/180;
  return new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(55.5*d,-85*d,60.5*d,'XYZ'))).invert();
}

export const EMOTIVE_MOON_GLSL=`
uniform sampler2D uMoonColorMap;uniform mat3 uMoonTextureRotation;
vec3 emotiveFullMoon(vec3 viewNormal){
 vec3 local=normalize(uMoonTextureRotation*viewNormal);
 // Inverse Three.js SphereGeometry UVs, retaining the source calibrated face.
 vec2 uv=vec2(fract(atan(local.z,-local.x)/6.28318530718),.5+asin(clamp(local.y,-1.,1.))/3.14159265359);
 vec4 texColor=texture2D(uMoonColorMap,uv);
 float brightness=texColor.r+texColor.g+texColor.b;
 if(brightness<.03)texColor=vec4(.5,.5,.5,1.);
 // Source Full phase: shadowOffset=(0,0), shadowSoftness=.05.
 float facing=viewNormal.z,edgeWidth=max(fwidth(facing)*4.,.05*3.);
 float shadowFactor=smoothstep(-edgeWidth,edgeWidth,facing);
 vec3 earthshine=texColor.rgb*.01*vec3(.35,.4,.6);
 float litFactor=pow(shadowFactor,2.);
 float textureLuminance=dot(texColor.rgb,vec3(.299,.587,.114));
 vec3 detailEnhanced=mix(texColor.rgb*.92,texColor.rgb*1.06,smoothstep(.25,.55,textureLuminance));
 detailEnhanced=min(detailEnhanced,vec3(.85));
 vec3 shadowedColor=mix(earthshine,detailEnhanced,litFactor);
 vec3 emissive=vec3(.02)*shadowFactor;
 vec3 emotionGlow=vec3(1.)*1.*.02*shadowFactor;
 return shadowedColor+emissive+emotionGlow;
}
`;
