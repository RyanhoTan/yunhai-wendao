/** Original sky-space bloom/rays, inspired by hizzd's warm emissive sun.
 * Shared by the sky and its water reflection; no flare textures or extra passes.
 */
export const SOLAR_DISC_GLSL=`
const float SUN_RADIUS=.032*5.;
vec3 solarSky(vec3 sky,vec3 d){
 float alignment=dot(d,uSun),visibility=uDay*smoothstep(-.04,.02,uSun.y);
 if(visibility<=0.)return sky;
 float distanceToSun=sqrt(max(0.,1.-alignment*alignment));
 // Only the hemisphere facing the sun contributes (the sine distance has two poles).
 if(alignment<=0.)return sky;
 float radius=distanceToSun/SUN_RADIUS;
 float warm=1.-smoothstep(.04,.32,uSun.y);
 vec3 glow=mix(vec3(1.,.76,.40),vec3(1.,.39,.12),warm);
 float bloom=exp(-radius*radius*.17)*.26+exp(-radius*radius*.025)*.055;
 // Angular rays occupy only a small neighbourhood, avoiding extra full-screen noise.
 if(radius>.8&&radius<7.){
  vec3 right=normalize(cross(uSun,vec3(0.,1.,0.))),up=cross(right,uSun);
  vec2 uv=vec2(dot(d,right),dot(d,up))/SUN_RADIUS;
  float angle=atan(uv.y,uv.x);
  float spokes=pow(max(0.,sin(angle*9.+.6)*.5+.5),12.)
             +pow(max(0.,sin(angle*13.-.8)*.5+.5),18.)*.45;
  float rays=spokes*exp(-radius*.75)*smoothstep(.8,1.5,radius)
             *(1.-smoothstep(5.,7.,radius))*.20;
  bloom+=rays;
 }
 sky+=glow*bloom*visibility;
 float edge=sqrt(1.-SUN_RADIUS*SUN_RADIUS),aa=max(fwidth(alignment),.000001);
 float disc=smoothstep(edge-aa,edge+aa,alignment);
 vec3 rim=mix(vec3(3.2,2.0,.85),vec3(3.5,.95,.25),warm);
 vec3 core=mix(vec3(5.5,4.7,3.2),vec3(5.0,2.6,.85),warm);
 vec3 surface=mix(rim,core,sqrt(max(0.,1.-radius*radius)));
 return mix(sky,surface,disc*visibility);
}
`;
