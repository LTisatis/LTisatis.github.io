const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const assert=require('node:assert/strict');
const fs=require('node:fs');
const out='.artifacts/character-motion-v2';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const report={errors:[],welcome:{},closeups:[]};
 try{
  const context=await browser.newContext({viewport:{width:1400,height:900}});
  const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  await p.goto('http://127.0.0.1:4322/__characters/');await p.waitForFunction(()=>window.characterLab);
  report.browIsolation=await p.evaluate(()=>{
   const e=window.characterLab;e.seek(5);
   for(const a of e.actors)for(const h of a.timeline.hair)h.angle=0;e.draw();
   const before=e.actors.map(a=>Array.from(a.skins.find(s=>s.part.kind==='brow').mesh.geometry.getAttribute('aPosition').buffer.data));
   for(const a of e.actors)for(const h of a.timeline.hair)h.angle=.12;e.draw();
   return e.actors.map((a,i)=>{
    const s=a.skins.find(s=>s.part.kind==='brow'),after=s.mesh.geometry.getAttribute('aPosition').buffer.data;
    return {name:a.anchor.dataset.character,maxDelta:Math.max(...after.map((v,j)=>Math.abs(v-before[i][j]))),aboveHair:a.root.getChildIndex(s.mesh)>Math.max(...a.skins.filter(s=>s.part.kind==='fringe').map(s=>a.root.getChildIndex(s.mesh)))};
   });
  });
  assert.ok(report.browIsolation.every(a=>a.maxDelta<.001&&a.aboveHair));
  assert.ok(await p.evaluate(()=>window.characterLab.metrics.resolution>=1.5));
  report.geometry=await p.evaluate(()=>{
   const e=window.characterLab;let min=Infinity,where;
   for(let t=0;t<=12;t+=.125){e.seek(t);for(const a of e.actors)for(const s of a.skins){
    const d=s.mesh.geometry.getAttribute('aPosition').buffer.data,n=s.part.grid[0];
    for(let j=0;j<d.length/2-n;j++){
     if(j%n===n-1)continue;
     const cross=(u,v,w)=>(d[v*2]-d[u*2])*(d[w*2+1]-d[u*2+1])-(d[v*2+1]-d[u*2+1])*(d[w*2]-d[u*2]);
     const area=Math.min(cross(j,j+1,j+n),cross(j+1,j+n+1,j+n));
     if(area<min){min=area;where={t,name:a.anchor.dataset.character,part:s.part.id};}
    }
   }}return {min,where};
  });
  assert.ok(report.geometry.min>0,JSON.stringify(report.geometry));
  for(const name of ['yasuna','sonya']){
   await p.evaluate(name=>{
    const e=window.characterLab;e.pause();document.querySelector('header').hidden=true;
    for(const a of e.actors){a.root.visible=a.anchor.dataset.character===name;Object.assign(a.anchor.style,{width:'2400px',left:name==='yasuna'?'-670px':'-450px',right:'auto',top:'-200px'});}e.resize();
   },name);
   for(const t of [0,.28,.35,.44,3.5,5,7,10]){
    await p.evaluate(t=>window.characterLab.seek(t),t);
    const path=`${out}/detail-v8-${name}-${t}.png`;await p.screenshot({path});report.closeups.push(path);
   }
   for(const angle of [-.22,.22])for(const closed of [false,true]){
    const area=await p.evaluate(({angle,closed})=>{
     const e=window.characterLab;e.seek(7);
     for(const a of e.actors){for(const h of a.timeline.hair)h.angle=angle;a.timeline.blinkStart=closed?6.9:-99;}
     e.draw();let min=Infinity;
     for(const a of e.actors)for(const s of a.skins){
      const d=s.mesh.geometry.getAttribute('aPosition').buffer.data,n=s.part.grid[0];
      for(let j=0;j<d.length/2-n;j++)if(j%n!==n-1){
       const cross=(u,v,w)=>(d[v*2]-d[u*2])*(d[w*2+1]-d[u*2+1])-(d[v*2+1]-d[u*2+1])*(d[w*2]-d[u*2]);
       min=Math.min(min,cross(j,j+1,j+n),cross(j+1,j+n+1,j+n));
      }
     }return min;
    },{angle,closed});
    assert.ok(area>0,`extreme wind fold: ${area}`);
    const path=`${out}/detail-v8-${name}-extreme-${angle}-${closed?'closed':'open'}.png`;
    await p.screenshot({path});report.closeups.push(path);
   }
  }
  await context.close();
  if(process.env.CHARACTER_DETAIL_ONLY){assert.equal(report.errors.length,0);console.log(JSON.stringify(report.geometry));return;}
  const welcomeContext=await browser.newContext({viewport:{width:1920,height:1080}});
  const w=await welcomeContext.newPage();w.on('pageerror',e=>report.errors.push(e.message));
  await w.goto('http://127.0.0.1:4322/');
  await w.waitForFunction(()=>document.querySelector('.character-stage')?.dataset.rendererReady==='true');
  assert.equal(await w.locator('html.welcome-active').count(),1);
  const read=()=>w.evaluate(()=>{
   const e=document.querySelector('.character-stage').characterPreview;
   return {time:e.actors.map(a=>a.timeline.time),frames:e.metrics.frames,scale:e.actors.map(a=>a.root.scale.x),pose:e.actors.map(a=>a.pose.bodyAngle)};
  });
  const initial=await read();await w.waitForTimeout(700);const moving=await read();
  assert.ok(moving.time.every((t,i)=>t-initial.time[i]>.4));
  assert.ok(moving.pose.some((v,i)=>Math.abs(v-initial.pose[i])>.001));
  report.welcome.before=initial;report.welcome.moving=moving;
  report.welcome.registration=await w.evaluate(()=>{
   const e=document.querySelector('.character-stage').characterPreview;e.draw();
   return e.actors.map(a=>{
    const box=a.anchor.getBoundingClientRect(),s=getComputedStyle(a.anchor),width=1407,height=1118;
    const cos=Math.cos(a.root.rotation)*a.root.scale.x,sin=Math.sin(a.root.rotation)*a.root.scale.y;
    const xs=[0,cos*width,-sin*height,cos*width-sin*height],ys=[0,sin*width,cos*height,sin*width+cos*height];
    return {left:Math.abs(a.root.x+Math.min(...xs)-box.left),top:Math.abs(a.root.y+Math.min(...ys)-box.top),width:Math.abs(Math.max(...xs)-Math.min(...xs)-box.width),alpha:Math.abs(a.root.alpha-Number(s.opacity))};
   });
  });
  assert.ok(report.welcome.registration.every(r=>r.left<.1&&r.top<.1&&r.width<.1&&r.alpha<.001),JSON.stringify(report.welcome.registration));
  await w.waitForTimeout(3200);await w.screenshot({path:`${out}/detail-v8-welcome.png`});
  const before=await read();await w.locator('#welcome-entry').press('Escape');await w.waitForTimeout(450);const midway=await read();await w.waitForTimeout(800);const after=await read();
  assert.ok(after.time.every((t,i)=>t>midway.time[i]&&midway.time[i]>before.time[i]));
  assert.ok(midway.scale.every((s,i)=>s<before.scale[i]&&s>after.scale[i]));
  report.welcome.shrinkRatios=before.scale.map((s,i)=>s/after.scale[i]);
  assert.ok(report.welcome.shrinkRatios.every(s=>Math.abs(s-1.09)<.002));
  report.welcome.after=after;await w.screenshot({path:`${out}/detail-v8-blog.png`});
  await welcomeContext.close();
  // Skip while the entrance is still moving; the clock and canvas must survive.
  const early=await browser.newContext({viewport:{width:1280,height:720}}),q=await early.newPage();
  await q.goto('http://127.0.0.1:4322/');await q.locator('#welcome-entry').press('Escape');
  await q.waitForFunction(()=>document.querySelector('.character-stage')?.dataset.rendererReady==='true');
  await q.waitForTimeout(1200);assert.equal(await q.locator('html.welcome-leaving').count(),0);
  assert.equal(await q.locator('.character-webgl').count(),1);report.welcome.earlySkip=true;
  await early.close();
  // Slow model loading still has visible motion, then inherits the running clock.
  const delayed=await browser.newContext({viewport:{width:1280,height:720}}),d=await delayed.newPage();
  d.on('pageerror',e=>report.errors.push(e.message));
  await d.route('**/media/characters-v2/rigs.json',async route=>{await new Promise(resolve=>setTimeout(resolve,2200));await route.continue();});
  await d.goto('http://127.0.0.1:4322/',{waitUntil:'domcontentloaded'});
  await d.waitForFunction(()=>document.querySelector('.puppet-original')?.style.transform);
  const fallbackBefore=await d.locator('.puppet-original').first().evaluate(el=>el.style.transform);
  await d.waitForTimeout(450);
  const fallbackAfter=await d.locator('.puppet-original').first().evaluate(el=>el.style.transform);
  assert.notEqual(fallbackBefore,fallbackAfter);
  await d.waitForFunction(()=>document.querySelector('.character-stage')?.dataset.rendererReady==='true');
  const inherited=await d.evaluate(()=>document.querySelector('.character-stage').characterPreview.actors.map(a=>a.timeline.time));
  assert.ok(inherited.every(t=>t>.5));report.welcome.delayedLoad={fallbackMoving:true,inherited};
  await delayed.close();assert.equal(report.errors.length,0);console.log(JSON.stringify(report.welcome));
 }finally{fs.writeFileSync(`${out}/detail-v8-report.json`,JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
