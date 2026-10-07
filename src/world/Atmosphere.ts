import * as THREE from 'three';
import type {WeatherSnapshot} from '../systems/WeatherState';

export interface Atmosphere {
  sun:THREE.Vector3;moon:THREE.Vector3;day:number;twilight:number;cloudCover:number;rain:number;
  fog:THREE.Color;sunColor:THREE.Color;skyLight:THREE.Color;
}
/** An authored daily arc, not geolocated astronomy. Local 06:00/18:00 cross the horizon. */
export function sampleAtmosphere(weather:WeatherSnapshot):Atmosphere {
  const angle=(weather.hour-12)*Math.PI/12,c=Math.cos(angle);
  const sun=new THREE.Vector3(-c*.84,c*.46,Math.sin(angle)*.9+.25).normalize();
  const moon=new THREE.Vector3(-sun.x,.27,-sun.z).normalize();
  const day=THREE.MathUtils.smoothstep(sun.y,-.06,.18);
  const twilight=Math.exp(-Math.pow(sun.y/.16,2))*(1-weather.cloudCover*.65);
  const fog=new THREE.Color('#101b32').lerp(new THREE.Color('#b4cbd6'),day);
  fog.lerp(new THREE.Color('#b38d79'),twilight*.42*day);
  fog.lerp(new THREE.Color('#657888'),weather.rain*.35*day);
  const sunColor=new THREE.Color('#ffba7c').lerp(new THREE.Color('#fff0d7'),THREE.MathUtils.smoothstep(sun.y,.08,.3));
  const skyLight=new THREE.Color('#8ca5cf').lerp(new THREE.Color('#c4dce9'),day);
  return {sun,moon,day,twilight,cloudCover:weather.cloudCover,rain:weather.rain,fog,sunColor,skyLight};
}

/** Shared sky and ocean reflection: original moon surface and lightweight layered clouds. */
export const WEATHER_SKY_GLSL=`
uniform vec3 uSun,uMoon;uniform float uDay,uTwilight,uCloudCover,uRain;
vec3 lunarSurface(vec3 d){
 vec3 right=normalize(cross(vec3(0.,1.,0.),uMoon)),up=cross(uMoon,right);
 vec2 uv=vec2(dot(d,right),dot(d,up))/.023;float r=dot(uv,uv);
 if(r>1.)return vec3(0.);
 vec3 normal=vec3(uv,sqrt(max(0.,1.-r)));
 float maria=smoothstep(.32,.65,fbmCoast(uv*3.4+vec2(4.7,-2.1)));
 float surface=mix(.35,.79,maria)+noiseCoast(uv*44.)*.05;
 for(int i=0;i<12;i++){
  float id=float(i);vec2 center=vec2(hashCoast(vec2(id,3.1)),hashCoast(vec2(id,8.4)))*1.8-.9;
  float radius=.035+hashCoast(vec2(id,16.7))*.1,dist=length(uv-center);
  surface-=.16*(1.-smoothstep(radius*.6,radius,dist));
  surface+=.1*exp(-pow((dist-radius)/.015,2.));
 }
 float light=dot(normal,normalize(vec3(.16,.06,1.)));
 float phase=smoothstep(-fwidth(light),fwidth(light),light);
 vec3 face=vec3(.68,.74,.82)*surface*(.55+.45*max(light,0.))*phase;
 return face+vec3(.017,.031,.065)*surface*(1.-phase);
}
vec3 coastSky(vec3 direction,float t){
 vec3 d=normalize(direction);float h=max(d.y,0.);
 vec3 noon=mix(vec3(.47,.65,.77),vec3(.075,.28,.52),pow(h,.48));
 vec3 night=mix(vec3(.016,.025,.052),vec3(.003,.009,.024),pow(h,.48));
 vec3 color=mix(night,noon,uDay);
 color=mix(color,mix(vec3(.52,.18,.065),vec3(.035,.032,.14),pow(h,.52)),uTwilight*.38);
 color+=vec3(.50,.19,.055)*uTwilight*pow(1.-h,5.);
 float solar=max(dot(d,uSun),0.);
 color+=vec3(1.,.86,.63)*pow(solar,24.)*.06*uDay;
 color+=vec3(1.,.82,.55)*smoothstep(.99978,.99993,solar)*3.*uDay;
 float lunar=max(dot(d,uMoon),0.),nightWeight=(1.-uDay)*smoothstep(0.,.09,d.y);
 color+=vec3(.025,.047,.08)*pow(lunar,190.)*nightWeight;
 if(lunar>.9997)color+=lunarSurface(d)*smoothstep(.99969,.999735,lunar)*nightWeight*1.7;
 vec2 starUV=vec2(atan(d.z,d.x)*80.,d.y*110.),cell=floor(starUV);
 float star=step(.996,hashCoast(cell))*pow(max(0.,1.-length(fract(starUV)-.5)*2.8),7.);
 color+=vec3(.42,.51,.65)*star*nightWeight;
 vec2 cloudUV=d.xz/max(.12,d.y)*1.05+vec2(t*.0013,t*.0003)+vec2(4.2,-1.3);
 float n=fbmCoast(cloudUV),threshold=mix(.91,.24,uCloudCover);
 float density=smoothstep(threshold,threshold+.16,n)*smoothstep(.08,.22,d.y)*smoothstep(0.,.05,uCloudCover);
 float edge=clamp((fbmCoast(cloudUV+uSun.xz*.27)-n)*5.+.84,.48,1.);
 vec3 cloud=mix(vec3(.024,.04,.075),mix(vec3(.39,.47,.55),vec3(.92,.93,.89),edge),uDay);
 cloud*=1.-uRain*.48;cloud+=vec3(.1,.13,.18)*pow(lunar,80.)*nightWeight;
 color=mix(color,cloud,density);
 color=mix(color,mix(vec3(.015,.026,.044),vec3(.30,.39,.47),uDay),uRain*.32*pow(1.-h,2.));
 return mix(mix(vec3(.006,.012,.021),vec3(.13,.29,.38),uDay),color,smoothstep(-.14,.035,d.y));
}
`;
