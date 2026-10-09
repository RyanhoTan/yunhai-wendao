import * as THREE from 'three';
import {COAST_GLSL} from './CoastMath';
import {WEATHER_SKY_GLSL} from './Atmosphere';
import {moonTextureRotation} from '../assets/EmotiveMoon';

/** The sea and mountain water share weather, reflection and absorption. */
export function createWaterUniforms(moonTexture:THREE.Texture|null=null){
  return {uTime:{value:0},uWeatherTime:{value:0},
    uSun:{value:new THREE.Vector3(-.84,.46,.25).normalize()},
    uMoon:{value:new THREE.Vector3(.7,.3,-.2).normalize()},
    uDay:{value:1},uTwilight:{value:0},uCloudCover:{value:.42},uRain:{value:0},
    uMoonColorMap:{value:moonTexture},uMoonTextureRotation:{value:moonTextureRotation()}};
}
export type WaterUniforms=ReturnType<typeof createWaterUniforms>;

/** Keep the coastal palette and optics in one shader for every watercourse. */
export const WATER_SURFACE_GLSL=`
uniform float uTime,uWeatherTime;
${COAST_GLSL}
${WEATHER_SKY_GLSL}
vec2 waterMicroNormal(vec2 p,float near){
 return vec2(sin(p.x*3.8+p.y*1.6+uTime*2.2),cos(p.x*2.1-p.y*4.0+uTime*2.7))*.028*near;
}
vec3 waterFoamColor(){return mix(vec3(.075,.115,.17),vec3(.72,.80,.77),uDay);}
vec3 shadeWater(vec3 position,vec3 n,float depth,float foam){
 vec2 p=position.xz;vec3 eye=normalize(cameraPosition-position);
 float dist=length(cameraPosition-position);
 float fresnel=.025+.975*pow(1.0-max(dot(n,eye),0.0),5.0);
 float macro=fbmCoast(p*.04),caustic=pow(max(0.0,1.0-abs(sin(p.x*1.35+uTime*.22)+sin(p.y*1.4-uTime*.27))*.5),12.0)*.04;
 vec3 bedColor=mix(vec3(.25,.26,.18),vec3(.49,.40,.25),macro)+vec3(.4,.7,.5)*caustic;
 vec3 absorption=exp(-vec3(.72,.20,.15)*min(depth/max(.24,dot(n,eye)),18.0));
 vec3 sea=mix(vec3(.023,.13,.18),vec3(.055,.28,.28),exp(-depth*.30));
 vec3 result=bedColor*absorption+sea*(vec3(1.0)-absorption);
 result*=.09+uDay*.91;
 result=mix(result,coastSky(reflect(-eye,n),uWeatherTime),fresnel*.82);
 float sunGlint=pow(max(dot(reflect(-uSun,n),eye),0.0),170.0)*.5*uDay;
 float moonGlint=pow(max(dot(reflect(-uMoon,n),eye),0.0),170.0)*.125*(1.-uDay);
 result+=(vec3(1.0,.84,.61)*sunGlint+vec3(.25,.36,.53)*moonGlint)*(1.-uRain*.7)*(1.-uCloudCover*.5);
 result=mix(result,waterFoamColor(),clamp(foam,0.0,.96));
 return mix(result,mix(vec3(.016,.025,.052),vec3(.47,.62,.70),uDay),1.0-exp(-dist*.00037));
}
float waterOpacity(float depth,float foam){
 return max(mix(.47,1.0,smoothstep(.025,1.8,depth)),foam*.92);
}
`;
