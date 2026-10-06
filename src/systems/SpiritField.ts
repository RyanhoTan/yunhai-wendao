import * as THREE from 'three';
import {ParticleSystem,BatchedParticleRenderer,RenderMode,ConstantValue,ConstantColor,Vector4,type Particle,type EmitterShape,type Behavior} from 'three.quarks';

/** Terrain-draped inward spirals and a bounded particle funnel, sharing the attack batch. */
export class SpiritField {
  private geometry=new THREE.RingGeometry(0,6,80,10).rotateX(-Math.PI/2);
  private material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uAge:{value:0},uStrength:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 vUv;uniform float uAge,uStrength;
    void main(){vec2 q=vUv-.5;float r=length(q)*2.;float a=atan(q.y,q.x+.00001);
      float lane=smoothstep(.7,.97,sin(a*4.+log(max(r,.025))*9.+uAge*5.)*.5+.5);
      float edge=1.-smoothstep(.88,1.,r),core=1.-smoothstep(.06,.2,r);
      vec3 col=mix(vec3(.07,.025,.14),vec3(.62,.38,.91),lane*.85);col=mix(col,vec3(.025,.012,.045),core);
      gl_FragColor=vec4(col,(.23+lane*.53+core*.22)*edge*uStrength);
      #include <colorspace_fragment>
    }`});
  readonly mesh=new THREE.Mesh(this.geometry,this.material);
  readonly particles:ParticleSystem;
  private center=new THREE.Vector3();private reduced=false;
  constructor(private scene:THREE.Scene,batch:InstanceType<typeof BatchedParticleRenderer>,particleMaterial:THREE.Material,random:()=>number) {
    this.mesh.name='GuixuSwallowSpiral';this.mesh.visible=false;this.mesh.frustumCulled=false;scene.add(this.mesh);
    const shape:EmitterShape={type:'point',initialize(p:Particle){const a=random()*Math.PI*2,r=4.6+random()*.8;p.position.set(Math.cos(a)*r,.45+random()*1.1,Math.sin(a)*r);p.velocity.set(0,0,0);},update(){},toJSON(){return{type:'point'};},clone(){return{...this};}};
    const behavior:Behavior={type:'swallow',initialize(){},frameUpdate(){},reset(){},toJSON(){return{type:'swallow'};},clone(){return{...this};},update:(p:Particle)=>{const dx=this.center.x-p.position.x,dz=this.center.z-p.position.z,turn=this.reduced?.7:2.2;p.velocity.set(dx*2.5-dz*turn,(this.center.y+.7-p.position.y)*2.5,dz*2.5+dx*turn);p.size.copy(p.startSize).multiplyScalar(1-.65*p.age/p.life);p.color.w=.75*(1-p.age/p.life);}};
    this.particles=new ParticleSystem({duration:20,looping:false,worldSpace:true,shape,material:particleMaterial,renderMode:RenderMode.BillBoard,startLife:new ConstantValue(1.2),startSpeed:new ConstantValue(0),startSize:new ConstantValue(.12),startColor:new ConstantColor(new Vector4(.65,.4,1,.75)),emissionOverTime:new ConstantValue(60),behaviors:[behavior]});
    scene.add(this.particles.emitter);batch.addSystem(this.particles);this.particles.stop();
  }
  start(center:THREE.Vector3,ground:(x:number,z:number)=>number) {
    this.center.copy(center);this.mesh.position.copy(center);const p=this.geometry.getAttribute('position');
    for(let i=0;i<p.count;i++)p.setY(i,ground(center.x+p.getX(i),center.z+p.getZ(i))-center.y+.1);
    p.needsUpdate=true;this.geometry.computeBoundingSphere();this.mesh.visible=true;this.particles.emitter.position.copy(center);this.particles.emitter.updateWorldMatrix(true,false);this.particles.restart();
  }
  progress(age:number,reduced:boolean) {this.reduced=reduced;this.material.uniforms.uAge.value=age*(reduced?.25:1);this.material.uniforms.uStrength.value=Math.min(1,age/.16,Math.max(0,(3-age)/.25));}
  end(){this.mesh.visible=false;this.particles.endEmit();}
  clear(){this.mesh.visible=false;this.particles.stop();}
  dispose(){this.particles.dispose();this.scene.remove(this.mesh);this.geometry.dispose();this.material.dispose();}
}
