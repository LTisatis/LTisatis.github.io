import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const context = vm.createContext({ exports: {} });
vm.runInContext(
	ts.transpileModule(
		fs.readFileSync("src/scripts/character-animation.ts", "utf8"),
		{
			compilerOptions: {
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.CommonJS,
			},
		},
	).outputText,
	context,
);
const { CharacterTimeline, blinkAmount, waveCurve, staggerWaves } =
	context.exports;
const deformContext=vm.createContext({exports:{},require:()=>context.exports});
vm.runInContext(ts.transpileModule(fs.readFileSync('src/scripts/character-deformation.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,deformContext);
test('detached hair keeps its root, width and arc length at both swing extremes',()=>{
 const {bendLock}=deformContext.exports;
 const tips=JSON.parse(fs.readFileSync('assets/character-motion-v2/hair-tips.json','utf8'));
 for(const tip of Object.values(tips).flat().filter(t=>t.foreground)){
  const dx=tip.tip[0]-tip.root[0],dy=tip.tip[1]-tip.root[1],length=Math.hypot(dx,dy),ex=dx/length,ey=dy/length;
  for(const angle of [-.22,.22]){
   assert.equal(JSON.stringify(bendLock(tip,...tip.root,angle)),JSON.stringify(tip.root));
   let previous=bendLock(tip,...tip.root,angle),arc=0;
   for(let i=1;i<=100;i++){
    const x=tip.root[0]+dx*i/100,y=tip.root[1]+dy*i/100;
    const q=bendLock(tip,x,y,angle);arc+=Math.hypot(q[0]-previous[0],q[1]-previous[1]);previous=q;
    const a=bendLock(tip,x-ey*8,y+ex*8,angle),b=bendLock(tip,x+ey*8,y-ex*8,angle);
    assert.ok(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-16)<1e-8,tip.id);
   }
   assert.ok(Math.abs(arc-length)/length<.001,`${tip.id} length ${arc}/${length}`);
  }
 }
});
test('body sway is small, continuous and independently phased with a still initial pose',()=>{
 const actors=[new CharacterTimeline(104729),new CharacterTimeline(7919,true)];
 for(const actor of actors){
  assert.equal(actor.pose.bodyAngle,0);assert.equal(actor.pose.bodyX,0);
  let previous=actor.pose,max=0;
  for(let i=0;i<7200;i++){
   actor.step(1/120,false);const p=actor.pose;
   assert.ok(Math.abs(p.bodyAngle)<=.026&&Math.abs(p.bodyX)<=5);
   assert.ok(Math.abs(p.bodyAngle-previous.bodyAngle)<.0005);
   max=Math.max(max,Math.abs(p.bodyAngle));previous=p;
  }
  assert.ok(max>.022);
 }
 assert.ok(Math.abs(actors[0].pose.bodyAngle-actors[1].pose.bodyAngle)>.001);
});
test('continuous hair weights pin facial features and keep parallax at the original range',()=>{
 const {hairWeight,parallaxDepth}=deformContext.exports;
 for(const long of [false,true])for(const id of ['hair-left','hair-right','hair-top']){
  for(const [x,y] of [[710,340],[770,450],[750,550]])assert.equal(hairWeight(long,id,x,y),0);
  for(let y=250;y<700;y+=7)for(let x=350;x<1250;x+=11){const w=hairWeight(long,id,x,y);assert.ok(w>=0&&w<=1);assert.ok(Math.abs(w-hairWeight(long,id,x+.01,y+.01))<.002);}
 }
 assert.equal(parallaxDepth('yasuna',false),65);assert.equal(parallaxDepth('sonya',false),85);
});
test('hair fields pin the jacket boundary and animate upper tips without influencing the face',()=>{
 const {hairWeight,restingArmWeight,tipWeight}=deformContext.exports;
 for(const [x,y] of [[570,650],[550,680],[520,710],[600,690],[650,630]])
  for(const id of ['hair-left','hair-right','hair-top'])assert.equal(hairWeight(true,id,x,y),0,`${id} ${x},${y}`);
 for(const [x,y] of [[480,430],[570,500],[610,540]])
  assert.equal(hairWeight(false,'hair-left',x,y),0);
 for(const long of [false,true]) {
  assert.equal(hairWeight(long,'hair-top',long?450:800,80),0);
  assert.equal(hairWeight(long,'hair-top',700,230),0);
  assert.equal(restingArmWeight(long,700,800),0);
 }
 assert.ok(restingArmWeight(true,200,990)>.99);
 assert.ok(restingArmWeight(false,1200,990)>.99);
 const tips=JSON.parse(fs.readFileSync('assets/character-motion-v2/hair-tips.json','utf8'));
 for(const list of Object.values(tips)){
  assert.ok(list.length>=12);assert.ok(list.filter(t=>t.foreground).length>=3);
  for(const tip of list){assert.equal(tipWeight(tip,...tip.root),0);assert.ok(tipWeight(tip,...tip.tip)>.99);}
 }
});
test('both arms sway between waves, independently, and blend continuously into waving',()=>{
 const a=new CharacterTimeline(104729),b=new CharacterTimeline(7919,true);
 for(const actor of [a,b]) {
  assert.equal(actor.pose.shoulder,0); assert.equal(actor.pose.restShoulder,0);
  actor.time=3.7;
  assert.ok(Math.abs(actor.pose.shoulder)>.002);
  assert.ok(Math.abs(actor.pose.restShoulder)>.002);
  const before=actor.pose;actor.wave();const atStart=actor.pose;
  assert.equal(before.shoulder,atStart.shoulder);
  let previous=atStart;
  for(let i=0;i<400;i++){
   actor.step(1/120,false);const p=actor.pose;
   for(const key of ['shoulder','elbow','wrist','restShoulder','restElbow'])assert.ok(Math.abs(p[key]-previous[key])<.02,key);
   previous=p;
  }
 }
 assert.notEqual(a.pose.shoulder,b.pose.shoulder);
});

test('Yasuna smile varies smoothly while Sonya and the initial original pose stay unchanged',()=>{
 const a=new CharacterTimeline(104729),b=new CharacterTimeline(7919,true);
 assert.equal(a.pose.mouth,1);assert.equal(b.pose.mouth,1);
 let min=1,max=1,previous=1;
 for(let i=0;i<7200;i++){
  a.step(1/120,false);b.step(1/120,false);const value=a.pose.mouth;
  assert.ok(value>=.8975-1e-8&&value<=1.0275+1e-8);
  assert.ok(Math.abs(value-previous)<.003);assert.equal(b.pose.mouth,1);
  min=Math.min(min,value);max=Math.max(max,value);previous=value;
 }
 assert.ok(min<.905&&max>1.02);
});

test('mouth deformation pins eyes, nose and jaw and does not fold at either extreme',()=>{
 const {mouthDisplacement}=deformContext.exports;
 for(const [x,y] of [[715,340],[888,365],[850,402],[780,552],[850,536],[690,505],[749,561]])
  assert.equal(JSON.stringify(mouthDisplacement(x,y)),JSON.stringify([0,0]),`${x},${y}`);
 const bottom=mouthDisplacement(780,529);assert.ok(Math.hypot(...bottom)>70);
 for(const opening of [.795,1.055])for(let y=370;y<=560;y+=3)for(let x=650;x<=900;x+=3){
  const a=mouthDisplacement(x,y),b=mouthDisplacement(x+.1,y),c=mouthDisplacement(x,y+.1),s=opening-1;
  const xx=1+(b[0]-a[0])*s/.1,xy=(c[0]-a[0])*s/.1,yx=(b[1]-a[1])*s/.1,yy=1+(c[1]-a[1])*s/.1;
  assert.ok(xx*yy-xy*yx>.15,`mouth fold ${opening} at ${x},${y}`);
 }
});

test('Yasuna crown pins the scalp and first sixty percent while keeping the very tip free',()=>{
 const {tipWeight}=deformContext.exports,tip=JSON.parse(fs.readFileSync('assets/character-motion-v2/hair-tips.json')).yasuna.find(t=>t.id==='crown-tip');
 for(let y=88;y<=130;y+=2)for(let x=720;x<=870;x+=2)assert.equal(tipWeight(tip,x,y),0);
 for(let t=0;t<=.6;t+=.05)assert.equal(tipWeight(tip,tip.root[0]+(tip.tip[0]-tip.root[0])*t,tip.root[1]+(tip.tip[1]-tip.root[1])*t),0);
 assert.ok(tipWeight(tip,...tip.tip)>.99);
});
test("blink closes in 80ms, holds 40ms, opens in 100ms; wave starts and ends at rest", () => {
	assert.equal(blinkAmount(-1), 0);
	assert.equal(blinkAmount(0), 0);
	assert.equal(blinkAmount(0.08), 1);
	assert.equal(blinkAmount(0.119), 1);
	assert.equal(blinkAmount(0.22), 0);
	for (const t of [0, 2.5, 10]) assert.equal(waveCurve(t), 0);
	assert.ok(waveCurve(0.7) > waveCurve(1.48));
	assert.ok(Math.abs(waveCurve(0.0001)) < 0.000001);
});
test("fixed seeds reproduce a minute of independent blinks and staggered waves", () => {
	function run() {
		const a = new CharacterTimeline(104729),
			b = new CharacterTimeline(7919, true);
		staggerWaves(a, b);
		for (let i = 0; i < 7200; i++) {
			a.step(1 / 120, b.time - b.waveStart > 3);
			b.step(1 / 120, a.time - a.waveStart > 3);
			staggerWaves(a, b);
		}
		return [a, b];
	}
	const [a, b] = run(),
		[c, d] = run();
	assert.equal(JSON.stringify(a.events), JSON.stringify(c.events));
	assert.equal(JSON.stringify(b.events), JSON.stringify(d.events));
	const aa = a.events.filter((e) => e.kind === "blink"),
		bb = b.events.filter((e) => e.kind === "blink");
	assert.ok(aa.length >= 8 && bb.length >= 8);
	assert.notEqual(JSON.stringify(aa), JSON.stringify(bb));
	for (const list of [aa, bb])
		for (let i = 1; i < list.length; i++)
			assert.ok(list[i].time - list[i - 1].time >= 0.39);
	for (const wa of a.events.filter((e) => e.kind === "wave"))
		for (const wb of b.events.filter((e) => e.kind === "wave"))
			assert.ok(Math.abs(wa.time - wb.time) >= 3);
	assert.ok(
		a.hair.every((h) => Number.isFinite(h.angle) && Math.abs(h.angle) <= 0.22),
	);
});
test("coordinating two wave clocks keeps 18–28 second intervals over ten minutes", () => {
	const a = new CharacterTimeline(104729),
		b = new CharacterTimeline(7919, true);
	staggerWaves(a, b);
	for (let i = 0; i < 72000; i++) {
		a.step(1 / 120, b.time - b.waveStart > 3);
		b.step(1 / 120, a.time - a.waveStart > 3);
		staggerWaves(a, b);
	}
	for (const actor of [a, b]) {
		const events = actor.events.filter((e) => e.kind === "wave");
		for (let i = 1; i < events.length; i++) {
			const gap = events[i].time - events[i - 1].time;
			assert.ok(gap >= 18 && gap <= 28.02, String(gap));
		}
	}
});
test("normal intervals and double blink do not produce chained or dense blinking", () => {
	const a = new CharacterTimeline(1);
	a.random = () => 0;
	assert.equal(a.blink(), true);
	assert.equal(a.blink(), false);
	for (let i = 0; i < 100; i++) a.step(1 / 120, false);
	assert.equal(a.events.filter((e) => e.kind === "blink").length, 2);
	assert.equal(a.doubleAt, Infinity);
	assert.ok(a.nextBlink >= a.lastBlink + 3.22 - 1e-8);
	const now = a.time;
	a.reschedule();
	assert.ok(a.nextBlink >= now + 3 && a.nextBlink <= now + 7);
	assert.ok(a.nextWave >= now + 18 && a.nextWave <= now + 28);
});
test("resuming reschedules stale deadlines and wave preparation resets blink", () => {
	const a = new CharacterTimeline(55);
	a.time = 100;
	a.reschedule();
	assert.ok(a.nextBlink > 100);
	assert.ok(a.nextWave > 100);
	a.wave();
	assert.equal(a.blinkStart, 100);
	assert.ok(a.nextBlink >= 103.22);
	a.step(0.01);
	assert.equal(a.events.filter((e) => e.kind === "blink").length, 1);
});

test('repeated manual greetings finish the current wave without restarting or queuing',()=>{
 const a=new CharacterTimeline(55);a.time=7;
 assert.equal(a.wave(),true);
 const start=a.waveStart,blink=a.blinkStart;
 for(let i=0;i<240;i++){a.step(1/120,false);assert.equal(a.wave(),false);}
 assert.equal(a.waveStart,start);assert.equal(a.blinkStart,blink);
 for(let i=0;i<72;i++)a.step(1/120,false);
 assert.equal(a.wave(),true);
 assert.equal(a.events.filter(e=>e.kind==='wave').length,2);
 assert.ok(a.nextWave>=a.time+18&&a.nextWave<=a.time+28);
});
test("v2 art fits 4MB including all eye plates, static images and manifest", () => {
	const dir = "public/media/characters-v2";
	const files = fs.readdirSync(dir);
	const bytes = files.reduce((n, f) => n + fs.statSync(dir + "/" + f).size, 0);
	assert.ok(bytes < 4 * 1024 * 1024, `${bytes} bytes`);
	const manifest = JSON.parse(fs.readFileSync(dir + "/rigs.json", "utf8"));
	for (const rig of Object.values(manifest.characters)) {
		assert.equal(rig.eyes.length, 2);
		assert.ok(!rig.hair.some(p=>p.id==='hair-top'));
		assert.ok(rig.tips.length>=12);
		assert.ok(rig.parts.filter(p=>p.kind==='fringe').length>=3);
		assert.ok(!rig.parts.some(p=>p.kind==='arm'||p.kind==='hand'));
		const body=rig.parts.find(p=>p.kind==='body');
		assert.equal(Buffer.from(body.hairFreedom,'base64').length,body.grid[0]*body.grid[1]);
		assert.equal(rig.parts.filter((p) => p.kind === "body").length, 1);
		assert.ok(
			!rig.parts.some((p) =>
				["head", "torso", "upper-arm", "forearm"].includes(p.id),
			),
		);
		for (const p of rig.parts) {
			assert.ok(
				p.x >= 0 && p.y >= 0 && p.x + p.width <= 1407 && p.y + p.height <= 1118,
			);
			assert.ok(fs.existsSync("public" + p.src));
		}
		for (const e of rig.eyes)
			for (const state of ["open", "half", "closed", "clean"])
				assert.ok(fs.existsSync("public" + e.states[state].src));
	}
});
