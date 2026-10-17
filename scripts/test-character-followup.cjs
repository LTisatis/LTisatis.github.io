const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sharp = require('sharp');
const base = process.env.CHARACTER_PREVIEW_URL || 'http://127.0.0.1:4323';
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 const page = await browser.newPage({viewport:{width:1920,height:1080}});
 const report = {errors:[]};
 page.on('pageerror',error=>report.errors.push(error.message));
 try {
  await page.goto(base,{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('.character-stage').characterPreview);
  assert.ok(await page.locator('html.welcome-active').count());
  await page.waitForTimeout(3300);
  const welcomeWidths=await page.locator('.corner-character').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
  const offsets = () => page.evaluate(()=>document.querySelector('.character-stage').characterPreview.actors.map(a=>{
   const box=a.anchor.getBoundingClientRect(),scale=box.width/parseFloat(getComputedStyle(a.anchor).width);
   return [(a.root.x-box.left)/scale,(a.root.y-box.top)/scale];
  }));
  await page.mouse.move(100,200);await page.waitForTimeout(1300);const left=await offsets();
  await page.mouse.move(1820,880);await page.waitForTimeout(1300);const right=await offsets();
  report.welcomeTravel=right.map((v,i)=>v.map((n,j)=>n-left[i][j]));
  assert.ok(report.welcomeTravel[0][0]>110 && report.welcomeTravel[1][0]>145);
  assert.ok(report.welcomeTravel.every(v=>v[1]>45));
  await page.screenshot({path:'.artifacts/character-motion-v2/welcome-follow.png'});
  const welcomeTime=await page.evaluate(()=>document.querySelector('.character-stage').characterPreview.actors.map(a=>a.timeline.time));
  await page.locator('#welcome-entry').press('Escape');
  await page.waitForTimeout(350);
  const midwayWidths=await page.locator('.corner-character').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
  await page.waitForTimeout(850);
  const blogWidths=await page.locator('.corner-character').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
  report.welcomeScale=welcomeWidths.map((w,i)=>w/blogWidths[i]);
  assert.ok(report.welcomeScale.every(s=>Math.abs(s-1.09)<.001));
  assert.ok(midwayWidths.every((w,i)=>w< welcomeWidths[i] && w>blogWidths[i]));
  const blogOffsets=await offsets();
  report.handoffError=blogOffsets.map((v,i)=>Math.hypot(v[0]-right[i][0],v[1]-right[i][1]));
  assert.ok(report.handoffError.every(v=>v<.15),JSON.stringify(report.handoffError));
  const blogTime=await page.evaluate(()=>document.querySelector('.character-stage').characterPreview.actors.map(a=>a.timeline.time));
  assert.ok(blogTime.every((t,i)=>t>welcomeTime[i]+.5));

  // Identify jacket vertices from the actual source texture, not just hand-picked coordinates.
  const rigs=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json','utf8')).characters;
  const clothing={};
  for(const [name,rig] of Object.entries(rigs)){
   const body=rig.parts.find(p=>p.kind==='body');
   const {data,info}=await sharp('public'+body.src).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   clothing[name]=[];
   for(let row=0;row<body.grid[1];row++)for(let col=0;col<body.grid[0];col++){
    const x=Math.min(info.width-1,Math.round(col*body.width/(body.grid[0]-1)));
    const y=Math.min(info.height-1,Math.round(row*body.height/(body.grid[1]-1)));
    const k=(y*info.width+x)*4,[r,g,b,a]=data.subarray(k,k+4);
    if(y+body.y>450 && a>240 && r>65 && b>r+7 && b>g+4 && b-r<65)clothing[name].push((row*body.grid[0]+col)*2);
   }
  }
  report.deformation=await page.evaluate(clothing=>{
   const e=document.querySelector('.character-stage').characterPreview;e.seek(5);
   const read=a=>Array.from(a.skins.find(s=>s.part.kind==='body').mesh.geometry.getAttribute('aPosition').buffer.data);
   for(const a of e.actors)for(const h of a.timeline.hair)h.angle=0;e.draw();
   const neutral=e.actors.map(read);
   const neutralFringe=e.actors.map(a=>a.skins.filter(s=>s.part.kind==='fringe').map(s=>Array.from(s.mesh.geometry.getAttribute('aPosition').buffer.data)));
   for(const a of e.actors)for(const h of a.timeline.hair)h.angle=.07;e.draw();
   return e.actors.map((a,i)=>{
    const d=read(a),s=a.skins.find(s=>s.part.kind==='body');let jacketDelta=0,topDelta=0,crownDelta=0;
    for(const k of clothing[a.anchor.dataset.character])jacketDelta=Math.max(jacketDelta,Math.hypot(d[k]-neutral[i][k],d[k+1]-neutral[i][k+1]));
    for(let k=0;k<d.length;k+=2){const x=s.original[k]+s.part.x,y=s.original[k+1]+s.part.y;
     const delta=Math.hypot(d[k]-neutral[i][k],d[k+1]-neutral[i][k+1]);
     const sonya=a.anchor.dataset.character==='sonya';
     if(sonya ? y<80&&x>400&&x<460 : y<90&&x>790&&x<850)topDelta=Math.max(topDelta,delta);
     if(sonya ? y>70&&y<140&&x>540&&x<760 : y>100&&y<145&&x>600&&x<720)crownDelta=Math.max(crownDelta,delta);
    }
    const fringes=a.skins.filter(s=>s.part.kind==='fringe').map((s,j)=>{
     const d=s.mesh.geometry.getAttribute('aPosition').buffer.data;let travel=0;
     for(let k=0;k<d.length;k+=2)travel=Math.max(travel,Math.hypot(d[k]-neutralFringe[i][j][k],d[k+1]-neutralFringe[i][j][k+1]));
     return {id:s.part.id,travel};
    });
    return {name:a.anchor.dataset.character,jacketVertices:clothing[a.anchor.dataset.character].length,jacketDelta,topDelta,crownDelta,fringes,
     activeTips:a.rig.tips.map((t,j)=>({id:t.id,vertices:a.skins.reduce((n,s)=>n+s.weights.filter(w=>w.tips.some(t=>t.index===j)).length,0)}))};
   });
  },clothing);
  assert.ok(report.deformation.every(a=>a.jacketVertices>50&&a.jacketDelta<.001),JSON.stringify(report.deformation));
  assert.ok(report.deformation.every(a=>a.topDelta>5));
  assert.ok(report.deformation.every(a=>a.crownDelta<.001));
  assert.ok(report.deformation.every(a=>a.fringes.every(f=>f.travel>2)));
  await page.goto(base+'/__characters/',{waitUntil:'load'});await page.waitForFunction(()=>window.characterLab);
  for(const t of [3.5,5,7]){await page.evaluate(t=>window.characterLab.seek(t),t);await page.screenshot({path:`.artifacts/character-motion-v2/new-idle-${t}.png`});}
  assert.equal(report.errors.length,0);
  console.log(report);
 } finally {
  fs.writeFileSync('.artifacts/character-motion-v2/followup-report.json',JSON.stringify(report,null,2));
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
