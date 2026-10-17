import { smooth } from "./character-animation";

function boundary(y: number, points: number[][]) {
	for (let i = 1; i < points.length; i++)
		if (y <= points[i][0]) {
			const a = points[i - 1];
			const b = points[i];
			const t = Math.max(0, Math.min(1, (y - a[0]) / (b[0] - a[0])));
			return a[1] + (b[1] - a[1]) * t;
		}
	return points[points.length - 1][1];
}
/** Continuous spatial weights: original hair and neighbouring pixels share a mesh.
 * Zero influence at the face/root, smoothly increasing towards the free strands.
 */
export function hairWeight(
	longHair: boolean,
	id: string,
	x: number,
	y: number,
) {
	if (id === "hair-top") {
		return 0; // Crown mass is fixed. Individual tip fields replace this band.
	}
	if (longHair) {
		if (id === "hair-right") {
			const edge = boundary(y, [
				[200, 870],
				[650, 1073],
				[760, 1080],
				[1000, 1000],
			]);
			// The upper ponytail is held behind the raised arm; bend its free length.
			return smooth((x - edge) / 65) * smooth((y - 590) / 170);
		}
		// The left lock disappears BEHIND the jacket. Keep a 35px guard band
		// (larger than a mesh cell diagonal) so interpolation cannot tug the sleeve.
		const jacketEdge = boundary(y, [[550, 740], [600, 650], [640, 574], [680, 530], [720, 490]]);
		return smooth((jacketEdge - x - 35) / 45) * (
			smooth((y - 550) / 65) *
			(1 - smooth((y - 640) / 65)) *
			smooth((x - 420) / 40) *
			(1 - smooth((x - 560) / 45))
		);
	}
	if (id === "hair-left") {
		const edge = boundary(y, [
			[340, 535],
			[435, 515],
			[480, 560],
			[520, 620],
			[565, 655],
		]);
		const sleeveEdge = boundary(y, [[340, 410], [435, 500], [480, 570], [520, 635], [565, 680]]);
		return smooth((x - sleeveEdge - 35) / 40) * (
			smooth((edge - x) / 80) *
			smooth((y - 340) / 90) *
			(1 - smooth((y - 540) / 55))
		);
	}
	const edge = boundary(y, [
		[340, 982],
		[414, 955],
		[473, 960],
		[521, 932],
		[600, 866],
	]);
	return (
		smooth((x - edge) / 75) *
		smooth((y - 340) / 90) *
		(1 - smooth((y - 575) / 65))
	);
}

export type HairTip = {
	id: string; root: number[]; tip: number[]; width: number; foreground?: boolean;
	sharedStrand?: string;
	pinned?: number; amplitude?: number; scalpY?: number;
};
/** Arc-length bend for a detached lock. Every cross-section keeps its width;
 * the fixed root and moving end have a continuous tangent. */
export function bendLock(tip: HairTip, x: number, y: number, angle: number): [number, number] {
	const dx=tip.tip[0]-tip.root[0];
	const dy=tip.tip[1]-tip.root[1];
	const length=Math.hypot(dx,dy);
	const ex=dx/length;
	const ey=dy/length;
	const along=(x-tip.root[0])*ex+(y-tip.root[1])*ey;
	const across=-(x-tip.root[0])*ey+(y-tip.root[1])*ex;
	const start=length*(tip.pinned??(tip.id==='bang-left'?.64:.32));
	if(along<=start)return [x,y];
	const span=along-start;
	const steps=16;
	const ds=span/steps;
	let cx=tip.root[0]+ex*start;
	let cy=tip.root[1]+ey*start;
	for(let i=0;i<steps;i++){
		const a=angle*smooth((ds*(i+.5))/(length-start));
		cx+=(ex*Math.cos(a)-ey*Math.sin(a))*ds;
		cy+=(ey*Math.cos(a)+ex*Math.sin(a))*ds;
	}
	const a=angle*smooth(span/(length-start));
	return [cx+(-ey*Math.cos(a)-ex*Math.sin(a))*across,cy+(ex*Math.cos(a)-ey*Math.sin(a))*across];
}
/** Only the last portion of each lock bends; the scalp and its first 28% are pinned. */
export function tipWeight(tip: HairTip, x: number, y: number) {
	const dx = tip.tip[0] - tip.root[0];
	const dy = tip.tip[1] - tip.root[1];
	const length = Math.hypot(dx, dy);
	const rx = x - tip.root[0];
	const ry = y - tip.root[1];
	const along = (rx * dx + ry * dy) / (length * length);
	const across = Math.abs(rx * dy - ry * dx) / length;
	// The narrow lock crosses an inked eyebrow; keep that crossing attached to
	// the face and bend its free end, rather than dragging a piece of eyebrow.
	const pinned = tip.pinned ?? (tip.foreground && tip.id === 'bang-left' ? .64 : .28);
	return smooth((along - pinned) / (1-pinned)) * (1 - smooth((along - 1.12) / 0.5)) *
		(1 - smooth((across / tip.width - 0.55) / 0.45)) *
		(tip.scalpY === undefined ? 1 : smooth((tip.scalpY-y)/10));
}

/** Keep the smile in one continuous surface. The soft boundary ends before
 * the nose, eyes and jaw; opening changes never expose an old mouth beneath. */
export function mouthDisplacement(x: number, y: number) {
	if(x<650||x>900||y<370||y>555)return [0,0] as const;
	const c=Math.cos(.29);
	const s=Math.sin(.29);
	const dx=x-780;
	const dy=y-470;
	const u=dx*c+dy*s;
	const v=-dx*s+dy*c;
	const radius=Math.hypot(u/90,v/74);
	const jawY=548-.75*Math.max(0,750-x)-.6*Math.max(0,x-790);
	const w=(1-smooth((radius-1)/.3))*smooth((y-403)/12)*(1-smooth((y-jawY+14)/14));
	const amount=(v+36)*w;
	return [-s*amount,c*amount] as const;
}

/** One smooth shoulder field on the SAME body mesh as the sleeve and hand. */
export function raisedArmWeight(longHair: boolean, x: number, y: number, shoulder: number[], wrist: number[]) {
	const dx = wrist[0] - shoulder[0];
	const dy = wrist[1] - shoulder[1];
	const length = Math.hypot(dx, dy);
	const along = ((x - shoulder[0]) * dx + (y - shoulder[1]) * dy) / length;
	const across = Math.abs((x - shoulder[0]) * dy - (y - shoulder[1]) * dx) / length;
	const edge = longHair
		? boundary(y, [[200,980],[350,940],[450,910],[500,875],[550,810],[620,720]])
		: boundary(y, [[200,430],[350,460],[450,560],[550,650],[620,700]]);
	const faceGuard = longHair ? smooth((x - edge) / 65) : smooth((edge - x) / 65);
	// Include the full hand spread before fading; the former narrow band
	// compressed fingertips against stationary transparent vertices at larger waves.
	return smooth((along + 110) / 210) * (1 - smooth((across - 160) / 160)) * faceGuard;
}

/** The lowered arm remains part of the continuous jacket mesh. Fade away from
 * the torso and shoulder before applying its separate elbow/shoulder motion. */
export function restingArmWeight(longHair: boolean, x: number, y: number) {
	return longHair
		? (1 - smooth((x - 430) / 100)) * smooth((y - 710) / 100)
		: smooth((x - 900) / 100) * smooth((y - 680) / 100);
}

export function parallaxDepth(name: string, mobile: boolean) {
	return mobile ? (name === "sonya" ? 16 : 12) : name === "sonya" ? 85 : 65;
}
