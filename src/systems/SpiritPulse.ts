import * as THREE from 'three';

export class SpiritPulse {
  private floorGeometry=new THREE.RingGeometry(0,7,80,10).rotateX(-Math.PI/2);
  private floorMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,uniforms:{uRadius:{value:0},uAlpha:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 vUv;uniform float uRadius,uAlpha;
    void main(){float r=length(vUv-.5)*2.;float wave=1.-smoothstep(.016,.05,abs(r-uRadius));float echo=1.-smoothstep(.006,.024,abs(r-uRadius*.76));gl_FragColor=vec4(.52,.98,.83,(wave+echo*.32)*uAlpha);#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
  readonly mesh=new THREE.Mesh(this.floorGeometry,this.floorMaterial);
  private arcGeometry=new THREE.BufferGeometry();
  private arcs:{mesh:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;age:number}[]=[];
  constructor(private scene:THREE.Scene) {
    this.mesh.name='SpiritPressureWave';this.mesh.visible=false;this.mesh.frustumCulled=false;scene.add(this.mesh);
    const positions:number[]=[],uv:number[]=[];
    for(let i=0;i<40;i++){const a=-1.1+i/40*2.2,b=-1.1+(i+1)/40*2.2;for(const [angle,r,t,w] of [[a,1.25,i/40,0],[a,2.35,i/40,1],[b,2.35,(i+1)/40,1],[a,1.25,i/40,0],[b,2.35,(i+1)/40,1],[b,1.25,(i+1)/40,0]]){positions.push(Math.sin(angle)*r,Math.sin(angle)*.14,-Math.cos(angle)*r);uv.push(t,w);}}
    this.arcGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.arcGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));this.arcGeometry.computeBoundingSphere();
    for(let i=0;i<3;i++){const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,uniforms:{uAlpha:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 vUv;uniform float uAlpha;void main(){float edge=pow(sin(vUv.y*3.14159),1.8)*pow(sin(vUv.x*3.14159),.5);gl_FragColor=vec4(1.,.82,.42,edge*uAlpha);#include <colorspace_fragment>}`.replace(';#include',';\n#include')});const mesh=new THREE.Mesh(this.arcGeometry,material);mesh.visible=false;mesh.name='GoldenSwordQiArc';scene.add(mesh);this.arcs.push({mesh,age:1});}
  }
  start(center:THREE.Vector3,ground:(x:number,z:number)=>number){this.mesh.position.copy(center);const p=this.floorGeometry.getAttribute('position');for(let i=0;i<p.count;i++)p.setY(i,ground(center.x+p.getX(i),center.z+p.getZ(i))-center.y+.12);p.needsUpdate=true;this.floorGeometry.computeBoundingSphere();this.mesh.visible=true;this.progress(0);}
  progress(age:number){this.floorMaterial.uniforms.uRadius.value=Math.min(1,1-Math.pow(1-Math.min(1,age/.5),2));this.floorMaterial.uniforms.uAlpha.value=Math.max(0,1-age/.6)*.78;}
  end(){this.mesh.visible=false;}
  slash(position:THREE.Vector3,yaw:number){const arc=this.arcs.find(a=>!a.mesh.visible)??this.arcs[0];arc.age=0;arc.mesh.visible=true;arc.mesh.position.copy(position);arc.mesh.position.y+=1.0;arc.mesh.rotation.y=yaw;arc.mesh.material.uniforms.uAlpha.value=.85;arc.mesh.scale.setScalar(.8);}
  update(dt:number,reduced:boolean){for(const arc of this.arcs){if(!arc.mesh.visible)continue;arc.age+=dt;const t=Math.min(1,arc.age/.25);arc.mesh.scale.setScalar(.8+t*.23);arc.mesh.material.uniforms.uAlpha.value=(1-t)*(reduced?.55:.85);if(t>=1)arc.mesh.visible=false;}}
  clear(){this.end();this.arcs.forEach(a=>a.mesh.visible=false);}
  diagnostics(){return {swordArcs:this.arcs.filter(a=>a.mesh.visible).length};}
  dispose(){this.scene.remove(this.mesh);this.floorGeometry.dispose();this.floorMaterial.dispose();this.arcGeometry.dispose();for(const arc of this.arcs){this.scene.remove(arc.mesh);arc.mesh.material.dispose();}}
}
