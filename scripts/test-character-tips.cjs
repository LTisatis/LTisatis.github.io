const {chromium}=require(process.env.PLAYWRIGHT_MODULE);const fs=require('fs');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage({viewport:{width:1920,height:1080}});const errors=[];p.on('pageerror',e=>errors.push(e.message));try{
await p.goto('http://127.0.0.1:4323/__characters/');await p.waitForFunction(()=>window.characterLab);
const geometry=await p.evaluate(()=>{const e=window.characterLab;let min=Infinity,where;for(let t=0;t<=12;t+=.125){e.seek(t);for(const a of e.actors)for(const s of a.skins){const d=s.mesh.geometry.getAttribute('aPosition').buffer.data,n=s.part.grid[0];for(let j=0;j<d.length/2-n;j++){if(j%n===n-1)continue;const cross=(u,v,w)=>(d[v*2]-d[u*2])*(d[w*2+1]-d[u*2+1])-(d[v*2+1]-d[u*2+1])*(d[w*2]-d[u*2]);const area=Math.min(cross(j,j+1,j+n),cross(j+1,j+n+1,j+n));if(area<min){min=area;where={time:t,name:a.anchor.dataset.character,part:s.part.id,j};}}}}return {min,where};});console.log({geometry,errors});
for(const t of [0,.35,.7,3.5,5,7]){await p.evaluate(t=>window.characterLab.seek(t),t);await p.screenshot({path:`.artifacts/character-motion-v2/tips-${t}.png`});}
await p.evaluate(()=>{for(const a of document.querySelectorAll('.actor')){a.style.width='1100px';a.style.top='100px';}window.characterLab.resize();});
for(const t of [0,.35,3.5,5]){await p.evaluate(t=>window.characterLab.seek(t),t);await p.screenshot({path:`.artifacts/character-motion-v2/tips-close-${t}.png`});}
fs.writeFileSync('.artifacts/character-motion-v2/tips-geometry.json',JSON.stringify({geometry,errors},null,2));
require('node:assert/strict').ok(geometry.min>0,JSON.stringify(geometry));
require('node:assert/strict').equal(errors.length,0);
await p.locator('#replay-welcome').click();await p.locator('html.welcome-active').waitFor();
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
