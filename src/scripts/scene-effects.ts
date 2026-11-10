import { BlurFilter, Container, Graphics } from "pixi.js";

type TrailPoint = { x: number; y: number; time: number; start: boolean };
type Burst = { x: number; y: number; time: number; radius: number };
const TRAIL_LIFETIME = 560;
const BURST_LIFETIME = 1450;
const MAX_POINTS = 48;
const MAX_BURSTS = 3;

/** Decorative geometry only: effects never distort character meshes or HTML. */
export function createSceneEffects() {
	const back = new Container();
	const front = new Container();
	const trail = front.addChild(new Graphics());
	const rings = back.addChild(new Graphics());
	const softness = new BlurFilter({ strength: 6, quality: 3, resolution: 1 });
	softness.enabled = false;
	trail.filters = [softness];
	const points: TrailPoint[] = [];
	const bursts: Burst[] = [];
	let detached = true;
	let lastBurst = Number.NEGATIVE_INFINITY;
	let trailPainted = false;
	let ringsPainted = false;
	const metrics = {
		trailPoints: 0,
		activeBursts: 0,
		burstCount: 0,
		maxTrailPoints: MAX_POINTS,
		maxBursts: MAX_BURSTS,
		lastBurst: null as { x: number; y: number } | null,
		lastBurstAt: null as number | null,
	};
	function clear() {
		points.length = bursts.length = 0;
		detached = true;
		if (trailPainted) trail.clear();
		if (ringsPainted) rings.clear();
		trailPainted = ringsPainted = false;
		softness.enabled = false;
		metrics.trailPoints = metrics.activeBursts = 0;
	}
	function draw(now: number) {
		while (points.length && now - points[0].time > TRAIL_LIFETIME) points.shift();
		while (bursts.length && now - bursts[0].time > BURST_LIFETIME) bursts.shift();
		metrics.trailPoints = points.length;
		metrics.activeBursts = bursts.length;
		if (points.length < 2 && !bursts.length && !trailPainted && !ringsPainted) return;
		if (points.length > 1 || trailPainted) trail.clear();
		trailPainted = points.length > 1;
		softness.enabled = trailPainted;
		for (let i = 1; i < points.length; i++) {
			const a = points[i - 1];
			const b = points[i];
			if (b.start) continue;
			const life = Math.max(0, 1 - (now - a.time) / TRAIL_LIFETIME);
			const intensity = life ** 1.35;
			const speed = Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / 32);
			for (const [width, alpha, color] of [
				[54, 0.055, 0xf4c8df], [38, 0.12, 0xf9dceb], [22, 0.21, 0xfff1f6],
			]) {
				trail.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
					width: width * (0.45 + life * 0.55),
					alpha: alpha * intensity * (0.55 + speed * 0.45),
					color, cap: "round",
				});
			}
		}
		if (bursts.length || ringsPainted) rings.clear();
		ringsPainted = bursts.length > 0;
		for (const burst of bursts) {
			for (let ring = 0; ring < 2; ring++) {
				const progress = (now - burst.time - ring * 130) / (BURST_LIFETIME - 130);
				if (progress < 0 || progress >= 1) continue;
				const eased = 1 - (1 - progress) ** 3;
				const radius = 24 + eased * burst.radius * (ring ? 0.8 : 1);
				const alpha = (1 - progress) ** 1.2 * (ring ? 0.68 : 1);
				if (!ring) rings.circle(burst.x, burst.y, radius).fill({ color: 0xf18abc, alpha: alpha * 0.14 });
				rings.circle(burst.x, burst.y, radius).stroke({ color: 0xef72b1, width: 76 * (1 - progress) + 8, alpha: alpha * 0.13 });
				rings.circle(burst.x, burst.y, radius).stroke({ color: 0xf484bd, width: 36 * (1 - progress) + 4, alpha: alpha * 0.55 });
				rings.circle(burst.x, burst.y, radius).stroke({ color: 0xffc5df, width: 11 * (1 - progress) + 2, alpha: alpha * 0.9 });
			}
		}
	}
	return {
		back, front, metrics, clear, draw,
		destroy() { clear(); trail.filters = []; softness.destroy(); },
		endTrail() { detached = true; },
		trailPoint(x: number, y: number, now = performance.now()) {
			if (!Number.isFinite(x) || !Number.isFinite(y)) return;
			const previous = points.at(-1);
			if (previous && now - previous.time < 8) return;
			if (previous && Math.hypot(x - previous.x, y - previous.y) < 2) return;
			const start = detached || !previous || now - previous.time > 100 || Math.hypot(x - previous.x, y - previous.y) > 160;
			points.push({ x, y, time: now, start });
			if (points.length > MAX_POINTS) points.shift();
			detached = false;
			metrics.trailPoints = points.length;
		},
		burst(x: number, y: number, now = performance.now()) {
			if (!Number.isFinite(x) || !Number.isFinite(y) || now - lastBurst < 150) return false;
			lastBurst = now;
			if (bursts.length === MAX_BURSTS) bursts.shift();
			bursts.push({ x, y, time: now, radius: Math.min(760, Math.max(360, Math.min(innerWidth, innerHeight) * 0.76)) });
			metrics.burstCount++;
			metrics.activeBursts = bursts.length;
			metrics.lastBurst = { x, y };
			metrics.lastBurstAt = now;
			return true;
		},
	};
}
