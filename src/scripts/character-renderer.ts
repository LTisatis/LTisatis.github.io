import {
	Container,
	MeshPlane,
	Texture,
	WebGLRenderer,
	Graphics,
} from "pixi.js";
import {
	CharacterTimeline,
	clamp,
	smooth,
	staggerWaves,
	HAIR_SPEED,
} from "./character-animation";
import { bendLock, hairWeight, parallaxDepth, restingArmWeight, raisedArmWeight, tipWeight, mouthDisplacement, type HairTip } from "./character-deformation";
import { hitMesh, type AlphaMask } from "./character-hit-test";
import { prepareCharacterAssets, type CharacterAssets } from "./character-assets";
type Point = [number, number];
type Part = {
	id: string;
	kind: string;
	src: string;
	x: number;
	y: number;
	width: number;
	height: number;
	pivot: number[] | null;
	grid: number[];
	gridX?: number[];
	gridY?: number[];
	textureResolution?: number;
	hairFreedom?: string;
	tip?: string;
};
type Eye = {
	x: number;
	y: number;
	width: number;
	height: number;
	states: Record<string, { src: string }>;
};
type Rig = {
	seed: number;
	shoulder: Point;
	elbow: Point;
	wrist: Point;
	neck: Point;
	parts: Part[];
	eyes: Eye[];
	tips: HairTip[];
	hair: { id: string; pivot: number[]; y: number; height: number }[];
};
export type CharacterManifest = { characters: Record<string, Rig> };
type VertexWeights = { freedom: number; arm: number; mouth: readonly [number,number]; tips: { index: number; weight: number }[] };
type Skin = { mesh: MeshPlane; part: Part; original: Float32Array; weights: VertexWeights[] };
const rotate = (x: number, y: number, p: number[], a: number): Point => [
	p[0] + (x - p[0]) * Math.cos(a) - (y - p[1]) * Math.sin(a),
	p[1] + (x - p[0]) * Math.sin(a) + (y - p[1]) * Math.cos(a),
];
const mix = (a: Point, b: Point, w: number): Point => [
	a[0] + (b[0] - a[0]) * w,
	a[1] + (b[1] - a[1]) * w,
];
export async function createRenderer(
	anchors: HTMLElement[],
	host: HTMLElement,
	onFailure: (error: unknown) => void,
	assetsTask: Promise<CharacterAssets> = prepareCharacterAssets(),
) {
	const renderer = new WebGLRenderer();
	const mobile = () => innerWidth < 1024;
	const initialization = renderer.init({
		width: innerWidth,
		height: innerHeight,
		resolution: mobile() ? Math.min(devicePixelRatio,1) : Math.min(2,Math.max(1.5,devicePixelRatio)),
		backgroundAlpha: 0,
		antialias: true,
		autoDensity: true,
		powerPreference: "low-power",
	});
	const prepared = await Promise.allSettled([initialization, assetsTask]);
	if (prepared[0].status === "rejected" || prepared[1].status === "rejected") {
		if (prepared[0].status === "fulfilled") renderer.destroy();
		throw prepared[0].status === "rejected" ? prepared[0].reason : (prepared[1] as PromiseRejectedResult).reason;
	}
	const { manifest, images, timing } = prepared[1].value;
	const canvas = renderer.canvas as HTMLCanvasElement;
	canvas.className = "character-webgl";
	canvas.setAttribute("aria-hidden", "true");
	const stage = new Container();
	const textures: Texture[] = [];
	const debug = new Graphics();
	const hitMasks = new WeakMap<Texture, AlphaMask>();
	let disposed = false;
	let running = false;
	let frame = 0;
	let last = 0;
	let accumulator = 0;
	let speed = 1;
	let showDebug = false;
	let lastDraw = 0;
	let pointerX = 0;
	let pointerY = 0;
	let x = 0;
	let y = 0;
	let qualityCap = 2;
	let desktopFps = 60;
	let qualitySamples: number[] = [];
	const metrics = {
		startup: { ...timing, firstRender: 0 },
		frames: 0,
		updateMs: [] as number[],
		intervalMs: [] as number[],
		resolution: renderer.resolution,
		targetFps: mobile() ? 30 : 60,
		qualityChanges: [] as { resolution: number; fps: number }[],
	};
	function texture(src: string) {
		const img = images.get(src);
		if (!img) throw new Error("Missing character texture");
		if (disposed) throw new Error("Disposed");
		const t = Texture.from(img);
		textures.push(t);
		// Small CPU-only alpha maps share the already decoded images. They are
		// sampled on clicks, so interaction adds no work to animation frames.
		const probe=document.createElement('canvas');
		probe.width=Math.ceil(img.naturalWidth/4);probe.height=Math.ceil(img.naturalHeight/4);
		const ctx=probe.getContext('2d');
		if (!ctx) throw new Error("Character alpha sampling unavailable");
		ctx.drawImage(img,0,0,probe.width,probe.height);
		const pixels=ctx.getImageData(0,0,probe.width,probe.height).data;
		const alpha=new Uint8Array(probe.width*probe.height);
		for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];
		hitMasks.set(t,{width:probe.width,height:probe.height,alpha});
		probe.width=probe.height=0;
		return t;
	}
	const actors: {
		root: Container;
		anchor: HTMLElement;
		rig: Rig;
		timeline: CharacterTimeline;
		pose: CharacterTimeline["pose"];
		skins: Skin[];
		eyes: { skins: Skin[]; textures: Texture[] }[];
		box: DOMRect;
		tipAngles: number[];
		armJoints: { elbow: Point; wrist: Point }[];
	}[] = [];
	try {
		for (const anchor of anchors) {
			const name = anchor.dataset.character ?? "";
			const rig: Rig = manifest.characters[name];
			if (!rig) throw new Error("Unknown character");
			const root = new Container();
			stage.addChild(root);
			const timeline = new CharacterTimeline(rig.seed, name === "sonya");
			const skins: Skin[] = [];
			function make(part: Part, t: Texture) {
				const mesh = new MeshPlane({
					texture: t,
					verticesX: part.grid[0],
					verticesY: part.grid[1],
				});
				mesh.autoResize = false;
				root.addChild(mesh);
				const original = new Float32Array(
					mesh.geometry.getAttribute("aPosition").buffer.data,
				);
				// Supersampled fringe/brow textures retain the original model units.
				for(let i=0;i<original.length;i+=2){original[i]*=part.width/t.width;original[i+1]*=part.height/t.height;}
				if(part.gridX&&part.gridY){
					// Refine only the mouth's row/column bands, retaining all previous
					// control points. Matching UVs keep the neutral artwork unchanged.
					const uvBuffer=mesh.geometry.getAttribute('aUV').buffer;
					const uv=uvBuffer.data;
					for(let i=0;i<original.length;i+=2){
						const u=part.gridX[(i/2)%part.grid[0]];
						const v=part.gridY[Math.floor(i/2/part.grid[0])];
						original[i]=u*part.width;original[i+1]=v*part.height;uv[i]=u;uv[i+1]=v;
					}
					uvBuffer.update();
				}
				const freedom = part.hairFreedom ? atob(part.hairFreedom) : "";
				const weights: VertexWeights[] = [];
				for(let i=0;i<original.length;i+=2){
					const x=original[i]+part.x;
					const y=original[i+1]+part.y;
					const free=part.kind === "fringe" ? 1 : (freedom.charCodeAt(i/2)||0)/255;
					const influences: VertexWeights["tips"]=[];
					if(free>0)rig.tips.forEach((tip,index)=>{
						// This overlapping nape tip shares the ponytail's broad flow.
						// A separate narrow rotation also pinches the rear silhouette.
						if(tip.sharedStrand)return;
						if(part.kind === "fringe" ? tip.id!==part.tip : tip.foreground)return;
						const weight=tipWeight(tip,x,y)*free;
						// Cache a local neighbourhood for each tip; deformation uses its
						// original weight so adjacent locks cannot amplify one another.
						const reach=tip.width+120;
						if(part.kind==='fringe'||(x>=Math.min(tip.root[0],tip.tip[0])-reach&&x<=Math.max(tip.root[0],tip.tip[0])+reach&&y>=Math.min(tip.root[1],tip.tip[1])-reach&&y<=Math.max(tip.root[1],tip.tip[1])+reach))influences.push({index,weight});
					});
					weights.push({freedom:free,arm:part.kind==='body'?raisedArmWeight(name==='sonya',x,y,rig.shoulder,rig.wrist):0,mouth:name==='yasuna'&&part.kind==='body'?mouthDisplacement(x,y):[0,0],tips:influences});
				}
				return { mesh, part, original, weights };
			}
			for (const p of rig.parts) skins.push(make(p, texture(p.src)));
			const eyes = [];
			for (const e of rig.eyes) {
				const ts = ["open", "half", "closed"].map(state => texture(e.states[state].src));
				const p = {
					...e,
					id: "eye",
					kind: "eye",
					src: "",
					pivot: null,
					grid: [9, 9],
				};
				// An opaque clean plate is already in the head. Never overlay closed eyes on original eyes.
				eyes.push({ skins: [make(p, ts[0])], textures: ts });
			}
			// Foreground locks must occlude every eye state, including a closing lid.
			for(const skin of skins)if(skin.part.kind==='fringe')root.addChild(skin.mesh);
			for(const skin of skins)if(skin.part.kind==='brow')root.addChild(skin.mesh);
			actors.push({
				root,
				anchor,
				rig,
				timeline,
				pose: timeline.pose,
				skins,
				eyes,
				box: anchor.getBoundingClientRect(),
				tipAngles: [],
				armJoints: [],
			});
		}
	} catch (error) {
		textures.forEach((t) => { t.destroy(true); });
		stage.destroy({ children: true });
		renderer.destroy();
		throw error;
	}
	staggerWaves(actors[0].timeline, actors[1].timeline);
	stage.addChild(debug);
	host.appendChild(canvas);
	function map(
		actor: (typeof actors)[number],
		part: Part,
		inputX: number,
		inputY: number,
		weights?: VertexWeights,
	): Point {
		let px = inputX;
		let py = inputY;
		const { rig, timeline, pose: p } = actor;
		const originalX = px;
		const originalY = py;
		const side = actor.anchor.dataset.character === "sonya" ? -1 : 1;
		const arm = weights?.arm ?? (part.kind==='body' ? raisedArmWeight(timeline.longHair,px,py,rig.shoulder,rig.wrist) : 0);
		if (arm > 0) {
			const axis=[rig.wrist[0]-rig.shoulder[0],rig.wrist[1]-rig.shoulder[1]];
			const length=Math.hypot(...axis);
			const elbowDistance=Math.hypot(rig.elbow[0]-rig.shoulder[0],rig.elbow[1]-rig.shoulder[1]);
			// Integrate the joint velocity field, rather than advecting one fixed
			// large displacement. This keeps the larger hand gesture continuous.
			for(let step=0;step<20;step++){
				const {elbow:e,wrist}=actor.armJoints[step];
				const along=((px-rig.shoulder[0])*axis[0]+(py-rig.shoulder[1])*axis[1])/length;
				const ew=smooth((along-elbowDistance+95)/190);
				const ww=smooth((along-length+50)/100);
				const vx=-(py-rig.shoulder[1])*p.shoulder*side-(py-e[1])*p.elbow*side*ew-(py-wrist[1])*p.wrist*side*ww;
				const vy=(px-rig.shoulder[0])*p.shoulder*side+(px-e[0])*p.elbow*side*ew+(px-wrist[0])*p.wrist*side*ww-p.shoulderLift;
				const w=raisedArmWeight(timeline.longHair,px,py,rig.shoulder,rig.wrist);
				px+=vx*w/20;py+=vy*w/20;
			}
		}
		let hairInfluence = 0;
		if (part.kind === "body" && (weights?.freedom ?? 0) > 0)
			for (const strand of rig.hair) {
				const influence = (weights?.freedom ?? 0) * hairWeight(
					timeline.longHair,
					strand.id,
					px,
					originalY,
				);
				if (influence === 0) continue;
				hairInfluence = Math.max(hairInfluence, influence);
				// The left lock is held between the face and jacket. It cannot swing
				// like the free ponytail. Bound displacement before applying its mask.
				const right=strand.id==='hair-right';
				const u=clamp((originalY-(right?590:530))/(right?410:170));
				const delayed=timeline.hair[4].angle*.65+timeline.hair[2].angle*.35;
				const displacement=Math.tanh(delayed*8)*(right?46:6.5)*smooth(u);
				px+=displacement*influence;
				py-=Math.abs(displacement)*.06*influence;
			}
		// Detached bangs bend as ribbons; attached tips use a bounded rest-space
		// displacement. Overlapping fields are averaged, never multiplied together.
		const influences=weights?.tips ?? [];
		if(part.kind==='fringe')for(const influence of influences){
			const tip=rig.tips[influence.index];
			[px,py]=bendLock(tip,px,py,actor.tipAngles[influence.index]);
		}
		// An initially zero velocity stays zero through every integration step.
		// Skip these stationary vertices (including the refined face grid).
		if(part.kind==='body'&&influences.some(influence=>influence.weight>0)){
			// Integrate all overlapping tip velocities together. Re-evaluating the
			// smooth field avoids a fold when an enlarged tip crosses its rest mask.
			let tx=originalX;
			let ty=originalY;
			for(let step=0;step<16;step++){
				let vx=0;
				let vy=0;
				let total=0;
				for(const influence of influences){
					const tip=rig.tips[influence.index];
					const w=tipWeight(tip,tx,ty)*(weights?.freedom??0);
					if(!w)continue;
					const angle=actor.tipAngles[influence.index]*.7*(tip.amplitude??1);
					const pin=tip.pinned??0;
					const rx=tip.root[0]+(tip.tip[0]-tip.root[0])*pin;
					const ry=tip.root[1]+(tip.tip[1]-tip.root[1])*pin;
					vx-=(ty-ry)*angle*w;vy+=(tx-rx)*angle*w;total+=w;
				}
				tx+=vx/Math.max(1,total)/16;ty+=vy/Math.max(1,total)/16;
			}
			px+=tx-originalX;py+=ty-originalY;
		}
		if(weights){px+=weights.mouth[0]*(p.mouth-1);py+=weights.mouth[1]*(p.mouth-1);}
		const neckWeight = 1 - smooth((originalY - 520) / 120);
		const weight =
			part.kind === "eye" || part.kind === "fringe" ? 1 : (neckWeight + (1 - neckWeight) * hairInfluence)*(1-arm);
		let q = mix([px, py], rotate(px, py, rig.neck, p.head), weight);
		if (part.kind === "body") {
			const w = restingArmWeight(timeline.longHair, px, originalY);
			if (w > 0) {
				const shoulder = timeline.longHair ? [545, 695] : [875, 675];
				const elbow = timeline.longHair ? [350, 850] : [1060, 850];
				const upper = rotate(...q, shoulder, p.restShoulder * side);
				const joint = rotate(...elbow as Point, shoulder, p.restShoulder * side);
				const fore = rotate(...upper, joint, p.restElbow * side);
				q = mix(q, mix(upper, fore, smooth((originalY - 790) / 150)), w);
			}
		}
		q=rotate(q[0],q[1]+p.breath,[rig.neck[0],1060],p.bodyAngle);
		return [q[0]+p.bodyX,q[1]];
	}
	function updateSkin(
		actor: (typeof actors)[number],
		skin: Skin,
		eyeAmount = 0,
	) {
		const { mesh, part, original } = skin;
		const buffer = mesh.geometry.getAttribute("aPosition").buffer;
		const data = buffer.data;
		for (let i = 0; i < original.length; i += 2) {
			const px = original[i] + part.x;
			let py = original[i + 1] + part.y;
			// Only a small local eyelid bend between painted states, never flatten the eyeball.
			if (part.kind === "eye") {
				const u = original[i] / part.width;
				const v = original[i + 1] / part.height;
				py +=
					Math.sin(u * Math.PI) *
					Math.sin(v * Math.PI) *
					Math.sin(eyeAmount * Math.PI * 2) *
					2;
			}
			const q = map(actor, part, px, py, skin.weights[i/2]);
			data[i] = q[0];
			data[i + 1] = q[1];
		}
		buffer.update();
	}
	function draw() {
		if (disposed) return;
		const start = performance.now();
		debug.clear();
		for (const a of actors) {
			a.pose = a.timeline.pose;
			// These transforms are shared by thousands of vertices in this frame.
			a.tipAngles=a.rig.tips.map((_,i)=>clamp(a.timeline.hair[i%6].angle*1.25+
				Math.sin(a.timeline.time*HAIR_SPEED*1.8+i*1.37)*.016*smooth(a.timeline.time),-.22,.22));
			const side=a.timeline.longHair?-1:1;
			a.armJoints=Array.from({length:20},(_,i)=>{
				const progress=(i+.5)/20;
				const elbow=rotate(...a.rig.elbow,a.rig.shoulder,a.pose.shoulder*side*progress);
				const wrist=rotate(...rotate(...a.rig.wrist,a.rig.shoulder,a.pose.shoulder*side*progress),elbow,a.pose.elbow*side*progress);
				return {elbow,wrist};
			});
			const entering=/welcome-(pending|active|leaving)/.test(document.documentElement.className);
			let scale = a.box.width / 1407;
			const depth = parallaxDepth(a.anchor.dataset.character ?? "", mobile());
			if(entering){
				// Follow the current WAAPI transform, including its rotation and fade.
				// A rotated bounding-box width is not the actual sprite scale.
				const style=getComputedStyle(a.anchor);
				const m=new DOMMatrixReadOnly(style.transform);
				const width=Number.parseFloat(style.width);
				const height=Number.parseFloat(style.height);
				const rect=a.anchor.getBoundingClientRect();
				const left=rect.left-Math.min(0,m.a*width,m.c*height,m.a*width+m.c*height);
				const top=rect.top-Math.min(0,m.b*width,m.d*height,m.b*width+m.d*height);
				const dx=x*depth;
				const dy=y*depth*.65;
				a.root.position.set(left+m.a*dx+m.c*dy,top+m.b*dx+m.d*dy);
				a.root.rotation=Math.atan2(m.b,m.a);
				scale=width/1407*Math.hypot(m.a,m.b);
				a.root.alpha=style.visibility==='hidden'?0:Number(style.opacity);
			}else{
				a.root.position.set(a.box.left+x*depth,a.box.top+y*depth*.65);
				a.root.rotation=0;a.root.alpha=1;
			}
			a.root.scale.set(scale);
			for (const skin of a.skins) updateSkin(a, skin);
			const blink = a.timeline.pose.blink;
			for (const eye of a.eyes) {
				const skin = eye.skins[0];
				skin.mesh.texture =
					eye.textures[blink < 0.28 ? 0 : blink < 0.82 ? 1 : 2];
				updateSkin(a, skin, blink);
			}
			if (showDebug) {
				for (const skin of a.skins) {
					const d = skin.mesh.geometry.getAttribute("aPosition").buffer.data;
					const nx = skin.part.grid[0];
					for (let j = 0; j < d.length / 2; j++) {
						const px = a.root.x + d[j * 2] * scale;
						const py = a.root.y + d[j * 2 + 1] * scale;
						if (j % nx < nx - 1)
							debug
								.moveTo(px, py)
								.lineTo(
									a.root.x + d[j * 2 + 2] * scale,
									a.root.y + d[j * 2 + 3] * scale,
								);
						if (j + nx < d.length / 2)
							debug
								.moveTo(px, py)
								.lineTo(
									a.root.x + d[(j + nx) * 2] * scale,
									a.root.y + d[(j + nx) * 2 + 1] * scale,
								);
					}
				}
				debug.stroke({ color: 0x12adbc, width: 0.65, alpha: 0.5 });
				const body = a.skins.find((s) => s.part.kind === "body");
				if (!body) continue;
				const points = [a.rig.shoulder, a.rig.elbow, a.rig.wrist].map((p) =>
					map(a, body.part, ...p),
				);
				for (let i = 0; i < points.length; i++) {
					const p = points[i];
					const px = a.root.x + p[0] * scale;
					const py = a.root.y + p[1] * scale;
					if (i === 0) debug.moveTo(px, py);
					else debug.lineTo(px, py);
				}
				debug.stroke({ color: 0xff386c, width: 2 });
				for (const p of points)
					debug
						.circle(a.root.x + p[0] * scale, a.root.y + p[1] * scale, 3)
						.fill(0xff386c);
			}
		}
		renderer.render(stage);
		if (!metrics.startup.firstRender) metrics.startup.firstRender = performance.now();
		metrics.frames++;
		metrics.updateMs.push(performance.now() - start);
		if (metrics.updateMs.length > 3600) metrics.updateMs.shift();
	}
	function tick(now: number) {
		if (!running || disposed) return;
		frame = requestAnimationFrame(tick);
		if (lastDraw && now - lastDraw < 1000 / (mobile() ? 30 : desktopFps) - 1)
			return;
		if (lastDraw) {
			metrics.intervalMs.push(now - lastDraw);
			if (metrics.intervalMs.length > 3600) metrics.intervalMs.shift();
		}
		if (lastDraw && !mobile()) {
			qualitySamples.push(now - lastDraw);
			if (qualitySamples.length >= 120) {
				const average =
					qualitySamples.reduce((a, b) => a + b, 0) / qualitySamples.length;
				qualitySamples = [];
				if (desktopFps===60 && average > 24 || desktopFps===30 && average>42 && qualityCap>1.5) {
					// Preserve edge quality: reduce cadence first, then cap high-DPI
					// supersampling at 1.5 if thirty frames are still too expensive.
					if (desktopFps===60) desktopFps=30;
					else {
						qualityCap = 1.5;
						renderer.resolution = Math.min(qualityCap,Math.max(1.5,devicePixelRatio));
						renderer.resize(innerWidth, innerHeight);
					}
					metrics.resolution = renderer.resolution;
					metrics.targetFps = desktopFps;
					metrics.qualityChanges.push({
						resolution: renderer.resolution,
						fps: desktopFps,
					});
				}
			}
		}
		lastDraw = now;
		const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
		last = now;
		accumulator += dt * speed;
		let steps = 0;
		while (accumulator >= 1 / 120 && steps++ < 12) {
			for (const a of actors) {
				const other = actors.find((b) => b !== a);
				a.timeline.step(
					1 / 120,
					!other || other.timeline.time - other.timeline.waveStart > 3,
				);
			}
			staggerWaves(actors[0].timeline, actors[1].timeline);
			accumulator -= 1 / 120;
		}
		if (steps >= 12) accumulator = 0;
		const follow = 1 - Math.exp(-dt * 6);
		x += (pointerX - x) * follow;
		y += (pointerY - y) * follow;
		draw();
	}
	function resize() {
		if (disposed) return;
		renderer.resolution = mobile()?Math.min(devicePixelRatio,1):Math.min(qualityCap,Math.max(1.5,devicePixelRatio));
		renderer.resize(innerWidth, innerHeight);
		metrics.resolution = renderer.resolution;
		metrics.targetFps = mobile() ? 30 : desktopFps;
		actors.forEach((a) => { a.box = a.anchor.getBoundingClientRect(); });
		draw();
	}
	function pause() {
		running = false;
		cancelAnimationFrame(frame);
		last = 0;
		lastDraw = 0;
		accumulator = 0;
	}
	function resume(resetTimers = false) {
		if (disposed || running) return;
		if (resetTimers) {
			actors.forEach((a) => { a.timeline.reschedule(); });
			staggerWaves(actors[0].timeline, actors[1].timeline);
		}
		running = true;
		last = 0;
		lastDraw = 0;
		frame = requestAnimationFrame(tick);
	}
	function lost(event: Event) {
		event.preventDefault();
		pause();
		onFailure(new Error("WebGL context lost"));
	}
	canvas.addEventListener("webglcontextlost", lost);
	window.addEventListener("resize", resize);
	resize();
	return {
		canvas,
		metrics,
		actors,
		pause,
		resume,
		resize,
		draw,
		pointer(a: number, b: number) {
			pointerX = clamp(a, -1, 1);
			pointerY = clamp(b, -1, 1);
		},
		// Carry the visible welcome-image position into the first WebGL frame.
		seedPointer(a: number, b: number) {
			x = clamp(a, -1, 1);
			y = clamp(b, -1, 1);
		},
		seedTime(seconds: number) {
			for(const a of actors) a.timeline.startAt(seconds);
			staggerWaves(actors[0].timeline,actors[1].timeline);
		},
		speed(value: number) {
			speed = clamp(value, 0.05, 2);
		},
		debug(value: boolean) {
			showDebug = value;
			draw();
		},
		hitTest(clientX: number, clientY: number) {
			if(disposed)return -1;
			for(let i=actors.length-1;i>=0;i--){
				const a=actors[i];
				if(!a.root.visible||a.root.alpha<.2)continue;
				const dx=clientX-a.root.x;
				const dy=clientY-a.root.y;
				const c=Math.cos(a.root.rotation);
				const s=Math.sin(a.root.rotation);
				const px=(dx*c+dy*s)/a.root.scale.x;
				const py=(-dx*s+dy*c)/a.root.scale.y;
				for(const skin of [...a.skins,...a.eyes.flatMap(e=>e.skins)]){
					const mask=hitMasks.get(skin.mesh.texture);
					if(mask&&hitMesh(px,py,skin.mesh.geometry.getAttribute('aPosition').buffer.data,skin.original,skin.part.grid[0],skin.part.width,skin.part.height,mask))return i;
				}
			}
			return -1;
		},
		wave(index?: number) {
			actors.forEach((a, i) => {
				if (index === undefined || i === index) a.timeline.wave();
			});
			draw();
		},
		blink(index?: number) {
			actors.forEach((a, i) => {
				if (index === undefined || i === index) a.timeline.blink(false);
			});
			draw();
		},
		seek(time: number) {
			pause();
			for (const a of actors) {
				a.timeline = new CharacterTimeline(
					a.rig.seed,
					a.anchor.dataset.character === "sonya",
				);
				a.timeline.waveStart = 0;
				a.timeline.blinkStart = 0.25;
				for (let t = 0; t < time; t += 1 / 120)
					a.timeline.step(Math.min(1 / 120, time - t), false);
			}
			draw();
		},
		destroy() {
			if (disposed) return;
			pause();
			disposed = true;
			window.removeEventListener("resize", resize);
			canvas.removeEventListener("webglcontextlost", lost);
			canvas.remove();
			stage.destroy({ children: true });
			textures.forEach((t) => { t.destroy(true); });
			renderer.destroy();
		},
	};
}
export type CharacterRenderer = Awaited<ReturnType<typeof createRenderer>>;
