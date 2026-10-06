import * as THREE from 'three';
import {ElementalEffects,type ElementVisual} from './ElementalEffects';
import {ELEMENT_INFO,type Element} from './ElementalForms';

export interface ElementalTarget {id:number;kind:'spirit'|'guardian';dead:boolean;model:{root:THREE.Object3D};}
interface Projectile<T>{visual:ElementVisual;age:number;index:number;element:Element;direction:THREE.Vector3;target:T|null;launched:boolean;}
export class ElementalCombat<T extends ElementalTarget> {
  element:Element='metal';cooldown=0;
  vortexCooldown=0;
  pulseCooldown=0;
  private pulse:{center:THREE.Vector3;age:number;hits:Set<number>}|null=null;
  private pulseHits=0;
  private vortex:{center:THREE.Vector3;age:number;tick:number}|null=null;
  private swallowed=0;
  private projectiles:Projectile<T>[]=[];
  private effects:ElementalEffects;
  private casts=0;private hits=0;
  private direction=new THREE.Vector3();private delta=new THREE.Vector3();private previous=new THREE.Vector3();private segment=new THREE.Vector3();
  constructor(scene:THREE.Scene,random:()=>number,private targets:()=>T[],private available:(e:T)=>boolean,private damage:(e:T,n:number,heavy:boolean)=>void,private ground:(x:number,z:number)=>number,private blocked:(a:THREE.Vector3,b:THREE.Vector3)=>boolean,private pull:(e:T,center:THREE.Vector3,step:number)=>void,private absorb:()=>void) {this.effects=new ElementalEffects(scene,random);}
  cast(position:THREE.Vector3,yaw:number):boolean {
    if(this.cooldown>0)return false;
    this.cooldown=3.2;this.casts++;this.direction.set(-Math.sin(yaw),0,-Math.cos(yaw));
    let target:T|null=null,best=32;
    for(const e of this.targets()){if(e.dead||!this.available(e))continue;this.delta.copy(e.model.root.position).sub(position);const d=this.delta.length();if(d<best&&this.delta.normalize().dot(this.direction)>.15){target=e;best=d;}}
    for(let i=0;i<5;i++){const visual=this.effects.acquire(this.element);visual.root.position.copy(position);visual.root.position.y+=1.3;this.projectiles.push({visual,age:0,index:i,element:this.element,direction:this.direction.clone(),target,launched:false});}
    return true;
  }
  update(dt:number,position:THREE.Vector3,reduced:boolean,realm:number) {
    this.cooldown=Math.max(0,this.cooldown-dt);
    this.vortexCooldown=Math.max(0,this.vortexCooldown-dt);
    this.pulseCooldown=Math.max(0,this.pulseCooldown-dt);
    if(this.vortex){const field=this.vortex;field.age+=dt;field.tick-=dt;this.effects.field.progress(field.age,reduced);const pulse=field.tick<=0,collapse=field.age>=3;if(pulse)field.tick+=.5;
      for(const e of this.targets()){if(e.dead||!this.available(e))continue;this.delta.copy(e.model.root.position).sub(field.center);const distance=Math.hypot(this.delta.x,this.delta.z);if(distance>6||Math.abs(this.delta.y)>4)continue;
        this.previous.copy(field.center);this.previous.y+=.8;this.delta.copy(e.model.root.position);this.delta.y+=.8;if(this.blocked(this.previous,this.delta))continue;
        this.pull(e,field.center,Math.min(distance,dt*(2+distance*1.7))*(e.kind==='guardian'?.18:1));
        if(pulse||collapse){this.damage(e,(collapse?25+realm*6:9+realm*4)*(e.kind==='guardian'?.6:1),false);if(e.dead){this.swallowed++;this.absorb();}}
      }
      if(collapse){this.effects.field.end();this.vortex=null;}
    }
    if(this.pulse){const pulse=this.pulse;pulse.age+=dt;const radius=7*(1-Math.pow(1-Math.min(1,pulse.age/.5),2));this.effects.pulse.progress(pulse.age);
      for(const e of this.targets()){if(e.dead||!this.available(e)||pulse.hits.has(e.id))continue;this.delta.copy(e.model.root.position).sub(pulse.center);if(Math.hypot(this.delta.x,this.delta.z)>radius||Math.abs(this.delta.y)>4)continue;
        this.previous.copy(pulse.center);this.previous.y+=.8;this.delta.copy(e.model.root.position);this.delta.y+=.8;if(this.blocked(this.previous,this.delta))continue;
        pulse.hits.add(e.id);this.pulseHits++;this.damage(e,22+realm*8,true);if(!e.dead)this.pull(e,pulse.center,e.kind==='guardian'?-.8:-3.2);
      }
      if(pulse.age>=.6){this.pulse=null;this.effects.pulse.end();}
    }
    for(let i=this.projectiles.length-1;i>=0;i--){
      const shot=this.projectiles[i],root=shot.visual.root,launch=.62+shot.index*.055;shot.age+=dt;
      if(shot.age<launch) {
        const angle=shot.index*Math.PI*2/5+shot.age*(reduced?1.2:7),radius=1.1+.18*Math.min(1,shot.age/.6);
        root.position.set(position.x+Math.cos(angle)*radius,position.y+1.25+Math.sin(angle*2)*.22,position.z+Math.sin(angle)*radius);root.scale.setScalar(.78*Math.min(1,shot.age/.1));
        if(shot.element==='water'||shot.element==='fire')this.delta.set(0,1,0);
        else if(shot.element==='metal')this.delta.set(Math.sin(angle)*.25,1,Math.cos(angle)*.25).normalize();
        else this.delta.set(Math.cos(angle+Math.PI/2),.25,Math.sin(angle+Math.PI/2)).normalize();
        this.effects.orient(shot.visual,this.delta,reduced?0:shot.age*2+shot.index);
        if(shot.element==='earth'&&!reduced){shot.visual.form.rotation.x=shot.age*3+shot.index;shot.visual.form.rotation.y=shot.age*2;}
        continue;
      }
      shot.launched=true;this.previous.copy(root.position);
      if(shot.target&&!shot.target.dead) {this.delta.copy(shot.target.model.root.position);this.delta.y+=shot.target.kind==='guardian'?1.5:.75;this.delta.sub(root.position).normalize();shot.direction.lerp(this.delta,1-Math.exp(-dt*10)).normalize();}
      root.position.addScaledVector(shot.direction,ELEMENT_INFO[shot.element].speed*dt);
      this.effects.orient(shot.visual,shot.direction,reduced?0:shot.age*3+shot.index);
      let hit:T|null=null;
      const segment=this.segment.copy(root.position).sub(this.previous),length=segment.lengthSq();
      const obstructed=this.blocked(this.previous,root.position);
      if(!obstructed)for(const e of this.targets()) {if(e.dead||!this.available(e))continue;this.delta.copy(e.model.root.position);this.delta.y+=e.kind==='guardian'?1.5:.75;this.delta.sub(this.previous);const along=THREE.MathUtils.clamp(this.delta.dot(segment)/Math.max(.000001,length),0,1);this.delta.addScaledVector(segment,-along);if(this.delta.length()<(e.kind==='guardian'?2.1:.85)){hit=e;break;}}
      const expired=shot.age>2.5,land=obstructed||root.position.y<this.ground(root.position.x,root.position.z)+.12;
      if(hit||expired||land){if(hit){this.damage(hit,ELEMENT_INFO[shot.element].damage+realm*4,true);this.hits++;}if(hit||land)this.effects.impact(root.position,shot.element);this.effects.release(shot.visual);this.projectiles.splice(i,1);}
    }
  }
  updateVisuals(dt:number,reduced:boolean,width=1280,height=720){this.effects.update(dt,reduced,width,height);}
  castVortex(center:THREE.Vector3):boolean {if(this.vortexCooldown>0)return false;this.vortexCooldown=9;this.vortex={center:center.clone(),age:0,tick:.45};this.effects.field.start(center,this.ground);return true;}
  castPulse(center:THREE.Vector3):boolean{if(this.pulseCooldown>0)return false;this.pulseCooldown=6;this.pulse={center:center.clone(),age:0,hits:new Set()};this.effects.pulse.start(center,this.ground);return true;}
  swordWave(position:THREE.Vector3,yaw:number){this.effects.pulse.slash(position,yaw);}
  get castingWeight():number{let weight=0;for(const p of this.projectiles)weight=Math.max(weight,Math.min(1,p.age/.14,Math.max(0,(1.1-p.age)/.25)));if(this.vortex)weight=Math.max(weight,Math.min(1,this.vortex.age/.14,Math.max(0,(.65-this.vortex.age)/.25)));if(this.pulse)weight=Math.max(weight,Math.min(1,this.pulse.age/.08,Math.max(0,(.6-this.pulse.age)/.2)));return weight;}
  clear(){this.projectiles.length=0;this.cooldown=0;this.vortexCooldown=0;this.pulseCooldown=0;this.pulse=null;this.pulseHits=0;this.vortex=null;this.swallowed=0;this.casts=0;this.hits=0;this.effects.clear();}
  diagnostics(){return {element:this.element,cooldown:this.cooldown,casts:this.casts,hits:this.hits,orbiting:this.projectiles.filter(s=>!s.launched).length,flying:this.projectiles.filter(s=>s.launched).length,vortex:this.vortex?{age:this.vortex.age,center:{x:this.vortex.center.x,y:this.vortex.center.y,z:this.vortex.center.z}}:null,vortexCooldown:this.vortexCooldown,swallowed:this.swallowed,fieldParticles:this.effects.field.particles.particleNum,pulseAge:this.pulse?.age??-1,pulseCooldown:this.pulseCooldown,pulseHits:this.pulseHits,castingWeight:this.castingWeight,...this.effects.pulse.diagnostics(),...this.effects.diagnostics()};}
  dispose(){this.effects.dispose();}
}
