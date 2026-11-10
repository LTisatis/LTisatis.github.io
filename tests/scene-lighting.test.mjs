import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync("src/scripts/scene-lighting.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture() {
  class Element extends EventTarget {
    dataset = {};
    style = {};
    removeAttribute(name) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      delete this.dataset[key];
    }
  }
  const root = new Element();
  root.dataset.blogMotion = "running";
  root.className = "";
  const host = new Element();
  const pulse = new Element();
  host.querySelector = () => pulse;
  const document = new EventTarget();
  document.documentElement = root;
  document.querySelector = () => host;
  document.hidden = false;
  const window = new EventTarget();
  const reduced = new EventTarget();
  reduced.matches = false;
  const observers = [];
  const animations = [];
  let now = 1000;
  pulse.animate = (frames, options) => {
    const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } };
    animations.push(animation);
    return animation;
  };
  const context = vm.createContext({
    exports: {}, AbortController,
    document: undefined, window,
    matchMedia: () => reduced,
    location: { hostname: "localhost" },
    innerWidth: 1280, innerHeight: 800,
    performance: { now: () => now },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
  });
  vm.runInContext(source, context);
  context.document = document;
  const controller = context.exports.createSceneLighting();
  function emit(type, detail) {
    const event = new Event(type);
    Object.defineProperty(event, "detail", { value: detail });
    document.dispatchEvent(event);
  }
  return {
    ...context.exports, root, host, pulse, document, reduced, animations, observers, controller,
    clock(value) { now = value; },
    emit,
    burst(detail = { x: 217, y: 400, index: 0, strength: 1 }) { emit("blog:scene-burst", detail); },
    mutate() { for (const observer of observers) if (!observer.disconnected) observer.callback(); },
  };
}

test("pulse brightness is finite, capped, continuous and ends at zero", () => {
  const f = fixture();
  const opacity = f.pulseOpacityAt;
  for (const peak of [0, .06, .16, 100, NaN, Infinity, -2]) {
    for (let elapsed = 0; elapsed < 2000; elapsed += 7) {
      const value = opacity(elapsed, .03, peak);
      assert.ok(Number.isFinite(value) && value >= 0 && value <= .16);
    }
  }
  assert.equal(opacity(0, .04, .16), .04);
  assert.equal(opacity(120, 0, .16), .16);
  assert.equal(opacity(1500, 0, .16), 0);
  f.controller.destroy();
});

test("repeated character feedback continues brightness and size without additive flashes", () => {
  const f = fixture();
  f.burst();
  f.clock(1500);
  f.burst({ x: 1060, y: 400, index: 1, strength: 1 });
  assert.equal(f.animations.length, 2);
  assert.equal(f.animations[0].cancelled, true);
  const frame = f.animations[1].frames[0];
  assert.equal(frame.opacity, f.pulseOpacityAt(500, 0, .16));
  assert.equal(Number(frame.transform.match(/scale\(([^)]+)\)/)[1]), f.pulseScaleAt(500));
  assert.equal(f.animations[1].frames[1].opacity, .16);
  assert.equal(f.host.dataset.scenePulseCount, "2");
  assert.deepEqual(JSON.parse(f.host.dataset.scenePulseOrigin), { x: 1060, y: 400, index: 1 });
  f.animations[1].onfinish();
  assert.equal(f.host.dataset.scenePulseActive, "false");
  f.controller.destroy();
});

test("pause, background visibility, welcome and reduced motion cancel residual light and block new pulses", () => {
  for (const state of ["pause", "hidden", "welcome", "reduced"]) {
    const f = fixture();
    f.burst();
    if (state === "pause") { f.root.dataset.blogMotion = "paused"; f.emit("blog:motionchange"); }
    if (state === "hidden") { f.document.hidden = true; f.emit("visibilitychange"); }
    if (state === "welcome") { f.root.className = "welcome-active"; f.mutate(); }
    if (state === "reduced") { f.reduced.matches = true; f.reduced.dispatchEvent(new Event("change")); }
    assert.equal(f.animations[0].cancelled, true, state);
    assert.equal(f.host.dataset.scenePulseActive, "false", state);
    f.burst();
    assert.equal(f.animations.length, 1, state);
    f.controller.destroy();
  }
});

test("only valid character events create light and duplicate initialization does not bind twice", () => {
  const f = fixture();
  f.emit("click");
  f.burst({ x: NaN, y: 400 });
  f.burst({ x: 217, y: Infinity });
  f.burst({ x: 217, y: 400, strength: Infinity });
  assert.equal(f.animations.length, 0);
  assert.equal(f.createSceneLighting(), undefined);
  f.burst();
  assert.equal(f.animations.length, 1);
  f.controller.destroy();
  f.burst();
  assert.equal(f.animations.length, 1);
});
