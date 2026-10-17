import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source=ts.transpileModule(fs.readFileSync("src/scripts/character-motion-v1.ts","utf8"),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText;
function fixture(complete=false, naturalWidth=100) {
  const events={};
  const img={complete,naturalWidth,addEventListener:(name,callback)=>events[name]=callback};
  const root={dataset:{puppetState:"static",fallback:"/media/sonya-hands.png"},querySelectorAll:()=>[img],replaceChildren(image){this.replacement=image;}};
  const context=vm.createContext({exports:{},document:{createElement:()=>({})}});
  vm.runInContext(source,context);
  const controller=context.exports.createCharacterMotion([root]);
  return {root,events,controller,exports:context.exports};
}
test("puppet state respects reduced motion, explicit pause and background visibility",()=>{
  const {exports:{puppetState}}=fixture();
  assert.equal(puppetState(false,false,false),"running");
  assert.equal(puppetState(true,false,false),"paused");
  assert.equal(puppetState(false,false,true),"paused");
  for(const paused of [false,true]) for(const hidden of [false,true]) assert.equal(puppetState(paused,true,hidden),"static");
});
test("first paused load keeps the rest pose; a later pause freezes an existing animation",()=>{
  const {root,controller}=fixture();
  controller.sync(true,false,false);
  assert.equal(root.dataset.puppetState,"static");
  controller.sync(false,false,false);
  assert.equal(root.dataset.puppetState,"running");
  controller.sync(false,false,true);
  assert.equal(root.dataset.puppetState,"paused");
  controller.sync(false,false,false);
  assert.equal(root.dataset.puppetState,"running");
  controller.sync(false,true,false);
  assert.equal(root.dataset.puppetState,"static");
});
test("failed cached and later-failing parts fall back once and cannot restart the rig",()=>{
  for(const cached of [false,true]) {
    const {root,controller,events}=fixture(cached,0);
    if(!cached) events.error();
    const replacement=root.replacement;
    assert.equal(replacement.src,"/media/sonya-hands.png");
    events.error();
    assert.equal(root.replacement,replacement);
    controller.sync(false,false,false);
    assert.equal(root.dataset.puppetState,"static");
  }
});
test("rig assets fit their canvas, contain finite pivots, and stay below the original transfer budget",()=>{
  const rigs=JSON.parse(fs.readFileSync("src/data/character-rigs.json","utf8"));
  let bytes=0;
  for(const rig of Object.values(rigs)) for(const part of rig.parts) {
    assert.ok(part.x>=0&&part.y>=0&&part.width>0&&part.height>0);
    assert.ok(part.x+part.width<=rig.width&&part.y+part.height<=rig.height);
    if(part.pivot) assert.ok(part.pivot.length===2&&part.pivot.every(Number.isFinite));
    assert.equal(fs.statSync(`public${part.src}`).size,part.bytes);
    bytes+=part.bytes;
  }
  const budget=["yasuna","sonya"].reduce((n,name)=>n+fs.statSync(`public/media/${name}-hands.png`).size,0);
  assert.ok(bytes<=budget);
});
