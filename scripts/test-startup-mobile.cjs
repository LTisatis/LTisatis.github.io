const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.CHARACTER_PREVIEW_URL || 'http://127.0.0.1:4322';
const out = '.artifacts/startup-mobile';
const report = {checks:[],errors:[]};
const article = '/posts/ideascientist-reading-notes/';
const check = name => { report.checks.push(name); console.log('PASS',name); };
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 async function open(options={}) {
  const context=await browser.newContext({viewport:{width:1280,height:720},...options});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.requests=[];page.on('request',r=>page.requests.push(r.url()));
  return page;
 }
 const ready=p=>p.waitForFunction(()=>document.querySelector('.character-stage')?.dataset.rendererReady==='true');
 async function layout(p) {
  await p.waitForFunction(()=>window.swup?.hooks);
  await p.waitForTimeout(1000); // Allow existing page-entry transforms to finish.
  return p.evaluate(()=>({
   overflow:document.documentElement.scrollWidth>innerWidth,
   title:document.querySelector('#post-container h1')?.getBoundingClientRect().top,
   body:document.querySelector('.markdown-content')?.getBoundingClientRect().top,
   sidebar:getComputedStyle(document.querySelector('#sidebar')).display,
   characters:getComputedStyle(document.querySelector('.character-stage')).visibility,
  }));
 }
 try {
  for(const [width,theme] of [[360,'light'],[390,'light'],[390,'dark'],[768,'light']]) {
   const p=await open({viewport:{width,height:844},isMobile:true,hasTouch:true});
   await p.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('blog-motion-paused','false');},theme);
   await p.goto(base+article,{waitUntil:'load'});
   const box=await layout(p);
   assert.equal(await p.locator('html.welcome-active,html.welcome-pending').count(),0);
   assert.equal(box.overflow,false);assert.ok(box.title<200,JSON.stringify(box));assert.ok(box.body<740,JSON.stringify(box));
   assert.equal(box.sidebar,'none');assert.equal(box.characters,'hidden');
   assert.ok(!p.requests.some(u=>u.includes('/rigs.json')||u.includes('/character-renderer.')||/\/media\/(scene\/.*|banner)\.mp4/.test(u)));
   assert.equal(await p.locator('#music-player').isVisible(),false);
   assert.equal(await p.locator('#search-switch svg').count(),1);
   assert.equal(await p.locator('#scheme-switch svg').count(),3);
   assert.ok(!p.requests.some(u=>/api\.(iconify|unisvg)/.test(u)));
   await p.screenshot({path:`${out}/article-${width}-${theme}.png`});
   if(width===390&&theme==='light') {
    await p.locator('#music-launcher').click();
    assert.ok(await p.locator('#music-player').isVisible());
    assert.ok(await p.locator('#music-details').isVisible());
    assert.equal(await p.locator('#mobile-motion-toggle').isDisabled(),true);
    assert.equal(await p.locator('#background-audio').getAttribute('src'),null);
    await p.screenshot({path:`${out}/music-sheet.png`});
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#music-player').isVisible(),false);
    assert.equal(await p.locator('#music-launcher').getAttribute('aria-expanded'),'false');
    await p.locator('.mobile-toc summary').click();
    assert.ok(await p.locator('.mobile-toc nav').isVisible());
    await p.locator('.mobile-toc nav a').first().click();
    await p.waitForTimeout(300);
    assert.ok(new URL(p.url()).hash);
    check('music sheet, keyboard close, no audio autoplay, touch TOC');
   }
   check(`article ${width}px ${theme}: compact, static, no overflow`);
   await p.context().close();
  }

  let p=await open({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await p.addInitScript(()=>sessionStorage.setItem('blog-welcome-seen','1'));
  await p.goto(base+'/',{waitUntil:'load'});await layout(p);
  assert.ok(!p.requests.some(u=>u.includes('/rigs.json')));
  await p.screenshot({path:`${out}/home-390.png`});
  await p.locator('#music-launcher').click();await p.locator('#mobile-motion-toggle').click();
  await ready(p);await p.locator('#music-close').click();
  await p.evaluate(()=>window.savedCanvas=document.querySelector('.character-webgl'));
  await p.locator('.post-card-title').first().click();await p.waitForURL('**/posts/**');await layout(p);
  const frames=await p.evaluate(()=>document.querySelector('.character-stage').characterPreview.metrics.frames);
  await p.waitForTimeout(200);
  assert.equal(await p.evaluate(()=>document.querySelector('.character-stage').characterPreview.metrics.frames),frames);
  await p.locator('#navbar a[href="/"]').first().click();await p.waitForURL(base+'/');await ready(p);await layout(p);
  assert.ok(await p.evaluate(()=>window.savedCanvas===document.querySelector('.character-webgl')));
  assert.equal(await p.locator('.character-webgl').count(),1);
  assert.ok(await p.locator('#sidebar').isVisible());
  check('mobile opt-in, article pause, Swup return resumes the same canvas');
  await p.context().close();

  p=await open();
  await p.route('**/characters-v2/rigs.json',async route=>{await new Promise(resolve=>setTimeout(resolve,2200));await route.continue();});
  await p.goto(base+'/',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>document.documentElement.classList.contains('welcome-active'));
  await p.locator('#welcome-entry').press('Escape');
  await ready(p);
  const resources=await p.evaluate(()=>({ready:document.querySelector('.character-stage').characterPreview.metrics.startup.firstRender, videos:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.mp4')).map(r=>r.startTime)}));
  assert.ok(resources.videos.every(start=>start>=resources.ready));
  await p.locator('#motion-toggle').click();
  const frame=await p.evaluate(()=>document.querySelector('.character-stage').characterPreview.metrics.frames);
  await p.waitForTimeout(250);
  assert.equal(await p.evaluate(()=>document.querySelector('.character-stage').characterPreview.metrics.frames),frame);
  await p.locator('#motion-toggle').click();
  await p.screenshot({path:`${out}/desktop-1280.png`});
  check('slow loading allows early welcome skip, gates videos and preserves pause/resume');
  await p.context().close();

  for(const scenario of ['reduced','paused','manifest-failure','texture-failure','webgl-failure']) {
   p=await open(scenario==='reduced'?{reducedMotion:'reduce'}:{});
   await p.addInitScript(()=>sessionStorage.setItem('blog-welcome-seen','1'));
   if(scenario==='paused')await p.addInitScript(()=>localStorage.setItem('blog-motion-paused','true'));
   if(scenario==='manifest-failure')await p.route('**/rigs.json',route=>route.fulfill({status:500,body:'failed'}));
   if(scenario==='texture-failure')await p.route('**/sonya-body.webp',route=>route.abort());
   if(scenario==='webgl-failure')await p.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});
   await p.goto(base+'/',{waitUntil:'load'});
   if(scenario.endsWith('failure'))await p.waitForFunction(()=>document.querySelector('[data-puppet-failed]'));
   else assert.ok(!p.requests.some(u=>u.includes('/rigs.json')||u.includes('/character-renderer.')));
   assert.equal(await p.locator('.character-webgl').count(),0);
   assert.ok(await p.locator('.puppet-original').first().isVisible());
   check(scenario+' keeps the static fallback');await p.context().close();
  }
  assert.deepEqual(report.errors,[]);
 } finally {
  fs.writeFileSync(`${out}/browser.json`,JSON.stringify(report,null,2));await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
