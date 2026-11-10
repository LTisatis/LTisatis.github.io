import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
	fs.readFileSync("src/scripts/scene-effects.ts", "utf8"),
	{ compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

// Capture the drawing protocol; GPU rasterization belongs to browser QA.
class Container {
	children = [];
	addChild(child) { this.children.push(child); return child; }
}
class Graphics {
	clears = 0;
	commands = [];
	clear() { this.clears++; this.commands = []; return this; }
	moveTo(x, y) { this.commands.push({ kind: "move", x, y }); return this; }
	lineTo(x, y) { this.commands.push({ kind: "line", x, y }); return this; }
	circle(x, y, radius) { this.commands.push({ kind: "circle", x, y, radius }); return this; }
	star(x, y, points, radius, innerRadius, rotation = 0) { this.commands.push({ kind: "star", x, y, points, radius, innerRadius, rotation }); return this; }
	stroke(style) { this.commands.push({ kind: "stroke", style }); return this; }
	fill(style) { this.commands.push({ kind: "fill", style }); return this; }
}
function fixture() {
	const context = vm.createContext({
		exports: {},
		require: () => ({ Container, Graphics }),
		performance: { now: () => 1000 },
		innerWidth: 1280,
		innerHeight: 800,
	});
	vm.runInContext(source, context);
	const effects = context.exports.createSceneEffects();
	return { effects, trail: effects.front.children[0], rings: effects.back.children[0] };
}

test("bursts reject invalid coordinates without changing their state", () => {
	const { effects } = fixture();
	for (const [x, y] of [[NaN, 2], [1, Infinity], [-Infinity, NaN]]) {
		assert.equal(effects.burst(x, y, 20_000), false);
	}
	assert.equal(effects.metrics.burstCount, 0);
	assert.equal(effects.metrics.activeBursts, 0);
	assert.equal(effects.metrics.lastBurst, null);
});

test("accepted clicks retain their center, enforce 150ms cooldown and bound concurrent bursts", () => {
	const { effects, rings } = fixture();
	assert.equal(effects.burst(123, 456, 1000), true);
	assert.equal(effects.burst(999, 888, 1149), false);
	assert.equal(effects.metrics.lastBurst.x, 123);
	assert.equal(effects.metrics.lastBurst.y, 456);
	assert.equal(effects.metrics.lastBurstAt, 1000);
	effects.draw(1100);
	const circles = rings.commands.filter(command => command.kind === "circle");
	assert.ok(circles.length > 0);
	assert.ok(circles.every(circle => circle.x === 123 && circle.y === 456));
	assert.ok(circles.every(circle => Number.isFinite(circle.radius) && circle.radius > 0));
	assert.equal(effects.burst(321, 654, 1150), true);
	for (let i = 1; i <= 20; i++) effects.burst(321 + i, 654, 1150 + i * 150);
	assert.ok(effects.metrics.activeBursts <= effects.metrics.maxBursts);
	assert.equal(effects.metrics.burstCount, 22);
	assert.equal(effects.metrics.lastBurst.x, 341);
	assert.equal(effects.metrics.lastBurstAt, 4150);
});

test("pause cleanup and natural expiration remove burst and trail geometry", () => {
	for (const cleanup of ["clear", "expire"]) {
		const { effects, trail, rings } = fixture();
		effects.trailPoint(10, 20, 1000);
		effects.trailPoint(30, 40, 1020);
		effects.burst(200, 300, 1000);
		effects.draw(1100);
		assert.ok(rings.commands.length);
		assert.ok(trail.commands.length);
		if (cleanup === "clear") effects.clear();
		else effects.draw(5000);
		assert.equal(effects.metrics.activeBursts, 0);
		assert.equal(effects.metrics.trailPoints, 0);
		assert.equal(rings.commands.length, 0);
		assert.equal(trail.commands.length, 0);
	}
});

test("idle frames leave graphics alone after the final cleanup", () => {
	const { effects, trail, rings } = fixture();
	for (let i = 0; i < 60; i++) effects.draw(i * 16);
	assert.equal(trail.clears + rings.clears, 0);
	effects.trailPoint(10, 20, 1000);
	effects.trailPoint(30, 40, 1020);
	effects.burst(200, 300, 1000);
	effects.draw(1100);
	const painting = trail.clears + rings.clears;
	assert.ok(painting > 0);
	effects.draw(5000);
	const cleaned = trail.clears + rings.clears;
	assert.ok(cleaned > painting);
	for (let i = 0; i < 120; i++) effects.draw(5000 + i * 16);
	effects.clear();
	assert.equal(trail.clears + rings.clears, cleaned);
	assert.equal(trail.commands.length + rings.commands.length, 0);
});

test("large pink bursts share the background layer and expand well beyond the old small rings", () => {
	const { effects, rings } = fixture();
	effects.burst(217, 272, 1000);
	effects.draw(1700);
	assert.equal(effects.back.children.includes(rings), true);
	assert.ok(rings.commands.some(command => command.kind === "circle" && command.radius > 480));
	assert.ok(rings.commands.some(command => command.kind === "stroke" && command.style.alpha > 0));
	assert.equal(rings.commands.some(command => command.kind === "fill"), false);
});

test("expanding rings narrow continuously to a fine edge before their geometry expires", () => {
	const { effects, rings } = fixture();
	effects.burst(217, 400, 1000);
	function primaryWidths(time) {
		effects.draw(time);
		return rings.commands.filter(command => command.kind === "stroke").slice(0, 3).map(command => command.style.width);
	}
	const early = primaryWidths(1030);
	const middle = primaryWidths(1660);
	const late = primaryWidths(2315);
	assert.equal(early.length, 3);
	assert.equal(middle.length, 3);
	assert.equal(late.length, 3);
	assert.ok(early[0] > 50, "the visible ring begins as a wide band");
	for (let i = 0; i < early.length; i++) {
		assert.ok(early[i] > middle[i] && middle[i] > late[i]);
		assert.ok(late[i] >= 0 && late[i] < 2, "the edge becomes fine before disappearing");
	}
	effects.draw(2500);
	assert.equal(effects.metrics.activeBursts, 0);
	assert.equal(rings.commands.length, 0);
});

test("star particles stay bounded and invalid pointer samples cannot add particles", () => {
  const { effects, trail } = fixture();
  for (let i = 0; i < 1000; i++) effects.trailPoint(i * 3, 100, i * 10);
  assert.ok(effects.metrics.trailPoints > 1);
  assert.ok(effects.metrics.trailPoints <= effects.metrics.maxTrailPoints);
  const retained = effects.metrics.trailPoints;
  effects.trailPoint(NaN, Infinity, 20_000);
  effects.trailPoint(200, 200, NaN);
  assert.equal(effects.metrics.trailPoints, retained);
  effects.draw(10_000);
  assert.ok(effects.metrics.trailPoints <= effects.metrics.maxTrailPoints);
  assert.ok(trail.commands.some(command => command.kind === "star"));
});

test("pointer trails draw varied five-point stars instead of a connected ribbon", () => {
  const { effects, trail } = fixture();
  for (let i = 0; i < 10; i++) effects.trailPoint(100 + i * 28, 200, 1000 + i * 16);
  effects.draw(1200);
  const stars = trail.commands.filter(command => command.kind === "star");
  const fills = trail.commands.filter(command => command.kind === "fill");
  assert.ok(stars.length > 0);
  assert.ok(stars.every(star => star.points === 5 && star.radius > star.innerRadius && star.innerRadius > 0));
  assert.ok(stars.every(star => [star.x, star.y, star.rotation, star.radius].every(Number.isFinite)));
  assert.ok(new Set(fills.map(fill => fill.style.color)).size >= 3);
  assert.ok(fills.every(fill => fill.style.alpha >= 0 && fill.style.alpha <= 1));
  assert.equal(trail.commands.some(command => command.kind === "line" || command.kind === "stroke"), false);
});

test("stars drift, rotate, shrink and fade as time advances", () => {
  const { effects, trail } = fixture();
  effects.trailPoint(100, 200, 1000);
  effects.draw(1100);
  const early = trail.commands.find(command => command.kind === "star");
  const earlyAlpha = Math.max(...trail.commands.filter(command => command.kind === "fill").map(command => command.style.alpha));
  effects.draw(1600);
  const late = trail.commands.find(command => command.kind === "star");
  const lateAlpha = Math.max(...trail.commands.filter(command => command.kind === "fill").map(command => command.style.alpha));
  assert.ok(early && late);
  assert.ok(Math.hypot(late.x - early.x, late.y - early.y) > 1);
  assert.ok(Math.abs(late.rotation - early.rotation) > .1);
  assert.ok(late.radius < early.radius);
  assert.ok(lateAlpha > 0 && lateAlpha < earlyAlpha);
});

test("ending a segment, a long gap or a large jump emits at the new point without crossing intervening content", () => {
  for (const scenario of ["end", "gap", "jump"]) {
    const { effects, trail } = fixture();
    effects.trailPoint(10, 100, 1000);
    if (scenario === "end") effects.endTrail();
    const nextX = scenario === "jump" ? 900 : 150;
    const nextTime = scenario === "gap" ? 1300 : 1040;
    effects.trailPoint(nextX, 100, nextTime);
    assert.equal(effects.metrics.trailPoints, 2, scenario);
    effects.draw(nextTime + 55);
    const stars = trail.commands.filter(command => command.kind === "star");
    assert.ok(stars.length > 0, scenario);
    assert.ok(stars.every(star => Math.abs(star.x - 10) < 25 || Math.abs(star.x - nextX) < 25), scenario);
    assert.ok(stars.some(star => Math.abs(star.x - 10) < 25), "existing stars may finish fading after a segment ends");
  }
});
