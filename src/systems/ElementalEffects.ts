import * as THREE from 'three';
import { BatchedParticleRenderer,ParticleSystem,RenderMode,ConstantValue,ConstantColor,Vector4,Vector3 as QuarksVector3,ColorOverLife,Gradient,type EmitterShape } from 'three.quarks';
import {createElementalForms,ELEMENT_INFO,type Element} from './ElementalForms';

const originShape:EmitterShape={type:'point',initialize(p){p.position.set(0,0,0);p.velocity.set(0,0,0);},update(){},toJSON(){return {type:'point'};},clone(){return {...this};}};
export interface ElementVisual {root:THREE.Group;form:THREE.Mesh;trail:ParticleSystem;busy:boolean;released:boolean;}

/** One shared Quarks trail batch and one impact batch; all effects reuse fixed slots. */
export class ElementalEffects {
  readonly batch=new BatchedParticleRenderer();
  readonly slots:ElementVisual[]=[];
  private forms=createElementalForms();
  private texture:THREE.CanvasTexture;
  private trailMaterial:THREE.MeshBasicMaterial;
  private impactMaterial:THREE.MeshBasicMaterial;
  private impacts:ParticleSystem[]=[];
  private axis=new THREE.Vector3(0,0,1);
  private impactCount=0;
  constructor(private scene:THREE.Scene,private random:()=>number) {
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(32,32,1,32,32,31);
    gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.25,'rgba(255,255,255,.8)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    this.texture=new THREE.CanvasTexture(canvas);
    this.trailMaterial=new THREE.MeshBasicMaterial({map:this.texture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false});
    this.impactMaterial=this.trailMaterial.clone();
    this.batch.name='FiveElementParticleBatch';scene.add(this.batch);
    for(let i=0;i<10;i++) {
      const root=new THREE.Group(),form=new THREE.Mesh(this.forms.geometry.metal,this.forms.materials.metal);root.add(form);root.visible=false;scene.add(root);
      const trail=new ParticleSystem({duration:3,looping:false,worldSpace:true,shape:originShape,material:this.trailMaterial,renderMode:RenderMode.Trail,startLife:new ConstantValue(2.6),startSpeed:new ConstantValue(0),startSize:new ConstantValue(.14),startColor:new ConstantColor(new Vector4(1,.8,.4,.7)),emissionOverTime:new ConstantValue(0),emissionBursts:[{time:0,count:new ConstantValue(1),cycle:1,interval:1,probability:1}],rendererEmitterSettings:{startLength:new ConstantValue(14),followLocalOrigin:true}});
      scene.add(trail.emitter);this.batch.addSystem(trail);trail.stop();this.slots.push({root,form,trail,busy:false,released:false});
    }
    for(let i=0;i<8;i++) {
      const burst=new ParticleSystem({duration:.1,looping:false,worldSpace:true,shape:originShape,material:this.impactMaterial,renderMode:RenderMode.BillBoard,startLife:new ConstantValue(.4),startSpeed:new ConstantValue(0),startSize:new ConstantValue(.15),startColor:new ConstantColor(new Vector4(1,1,1,1)),emissionOverTime:new ConstantValue(0),emissionBursts:[{time:0,count:new ConstantValue(18),cycle:1,interval:1,probability:1}]});
      burst.addBehavior(new ColorOverLife(new Gradient([[new QuarksVector3(1,1,1),0],[new QuarksVector3(1,1,1),1]],[[1,0],[0,1]])));
      scene.add(burst.emitter);this.batch.addSystem(burst);burst.stop();this.impacts.push(burst);
    }
  }
  acquire(element:Element):ElementVisual {
    const slot=this.slots.find(s=>!s.busy && s.trail.particleNum===0)??this.slots.find(s=>!s.busy)!;
    slot.busy=true;slot.released=false;slot.root.visible=true;slot.form.geometry=this.forms.geometry[element];slot.form.material=this.forms.materials[element];slot.root.scale.setScalar(.001);slot.form.rotation.set(0,0,0);
    const c=new THREE.Color(ELEMENT_INFO[element].color);slot.trail.startColor=new ConstantColor(new Vector4(c.r,c.g,c.b,.7));slot.trail.restart();return slot;
  }
  orient(slot:ElementVisual,direction:THREE.Vector3,spin:number) {slot.root.quaternion.setFromUnitVectors(this.axis,direction);slot.form.rotation.z=spin;}
  release(slot:ElementVisual) {slot.busy=false;slot.released=true;slot.root.visible=false;slot.trail.endEmit();for(let i=0;i<slot.trail.particleNum;i++)slot.trail.particles[i].life=slot.trail.particles[i].age+.14;}
  impact(position:THREE.Vector3,element:Element) {
    const burst=this.impacts.find(s=>s.particleNum===0);if(!burst)return;
    const color=new THREE.Color(ELEMENT_INFO[element].color);burst.startColor=new ConstantColor(new Vector4(color.r,color.g,color.b,1));burst.emitter.position.copy(position);burst.restart();burst.emit(.001,burst.emissionState,burst.emitter.matrixWorld as unknown as Parameters<ParticleSystem['emit']>[2]);
    for(let i=0;i<burst.particleNum;i++) {const p=burst.particles[i],a=this.random()*Math.PI*2,v=1+this.random()*3;p.position.set(position.x,position.y,position.z);p.velocity.set(Math.cos(a)*v,(this.random()-.2)*3,Math.sin(a)*v);}
    this.impactCount++;
  }
  update(dt:number,reduced:boolean,width:number,height:number) {
    for(const slot of this.slots){slot.trail.emitter.position.copy(slot.root.position);slot.trail.emitter.updateWorldMatrix(true,false);}
    this.batch.update(dt);
    for(const batch of this.batch.batches){const material=batch.material as THREE.ShaderMaterial;if(material.uniforms?.resolution)material.uniforms.resolution.value.set(width,height);}
    for(const system of this.impacts)for(let i=0;i<system.particleNum;i++){const particle=system.particles[i];particle.size.copy(particle.startSize).multiplyScalar(reduced?.7:1);}
  }
  clear() {for(const slot of this.slots){slot.busy=false;slot.released=false;slot.root.visible=false;slot.trail.stop();}this.impacts.forEach(s=>s.stop());this.batch.update(0);this.impactCount=0;}
  diagnostics(){return {projectileSlots:this.slots.length,activeProjectiles:this.slots.filter(s=>s.busy).length,trailParticles:this.slots.reduce((n,s)=>n+s.trail.particleNum,0),impactParticles:this.impacts.reduce((n,s)=>n+s.particleNum,0),impacts:this.impactCount,batches:this.batch.batches.length};}
  dispose(){this.clear();for(const s of this.slots){s.trail.dispose();this.scene.remove(s.root);}this.impacts.forEach(s=>s.dispose());this.batch.batches.forEach(b=>b.dispose());this.scene.remove(this.batch);this.forms.dispose();this.texture.dispose();this.trailMaterial.dispose();this.impactMaterial.dispose();}
}
