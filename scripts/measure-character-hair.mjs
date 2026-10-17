import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('src/scripts/character-animation.ts','utf8');
function measure(previous,long){
 const code=previous?source.replace('export const HAIR_SPEED = 2.25','export const HAIR_SPEED = 1.65'):source;
 const context=vm.createContext({exports:{}});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 const timeline=new context.exports.CharacterTimeline(long?7919:104729,long);
 let sum=0,n=0,crossings=0,last=0,max=0;
 for(let i=0;i<120*65;i++){
  timeline.step(1/120,false);const a=timeline.hair[0].angle;
  if(i>=120*5){sum+=a*a;n++;max=Math.max(max,Math.abs(a));if(last<=0&&a>0)crossings++;}
  last=a;
 }
 return {rms:Math.sqrt(sum/n),max,cyclesPerMinute:crossings};
}
const report=['yasuna','sonya'].map(name=>{const previous=measure(true,name==='sonya'),current=measure(false,name==='sonya');return{name,previous,current,rmsRatio:current.rms/previous.rms,frequencyRatio:current.cyclesPerMinute/previous.cyclesPerMinute};});
fs.writeFileSync('.artifacts/character-motion-v2/hair-motion-v9-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
