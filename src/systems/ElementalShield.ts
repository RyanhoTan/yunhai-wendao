import * as THREE from 'three';
import {ELEMENTS,type Element} from './ElementalForms';

export const SHIELD_COLORS:Record<Element,string>={metal:'#ffe4a3',wood:'#74dc8c',water:'#64cfff',fire:'#ff624e',earth:'#c8a16b'};
export const SHIELD_RULES={cost:18,duration:6,cooldown:10,capacity:42,realmCapacity:18,radius:1.48,centerHeight:1.5};
/** Original sphere shader; Flow Shield studied for rim, reveal and spherical hit-ring structure. */
export class ElementalShield {
  private geometry=new THREE.SphereGeometry(SHIELD_RULES.radius,48,32);
  private material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false,
    uniforms:{uColor:{value:new THREE.Color(SHIELD_COLORS.metal)},uMode:{value:0},uTime:{value:0},uFlowTime:{value:0},uOpacity:{value:0},uLife:{value:1},uHitDirections:{value:Array.from({length:4},()=>new THREE.Vector3(0,0,1))},uHitTimes:{value:new Float32Array(4).fill(-10)}},
    vertexShader:`varying vec3 vLocal,vNormal,vView;void main(){vLocal=position;vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);vView=-p.xyz;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`varying vec3 vLocal,vNormal,vView;uniform vec3 uColor,uHitDirections[4];uniform float uMode,uTime,uFlowTime,uOpacity,uLife,uHitTimes[4];
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 p=normalize(vLocal);float rim=pow(1.-clamp(abs(dot(normalize(vNormal),normalize(vView))),0.,1.),2.8);float t=uFlowTime;
        float flow=noise(p*5.+vec3(t*.15,-t*.3,t*.08));float pattern;
        if(uMode<.5)pattern=pow(abs(sin(atan(p.z,p.x+.0001)*8.+p.y*2.)),26.)*.5+pow(abs(sin(p.y*19.+flow*2.)),28.)*.35;
        else if(uMode<1.5)pattern=pow(.5+.5*sin(p.y*15.+sin(p.x*11.+sin(p.z*9.))+t*.5),12.);
        else if(uMode<2.5)pattern=pow(.5+.5*sin(p.y*23.+flow*5.-t*2.),16.);
        else if(uMode<3.5)pattern=pow(noise(p*9.+vec3(0,-t*1.2,0)),3.)*(.5+.5*sin(p.y*17.-t*4.+flow*5.));
        else pattern=1.-smoothstep(.035,.1,abs(noise(p*8.)-.5));
        float hits=0.;for(int i=0;i<4;i++){float age=uTime-uHitTimes[i];if(age>=0.&&age<.85){float d=acos(clamp(dot(p,uHitDirections[i]),-1.,1.));hits+=(1.-smoothstep(.035,.11,abs(d-age*2.8)))*(1.-age/.85);}}
        float alpha=clamp(.018+rim*.34+pattern*(.02+rim*.07)+hits*.16,0.,.55)*uOpacity;
        vec3 color=uColor*(.75+rim*.65+flow*.16)+vec3(hits*.34);gl_FragColor=vec4(color,alpha*(.65+.35*uLife)*(gl_FrontFacing?1.:.2));
        #include <colorspace_fragment>
      }`});
  readonly mesh=new THREE.Mesh(this.geometry,this.material);
  element:Element='metal';cooldown=0;remaining=0;capacity=0;maxCapacity=0;
  private clock=0;private fade=0;private hitIndex=0;private hits=0;private absorbed=0;
  private direction=new THREE.Vector3();
  constructor(private scene:THREE.Scene){this.mesh.name='FiveElementTransparentShield';this.mesh.visible=false;this.mesh.renderOrder=4;scene.add(this.mesh);}
  get active(){return this.remaining>0&&this.capacity>0;}
  cast(element:Element,realm:number,position:THREE.Vector3){if(this.cooldown>0||this.active)return false;this.element=element;this.cooldown=SHIELD_RULES.cooldown;this.remaining=SHIELD_RULES.duration;this.maxCapacity=this.capacity=SHIELD_RULES.capacity+realm*SHIELD_RULES.realmCapacity;this.fade=0;this.material.uniforms.uColor.value.set(SHIELD_COLORS[element]);this.material.uniforms.uMode.value=ELEMENTS.indexOf(element);this.material.uniforms.uHitTimes.value.fill(-10);this.follow(position);this.mesh.visible=true;return true;}
  update(dt:number,position:THREE.Vector3,reduced:boolean){this.clock+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.remaining=Math.max(0,this.remaining-dt);this.fade=THREE.MathUtils.damp(this.fade,this.active?1:0,12,dt);if(this.remaining===0)this.capacity=0;this.follow(position);
    this.material.uniforms.uTime.value=this.clock;this.material.uniforms.uOpacity.value=this.fade;this.material.uniforms.uLife.value=this.maxCapacity?this.capacity/this.maxCapacity:0;
    this.material.uniforms.uFlowTime.value+=dt*(reduced?.15:1);this.mesh.visible=this.active||this.fade>.005;
    this.mesh.scale.setScalar(reduced?1:1+Math.sin(this.clock*2)*.003);
  }
  private follow(position:THREE.Vector3){this.mesh.position.copy(position);this.mesh.position.y+=SHIELD_RULES.centerHeight;}
  absorb(amount:number,source:THREE.Vector3|undefined,position:THREE.Vector3,yaw:number){if(!this.active)return {absorbed:0,remainder:amount};const blocked=Math.min(amount,this.capacity);this.capacity-=blocked;this.absorbed+=blocked;this.hits++;
    if(source)this.direction.copy(source).sub(position);else this.direction.set(-Math.sin(yaw),0,-Math.cos(yaw));this.direction.y=.12;if(this.direction.lengthSq()<.00001)this.direction.set(0,0,-1);this.direction.normalize();
    const slot=this.hitIndex++%4;this.material.uniforms.uHitDirections.value[slot].copy(this.direction);this.material.uniforms.uHitTimes.value[slot]=this.clock;if(this.capacity===0)this.remaining=0;return {absorbed:blocked,remainder:amount-blocked};}
  clear(){this.cooldown=0;this.remaining=0;this.capacity=0;this.maxCapacity=0;this.clock=0;this.fade=0;this.hits=0;this.absorbed=0;this.hitIndex=0;this.mesh.visible=false;this.material.uniforms.uOpacity.value=0;this.material.uniforms.uFlowTime.value=0;this.material.uniforms.uHitTimes.value.fill(-10);}
  diagnostics(){return {active:this.active,element:this.element,color:SHIELD_COLORS[this.element],cooldown:this.cooldown,remaining:this.remaining,capacity:this.capacity,maxCapacity:this.maxCapacity,hits:this.hits,absorbed:this.absorbed,visible:this.mesh.visible,opacity:this.fade,clock:this.clock,position:{x:this.mesh.position.x,y:this.mesh.position.y,z:this.mesh.position.z},radius:SHIELD_RULES.radius};}
  dispose(){this.clear();this.scene.remove(this.mesh);this.geometry.dispose();this.material.dispose();}
}
