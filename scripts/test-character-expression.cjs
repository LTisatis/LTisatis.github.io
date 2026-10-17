const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const fs=require('node:fs');
const assert=require('node:assert/strict');
const out='.artifacts/character-motion-v2',report={errors:[],mouth:[],crown:[]};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1400,height:900}});p.on('pageerror',e=>report.errors.push(e.message));
  await p.goto('http://127.0.0.1:4322/__characters/');await p.waitForFunction(()=>window.characterLab);
  report.textureRegistration=await p.evaluate(()=>{
   const s=window.characterLab.actors[0].skins.find(s=>s.part.kind==='body'),uv=s.mesh.geometry.getAttribute('aUV').buffer.data;
   let error=0;for(let i=0;i<s.original.length;i+=2)error=Math.max(error,Math.abs(uv[i]*s.part.width-s.original[i]),Math.abs(uv[i+1]*s.part.height-s.original[i+1]));
   return {vertices:s.original.length/2,maxSourcePixelError:error};
  });
  assert.ok(report.textureRegistration.maxSourcePixelError<.001);
  await p.evaluate(()=>{
   const e=window.characterLab;e.seek(7);document.querySelector('header').hidden=true;
   for(const a of e.actors){a.root.visible=!a.timeline.longHair;Object.assign(a.anchor.style,{width:'3000px',left:'-1000px',right:'auto',top:'-620px'});}e.resize();
  });
  for(const opening of [.795,1,1.055]){
   const result=await p.evaluate(opening=>{
    const e=window.characterLab,a=e.actors[0],get=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(a.timeline),'pose').get;
    Object.defineProperty(a.timeline,'pose',{configurable:true,get(){return {...get.call(this),mouth:opening};}});e.draw();
    const s=a.skins.find(s=>s.part.kind==='body'),d=s.mesh.geometry.getAttribute('aPosition').buffer.data,n=s.part.grid[0];let min=Infinity;
    for(let j=0;j<d.length/2-n;j++)if(j%n!==n-1){
     const cross=(u,v,w)=>(d[v*2]-d[u*2])*(d[w*2+1]-d[u*2+1])-(d[v*2+1]-d[u*2+1])*(d[w*2]-d[u*2]);
     min=Math.min(min,cross(j,j+1,j+n),cross(j+1,j+n+1,j+n));
    }return {opening,min};
   },opening);assert.ok(result.min>0);report.mouth.push(result);
   await p.screenshot({path:`${out}/detail-v10-mouth-${opening}.png`});
  }
  await p.evaluate(()=>{
   const e=window.characterLab;e.seek(7);
   for(const a of e.actors)Object.assign(a.anchor.style,{width:'3200px',left:'-1150px',right:'auto',top:'20px'});e.resize();
  });
  for(const angle of [-.22,.22]){
   const result=await p.evaluate(angle=>{
    const e=window.characterLab,a=e.actors[0];for(const h of a.timeline.hair)h.angle=0;e.draw();
    const s=a.skins.find(s=>s.part.kind==='body'),before=Float32Array.from(s.mesh.geometry.getAttribute('aPosition').buffer.data);
    for(const h of a.timeline.hair)h.angle=angle;e.draw();
    const d=s.mesh.geometry.getAttribute('aPosition').buffer.data;let scalp=0,tip=0,samples=0;
    for(let i=0;i<s.original.length;i+=2){
     const x=s.original[i]+s.part.x,y=s.original[i+1]+s.part.y;
     if(x<720||x>870||y<45||y>130)continue;
     const delta=Math.hypot(d[i]-before[i],d[i+1]-before[i+1]);
     if(y>=88){scalp=Math.max(scalp,delta);samples++;}else tip=Math.max(tip,delta);
    }return {angle,scalp,tip,samples};
   },angle);
   assert.ok(result.samples>10&&result.scalp<.001);assert.ok(result.tip>.2&&result.tip<4,JSON.stringify(result));report.crown.push(result);
   await p.screenshot({path:`${out}/detail-v10-crown-${angle}.png`});
  }
  assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
 }finally{fs.writeFileSync(`${out}/expression-v10-report.json`,JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
