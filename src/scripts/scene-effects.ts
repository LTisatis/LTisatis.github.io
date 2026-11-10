import { Container, Graphics } from "pixi.js";

type TrailPoint = { x: number; y: number; time: number };
type StarParticle = TrailPoint & {
	lifetime: number;
	vx: number;
	vy: number;
	size: number;
	rotation: number;
	spin: number;
	phase: number;
	color: number;
};
type Burst = { x: number; y: number; time: number; radius: number };
const BURST_LIFETIME = 1450;
const STAR_SPACING = 14;
const MAX_POINTS = 72;
const MAX_BURSTS = 3;
const STAR_COLORS = [0xf7a8ca, 0xc7b1f3, 0x8ecdeb, 0x9bdbc4, 0xf5d587, 0xf3b68f];

// Stable variation keeps a path colorful without sampling randomness every frame.
function variation(seed: number) {
	const value = Math.sin(seed * 127.1) * 43758.5453;
	return value - Math.floor(value);
}

/** Decorative geometry only: effects never distort character meshes or HTML. */
export function createSceneEffects() {
	const back = new Container();
	const front = new Container();
	const trail = front.addChild(new Graphics());
	const rings = back.addChild(new Graphics());
	const particles: StarParticle[] = [];
	const bursts: Burst[] = [];
	let previous: TrailPoint | null = null;
	let carriedDistance = 0;
	let sequence = 0;
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
		particles.length = bursts.length = 0;
		previous = null;
		carriedDistance = 0;
		if (trailPainted) trail.clear();
		if (ringsPainted) rings.clear();
		trailPainted = ringsPainted = false;
		metrics.trailPoints = metrics.activeBursts = 0;
	}
	function emitStar(x: number, y: number, time: number, dx = 0, dy = 0) {
		const seed = ++sequence;
		const scatter = variation(seed + 1);
		const offset = (variation(seed + 2) - 0.5) * 22;
		if (particles.length === MAX_POINTS) particles.shift();
		particles.push({
			x: x - dy * offset,
			y: y + dx * offset,
			time,
			lifetime: 760 + variation(seed + 3) * 320,
			vx: -dx * 12 + (scatter - 0.5) * 32,
			vy: -dy * 8 - 14 - variation(seed + 4) * 14,
			size: 4.5 + variation(seed + 5) * 4,
			rotation: variation(seed + 6) * Math.PI * 2,
			spin: (seed % 2 ? 1 : -1) * (0.8 + variation(seed + 7) * 1.6),
			phase: variation(seed + 8) * Math.PI * 2,
			color: STAR_COLORS[(seed - 1) % STAR_COLORS.length],
		});
	}
	function draw(now: number) {
		for (let i = particles.length - 1; i >= 0; i--) {
			if (now - particles[i].time >= particles[i].lifetime) particles.splice(i, 1);
		}
		while (bursts.length && now - bursts[0].time > BURST_LIFETIME) bursts.shift();
		metrics.trailPoints = particles.length;
		metrics.activeBursts = bursts.length;
		if (!particles.length && !bursts.length && !trailPainted && !ringsPainted) return;
		if (particles.length || trailPainted) trail.clear();
		trailPainted = particles.length > 0;
		for (const particle of particles) {
			const age = Math.max(0, now - particle.time);
			const seconds = age / 1000;
			const progress = age / particle.lifetime;
			const entrance = Math.min(1, age / 55);
			const twinkle = 0.9 + Math.sin(particle.phase + seconds * 5) * 0.1;
			const alpha = entrance * (1 - progress) ** 1.1 * twinkle;
			const radius = particle.size * (0.55 + entrance * 0.45) * (1 - progress * 0.55);
			const x = particle.x + particle.vx * seconds;
			const y = particle.y + particle.vy * seconds + 12 * seconds ** 2;
			const rotation = particle.rotation + particle.spin * seconds;
			// A translucent outer star gives softness without a full-canvas blur.
			trail.star(x, y, 5, radius * 1.7, radius * 0.76, rotation)
				.fill({ color: particle.color, alpha: alpha * 0.09 });
			trail.star(x, y, 5, radius, radius * 0.45, rotation)
				.fill({ color: particle.color, alpha: alpha * 0.66 });
		}
		if (bursts.length || ringsPainted) rings.clear();
		ringsPainted = bursts.length > 0;
		for (const burst of bursts) {
			for (let ring = 0; ring < 2; ring++) {
				const progress = (now - burst.time - ring * 130) / (BURST_LIFETIME - 130);
				if (progress < 0 || progress >= 1) continue;
				const eased = 1 - (1 - progress) ** 3;
				const radius = 24 + eased * burst.radius * (ring ? 0.8 : 1);
				// Let the band visibly taper to zero before the last light fades.
				const width = (ring ? 72 : 104) * (1 - progress) ** 1.6;
				const fade = Math.max(0, (progress - 0.65) / 0.35);
				const alpha = (1 - fade ** 2) * (ring ? 0.68 : 1);
				rings.circle(burst.x, burst.y, radius).stroke({ color: 0xef72b1, width: width * 1.8, alpha: alpha * 0.13 });
				rings.circle(burst.x, burst.y, radius).stroke({ color: 0xf484bd, width, alpha: alpha * 0.55 });
				rings.circle(burst.x, burst.y, radius).stroke({ color: 0xffc5df, width: width * 0.22, alpha: alpha * 0.9 });
			}
		}
	}
	return {
		back, front, metrics, clear, draw,
		destroy() { clear(); },
		endTrail() { previous = null; carriedDistance = 0; },
		trailPoint(x: number, y: number, now = performance.now()) {
			if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(now)) return;
			const distance = previous ? Math.hypot(x - previous.x, y - previous.y) : 0;
			if (previous && (now - previous.time < 12 || distance < 2)) return;
			if (!previous || now - previous.time > 150 || distance > 160) {
				emitStar(x, y, now);
				carriedDistance = 0;
			} else {
				const dx = (x - previous.x) / distance;
				const dy = (y - previous.y) / distance;
				const count = Math.floor((carriedDistance + distance) / STAR_SPACING);
				for (let i = 0; i < count; i++) {
					const t = (STAR_SPACING - carriedDistance + i * STAR_SPACING) / distance;
					emitStar(previous.x + (x - previous.x) * t, previous.y + (y - previous.y) * t,
						previous.time + (now - previous.time) * t, dx, dy);
				}
				carriedDistance = (carriedDistance + distance) % STAR_SPACING;
			}
			previous = { x, y, time: now };
			metrics.trailPoints = particles.length;
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
