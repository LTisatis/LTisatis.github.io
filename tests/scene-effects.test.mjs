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
	stroke(style) { this.commands.push({ kind: "stroke", style }); return this; }
	fill(style) { this.commands.push({ kind: "fill", style }); return this; }
}
class BlurFilter {
	constructor(options) { this.options = options; this.enabled = true; }
	destroy() { this.destroyed = true; }
}
function fixture() {
	const context = vm.createContext({
		exports: {},
		require: () => ({ Container, Graphics, BlurFilter }),
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
	assert.ok(rings.commands.some(command => command.kind === "fill" && command.style.alpha > 0));
});

test("trail history is bounded and disconnected paths never bridge content", () => {
	const { effects, trail } = fixture();
	for (let i = 0; i < 1000; i++) effects.trailPoint(i * 3, 100, i * 10);
	assert.ok(effects.metrics.trailPoints > 1);
	assert.ok(effects.metrics.trailPoints <= effects.metrics.maxTrailPoints);
	const retained = effects.metrics.trailPoints;
	effects.trailPoint(NaN, Infinity, 20_000);
	assert.equal(effects.metrics.trailPoints, retained);
	effects.clear();
	effects.trailPoint(10, 20, 1000);
	effects.endTrail();
	effects.trailPoint(30, 40, 1020);
	effects.draw(1100);
	assert.equal(trail.commands.length, 0);
});

test("soft trail filtering stops when cleared and releases resources on destruction", () => {
	const { effects, trail } = fixture();
	const filter = trail.filters[0];
	assert.equal(filter.enabled, false);
	effects.trailPoint(10, 20, 1000);
	effects.trailPoint(30, 40, 1020);
	effects.draw(1100);
	assert.equal(filter.enabled, true);
	effects.clear();
	assert.equal(filter.enabled, false);
	effects.destroy();
	assert.equal(filter.destroyed, true);
	assert.equal(trail.filters.length, 0);
});
