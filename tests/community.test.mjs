import assert from "node:assert/strict";
import test from "node:test";
import { commentPath, isWebUrl } from "../src/utils/community-utils.ts";

test("comment identity ignores host, query, hash and trailing slash differences", () => {
  assert.equal(commentPath("/posts/ba-zhichi?from=home#reply", false), "/posts/ba-zhichi/");
  assert.equal(commentPath("https://localhost:5173/posts/ba-zhichi/", false), "/posts/ba-zhichi/");
  assert.notEqual(commentPath("/friends/", false), commentPath("/posts/welcome/", false));
});
test("preview comments cannot write into public threads", () => {
  assert.equal(commentPath("/friends/", true), "/__preview__/friends/");
  assert.notEqual(commentPath("/posts/welcome/", true), commentPath("/posts/welcome/", false));
});
test("friend links reject executable protocols and embedded credentials", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "https://user:pass@example.com", "//example.com", "invalid"]) assert.equal(isWebUrl(url), false);
  assert.equal(isWebUrl("https://example.com/blog/"), true);
});
