const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const assert=require('node:assert/strict');
const fs=require('node:fs');
const out='.artifacts/character-motion-v2';
const report={checks:[],errors:[]};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const ready=p=>p.waitForFunction(()=>document.querySelector('.character-stage')?.dataset.rendererReady==='true');
 const freeze=p=>p.evaluate(()=>document.querySelector('.character-stage').characterPreview.seek(7));
 const counts=p=>p.evaluate(()=>document.querySelector('.character-stage').characterPreview.actors.map(a=>a.timeline.events.filter(e=>e.kind==='wave').length));
 const findPoint=(p,index,kind='character')=>p.evaluate(({index,kind})=>{
  const e=document.querySelector('.character-stage').characterPreview;
  for(let y=120;y<innerHeight-30;y+=12)for(let x=16;x<innerWidth-16;x+=12){
   const target=document.elementFromPoint(x,y),hit=e.hitTest(x,y);
   if(kind==='content'){
    if(hit>=0&&target?.closest('.post-card')&&!target.closest('a,button'))return{x,y};
   }else{
    if(target?.closest('a,button,input,textarea,select,nav,main,aside,article,.card-base,.section-intro,[role="button"]')&&!target.closest('#welcome-entry'))continue;
    const margin=innerWidth<1024?2:12;
    const stable=kind==='empty'?hit<0:hit===index&&[[margin,0],[-margin,0],[0,margin],[0,-margin]].every(([dx,dy])=>e.hitTest(x+dx,y+dy)===index);
    if(stable)return{x,y};
   }
  }return null;
 },{index,kind});
 try{
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  await p.goto('http://127.0.0.1:4322/');await ready(p);await p.waitForTimeout(3200);
  // The welcome overlay still enters the blog; clicking a portrait also greets.
  let point=await findPoint(p,0);assert.ok(point,'welcome portrait visible');
  await p.mouse.click(point.x,point.y);await p.waitForTimeout(50);
  assert.equal((await counts(p))[0],1);
  await p.waitForTimeout(1200);assert.equal(await p.locator('html.welcome-leaving').count(),0);
  report.checks.push('welcome click greets while preserving entry');
  for(const i of [0,1]){
   await freeze(p);point=await findPoint(p,i);assert.ok(point,`clickable actor ${i}`);
   await p.mouse.click(point.x,point.y);
   assert.deepEqual(await counts(p),i===0?[1,0]:[0,1]);
   await p.mouse.click(point.x,point.y);await p.mouse.click(point.x,point.y);
   assert.deepEqual(await counts(p),i===0?[1,0]:[0,1]);
   await p.evaluate(()=>document.querySelector('.character-stage').characterPreview.resume());
   await p.waitForTimeout(700);
   const pose=await p.evaluate(i=>document.querySelector('.character-stage').characterPreview.actors[i].pose,i);
   assert.ok(Math.abs(pose.wrist)>.08);
  }
  report.checks.push('each portrait greets independently; repeated clicks do not restart');
  await freeze(p);point=await findPoint(p,0,'empty');assert.ok(point,'transparent point');
  await p.mouse.click(point.x,point.y);assert.deepEqual(await counts(p),[0,0]);
  point=await findPoint(p,0,'content');assert.ok(point,'content overlays a portrait');
  await p.mouse.click(point.x,point.y);assert.deepEqual(await counts(p),[0,0]);
  report.checks.push('transparent margins and overlaid article content do not greet');
  await p.locator('[data-wave-character="sonya"]').focus();await p.keyboard.press('Enter');
  assert.deepEqual(await counts(p),[0,1]);
  assert.ok(await p.locator('[data-wave-character="sonya"]').evaluate(el=>{
   const r=el.getBoundingClientRect();return r.width>40&&r.left>=0&&r.right<=innerWidth&&getComputedStyle(el).clipPath==='none'&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;
  }));
  await p.screenshot({path:`${out}/detail-v8-keyboard.png`});
  report.checks.push('keyboard activation greets with a visible focus control');
  await p.locator('#motion-toggle').click();
  assert.ok(await p.locator('[data-wave-character="yasuna"]').isDisabled());
  point=await findPoint(p,0);const pausedBefore=await counts(p);
  await p.mouse.click(point.x,point.y);assert.deepEqual(await counts(p),pausedBefore);
  report.checks.push('manual pause stays frozen on portrait click');
  await p.locator('#motion-toggle').click();await ready(p);
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.waitForFunction(()=>document.querySelector('[data-wave-character="sonya"]').disabled);
  assert.ok(await p.locator('[data-wave-character="sonya"]').isDisabled());
  await p.mouse.click(point.x,point.y);assert.deepEqual(await counts(p),pausedBefore);
  await p.emulateMedia({reducedMotion:'no-preference'});await ready(p);
  report.checks.push('reduced motion does not resume on portrait click');
  await p.locator('#navbar a[href="/archive/"]').first().click();await p.waitForURL('**/archive/');await ready(p);await p.waitForTimeout(300);
  await freeze(p);point=await findPoint(p,1);assert.ok(point);
  await p.mouse.click(point.x,point.y);assert.deepEqual(await counts(p),[0,1]);
  assert.equal(await p.locator('.character-webgl').count(),1);
  report.checks.push('greeting survives navigation without duplicate listeners/canvases');
  await context.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const m=await mobile.newPage(),requests=[];m.on('request',r=>requests.push(r.url()));m.on('pageerror',e=>report.errors.push(e.message));
  await m.goto('http://127.0.0.1:4322/');await m.locator('#welcome-entry').press('Escape');await m.waitForTimeout(1200);
  await m.touchscreen.tap(62,125);assert.ok(!requests.some(u=>u.includes('/rigs.json')||u.includes('character-renderer')));
  await m.locator('#motion-toggle').click();await ready(m);await freeze(m);
  point=await findPoint(m,0);assert.ok(point);await m.touchscreen.tap(point.x,point.y);assert.deepEqual(await counts(m),[1,0]);
  report.checks.push('mobile defaults static; tapping greets after motion is enabled');
  await mobile.close();assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify(report));
 }finally{fs.writeFileSync(`${out}/interaction-v8-report.json`,JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
