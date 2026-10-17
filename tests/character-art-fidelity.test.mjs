import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
test('Sonya open eyes retain original iris, pupil and reflection pixels',async()=>{
 const rig=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters.sonya;
 const source=await sharp('public/media/sonya-hands.png').ensureAlpha().raw().toBuffer();
 for(const [index,e] of rig.eyes.entries()){
  const patch=await sharp('public'+e.states.open.src).ensureAlpha().raw().toBuffer();let samples=0,max=0;
  for(let y=0;y<e.height;y++)for(let x=0;x<e.width;x++){
   const px=x+e.x,py=y+e.y,i=(y*e.width+x)*4,j=(py*1407+px)*4;
   // Exclude only the repaired occlusion at the upper lash, never the iris.
   if(patch[i+3]<254||(index===0?px<520&&py<402:px<758&&py<322))continue;
   const [r,g,b]=source.subarray(j,j+3);if(!(b>r*1.25||r>230&&g>230&&b>230))continue;
   samples++;for(let c=0;c<3;c++)max=Math.max(max,Math.abs(patch[i+c]-source[j+c]));
  }
  assert.ok(samples>2000,`${index}: ${samples}`);assert.ok(max<=1,`${index}: colour drift ${max}`);
 }
});
test('foreground brown hair masks do not carry opaque peach pixels',async()=>{
 const rig=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters.yasuna;
 for(const p of rig.parts.filter(p=>p.kind==='fringe')){
  const data=await sharp('public'+p.src).ensureAlpha().raw().toBuffer();let skin=0;
  for(let i=0;i<data.length;i+=4)if(data[i+3]>32&&data[i]>170&&data[i+1]>110&&data[i+2]>data[i+1]*.6)skin++;
  assert.equal(skin,0,p.id);
 }
});
test('Yasuna revealed upper lash has no translucent old-bang seam',async()=>{
 const rig=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters.yasuna;
 for(const state of ['open','half','closed','clean']){
  const {data,info}=await sharp('public'+rig.eyes[1].states[state].src).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let y=14;y<30;y++)for(let x=50;x<75;x++)
   assert.ok(data[(y*info.width+x)*4+3]>=250,`${state}: translucent footprint at ${x},${y}`);
 }
});
test('Sonya original upper-eye crease and lash corner remain fully visible',async()=>{
 const e=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters.sonya.eyes[1];
 const source=await sharp('public/media/sonya-hands.png').ensureAlpha().raw().toBuffer();
 const eye=await sharp('public'+e.states.open.src).ensureAlpha().raw().toBuffer();let samples=0;
 for(let y=286;y<324;y++)for(let x=644;x<676;x++){
  const s=(y*1407+x)*4,i=((y-e.y)*e.width+x-e.x)*4;
  if(source[s]<95&&source[s+1]<85){samples++;assert.ok(eye[i+3]>245,`clipped original ink at ${x},${y}`);for(let c=0;c<3;c++)assert.ok(Math.abs(source[s+c]-eye[i+c])<=1);}
 }
 assert.ok(samples>60);
});
test('transparent paint RGB cannot leak red speckles into Sonya hair gap',async()=>{
 const p=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters.sonya.parts.find(p=>p.kind==='body');
 const data=await sharp('public'+p.src).ensureAlpha().raw().toBuffer();let red=0;
 for(let y=432;y<478;y++)for(let x=452;x<474;x++){
  const i=((y-p.y)*p.width+x-p.x)*4;
  if(data[i+3]>20&&data[i]>data[i+1]*2&&data[i]>130&&data[i+2]<90)red++;
 }
 assert.equal(red,0);
});
test('Sonya blink textures contain no second golden eyebrow',async()=>{
 const e=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters.sonya.eyes[1];
 for(const state of ['half','closed']){
  const data=await sharp('public'+e.states[state].src).ensureAlpha().raw().toBuffer();let gold=0;
  for(let i=0;i<data.length;i+=4)if(data[i+3]>32&&data[i]>150&&data[i+1]>100&&data[i+2]<data[i+1]*.65)gold++;
  assert.equal(gold,0,state);
 }
});

test('Sonya stationary temple and inner ear retain their original ink',async()=>{
 const p=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters.sonya.parts.find(p=>p.kind==='body');
 const body=await sharp('public'+p.src).ensureAlpha().raw().toBuffer(),source=await sharp('public/media/sonya-hands.png').ensureAlpha().raw().toBuffer();
 for(const [left,top,right,bottom] of [[473,310,485,330],[828,380,852,430]]){
  let samples=0;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
   const i=((y-p.y)*p.width+x-p.x)*4,j=(y*1407+x)*4;
   if(source[j]>100||source[j+1]>100||source[j+3]<250)continue;
   samples++;for(let c=0;c<4;c++)assert.ok(Math.abs(body[i+c]-source[j+c])<=1,`altered original contour ${x},${y}`);
  }
  assert.ok(samples>10,`insufficient contour samples: ${samples}`);
 }
});

test('Sonya nape junction retains its original gold triangle, ink and empty gap',async()=>{
 const p=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters.sonya.parts.find(p=>p.kind==='body');
 const body=await sharp('public'+p.src).ensureAlpha().raw().toBuffer(),source=await sharp('public/media/sonya-hands.png').ensureAlpha().raw().toBuffer();
 let gold=0,ink=0,empty=0;
 for(let y=440;y<482;y++)for(let x=455;x<483;x++){
  const i=((y-p.y)*p.width+x-p.x)*4,j=(y*1407+x)*4;
  if(source[j+3]===0){empty++;assert.equal(body[i+3],0,`filled gap ${x},${y}`);continue;}
  if(source[j+3]<250)continue;
  const isGold=source[j]>150&&source[j+1]>100&&source[j+2]<source[j+1]*.65;
  const isInk=source[j]<100&&source[j+1]<100&&source[j+2]<100;
  if(!isGold&&!isInk)continue;
  if(isGold)gold++;else ink++;
  for(let c=0;c<4;c++)assert.ok(Math.abs(body[i+c]-source[j+c])<=1,`altered hair junction ${x},${y}`);
 }
 assert.ok(gold>100&&ink>30&&empty>50,`${gold} gold, ${ink} ink, ${empty} gap samples`);
});

test('Sonya diagonal temple junction keeps the original continuous ink',async()=>{
 const p=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters.sonya.parts.find(p=>p.kind==='body');
 const body=await sharp('public'+p.src).ensureAlpha().raw().toBuffer(),source=await sharp('public/media/sonya-hands.png').ensureAlpha().raw().toBuffer();let samples=0;
 for(let y=330;y<=346;y++)for(let x=801;x<=812;x++){
  const i=((y-p.y)*p.width+x-p.x)*4,j=(y*1407+x)*4;
  if(source[j]>90||source[j+1]>90||source[j+3]<250)continue;samples++;
  for(let c=0;c<4;c++)assert.ok(Math.abs(body[i+c]-source[j+c])<=2,`stepped temple ink ${x},${y}`);
 }
 assert.ok(samples>20);
});

test('Yasuna central fringe has a steadily sloping edge without the old lash spur',async()=>{
 const p=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters.yasuna.parts.find(p=>p.id==='bang-center');
 const {data,info}=await sharp('public'+p.src).ensureAlpha().raw().toBuffer({resolveWithObject:true}),scale=p.textureResolution;
 let last;
 for(let y=254;y<=282;y+=2){
  const row=Math.round((y-p.y)*scale);let left=0;while(left<info.width&&data[(row*info.width+left)*4+3]<128)left++;
  assert.ok(left<info.width);const x=left/scale;
  if(last!==undefined)assert.ok(x-last>=.5&&x-last<=3,`side spur at ${y}: ${x-last}`);
  last=x;
 }
});

test('eye-state outer skin matches the continuous face without a pale patch rim',async()=>{
 const rigs=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters;
 const skin=(d,i)=>d[i+3]>250&&d[i]>220&&d[i+1]>150&&d[i+2]>110&&d[i]-d[i+1]>16&&d[i+1]-d[i+2]>10;
 for(const [name,rig] of Object.entries(rigs)){
  const p=rig.parts.find(p=>p.kind==='body'),body=await sharp('public'+p.src).ensureAlpha().raw().toBuffer();
  for(const [index,e] of rig.eyes.entries())for(const state of ['open','half','closed']){
   const patch=await sharp('public'+e.states[state].src).ensureAlpha().raw().toBuffer(),differences=[];
   for(let y=5;y<e.height-5;y++)for(let x=5;x<e.width-5;x++){
    const j=(y*e.width+x)*4,k=((y+e.y-p.y)*p.width+x+e.x-p.x)*4;
    if(!skin(body,k)||![[-4,0],[4,0],[0,4],[0,-4],[0,0]].every(([dx,dy])=>skin(patch,((y+dy)*e.width+x+dx)*4)))continue;
    differences.push(Math.max(...[0,1,2].map(c=>Math.abs(patch[j+c]-body[k+c]))));
   }
   differences.sort((a,b)=>a-b);
   assert.ok(differences.length>10,`${name} ${index} ${state}: no skin samples`);
   assert.ok(differences[Math.floor(differences.length*.95)]<=5,`${name} ${index} ${state}: visible colour rim`);
  }
 }
});

test('Yasuna clean eye plates contain no old iris contour or colour-correction rings',async()=>{
 const rig=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters.yasuna;
 for(const [index,e] of rig.eyes.entries()){
  const clean=await sharp('public'+e.states.clean.src).ensureAlpha().raw().toBuffer();
  for(let y=Math.ceil(e.height*.4);y<e.height*.8;y++)for(let x=Math.ceil(e.width*.32);x<e.width*.67;x++){
   const i=(y*e.width+x)*4;
   if(clean[i+3]<254)continue;
   for(const offset of [4,e.width*4])for(let c=0;c<3;c++)
    assert.ok(Math.abs(clean[i+c]-clean[i+offset+c])<=5,`${index}: residual edge at ${x},${y}`);
  }
 }
});

for(const [name,id,start,minEnd,tipX] of [['sonya','bang-left',342,374,505],['yasuna','bang-right',285,317,908]]){
 test(`${name} eye-crossing fringe tapers continuously to one complete tip`,async()=>{
  const p=JSON.parse(fs.readFileSync('public/media/characters-v2/rigs.json')).characters[name].parts.find(p=>p.id===id);
  const {data,info}=await sharp('public'+p.src).ensureAlpha().raw().toBuffer({resolveWithObject:true}),scale=p.textureResolution;
  let previous,last,finished=false;
  for(let y=Math.round((start-p.y)*scale);y<info.height;y++){
   let left=-1,right=-1;
   for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=128){if(left<0)left=x;right=x;}
   if(left<0){if(previous)finished=true;continue;}
   assert.equal(finished,false,'detached fragment below the tip');
   for(let x=left;x<=right;x++)assert.ok(data[(y*info.width+x)*4+3]>=128,'split contour');
   if(previous){
    assert.ok(right-left<=previous.right-previous.left+1,`outward width step at ${p.y+y/scale}`);
    assert.ok(left>=previous.left-1&&right<=previous.right+1,`edge notch at ${p.y+y/scale}`);
   }
   previous={left,right};last={y:p.y+y/scale,x:p.x+(left+right)/(2*scale)};
  }
  assert.ok(last&&last.y>=minEnd,'black pointed end was trimmed');
  assert.ok(Math.abs(last.x-tipX)<=3,'tip has a sideways remnant');
 });
}
