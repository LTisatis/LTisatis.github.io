// Visual regression at the large face scale used in the reported screenshots.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1400,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:4323/__characters/');
  await page.waitForFunction(()=>window.characterLab);
  await page.evaluate(()=>{
   const e=window.characterLab;e.pause();
   document.querySelector('header').hidden=true;
   for(const a of e.actors){
    if(a.anchor.dataset.character==='yasuna')a.root.visible=false;
    else Object.assign(a.anchor.style,{width:'2400px',left:'-450px',right:'auto',top:'-200px'});
   }
   e.resize();
  });
  for(const t of [0,.28,.35,.44,.6,3.5,5,7,10]){
   await page.evaluate(t=>window.characterLab.seek(t),t);
   await page.screenshot({path:`.artifacts/character-motion-v2/face-v3-${t}.png`});
  }
  await page.evaluate(()=>{
   const e=window.characterLab;e.seek(0);
   const a=e.actors.find(a=>a.timeline.longHair);
   for(const s of a.skins)if(s.part.kind==='fringe')s.mesh.visible=false;
   for(const eye of a.eyes)for(const s of eye.skins)s.mesh.visible=false;
   e.draw();
  });
  await page.screenshot({path:'.artifacts/character-motion-v2/face-v3-underlay.png'});
  if(errors.length)throw new Error(errors.join('\n'));
  fs.writeFileSync('.artifacts/character-motion-v2/face-v3-report.json',JSON.stringify({viewport:[1400,900],actorWidth:2400,times:[0,.28,.35,.44,.6,3.5,5,7,10],errors},null,2));
  console.log('Face closeups captured; no browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
