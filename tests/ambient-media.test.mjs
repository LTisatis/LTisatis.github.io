import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync("src/scripts/ambient-media.ts", "utf8").replace("export function", "function"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function scene() {
  let active = true;
  let observer;
  let load;
  let id = 0;
  const timers = new Map();
  const videos = [1, 2].map(i => ({
    dataset: { src: `/video-${i}.mp4` }, paused: true, plays: 0,
    hasAttribute(name) { return name === "src" && !!this.src; },
    pause() { this.paused = true; },
    play() { this.paused = false; this.plays++; return Promise.resolve(); },
  }));
  const document = { readyState: "loading", hidden: false };
  const context = vm.createContext({
    videos, document, active: () => active,
    window: { addEventListener: (_event, callback) => { load = callback; } },
    setTimeout: (callback, delay) => { timers.set(++id, { callback, delay }); return id; },
    clearTimeout: key => timers.delete(key),
    IntersectionObserver: class {
      constructor(callback) { observer = callback; }
      observe() {}
    },
  });
  vm.runInContext(`${source}\nglobalThis.controller = createAmbientPlayback(videos, active);`, context);
  return {
    videos, document, controller: context.controller,
    active: value => { active = value; context.controller.sync(); },
    visible: entries => observer(entries.map(([index, isIntersecting]) => ({ target: videos[index], isIntersecting }))),
    load: () => load(),
    tick: () => { const [key, timer] = timers.entries().next().value; timers.delete(key); timer.callback(); return timer.delay; },
    timers,
  };
}

test("decorative videos make no request until the page loads and the deferred start runs", () => {
  const s = scene();
  s.visible([[0, true], [1, true]]);
  assert.equal(s.timers.size, 0);
  assert.ok(s.videos.every(video => !video.src));
  s.load();
  assert.equal(s.tick(), 1200);
  assert.ok(s.videos.every(video => !video.src));
  assert.equal(s.tick(), 400);
  assert.equal(s.videos[0].src, "/video-1.mp4");
  assert.equal(s.videos[1].src, undefined);
  s.tick();
  assert.equal(s.videos[1].src, "/video-2.mp4");
});

test("paused or hidden pages cancel pending downloads and resume only visible videos", async () => {
  const s = scene();
  s.visible([[0, true]]);
  s.active(false);
  s.load(); s.tick();
  assert.equal(s.timers.size, 0);
  assert.ok(s.videos.every(video => !video.src));
  s.active(true);
  s.document.hidden = true;
  s.controller.sync();
  assert.equal(s.timers.size, 0);
  s.document.hidden = false;
  s.controller.sync(); s.tick();
  await Promise.resolve();
  assert.equal(s.videos[0].paused, false);
  assert.equal(s.videos[1].src, undefined);
  s.visible([[0, false], [1, true]]);
  assert.equal(s.videos[0].paused, true);
  s.active(false);
  assert.equal(s.timers.size, 0);
  assert.equal(s.videos[1].src, undefined);
});

test("late character readiness holds decorative downloads after the load delay", () => {
  const s = scene();
  s.active(false); // Character preparation is still pending.
  s.visible([[0, true], [1, true]]);
  s.load(); s.tick();
  assert.equal(s.timers.size, 0);
  assert.ok(s.videos.every(video => !video.src));
  s.active(true); // Ready or explicitly failed: the decoration gate can open.
  s.tick();
  assert.equal(s.videos[0].src, "/video-1.mp4");
});
