export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smooth = (v: number) => {
	const t = clamp(v);
	return t * t * (3 - 2 * t);
};
export const HAIR_SPEED = 2.25;
export function seededRandom(initialSeed: number) {
	let seed = initialSeed;
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
export function blinkAmount(t: number) {
	if (t < 0 || t >= 0.22) return 0;
	if (t < 0.08) return smooth(t / 0.08);
	if (t < 0.12) return 1;
	return 1 - smooth((t - 0.12) / 0.1);
}
export const waveKeys = [
	[0, 0],
	[0.32, 0.18],
	[0.7, 1],
	[1.08, -0.7],
	[1.48, 0.78],
	[1.86, -0.48],
	[2.5, 0],
];
export function waveCurve(time: number, delay = 0) {
	const t = time - delay;
	if (t <= 0 || t >= 2.5) return 0;
	const i = waveKeys.findIndex((k) => k[0] >= t);
	const a = waveKeys[i - 1];
	const b = waveKeys[i];
	return a[1] + (b[1] - a[1]) * smooth((t - a[0]) / (b[0] - a[0]));
}
/** Keep upcoming gestures apart without extending the 18–28 second interval. */
export function staggerWaves(a: CharacterTimeline, b: CharacterTimeline) {
	if (Math.abs(a.nextWave - b.nextWave) >= 3.1) return;
	const low = b.waveStart < 0 ? b.time + 18 : b.waveStart + 18;
	const high = low + 10;
	const choices = [a.nextWave - 3.1, a.nextWave + 3.1, low, high].filter(
		(t) =>
			t >= low && t <= high && t > b.time && Math.abs(t - a.nextWave) >= 3.099,
	);
	choices.sort((x, y) => Math.abs(x - b.nextWave) - Math.abs(y - b.nextWave));
	if (choices.length) b.nextWave = choices[0];
}
/** Pure simulation clock: no timers, deterministic under a fixed seed. */
export class CharacterTimeline {
	time = 0;
	blinkStart = -99;
	waveStart = -99;
	nextBlink = 0;
	nextWave = 0;
	doubleAt = Number.POSITIVE_INFINITY;
	lastBlink = -99;
	random: () => number;
	events: { kind: string; time: number }[] = [];
	hair = Array.from({ length: 6 }, () => ({ angle: 0, velocity: 0 }));
	constructor(
		seed: number,
		public longHair = false,
	) {
		this.random = seededRandom(seed);
		this.reschedule();
	}
	reschedule() {
		this.nextBlink = this.time + 3 + 4 * this.random();
		this.nextWave = this.time + 18 + 10 * this.random();
		this.doubleAt = Number.POSITIVE_INFINITY;
	}
	/** Used once at the static-image handoff; resume keeps its own natural schedule. */
	startAt(seconds: number) {
		const target = Math.max(0, seconds);
		// Warm only the spring state, with bounded work and no hidden gesture events.
		this.time = Math.max(0, target - 0.75);
		while (this.time < target) {
			const dt = Math.min(1 / 120, target - this.time);
			this.time += dt;
			this.stepHair(dt);
		}
		this.reschedule();
		this.nextBlink = this.time + (this.longHair ? 1.3 : 0.85);
	}
	blink(allowDouble = true) {
		if (this.time - this.lastBlink < 0.35) return false;
		this.blinkStart = this.time;
		this.lastBlink = this.time;
		this.nextBlink = this.time + 0.22 + 3 + 4 * this.random();
		this.doubleAt =
			allowDouble && this.random() < 0.1 ? this.time + 0.22 + 0.18 : Number.POSITIVE_INFINITY;
		this.events.push({ kind: "blink", time: this.time });
		return true;
	}
	wave() {
		if (this.time - this.waveStart < 2.5) return false;
		this.waveStart = this.time;
		this.nextWave = this.time + 18 + 10 * this.random();
		if (this.time - this.lastBlink > 0.65) this.blink(false);
		this.events.push({ kind: "wave", time: this.time });
		return true;
	}
	step(dt: number, allowWave = true) {
		this.time += dt;
		if (this.time >= this.doubleAt) {
			this.doubleAt = Number.POSITIVE_INFINITY;
			this.blink(false);
		} else if (this.time >= this.nextBlink) this.blink();
		if (allowWave && this.time >= this.nextWave) this.wave();
		this.stepHair(dt);
		if (this.events.length > 512) this.events.splice(0, 256);
	}
	private stepHair(dt: number) {
		const phase = this.longHair ? 1.8 : 0.3;
		// Speed only the hair clock. Scale the spring and damping with it, keeping
		// the same delayed follow-through instead of filtering away the faster wind.
		const hairSpeed = HAIR_SPEED;
		const amplitude = this.longHair ? 4.05 : 5.67;
		const wind =
			(Math.sin(this.time * hairSpeed * 1.65 + phase) * 0.018 +
				Math.sin(this.time * hairSpeed * 0.79 + phase) * 0.009 +
				this.pose.shoulder * 0.14) * amplitude;
		for (let i = 0; i < this.hair.length; i++) {
			const h = this.hair[i];
			const parent = i ? this.hair[i - 1].angle : wind;
			const stiffness = (this.longHair ? 39 : 65) * hairSpeed * hairSpeed;
			const damping = (this.longHair ? 7.3 : 10) * hairSpeed;
			h.velocity +=
				((parent - h.angle) * stiffness - h.velocity * damping) * dt;
			h.angle = clamp(h.angle + h.velocity * dt, -0.22, 0.22);
		}
	}
	get pose() {
		const t = this.time - this.waveStart;
		const phase = this.longHair ? 1.7 : 0;
		const fadeIn = smooth(this.time / 1.2);
		// Ease the idle gesture down during a wave, then restore it smoothly.
		const idle = fadeIn * (t >= 0 && t < 2.9
			? 1 - smooth(t / 0.25) * (1 - smooth((t - 2.5) / 0.4)) : 1);
		const sway = Math.sin(this.time * 1.72 + phase);
		return {
			// Gentle variation of the existing open smile, independent of wind.
			mouth: this.longHair ? 1 : 1+fadeIn*.5*(-.075+Math.sin(this.time*1.75+.3)*.105+Math.sin(this.time*.71+.8)*.025),
			// Whole-character motion uses the same final transform for every layer.
			bodyAngle: (Math.sin(this.time * (this.longHair ? 1.25 : 1.14) + phase) * .021
				+ Math.sin(this.time * .55 + phase) * .005) * fadeIn,
			bodyX: Math.sin(this.time * .96 + phase) * 5 * fadeIn,
			blink: blinkAmount(this.time - this.blinkStart),
			shoulder: waveCurve(t) * 0.0675 + sway * 0.0544 * idle,
			shoulderLift: Math.sin(this.time * 1.72 + phase - 0.2) * 6.8 * fadeIn + waveCurve(t) * 8.1,
			elbow: waveCurve(t, 0.055) * 0.10125 + Math.sin(this.time * 1.72 + phase - 0.35) * 0.051 * idle,
			wrist: waveCurve(t, 0.1) * 0.216 + Math.sin(this.time * 1.72 + phase - 0.7) * 0.0595 * idle,
			restShoulder: Math.sin(this.time * 1.425 + phase) * 0.0765 * fadeIn,
			restElbow: Math.sin(this.time * 1.425 + phase - 0.45) * 0.0595 * fadeIn,
			head:
				Math.sin(this.time * 1.32 + (this.longHair ? 1 : 0)) * 0.005 +
				waveCurve(t) * 0.011,
			breath: Math.sin(this.time * 1.9 + (this.longHair ? 2 : 0)) * 2.5,
		};
	}
}
