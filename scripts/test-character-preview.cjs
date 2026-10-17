const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage({viewport:{width:1280,height:720}});const results=[];try{
 await p.goto('http://127.0.0.1:4323/',{waitUntil:'load'});
 await p.waitForFunction(()=>document.querySelector('.character-stage').characterPreview);
 assert.ok(await p.locator('html.welcome-active').count());assert.equal(await p.locator('.character-stage').getAttribute('data-renderer-ready'),null);
 await p.locator('#welcome-entry').press('Escape');await p.waitForTimeout(150);assert.equal(await p.locator('.character-stage').getAttribute('data-renderer-ready'),null);
 await p.waitForFunction(()=>document.querySelector('.character-stage').dataset.rendererReady==='true');
 results.push({name:'model-ready-waits-for-entrance-and-exit',passed:true});
 const bounds=await p.evaluate(()=>{const e=document.querySelector('.character-stage').characterPreview;let left=Infinity,right=-Infinity,top=Infinity;for(let t=0;t<=2.6;t+=1/30){e.seek(t);for(const a of e.actors)for(const s of a.skins){const d=s.mesh.geometry.getAttribute('aPosition').buffer.data;for(let i=0;i<d.length;i+=2){left=Math.min(left,a.root.x+d[i]*a.root.scale.x);right=Math.max(right,a.root.x+d[i]*a.root.scale.x);top=Math.min(top,a.root.y+d[i+1]*a.root.scale.y);}}}return {left,right,top};});assert.ok(Object.values(bounds).every(Number.isFinite),JSON.stringify(bounds));results.push({name:'large-portrait-wave-envelope-finite',...bounds});
 await p.goto('http://127.0.0.1:4323/__characters/',{waitUntil:'load'});await p.waitForFunction(()=>window.characterLab);
 await p.locator('#version').selectOption('v1');await p.frameLocator('#legacy').locator('.character-puppet').first().waitFor();assert.equal(await p.frameLocator('#legacy').locator('.character-puppet').count(),2);
 await p.locator('#version').selectOption('v2');await p.locator('#speed').selectOption('.25');await p.locator('#debug').check();await p.locator('#scrub').evaluate(el=>{el.value='0.35';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.ok(await p.evaluate(()=>window.characterLab.actors.every(a=>a.timeline.pose.blink>.99)));await p.screenshot({path:'.artifacts/character-motion-v2/mesh-debug.png'});await p.locator('#debug').uncheck();
 await p.screenshot({path:'.artifacts/character-motion-v2/final-closed.png'});results.push({name:'v1-v2-slow-scrub-debug-controls',passed:true});
 console.log(results);
}finally{fs.writeFileSync('.artifacts/character-motion-v2/preview-checks.json',JSON.stringify(results,null,2));await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});


