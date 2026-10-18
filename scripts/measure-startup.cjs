// Reproducible local cold-cache comparison; excludes unrelated external services.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const base = process.env.CHARACTER_PREVIEW_URL || 'http://127.0.0.1:4322';
const label = process.argv[2] || 'after';
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 const runs=[];
 try {
  for(let i=0;i<5;i++) {
   const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
   await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   const page=await context.newPage();
   const cdp=await context.newCDPSession(page);
   await cdp.send('Network.enable');
   await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:10*1000*1000/8,uploadThroughput:1000*1000/8});
   await page.addInitScript(()=>{
    sessionStorage.setItem('blog-welcome-seen','1');
    window.startupSample={};
    const sample=()=>{
     const engine=document.querySelector('.character-stage')?.characterPreview;
     const result=window.startupSample;
     if(engine){
      result.ready ??= performance.now();
      if(engine.actors.some(a=>a.timeline.hair.some(h=>Math.abs(h.angle)>.001)))result.hair ??=performance.now();
      if(engine.actors.every(a=>a.timeline.events.some(e=>e.kind==='blink')))result.bothBlinks ??=performance.now();
     }
     if(!result.bothBlinks)requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
   });
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.startupSample.bothBlinks,{},{timeout:60000});
   runs.push(await page.evaluate(()=>({
    ...window.startupSample,
    resources:performance.getEntriesByType('resource').filter(r=>r.name.includes('/characters-v2/')||r.name.endsWith('.mp4')).map(r=>({name:new URL(r.name).pathname,start:r.startTime,end:r.responseEnd})),
   })));
   console.log(label,i+1,JSON.stringify({ready:runs.at(-1).ready,hair:runs.at(-1).hair,bothBlinks:runs.at(-1).bothBlinks}));
   await context.close();
  }
 } finally {
  fs.mkdirSync('.artifacts/startup-mobile',{recursive:true});
  fs.writeFileSync(`.artifacts/startup-mobile/${label}.json`,JSON.stringify({conditions:'1280x720 DPR1, headless Edge, cold cache, 10Mbps/150ms RTT, external requests blocked, welcome skipped',runs},null,2));
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
