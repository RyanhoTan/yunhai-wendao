/** Shared metre-scale coast: rendering, traversal and the map use this shoreline. */
export const SEA_LEVEL = 0;
export function shorelineAt(x: number): number {
  return 196 + Math.sin(x * .014) * 13 + Math.sin(x * .05 + .8) * 3;
}
export function coastalHeight(x: number, z: number): number {
  const inland = shorelineAt(x) - z;
  if (inland < 0) return inland * .055 - inland * inland * .00016;
  const dune = Math.exp(-(((inland - 43) / 19) ** 2)) * (1.1 + .55 * Math.sin(x * .038));
  const ripples = Math.sin(x * .8 + Math.sin(z * .23)) * .016 * Math.exp(-inland * .015);
  return inland * .047 + dune + ripples;
}
export function coastBlend(z: number): number {
  const t = Math.max(0, Math.min(1, (z - 120) / 26));
  return t * t * (3 - 2 * t);
}
/** Grounded saves never restore a sword-flight position onto the seabed. */
export function safeCoastalPosition(x: number, z: number, isClear?: (x:number,z:number)=>boolean) {
  const candidate={ x, z: Math.min(z, shorelineAt(x) - 5) };
  if(z<=166||!isClear||isClear(candidate.x,candidate.z))return candidate;
  // Search farther inland before sideways, keeping a saved landing near its original coast.
  for(const inland of [10,18,28,38,52])for(const offset of [0,-8,8,-16,16,-24,24]){
    const px=Math.max(-294,Math.min(294,x+offset)),pz=Math.min(z,shorelineAt(px)-inland);
    if(isClear(px,pz))return{x:px,z:pz};
  }
  // The authored central beach channel contains neither trees nor rock obstacles.
  return{x:0,z:shorelineAt(0)-18};
}
export const COAST_GLSL = `
float coastLine(float x){return 196.0 + sin(x*.014)*13.0 + sin(x*.05+.8)*3.0;}
float shoreDistance(vec2 p){return p.y-coastLine(p.x);}
float hashCoast(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noiseCoast(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(hashCoast(i),hashCoast(i+vec2(1,0)),f.x),mix(hashCoast(i+vec2(0,1)),hashCoast(i+vec2(1)),f.x),f.y);}
float fbmCoast(vec2 p){float n=0.0,a=.5;for(int i=0;i<4;i++){n+=a*noiseCoast(p);p=p*2.07+vec2(13.7,4.9);a*=.5;}return n;}
float seaHeight(vec2 p,float t){
 float d=shoreDistance(p),fade=smoothstep(-2.0,16.0,d);
 float group=.84+.12*sin(t*.12+p.x*.009);
 float h=sin(d*.29+t*1.28+p.x*.023)*.27 + sin(d*.43+t*1.73-p.x*.042)*.12;
 h+=sin(dot(p,vec2(.13,.71))-t*2.14)*.048;
 return h*fade*group + .14*sin(t*.82+p.x*.02)*(1.0-smoothstep(0.0,20.0,d));
}
`;
