// Deterministic packing only. Painted eye states were produced with ImageGen.
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const legacy = JSON.parse(
	await readFile("src/data/character-rigs.json", "utf8"),
);
const tips = JSON.parse(await readFile("assets/character-motion-v2/hair-tips.json", "utf8"));
const W = 1407,
	H = 1118,
	out = "public/media/characters-v2";
await mkdir(out, { recursive: true });
const settings = {
	sonya: {
		armCut:
			"M 843 537 Q 881 596 871 688 L 1000 620 L 1265 366 L 1407 310 L 1407 0 L 1160 0 L 1146 206 L 890 491 Z",
		shoulder: [852, 614],
		elbow: [1015, 449],
		wrist: [1186, 304],
		neck: [704, 567],
		split: 570,
		seed: 7919,
		eyes: [
			{
				x: 462,
				y: 337,
				width: 138,
				height: 122,
				path: "M 7 57 Q 28 17 69 7 Q 110 2 127 31 L 132 78 Q 116 121 61 121 Q 10 120 7 57 Z",
			},
			{
				x: 635,
				y: 272,
				width: 160,
				height: 145,
				path: "M 2 24 Q 20 2 85 2 Q 132 0 157 18 L 156 72 Q 142 112 88 129 Q 15 138 2 78 Z",
			},
		],
	},
	yasuna: {
		armCut:
			"M 0 0 L 295 0 L 293 241 L 435 385 L 531 465 Q 590 477 614 537 Q 653 600 605 679 L 546 752 L 406 578 L 155 349 L 0 298 Z",
		shoulder: [598, 596],
		elbow: [412, 449],
		wrist: [220, 309],
		neck: [749, 561],
		split: 563,
		seed: 104729,
		eyes: [
			{
				x: 650,
				y: 255,
				width: 140,
				height: 132,
				path: "M 7 51 Q 24 1 81 1 Q 119 0 135 31 L 126 98 Q 100 131 50 126 Q 10 119 7 51 Z",
			},
			{
				x: 840,
				y: 283,
				width: 111,
				height: 145,
				path: "M 8 8 L 74 8 Q 94 10 96 42 L 95 90 Q 84 136 45 140 Q 5 135 6 95 Z",
			},
		],
	},
};
const svg = (w, h, body) =>
	Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`,
	);
// Identify only skin connected to the outside of an eye crop. Warm brown irises
// are enclosed by ink/white and must never be mistaken for facial skin.
function outsideSkin(pixels, width, height) {
	const skin = new Uint8Array(width * height), queue = [];
	const peach = i => pixels[i*4+3]>200 && pixels[i*4]>175 && pixels[i*4+1]>105 &&
		pixels[i*4+2]>70 && pixels[i*4+2]<230 && pixels[i*4]-pixels[i*4+1]>12 &&
		pixels[i*4+1]-pixels[i*4+2]>6 && pixels[i*4+1]-pixels[i*4+2]<85;
	const add = i => { if (!skin[i] && peach(i)) { skin[i]=1; queue.push(i); } };
	for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}
	for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
	for(let k=0;k<queue.length;k++){
		const i=queue[k],x=i%width,y=Math.floor(i/width);
		if(x)add(i-1);if(x+1<width)add(i+1);if(y)add(i-width);if(y+1<height)add(i+width);
	}
	return skin;
}

function blurFields(fields,width,height,sigma) {
	// Float fields avoid 8-bit quantization bands when normalizing sparse skin
	// samples around an eye. Never filter the visible eye artwork itself.
	const radius=Math.ceil(sigma*3),kernel=[];let sum=0;
	for(let k=-radius;k<=radius;k++){const v=Math.exp(-k*k/(2*sigma*sigma));kernel.push(v);sum+=v;}
	for(let k=0;k<kernel.length;k++)kernel[k]/=sum;
	return fields.map(input=>{
		const temp=new Float32Array(input.length),out=new Float32Array(input.length);
		for(let y=0;y<height;y++)for(let x=0;x<width;x++){
			let v=0;for(let k=-radius;k<=radius;k++)v+=input[y*width+Math.max(0,Math.min(width-1,x+k))]*kernel[k+radius];
			temp[y*width+x]=v;
		}
		for(let y=0;y<height;y++)for(let x=0;x<width;x++){
			let v=0;for(let k=-radius;k<=radius;k++)v+=temp[Math.max(0,Math.min(height-1,y+k))*width+x]*kernel[k+radius];
			out[y*width+x]=v;
		}
		return out;
	});
}

async function eyeSkinSurface(body, plate, rect, continuousFace) {
	const crop = input => sharp(input,{raw:{width:W,height:H,channels:4}}).extract(rect).raw().toBuffer();
	const [backdrop,paint] = await Promise.all([crop(body),crop(plate)]);
	if(continuousFace)return backdrop;
	// Match the clean under-eye painting to the original skin around Yasuna's
	// eye. Normalized filtering extends the colour correction through the blank
	// eye area, without blurring either eyelash or pupil.
	const connected=outsideSkin(backdrop,rect.width,rect.height),n=connected.length;
	const weight=new Float32Array(n),channels=Array.from({length:3},()=>new Float32Array(n));
	for(let i=0;i<n;i++)if(connected[i] && paint[i*4]>175 && paint[i*4+2]>70){
		// Reject partially covered old eye edges even when their warm RGB can
		// pass a skin key. Only uniform exterior skin may define the new plate.
		const x=i%rect.width,y=Math.floor(i/rect.width);let safe=true;
		for(let dy=-3;dy<=3&&safe;dy+=3)for(let dx=-3;dx<=3;dx+=3){
			const xx=Math.max(0,Math.min(rect.width-1,x+dx)),yy=Math.max(0,Math.min(rect.height-1,y+dy)),j=yy*rect.width+xx;
			if(!connected[j]||[0,1,2].some(c=>Math.abs(backdrop[i*4+c]-backdrop[j*4+c])>10)){safe=false;break;}
		}
		if(!safe)continue;
		weight[i]=1;
		for(let c=0;c<3;c++)channels[c][i]=backdrop[i*4+c]-paint[i*4+c];
	}
	const [weights,...deltas]=blurFields([weight,...channels],rect.width,rect.height,18);
	for(let i=0;i<n;i++)for(let c=0;c<3;c++)paint[i*4+c]=weight[i]?backdrop[i*4+c]:
		Math.max(0,Math.min(255,Math.round(paint[i*4+c]+(weights[i]>1e-5?deltas[c][i]/weights[i]:0))));
	return paint;
}

async function matchExteriorSkin(pixels, surface, width, height) {
	const exterior=outsideSkin(pixels,width,height),n=exterior.length;
	const weight=new Float32Array(n),channels=Array.from({length:3},()=>new Float32Array(n));
	for(let p=0;p<n;p++)if(exterior[p]&&pixels[p*4]>220&&pixels[p*4+1]>150&&pixels[p*4+2]>110){
		weight[p]=1;for(let c=0;c<3;c++)channels[c][p]=pixels[p*4+c];
	}
	const [weights,...colour]=blurFields([weight,...channels],width,height,4);
	for(let p=0;p<n;p++)if(exterior[p]&&weights[p]>1e-5&&surface[p*4]>175&&surface[p*4+2]>70){
		const background=colour.map(c=>c[p]/weights[p]);
		// Transfer the skin-colour difference, not the skin itself. This keeps
		// partial ink coverage on the antialiased outer eyelash intact.
		const coverage=Math.min(1,...background.map((v,c)=>pixels[p*4+c]/Math.max(1,v)));
		for(let c=0;c<3;c++)pixels[p*4+c]=Math.max(0,Math.min(255,Math.round(pixels[p*4+c]+(surface[p*4+c]-background[c])*coverage)));
	}
	return pixels;
}

const manifest = {
	version: 2,
	width: W,
	height: H,
	step: 1 / 120,
	waveDuration: 2.5,
	blink: {
		close: 0.08,
		hold: 0.04,
		open: 0.1,
		interval: [3, 7],
		doubleProbability: 0.1,
		doubleGap: 0.18,
	},
	characters: {},
};
for (const name of ["sonya", "yasuna"]) {
	const cfg = settings[name],
		old = legacy[name],
		parts = [];
	async function pack(id, input, kind, pivot = null) {
		const { data, info } = await sharp(input)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		let l = W,
			t = H,
			r = 0,
			b = 0;
		for (let y = 0; y < H; y++)
			for (let x = 0; x < W; x++)
				if (data[(y * W + x) * info.channels + 3] > 0) {
					l = Math.min(l, x);
					t = Math.min(t, y);
					r = Math.max(r, x);
					b = Math.max(b, y);
				}
		l = Math.max(0, l - 2);
		t = Math.max(0, t - 2);
		r = Math.min(W - 1, r + 2);
		b = Math.min(H - 1, b + 2);
		const rect = { left: l, top: t, width: r - l + 1, height: b - t + 1 };
		const textureResolution = kind === 'fringe' || kind === 'brow' ? 2 : 1;
		const cropped=await sharp(input).extract(rect).ensureAlpha().raw().toBuffer();
		if(kind==='fringe'){
			// Colour padding under transparent edge texels prevents magnification
			// from sampling the skin RGB that existed outside the source cutout.
			const originalPixels=Buffer.from(cropped);
			for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){
				const i=y*rect.width+x;if(originalPixels[i*4+3]>=240)continue;
				let nearest=-1,best=99;
				for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
					const xx=x+dx,yy=y+dy,j=yy*rect.width+xx,d=dx*dx+dy*dy;
					if(xx>=0&&xx<rect.width&&yy>=0&&yy<rect.height&&d<best&&originalPixels[j*4+3]>=240){nearest=j;best=d;}
				}
				if(nearest>=0)for(let c=0;c<3;c++)cropped[i*4+c]=originalPixels[nearest*4+c];
			}
		}
		const tw=rect.width*textureResolution,th=rect.height*textureResolution;
		const sampled=await sharp(cropped,{raw:{width:rect.width,height:rect.height,channels:4}})
			.resize(tw,th,{kernel:'cubic'}).raw().toBuffer();
		if(kind==='fringe'&&name==='yasuna'){
			// Unpremultiplication at fractional coverage can create a few pale
			// texels after resampling. Pad their RGB as well, retaining coverage.
			const before=Buffer.from(sampled),peach=i=>before[i*4]>170&&before[i*4+1]>110&&before[i*4+2]>before[i*4+1]*.6;
			for(let y=0;y<th;y++)for(let x=0;x<tw;x++){
				const i=y*tw+x;if(!before[i*4+3]||!peach(i))continue;
				let nearest=-1,best=999;
				for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){
					const xx=x+dx,yy=y+dy,j=yy*tw+xx,d=dx*dx+dy*dy;
					if(xx>=0&&xx<tw&&yy>=0&&yy<th&&d<best&&before[j*4+3]>240&&!peach(j)){nearest=j;best=d;}
				}
				if(nearest>=0)for(let c=0;c<3;c++)sampled[i*4+c]=before[nearest*4+c];
			}
		}
		const bytes = await sharp(sampled,{raw:{width:tw,height:th,channels:4}})
			.webp({ lossless: true, effort: 6 })
			.toBuffer();
		const src = `/media/characters-v2/${name}-${id}.webp`;
		await writeFile("public" + src, bytes);
		const refine=(count,start,size,from,to)=>[...new Set([
			...Array.from({length:count},(_,i)=>i/(count-1)),
			...Array.from({length:Math.floor((to-from)/4)+1},(_,i)=>(from+i*4-start)/size),
		].map(v=>Math.round(v*1e8)/1e8))].filter(v=>v>=0&&v<=1).sort((a,b)=>a-b);
		const gridX=kind==='body'&&name==='yasuna'?refine(97,l,rect.width,680,872):undefined;
		const gridY=kind==='body'&&name==='yasuna'?refine(81,t,rect.height,390,550):undefined;
		parts.push({
			id,
			kind,
			src,
			x: l,
			y: t,
			width: rect.width,
			height: rect.height,
			pivot,
			bytes: bytes.length,
			textureResolution,
			grid: gridX?[gridX.length,gridY.length]:kind === "body" ? [97, 81] : [17, 23],
			gridX,gridY,
		});
	}
	async function full(p) {
		return sharp({
			create: { width: W, height: H, channels: 4, background: "#00000000" },
		})
			.composite([
				{ input: await readFile("public" + p.src), left: p.x, top: p.y },
			])
			.png()
			.toBuffer();
	}
	// One uncut body, including BOTH shoulders, sleeves and hands. No overlapping
	// sleeve cutout can expose a second shoulder contour when the arm swings.
	const original = `public/media/${name}-hands.png`;
	const rgba = await sharp(original).ensureAlpha().raw().toBuffer();
	let brows;
	if(name==='yasuna'){
		const clean=await sharp('assets/character-motion-v2/yasuna-no-brows-v5.png').ensureAlpha().raw().toBuffer();
		const area=await sharp(svg(W,H,'<rect x="687" y="195" width="106" height="37" rx="7" fill="white"/><rect x="879" y="238" width="68" height="48" rx="7" fill="white"/>')).blur(2).ensureAlpha().raw().toBuffer();
		for(let i=0;i<W*H;i++)if(area[i*4+3]){
			const m=area[i*4+3]/255;
			for(let c=0;c<3;c++)rgba[i*4+c]=Math.round(rgba[i*4+c]*(1-m)+clean[i*4+c]*m);
		}
		// The original line crosses two dark hair contours. A difference matte
		// also captures those crossings; trace the continuous original curve so
		// no short piece of hair contour becomes part of the stationary eyebrow.
		brows=await sharp(svg(W,H,'<path d="M 693 221 C 720 202 754 198 783 214 M 887 250 Q 916 251 936 277" fill="none" stroke="#3f2216" stroke-width="1.55" stroke-linecap="round"/>')).png().toBuffer();
	}
	if(name==='sonya'){
		const matte=svg(W,H,'<path d="M 492 303 Q 522 300 557 319 Q 532 320 507 308 Z M 627 291 Q 646 256 687 234 Q 655 268 627 291 Z" fill="white" stroke="white" stroke-width="3" stroke-linejoin="round"/>');
		brows=await sharp(original).composite([{input:matte,blend:'dest-in'}]).png().toBuffer();
	}
	const front = tips[name].filter(t => t.foreground);
	const shape = (t, stroke = 8) => `<path d="${t.path}" fill="white" stroke="white" stroke-width="${stroke}" stroke-linejoin="round"/>`;
	const eyeCoverage=await sharp(svg(W,H,cfg.eyes.map(e=>`<g transform="translate(${e.x} ${e.y})"><path d="${e.path}" fill="white"/></g>`).join(''))).ensureAlpha().raw().toBuffer();
	// The painted clean-eye source restores hair hidden by the original lash.
	// Use it only at eye intersections; all other hair remains original artwork.
	const cleanRGBA=await sharp(`assets/character-motion-v2/${name}-clean.png`).ensureAlpha().raw().toBuffer();
	const strandRGBA=Buffer.from(rgba);
	for(let i=0;i<W*H;i++)if(eyeCoverage[i*4+3])for(let c=0;c<4;c++)strandRGBA[i*4+c]=cleanRGBA[i*4+c];
	if(name==='sonya'){
		const hair=await sharp('assets/character-motion-v2/sonya-fringe-source-v3.png').ensureAlpha().raw().toBuffer();
		const intersections=await sharp(svg(W,H,'<path d="M 489 303 Q 522 300 558 319 M 627 291 Q 646 256 687 234" fill="none" stroke="white" stroke-width="8" stroke-linecap="round"/>')).blur(.6).ensureAlpha().raw().toBuffer();
		for(let i=0;i<W*H;i++){
			// Preserve the narrow left lock's original silhouette. The right lock
			// needs its painted continuation behind the original eyelash; blend
			// above that crossing, wholly inside its own spatial region.
			// The eyebrow crossing on the narrow left lock lies wholly inside its
			// pinned section. Its original contour can stay pixel-exact there.
			const x=i%W,y=Math.floor(i/W);
			const rightBlend=Math.max(0,Math.min(1,(y-235)/25));
			const m=x>=625&&y<330?rightBlend*rightBlend*(3-2*rightBlend):x<535&&y<330?0:
				Math.max(intersections[i*4+3],x<535?eyeCoverage[i*4+3]:0)/255;
			for(let c=0;c<4;c++)strandRGBA[i*4+c]=Math.round(rgba[i*4+c]*(1-m)+hair[i*4+c]*m);
		}
	}
	// These two narrow locks cross an eyelash in the original. An eye-shaped
	// source switch cuts diagonally through their silhouette and creates a step.
	// Switch across the full lock ABOVE the eye, then keep one continuous source
	// all the way to its painted black tip, independently of every eye state.
	const narrowTip = name==='sonya'
		? { id:'bang-left',left:480,right:535,start:314,end:326,bottom:405 }
		: { id:'bang-right',left:850,right:928,start:270,end:284,bottom:340 };
	for(let y=narrowTip.start;y<narrowTip.bottom;y++)for(let x=narrowTip.left;x<narrowTip.right;x++){
		const i=y*W+x,t=Math.max(0,Math.min(1,(y-narrowTip.start)/(narrowTip.end-narrowTip.start))),m=t*t*(3-2*t);
		for(let c=0;c<4;c++)strandRGBA[i*4+c]=Math.round(rgba[i*4+c]*(1-m)+cleanRGBA[i*4+c]*m);
	}
	const strandSource=await sharp(strandRGBA,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
	const isHair=(i)=>{
		const r=strandRGBA[i*4],g=strandRGBA[i*4+1],b=strandRGBA[i*4+2];
		return name==='sonya' ? r>150&&g>100&&b<g*.65 : r>55&&r<145&&g<95&&b<80&&r>g*1.1;
	};
	const frontMasks=new Map(),removalMasks=new Map(),combined=Buffer.alloc(W*H*4);
	for(const tip of front){
		const mask=await sharp(svg(W,H,shape(tip))).ensureAlpha().raw().toBuffer();
		// Removal must cover the whole source silhouette, including black tip
		// pixels hidden by an eyelash. Its footprint is deliberately independent
		// of the cleaned foreground's colour/connected-component selection.
		// Yasuna's source lash crosses the bang silhouette. Include its antialiased
		// overlap in the underpaint/eye reveal, without widening the moving hair.
		const removal=name==='yasuna'
			? await sharp(svg(W,H,shape(tip,16))).ensureAlpha().raw().toBuffer()
			: Buffer.from(mask);
		removalMasks.set(tip.id,removal);
		for(let i=0;i<W*H;i++){
			combined[i*4]=combined[i*4+1]=combined[i*4+2]=255;
			combined[i*4+3]=Math.max(combined[i*4+3],removal[i*4+3]);
		}
		for(let y=0;y<H;y++)for(let x=0;x<W;x++){
			const i=y*W+x;if(!mask[i*4+3])continue;
			// The path selects a lock, not a rectangle of face artwork. Trim skin,
			// eyebrows and eye whites throughout its moving length (not just eyes).
			// Include the complete antialiased hair contour so none stays on the base.
			const moving = y > tip.root[1]+25;
			const highlight=name==='sonya'&&y<245&&strandRGBA[i*4]>230&&strandRGBA[i*4+1]>220&&strandRGBA[i*4+2]>220;
			if(!highlight&&strandRGBA[i*4]>(name==='yasuna'?145:170)&&strandRGBA[i*4+1]>(name==='yasuna'?75:110)&&strandRGBA[i*4+2]>strandRGBA[i*4+1]*.6){mask[i*4+3]=0;continue;}
			// The pointed black contour can extend much farther than 3 pixels
			// beyond the coloured fill. Its clean source has no lash to confuse it
			// with, so preserve the complete ink within this lock's own path.
			const cleanTipInk=tip.id===narrowTip.id&&y>=narrowTip.end&&
				strandRGBA[i*4]<110&&strandRGBA[i*4+1]<100&&strandRGBA[i*4+2]<85;
			if((name==='sonya'||moving || eyeCoverage[i*4+3]>0) && !isHair(i)&&!highlight&&!cleanTipInk){
				let edge=false;
				for(let dy=-3;dy<=3&&!edge;dy++)for(let dx=-3;dx<=3;dx++){
					const xx=x+dx,yy=y+dy;
					if(xx>=0&&xx<W&&yy>=0&&yy<H&&dx*dx+dy*dy<=9&&isHair(yy*W+xx)&&mask[(yy*W+xx)*4+3])edge=true;
				}
				if(!edge)mask[i*4+3]=0;
			}
		}
		// A strand is one connected silhouette. Do not carry isolated old ink or
		// compression flecks along with it when it moves across the face.
		const seen=new Uint8Array(W*H);let largest=[];
		for(let start=0;start<W*H;start++)if(mask[start*4+3]&&!seen[start]){
			const component=[start];seen[start]=1;
			for(let k=0;k<component.length;k++){
				const p=component[k],x=p%W,y=Math.floor(p/W);
				for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
					const xx=x+dx,yy=y+dy,q=yy*W+xx;
					if(xx>=0&&xx<W&&yy>=0&&yy<H&&!seen[q]&&mask[q*4+3]){seen[q]=1;component.push(q);}
				}
			}
			if(component.length>largest.length)largest=component;
		}
		const connected=new Uint8Array(W*H);for(const p of largest)connected[p]=1;
		for(let i=0;i<W*H;i++)if(!connected[i])mask[i*4+3]=0;
		let smoothTipStart=Infinity;
		if(tip.id===narrowTip.id){
			// Recover subpixel crossings from the continuous painted outline,
			// rather than colour-keying partially covered skin/ink into stair steps.
			const rows=[];smoothTipStart=name==='sonya'?326:270;
			for(let y=smoothTipStart;y<narrowTip.bottom;y++){
				let left=-1,right=-1;
				for(let x=narrowTip.left;x<narrowTip.right;x++)if(mask[(y*W+x)*4+3]){if(left<0)left=x;right=x;}
				if(left<0){if(rows.length)break;continue;}
				const value=x=>cleanRGBA[(y*W+x)*4+1],threshold=120;
				while(left<=right&&value(left)>threshold)left++;
				while(right>=left&&value(right)>threshold)right--;
				if(right<left)break;
				const l=left-.5+Math.max(0,Math.min(1,(value(left-1)-threshold)/Math.max(1,value(left-1)-value(left))));
				const r=right+.5+Math.max(0,Math.min(1,(threshold-value(right))/Math.max(1,value(right+1)-value(right))));
				rows.push({y:y+.5,l,r});
			}
			if(rows.length<4)throw new Error(`${name}: missing continuous ${tip.id} contour`);
			const filtered=rows.map((row,i)=>{
				let l=0,r=0,total=0;
				for(let k=-3;k<=3;k++){
					const sample=rows[Math.max(0,Math.min(rows.length-1,i+k))],w=Math.exp(-k*k/3.125);
					l+=sample.l*w;r+=sample.r*w;total+=w;
				}
				return {...row,l:l/total,r:r/total};
			});
			const end=filtered.at(-1),points=[...filtered.map(row=>[row.l,row.y]),[(end.l+end.r)/2,end.y+1],...filtered.toReversed().map(row=>[row.r,row.y])];
			const outline=await sharp(svg(W,H,`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="white"/>`)).ensureAlpha().raw().toBuffer();
			for(let y=smoothTipStart;y<narrowTip.bottom;y++)for(let x=narrowTip.left;x<narrowTip.right;x++){
				const i=y*W+x,t=Math.max(0,Math.min(1,(y-smoothTipStart)/5)),m=t*t*(3-2*t);
				mask[i*4+3]=Math.round(mask[i*4+3]*(1-m)+outline[i*4+3]*m);
			}
		}
		if(name==='yasuna'&&tip.id==='bang-center'){
			// Remove tiny lash/colour-key nicks from this sloping silhouette. Trace
			// fractional coverage first, then filter the contour, not the brown ink.
			const rows=[];smoothTipStart=232;
			for(let y=232;y<325;y++){
				let l=-1,r=-1;for(let x=720;x<850;x++)if(mask[(y*W+x)*4+3]>=128){if(l<0)l=x;r=x;}
				if(l<0){if(rows.length)break;continue;}
				const a=x=>mask[(y*W+x)*4+3];
				rows.push({y:y+.5,l:l-.5+(128-a(l-1))/Math.max(1,a(l)-a(l-1)),r:r+.5+(a(r)-128)/Math.max(1,a(r)-a(r+1))});
			}
			const filtered=rows.map((row,i)=>{
				let l=0,r=0,n=0;for(let k=-6;k<=6;k++){const j=Math.max(0,Math.min(rows.length-1,i+k)),w=Math.exp(-k*k/10);l+=rows[j].l*w;r+=rows[j].r*w;n+=w;}
				return {...row,l:l/n,r:r/n};
			});
			// The source has a short stray lash at this edge. Bridge only that
			// interval with the neighbouring tangents, keeping the rest of the lock.
			const a=filtered[252-232],b=filtered[283-232],span=b.y-a.y;
			const da=(a.l-filtered[248-232].l)/4,db=(filtered[287-232].l-b.l)/4;
			for(const row of filtered)if(row.y>a.y&&row.y<b.y){const t=(row.y-a.y)/span;row.l=(2*t*t*t-3*t*t+1)*a.l+(t*t*t-2*t*t+t)*span*da+(-2*t*t*t+3*t*t)*b.l+(t*t*t-t*t)*span*db;}
			const end=filtered.at(-1),points=[...filtered.map(row=>[row.l,row.y]),[(end.l+end.r)/2,end.y+1],...filtered.toReversed().map(row=>[row.r,row.y])];
			const contour=await sharp(svg(W,H,`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="white"/>`)).ensureAlpha().raw().toBuffer();
			for(let y=232;y<325;y++)for(let x=720;x<850;x++){const i=y*W+x,t=Math.max(0,Math.min(1,(y-232)/8)),m=t*t*(3-2*t);mask[i*4+3]=Math.round(mask[i*4+3]*(1-m)+contour[i*4+3]*m);}
		}
		// Anti-alias the extracted silhouette instead of binary colour-cut stairs.
		// Slightly contract first so filtered edge coverage never includes a skin rim.
		const aa=await sharp(mask,{raw:{width:W,height:H,channels:4}}).extractChannel(3).erode(1).blur(.6).raw().toBuffer();
		for(let i=0;i<W*H;i++)if(Math.floor(i/W)<smoothTipStart)mask[i*4+3]=Math.min(mask[i*4+3],aa[i]);
		frontMasks.set(tip.id,await sharp(mask,{raw:{width:W,height:H,channels:4}}).png().toBuffer());
	}
	const frontMask=await sharp(combined,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
	// Underpaint the covered region, retaining ORIGINAL pixels at each pinned
	// root. Never erase beyond the original foreground silhouette.
	const repairAlpha = Buffer.alloc(W*H);
	for(const tip of front){
		const mask = removalMasks.get(tip.id);
		const dx=tip.tip[0]-tip.root[0],dy=tip.tip[1]-tip.root[1],ll=dx*dx+dy*dy;
		for(let y=0;y<H;y++)for(let x=0;x<W;x++){
			const i=y*W+x;if(!mask[i*4+3])continue;
			const u=((x-tip.root[0])*dx+(y-tip.root[1])*dy)/ll;
			const t=Math.max(0,Math.min(1,tip.id==='bang-left'?(u-.55)/.09:(u-.05)/.23));
			repairAlpha[i]=Math.max(repairAlpha[i],Math.round(mask[i*4+3]*t*t*(3-2*t)));
		}
	}
	const repairRGBA=Buffer.alloc(W*H*4,255);
	for(let i=0;i<W*H;i++)repairRGBA[i*4+3]=repairAlpha[i];
	const repairMask=await sharp(repairRGBA,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
	const feather=await sharp(repairAlpha,{raw:{width:W,height:H,channels:1}}).dilate(4).blur(2).greyscale().raw().toBuffer();
	for(let i=0;i<W*H;i++){
		const r=rgba[i*4],g=rgba[i*4+1],b=rgba[i*4+2];
		// Feather into adjacent skin, never across a neighbouring hair/brow line.
		if(r>150&&g>100&&b>g*.7&&r-g>15)repairAlpha[i]=Math.max(repairAlpha[i],feather[i]);
	}
	const oldPlate=await sharp(`assets/character-motion-v2/${name}-face-underpaint.png`).ensureAlpha().raw().toBuffer();
	const blankPlate=await sharp(`assets/character-motion-v2/${name}-underpaint-no-brows-v5.png`).resize(W,H).ensureAlpha().raw().toBuffer();
	const browArea=name==='sonya'
		? '<path d="M 488 323 Q 527 318 563 335 M 639 311 Q 667 276 711 254" fill="none" stroke="white" stroke-width="20" stroke-linecap="round"/>'
		: '<path d="M 714 217 Q 755 199 795 231 M 882 260 Q 913 248 938 281" fill="none" stroke="white" stroke-width="20" stroke-linecap="round"/>';
	const browErase=await sharp(svg(W,H,browArea)).blur(3).ensureAlpha().raw().toBuffer();
	const plateRGBA=Buffer.from(oldPlate);
	for(let i=0;i<W*H;i++){const m=browErase[i*4+3]/255;for(let c=0;c<3;c++)plateRGBA[i*4+c]=Math.round(oldPlate[i*4+c]*(1-m)+blankPlate[i*4+c]*m);}
	const plateSource=await sharp(plateRGBA,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
	const bodyRGBA = Buffer.from(rgba);
	// Complementary premultiplied mixing. Erase-then-over leaves only 75% alpha
	// at a half-covered edge, which exposed the page as a bright triangular seam.
	for(let i=0;i<W*H;i++){
		const m=repairAlpha[i]/255;if(!m)continue;
		const a=rgba[i*4+3]*(1-m),b=plateRGBA[i*4+3]*m,total=a+b;
		for(let c=0;c<3;c++)bodyRGBA[i*4+c]=total?Math.round((rgba[i*4+c]*a+plateRGBA[i*4+c]*b)/total):0;
		bodyRGBA[i*4+3]=Math.round(total);
	}
	if(name==='sonya'){
		// One continuous face surface replaces all exposed bang footprints and
		// the original eyes. No triangular per-lock patches remain on this face.
		const face=await sharp(svg(W,H,'<path d="M 495 246 Q 540 229 601 241 L 706 236 Q 766 251 803 327 L 843 374 Q 849 447 776 499 Q 703 547 632 548 Q 536 540 491 497 Q 450 455 461 394 Q 472 320 495 246 Z" fill="white"/>')).blur(6).ensureAlpha().raw().toBuffer();
		// Preserve only hair material at stationary attachments, not nearby face ink.
		// The ear lock stays on the continuous body mesh: preserve its original outline.
		const ear=tips[name].find(t=>t.id==='ear-curl');
		const earMask=await sharp(svg(W,H,shape(ear))).blur(2).ensureAlpha().raw().toBuffer();
		const fixedFeatures=await sharp(svg(W,H,'<path d="M 300 220 L 491 220 L 491 330 L 461 414 L 458 470 L 300 470 Z M 810 340 Q 859 325 886 362 L 885 432 Q 861 456 826 468 L 807 427 Z" fill="white"/>')).blur(1).ensureAlpha().raw().toBuffer();
		// The narrow gold triangle between the side tips and nape is hair, not
		// exposed face. Preserve its ink, colour and alpha together; otherwise
		// the underpaint feather washes it out and doubles the outer hair edge.
		const napeJoin=await sharp(svg(W,H,'<path d="M 440 412 L 475 412 Q 500 431 513 453 L 525 493 L 511 551 L 441 554 Z" fill="white"/>')).blur(3).ensureAlpha().raw().toBuffer();
		for(let i=0;i<W*H;i++)fixedFeatures[i*4+3]=Math.max(fixedFeatures[i*4+3],napeJoin[i*4+3]);
		// Preserve the complete temple/curl junction, not a binary gold-only
		// selection whose clipped antialiasing left teeth along the diagonal.
		const templeJoin=await sharp(svg(W,H,'<path d="M 795 319 L 810 339 Q 798 354 795 370" fill="none" stroke="white" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>')).blur(2).ensureAlpha().raw().toBuffer();
		for(let i=0;i<W*H;i++)fixedFeatures[i*4+3]=Math.max(fixedFeatures[i*4+3],templeJoin[i*4+3]);
		for(let i=0;i<W*H;i++)if(fixedFeatures[i*4+3]){
			const m=fixedFeatures[i*4+3]/255;
			earMask[i*4+3]=Math.max(earMask[i*4+3],fixedFeatures[i*4+3]);
			for(let c=0;c<4;c++)bodyRGBA[i*4+c]=Math.round(bodyRGBA[i*4+c]*(1-m)+rgba[i*4+c]*m);
		}
		// Cover the complete attached side-hair boundary, including above the
		// old cutout's y=275 edge. Ending there left a straight step in its shadow.
		const templeMask=await sharp(svg(W,H,'<path d="M 698 208 L 925 208 L 925 530 L 855 425 Z" fill="white"/>')).ensureAlpha().raw().toBuffer();
		const gold=i=>rgba[i*4]>150&&rgba[i*4+1]>100&&rgba[i*4+2]<rgba[i*4+1]*.65;
		for(let i=0;i<W*H;i++)if(templeMask[i*4+3]){
			let material=gold(i);
			if(!material&&rgba[i*4]<110){
				for(let dy=-2;dy<=2&&!material;dy++)for(let dx=-2;dx<=2;dx++){
					const x=i%W+dx,y=Math.floor(i/W)+dy;
					if(x>=0&&x<W&&y>=0&&y<H&&dx*dx+dy*dy<=4&&gold(y*W+x))material=true;
				}
			}
			if(material)earMask[i*4+3]=Math.max(earMask[i*4+3],templeMask[i*4+3]);
		}
		for(let i=0;i<W*H;i++)face[i*4+3]=Math.round(face[i*4+3]*(1-earMask[i*4+3]/255));
		for(const tip of front){
			const mask=tip.id==='bang-left'?removalMasks.get(tip.id):await sharp(frontMasks.get(tip.id)).raw().toBuffer();
			const dx=tip.tip[0]-tip.root[0],dy=tip.tip[1]-tip.root[1],ll=dx*dx+dy*dy;
			for(let i=0;i<W*H;i++)if(mask[i*4+3]){
				const u=(((i%W)-tip.root[0])*dx+(Math.floor(i/W)-tip.root[1])*dy)/ll;
				const t=Math.max(0,Math.min(1,tip.id==='bang-left'?(.64-u)/.09:(.45-u)/.2)),m=t*t*(3-2*t)*mask[i*4+3]/255;
				face[i*4+3]=Math.round(face[i*4+3]*(1-m));
				for(let c=0;c<4;c++)bodyRGBA[i*4+c]=Math.round(bodyRGBA[i*4+c]*(1-m)+rgba[i*4+c]*m);
			}
		}
		for(let i=0;i<W*H;i++){
			const m=face[i*4+3]/255;if(!m)continue;
			// Painted transparent pixels contain undefined RGB. Mixing them as
			// opaque colour exposed red/yellow noise in the gap beside the cheek.
			const a=bodyRGBA[i*4+3]*(1-m),b=plateRGBA[i*4+3]*m,total=a+b;
			for(let c=0;c<3;c++)bodyRGBA[i*4+c]=total?Math.round((bodyRGBA[i*4+c]*a+plateRGBA[i*4+c]*b)/total):0;
			bodyRGBA[i*4+3]=Math.round(total);
		}

	}
	const oldBody=await sharp(bodyRGBA,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
	const cleanLayers = [],
		eyes = [];
	for (let i = 0; i < cfg.eyes.length; i++) {
		const e = cfg.eyes[i],
			rect = { left: e.x, top: e.y, width: e.width, height: e.height };
		const mask = await sharp(
			svg(e.width, e.height, `<path d="${e.path}" fill="white"/>`),
		)
			.blur(1.2)
			.png()
			.toBuffer();
		const hairAtEye = await sharp(frontMask).extract(rect).png().toBuffer();
		const skinSurface = await eyeSkinSurface(bodyRGBA,plateRGBA,rect,name==='sonya');
		const states = {};
		for (const state of ["open", "half", "closed", "clean"]) {
			const file = name==='sonya'
				? `assets/character-motion-v2/${state==='clean'?'sonya-face-underpaint':`sonya-${state}-face-v3`}.png`
				:
				state === "open"
					? `public/media/${name}-hands.png`
					: `assets/character-motion-v2/${name}-${state}.png`;
			let input=state==='clean'&&name==='sonya'?plateSource:file;
			if(name==='sonya'&&state==='open'){
				// Preserve every visible original eye pixel. Only the narrow regions
				// previously covered by the two pointed bangs use a repair plate.
				const region=i===0
					? 'M 495 338 Q 496 361 505 393 L 511 399 L 513 364 L 518 337 Z'
					: 'M 688 270 L 738 270 L 755 318 L 739 315 L 711 294 Z';
				const reveal=await sharp(svg(W,H,`<path d="${region}" fill="white"/>`)).blur(.6).png().toBuffer();
				let repair;
				if(i===0)repair=await readFile('assets/character-motion-v2/sonya-eye-repair-v4.png');
				else {
					const eye=await sharp('assets/character-motion-v2/sonya-eye1-repair-v4.png').resize(147,133).png().toBuffer();
					repair=await sharp('assets/character-motion-v2/sonya-face-underpaint.png').composite([{input:eye,left:641,top:276}]).png().toBuffer();
				}
				const patch=await sharp(repair).composite([{input:reveal,blend:'dest-in'}]).png().toBuffer();
				input=await sharp(original).composite([{input:patch}]).png().toBuffer();
			}
			let patch = await sharp(input).extract(rect).ensureAlpha().png().toBuffer();
			if(name==='yasuna'){
				// Complementary coverage avoids a translucent outline around the
				// old bang footprint (erase + source-over leaves only 75% at its edge).
				const pixels=await sharp(patch).raw().toBuffer();
				const revealed=await sharp(state==='open'?`assets/character-motion-v2/${name}-forehead-plate.png`:plateSource).extract(rect).ensureAlpha().raw().toBuffer();
				const coverage=await sharp(hairAtEye).blur(.6).ensureAlpha().raw().toBuffer();
				if(state==='open'&&i===1)for(let p=0;p<e.width*e.height;p++)coverage[p*4+3]=255;
				for(let p=0;p<e.width*e.height;p++){
					const m=coverage[p*4+3]/255,a=pixels[p*4+3]*(1-m),b=revealed[p*4+3]*m,total=a+b;
					for(let c=0;c<3;c++)pixels[p*4+c]=total?Math.round((pixels[p*4+c]*a+revealed[p*4+c]*b)/total):0;
					pixels[p*4+3]=Math.round(total);
				}
				patch=await sharp(pixels,{raw:{width:e.width,height:e.height,channels:4}}).png().toBuffer();
			}
			if(name==='yasuna'&&i===1&&state==='open'){
				const creaseMask=await sharp(svg(e.width,e.height,'<rect x="19" y="5" width="29" height="14" rx="4" fill="white"/>')).blur(1).png().toBuffer();
				const crease=await sharp(original).extract(rect).composite([{input:creaseMask,blend:'dest-in'}]).png().toBuffer();
				patch=await sharp(patch).composite([{input:crease}]).png().toBuffer();
			}
			// Eye states carry eye ink/whites/irises, not a differently coloured skin
			// disk. Key only exterior skin; the enclosing ink protects brown irises.
			const eyePixels=await matchExteriorSkin(await sharp(patch).ensureAlpha().raw().toBuffer(),skinSurface,e.width,e.height);
			patch=await sharp(eyePixels,{raw:{width:e.width,height:e.height,channels:4}}).png().toBuffer();
			// Closed/half artwork has a painted eyebrow above the lid. Keep that
			// ink and the adjacent temple out of the animated eye patch; brows are
			// now an independent, continuously visible layer in original position.
			const stateMask=name==='sonya'&&i===1&&(state==='half'||state==='closed')
				? await sharp(svg(e.width,e.height,'<path d="M 16 50 Q 40 28 62 28 L 134 32 Q 150 37 158 50 L 156 98 Q 125 141 75 138 Q 21 138 12 80 Z" fill="white"/>')).blur(1.2).png().toBuffer()
				: mask;
			patch=await sharp(patch).composite([{input:stateMask,blend:'dest-in'}]).png().toBuffer();
			const bytes = await sharp(patch)
				.webp({ lossless: true, effort: 6 })
				.toBuffer();
			const src = `/media/characters-v2/${name}-eye${i}-${state}.webp`;
			await writeFile("public" + src, bytes);
			states[state] = { src, bytes: bytes.length };
			// Sonya already has one continuous clean face with protected temple
			// hair. A second eye-sized clean patch would erase that hair boundary.
			if (state === "clean" && name==='yasuna')
				cleanLayers.push({ input: patch, left: e.x, top: e.y });
		}
		eyes.push({ ...e, states });
	}
	const base = await sharp(oldBody).composite(cleanLayers).png().toBuffer();
	const clip = async (input, shape) =>
		sharp(input)
			.composite([{ input: svg(W, H, shape), blend: "dest-in" }])
			.png()
			.toBuffer();
	await pack("body", base, "body");
	// Offline distance to skin/jacket protects all triangles touching those
	// materials, with a wide fade band for the long ponytail. No runtime readback.
	const distance = new Float32Array(W*H).fill(120);
	for(let i=0;i<W*H;i++) {
		const r=rgba[i*4],g=rgba[i*4+1],b=rgba[i*4+2],a=rgba[i*4+3];
		const jacket = b>r+7 && b>g+4 && r>45;
		const skin = r>150 && g>90 && b>85 && r-g>14 && g-b>10 && g-b<75;
		if(a>200 && (jacket || skin)) distance[i]=0;
	}
	for(let y=1;y<H;y++)for(let x=1;x<W-1;x++){
		const i=y*W+x;distance[i]=Math.min(distance[i],distance[i-1]+1,distance[i-W]+1,distance[i-W-1]+1.414,distance[i-W+1]+1.414);
	}
	for(let y=H-2;y>=0;y--)for(let x=W-2;x>0;x--){
		const i=y*W+x;distance[i]=Math.min(distance[i],distance[i+1]+1,distance[i+W]+1,distance[i+W+1]+1.414,distance[i+W-1]+1.414);
	}
	const body=parts[0], freedom=[];
	for(let y=0;y<body.grid[1];y++)for(let x=0;x<body.grid[0];x++){
		const px=Math.min(W-1,Math.round(body.x+(body.gridX?.[x]??x/(body.grid[0]-1))*body.width));
		const py=Math.min(H-1,Math.round(body.y+(body.gridY?.[y]??y/(body.grid[1]-1))*body.height));
		const t=Math.max(0,Math.min(1,(distance[py*W+px]-23)/55));
		freedom.push(Math.round(t*t*(3-2*t)*255));
	}
	body.hairFreedom=Buffer.from(freedom).toString("base64");
	for(const tip of front){
		let source=strandSource;
		if(name==='sonya'){
			// Blend along the lock rather than exposing a rectangular crop boundary.
			const pixels=Buffer.from(strandRGBA),dx=tip.tip[0]-tip.root[0],dy=tip.tip[1]-tip.root[1],ll=dx*dx+dy*dy;
			for(let i=0;i<W*H;i++){
				const u=(((i%W)-tip.root[0])*dx+(Math.floor(i/W)-tip.root[1])*dy)/ll;
				const t=Math.max(0,Math.min(1,(u-.12)/.42)),m=t*t*(3-2*t);
				for(let c=0;c<4;c++)pixels[i*4+c]=Math.round(rgba[i*4+c]*(1-m)+pixels[i*4+c]*m);
			}
			source=await sharp(pixels,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
		}
		const strand=await sharp(source).composite([{input:frontMasks.get(tip.id),blend:'dest-in'}]).png().toBuffer();
		await pack(tip.id, strand, "fringe", tip.root);
		parts.at(-1).tip=tip.id;
	}
	if(brows)await pack('brows',brows,'brow');
	const staticBytes = await sharp(`public/media/${name}-hands.png`)
		.webp({ quality: 94, effort: 6 })
		.toBuffer();
	await writeFile(`${out}/${name}-static.webp`, staticBytes);
	manifest.characters[name] = {
		...cfg,
		eyes,
		parts,
		tips: tips[name].map(({path,...tip})=>tip),
		hair: (name === "sonya" ? old.parts : [])
			.filter((p) => p.id.startsWith("hair"))
			.map((p) => ({
				id: p.id,
				pivot: p.pivot,
				x: p.x,
				y: p.y,
				width: p.width,
				height: p.height,
			})),
		static: {
			src: `/media/characters-v2/${name}-static.webp`,
			bytes: staticBytes.length,
		},
		weights: { elbowBlend: 95, wristBlend: 50, neckBlend: [520, 640] },
		curves: {
			wave: [
				[0, 0],
				[0.32, 0.18],
				[0.7, 1],
				[1.08, -0.7],
				[1.48, 0.78],
				[1.86, -0.48],
				[2.5, 0],
			],
		},
	};
	console.log(name, parts.length, "mesh parts", eyes.length, "eye patches");
}
await writeFile(
	"public/media/characters-v2/rigs.json",
	JSON.stringify(manifest),
);
await writeFile(
	"src/data/character-rigs-v2.json",
	JSON.stringify(manifest, null, 2) + "\n",
);
