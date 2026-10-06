import * as THREE from 'three';

export type HeadPart = {geometry:THREE.BufferGeometry;material:THREE.Material;bone:string};

/** Original anatomical sculpt; long-wind's bony-landmark approach informed the construction. */
export function buildCultivatorHead(origin:THREE.Vector3):HeadPart[] {
  const parts:HeadPart[]=[];
  const point=(x:number,y:number,z:number)=>origin.clone().add(new THREE.Vector3(x,y,z));
  const add=(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1,rotation=new THREE.Euler())=>{
    geometry.applyMatrix4(new THREE.Matrix4().compose(point(x,y,z),new THREE.Quaternion().setFromEuler(rotation),new THREE.Vector3(sx,sy,sz)));
    parts.push({geometry,material,bone:'Head'});
  };
  const gaussian=(x:number,r:number)=>Math.exp(-x*x/(r*r));
  const pores=document.createElement('canvas');pores.width=pores.height=256;
  const ctx=pores.getContext('2d')!,pixels=ctx.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const hash=Math.sin(x*127.1+y*311.7)*43758.5453,noise=hash-Math.floor(hash);
    const v=128+(noise-.5)*30-(noise>.94?23:0),i=(y*256+x)*4;
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const bumpMap=new THREE.CanvasTexture(pores);
  const skin=new THREE.MeshPhysicalMaterial({color:'#c99f83',roughness:.58,specularIntensity:.42,bumpMap,bumpScale:.00035,vertexColors:true,sheen:.08,sheenColor:new THREE.Color('#c58b77')});
  const skinDetail=skin.clone();skinDetail.vertexColors=false;
  const hairCanvas=document.createElement('canvas');hairCanvas.width=hairCanvas.height=256;
  const hc=hairCanvas.getContext('2d')!,hp=hc.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const strand=.5+.5*Math.sin(x*2.73+Math.sin(y*.03)*.6),v=178+strand*55,i=(y*256+x)*4;
    hp.data[i]=hp.data[i+1]=hp.data[i+2]=v;hp.data[i+3]=255;
  }
  hc.putImageData(hp,0,0);const hairMap=new THREE.CanvasTexture(hairCanvas);hairMap.colorSpace=THREE.SRGBColorSpace;
  const hair=new THREE.MeshPhysicalMaterial({color:'#242321',map:hairMap,roughness:.45,sheen:.25,sheenColor:new THREE.Color('#77604d'),anisotropy:.5});
  const sclera=new THREE.MeshPhysicalMaterial({color:'#c5bca8',roughness:.35,specularIntensity:.5});
  const iris=new THREE.MeshPhysicalMaterial({color:'#453225',roughness:.25});
  const pupil=new THREE.MeshPhysicalMaterial({color:'#120f0d',roughness:.17});
  const lip=new THREE.MeshStandardMaterial({color:'#a37163',roughness:.64});
  const crease=new THREE.MeshStandardMaterial({color:'#684b3d',roughness:.85});
  const gold=new THREE.MeshStandardMaterial({color:'#9f8150',metalness:.72,roughness:.37});

  // y, half-width, front depth, back depth: narrower jaw, broader cranium, flat facial planes.
  const profile=[[-.067,.002,.024,.025],[-.054,.024,.064,.04],[-.038,.043,.073,.053],[-.015,.059,.078,.065],[.013,.066,.080,.074],[.045,.071,.081,.083],[.075,.073,.082,.09],[.106,.073,.082,.094],[.133,.071,.078,.094],[.155,.061,.063,.083],[.176,.038,.038,.055],[.185,.001,.001,.001]];
  const segments=80,rows=profile.length*5;
  const positions:number[]=[],colors:number[]=[],uvs:number[]=[],indices:number[]=[];
  const base=new THREE.Color('#ffffff'),warm=new THREE.Color('#d4a38e'),shadow=new THREE.Color('#baaea2');
  for(let row=0;row<=rows;row++){
    const t=row/rows*(profile.length-1),j=Math.min(profile.length-2,Math.floor(t)),f=t-j;
    const sample=(column:number)=>{
      const a=profile[Math.max(0,j-1)]![column]!,b=profile[j]![column]!,c=profile[j+1]![column]!,d=profile[Math.min(profile.length-1,j+2)]![column]!;
      return .5*(2*b+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f);
    };
    const y=sample(0),width=Math.max(.001,sample(1)),front=sample(2),back=sample(3);
    for(let col=0;col<=segments;col++){
      const a=col/segments*Math.PI*2,c=Math.cos(a),x=width*Math.sin(a);
      let z=c>=0?-front*Math.pow(c,.48):back*-c;
      const facing=Math.max(0,c);
      z+=facing*.010*(gaussian(x-.032,.018)+gaussian(x+.032,.018))*gaussian(y-.087,.014);
      z-=facing*(.010*gaussian(x,.011)*gaussian(y-.086,.039)+.024*gaussian(x,.013)*gaussian(y-.050,.014));
      z-=facing*.005*(gaussian(x-.014,.008)+gaussian(x+.014,.008))*gaussian(y-.045,.009);
      z-=facing*.005*(gaussian(x-.049,.020)+gaussian(x+.049,.020))*gaussian(y-.056,.020);
      z+=facing*.004*(gaussian(x-.048,.017)+gaussian(x+.048,.017))*gaussian(y-.018,.022);
      z-=facing*.005*gaussian(x,.026)*gaussian(y+.039,.013);
      z-=facing*.004*gaussian(x,.019)*gaussian(y-.011,.013);
      const cheek=facing*gaussian(Math.abs(x)-.05,.025)*gaussian(y-.055,.035)*.19;
      const under=facing*gaussian(y+.023,.036)*.07;
      const color=base.clone().lerp(warm,cheek).lerp(shadow,under);
      positions.push(x,y,z);colors.push(color.r,color.g,color.b);uvs.push(col/segments,row/rows);
      if(row<rows&&col<segments){const k=row*(segments+1)+col;indices.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2);}
    }
  }
  const face=new THREE.BufferGeometry();face.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));face.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));face.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));face.setIndex(indices);face.computeVertexNormals();
  // Geometry merging groups by material; only skin has vertex colors, all other parts share matching attributes below.
  // Keep the scalp source in head-local space; add() transforms only the render copy.
  add(face.clone(),skin,0,0,0);
  add(new THREE.CylinderGeometry(.034,.041,.09,24),skinDetail,0,-.085,.012);
  const tube=(coords:number[][],radius:number,material:THREE.Material,steps=20)=>{
    const curve=new THREE.CatmullRomCurve3(coords.map(p=>point(p[0]!,p[1]!,p[2]!)));
    parts.push({geometry:new THREE.TubeGeometry(curve,steps,radius,6,false),material,bone:'Head'});
  };
  for(const side of [-1,1]){
    add(new THREE.SphereGeometry(1,20,16),skinDetail,side*.077,.067,.001,.012,.026,.017);
    tube([[side*.081,.085,-.01],[side*.089,.079,-.006],[side*.088,.06,-.012],[side*.081,.05,-.016]],.0025,skinDetail);
    add(new THREE.SphereGeometry(1,12,10),crease,side*.086,.067,-.014,.003,.008,.0015);
    // Almond eye aperture, with recessed corners rather than a white oval pasted onto the skull.
    const p:number[]=[],uv:number[]=[],ix:number[]=[];
    for(let u=0;u<=24;u++){
      const q=u/24*2-1,half=Math.sqrt(Math.max(0,1-q*q));
      for(let v=0;v<=8;v++){
        const r=v/8*2-1;
        p.push(side*.032+q*.013,.087+r*half*(r>0?.0043:.0031)+side*q*.001,-.0715-.006*half*(1-r*r));uv.push(u/24,v/8);
        if(u<24&&v<8){const k=u*9+v;ix.push(k,k+1,k+9,k+1,k+10,k+9);}
      }
    }
    const eye=new THREE.BufferGeometry();eye.setAttribute('position',new THREE.Float32BufferAttribute(p,3));eye.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));eye.setIndex(ix);eye.computeVertexNormals();add(eye,sclera,0,0,0);
    add(new THREE.SphereGeometry(1,20,12),iris,side*.032,.087,-.0778,.0035,.0035,.001);
    add(new THREE.SphereGeometry(1,16,10),pupil,side*.032,.087,-.0787,.0017,.0023,.0006);
    // Flesh ribbons bridge the complete sclera perimeter into the carved socket.
    const lp:number[]=[],lu:number[]=[],li:number[]=[];
    for(let k=0;k<=40;k++)for(let row=0;row<=4;row++){
      const a=k/40*Math.PI*2,c=Math.cos(a),s=Math.sin(a),t=row/4;
      const x=side*.032+c*(.013+t*.009),y=.087+s*((s>0?.0043:.0031)+t*.007)+side*c*.001;
      const front=Math.sqrt(Math.max(0,1-(x/.073)**2));
      const socket=-.082*Math.pow(front,.48)+front*.010*(gaussian(x-.032,.018)+gaussian(x+.032,.018))*gaussian(y-.087,.014)
        -front*.010*gaussian(x,.011)*gaussian(y-.086,.039)
        -front*.005*(gaussian(x-.049,.020)+gaussian(x+.049,.020))*gaussian(y-.056,.020);
      lp.push(x,y,THREE.MathUtils.lerp(-.0718,socket,t)-.0012*Math.sin(t*Math.PI)*Math.abs(s));lu.push(k/40,t);
      if(k<40&&row<4){const i=k*5+row;li.push(i,i+5,i+1,i+1,i+5,i+6);}
    }
    const lids=new THREE.BufferGeometry();lids.setAttribute('position',new THREE.Float32BufferAttribute(lp,3));lids.setAttribute('uv',new THREE.Float32BufferAttribute(lu,2));lids.setIndex(li);lids.computeVertexNormals();add(lids,skinDetail,0,0,0);
    tube([[side*.017,.104,-.079],[side*.031,.11,-.077],[side*.044,.108,-.070],[side*.054,.104,-.065]],.0021,hair);
    add(new THREE.SphereGeometry(1,16,12),crease,side*.010,.041,-.100,.003,.0017,.001);
  }
  tube([[-.022,.01,-.077],[-.011,.012,-.085],[0,.015,-.086],[.011,.012,-.085],[.022,.01,-.077]],.0021,lip);
  tube([[-.02,.009,-.078],[0,.006,-.085],[.02,.009,-.078]],.0027,lip);
  tube([[-.020,.009,-.079],[0,.009,-.087],[.020,.009,-.079]],.00075,crease);

  const cap=face.clone();cap.deleteAttribute('color');const cp=cap.getAttribute('position'),capIndices:number[]=[];
  const hairline=(i:number)=>{const z=cp.getZ(i);return -.016+.144*THREE.MathUtils.smoothstep(-z/(z<0?.082:.094),-.7,.9);};
  const retained=(i:number)=>cp.getY(i)>=hairline(i);
  for(let i=0;i<indices.length;i+=3){const a=indices[i]!,b=indices[i+1]!,c=indices[i+2]!;if(retained(a)||retained(b)||retained(c))capIndices.push(a,b,c);}
  // Project crossing triangles to the analytic hairline instead of leaving a stair-stepped cut.
  for(let i=0;i<cp.count;i++){const x=cp.getX(i),y=Math.max(cp.getY(i),hairline(i)),z=cp.getZ(i);const groove=.0006*Math.sin(Math.atan2(x,z)*52+y*45);cp.setXYZ(i,x*1.045,y+.002,z*1.045+groove);}
  cap.setIndex(capIndices);cap.computeVertexNormals();add(cap,hair,0,0,0);
  const knot=new THREE.SphereGeometry(1,32,20),kp=knot.getAttribute('position');
  for(let i=0;i<kp.count;i++){const x=kp.getX(i),z=kp.getZ(i),r=1+.027*Math.sin(Math.atan2(x,z)*22);kp.setXYZ(i,x*r,kp.getY(i),z*r);}
  knot.computeVertexNormals();add(knot,hair,0,.205,.025,.037,.039,.032);
  add(new THREE.TorusGeometry(.033,.003,8,32),gold,0,.187,.025,1,1,1,new THREE.Euler(Math.PI/2,0,0));
  add(new THREE.CylinderGeometry(.0025,.0025,.15,10),gold,0,.207,.025,1,1,1,new THREE.Euler(0,0,Math.PI/2-.1));
  for(const side of [-1,1]){
    tube([[side*.055,.136,-.049],[side*.071,.114,-.038],[side*.077,.076,-.020],[side*.074,.037,-.017]],.005,hair,24);
  }
  for(let i=0;i<12;i++){
    const x=(i-5.5)*.004;
    tube([[x,.177,.031],[x,.116,.096],[x,.018,.16],[x*.5,-.15,.22],[x*.7,-.265,.21]],.0032,hair,20);
  }
  return parts;
}
