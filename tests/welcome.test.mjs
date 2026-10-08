import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const layout = fs.readFileSync("src/layouts/Layout.astro", "utf8");
const bootstrap = layout.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
const welcome = ts.transpileModule(fs.readFileSync("src/scripts/welcome.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function page(storage, referrer = "") {
  const classes = new Set();
  const root = { classList: {
    add: value => classes.add(value), remove: value => classes.delete(value),
    contains: value => classes.has(value),
  } };
  const context = vm.createContext({
    window: {}, document: { documentElement: root, referrer,
      querySelector: () => ({}), querySelectorAll: selector => selector === ".corner-character" ? [{}, {}] : [],
    },
    location: { origin: "https://ltisatis.github.io" }, sessionStorage: storage,
    setTimeout() {}, URL, matchMedia: () => ({ matches: false }),
  });
  vm.runInContext(bootstrap, context);
  return { classes, context };
}

test("welcome appears once across full page navigation and reloads in one session", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const first = page(storage);
  assert.ok(first.classes.has("welcome-pending"));
  first.classes.clear();
  vm.runInContext(bootstrap, first.context);
  assert.equal(first.classes.size, 0, "Swup head processing must not replay welcome");
  for (const route of ["/", "/archive/", "/friends/", "/about/"]) {
    const next = page(storage, `https://ltisatis.github.io${route}`);
    assert.equal(next.classes.size, 0);
    vm.runInContext(welcome, next.context);
    assert.equal(next.classes.size, 0, "page script must respect the bootstrap gate");
  }
});

test("internal navigation skips welcome even when session storage is blocked", () => {
  const blocked = { getItem() { throw new Error("blocked"); } };
  assert.equal(page(blocked, "https://ltisatis.github.io/friends/").classes.size, 0);
  assert.ok(page(blocked).classes.has("welcome-pending"));
});
