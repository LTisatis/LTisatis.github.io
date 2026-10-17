import test from 'node:test';
import assert from 'node:assert/strict';
import { hitMesh } from '../src/scripts/character-hit-test.ts';

const original=new Float32Array([0,0,100,0,0,100,100,100]);
const mask={width:4,height:4,alpha:new Uint8Array([0,0,0,0,0,255,255,0,0,255,255,0,0,0,0,0])};
test('mesh picking ignores the transparent margins and exterior',()=>{
 for(const p of [[10,10],[90,50],[50,90],[-5,50],[120,40]])assert.equal(hitMesh(...p,original,original,2,100,100,mask),false);
 for(const p of [[40,40],[60,40],[40,60],[60,60]])assert.equal(hitMesh(...p,original,original,2,100,100,mask),true);
});
test('mesh picking follows the deformed triangles rather than the original rectangle',()=>{
 const pose=new Float32Array([200,0,300,20,160,100,260,120]);
 assert.equal(hitMesh(230,60,pose,original,2,100,100,mask),true);
 assert.equal(hitMesh(50,50,pose,original,2,100,100,mask),false);
 assert.equal(hitMesh(200,2,pose,original,2,100,100,mask),false);
});
test('transparent holes and collapsed triangles are never clickable',()=>{
 const empty={...mask,alpha:new Uint8Array(16)};
 assert.equal(hitMesh(50,50,original,original,2,100,100,empty),false);
 assert.equal(hitMesh(50,0,new Float32Array([0,0,100,0,0,0,100,0]),original,2,100,100,mask),false);
});
