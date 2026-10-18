import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

function module(file) {
 const context=vm.createContext({exports:{}});
 vm.runInContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 return context.exports;
}
const {loadUnique}=module('src/scripts/character-assets.ts');
const {CharacterTimeline}=module('src/scripts/character-animation.ts');

test('character downloads overlap, stay bounded, and deduplicate shared URLs',async()=>{
 let active=0,max=0;
 const calls=[];
 const result=await loadUnique(['a','b','a','c','d','e'],async url=>{
  calls.push(url);max=Math.max(max,++active);
  await new Promise(resolve=>setTimeout(resolve,5));active--;return url.toUpperCase();
 },3);
 assert.equal(max,3);assert.equal(active,0);assert.equal(calls.length,5);
 assert.equal(result.get('a'),'A');assert.equal(result.get('e'),'E');
});

test('failure drains in-flight downloads and does not start queued assets',async()=>{
 let active=0;
 const calls=[];
 await assert.rejects(loadUnique(['bad','pending','never'],async url=>{
  calls.push(url);active++;
  await new Promise(resolve=>setTimeout(resolve,url==='bad'?1:15));active--;
  if(url==='bad')throw new Error('missing texture');return url;
 },2),/missing texture/);
 assert.equal(active,0);assert.deepEqual(calls,['bad','pending']);
});

test('handoff primes hair without hidden gestures and both first blinks arrive within 1.5s',()=>{
 for(const long of [false,true]) {
  const timeline=new CharacterTimeline(55,long);
  timeline.startAt(4.25);
  assert.equal(timeline.time,4.25);assert.equal(timeline.events.length,0);
  assert.ok(timeline.hair.some(h=>Math.abs(h.angle)>.001));
  assert.ok(timeline.hair.every(h=>Number.isFinite(h.angle)&&Math.abs(h.angle)<=.22));
  for(let i=0;i<180;i++)timeline.step(1/120,false);
  assert.equal(timeline.events.filter(e=>e.kind==='blink').length,1);
  const blink=timeline.events[0];
  assert.ok(blink.time-4.25>=.8&&blink.time-4.25<=1.5);
  assert.ok(timeline.nextBlink-blink.time>=3.22-1e-8);
  timeline.reschedule();
  assert.ok(timeline.nextBlink-timeline.time>=3);
 }
});
