import assert from "node:assert/strict";
import test from "node:test";
import { comparePosts, isPublished, shanghaiDay } from "../src/utils/publication.ts";

test("Shanghai day changes at UTC 16:00", () => {
 assert.equal(shanghaiDay(new Date("2026-09-09T15:59:59Z")), "2026-09-09");
 assert.equal(shanghaiDay(new Date("2026-09-09T16:00:00Z")), "2026-09-10");
});
test("drafts, demos and future dates are excluded independently", () => {
 const now = new Date("2026-09-09T08:00:00Z");
 const data = { published: new Date("2026-09-09") };
 assert.equal(isPublished(data, now), true);
 assert.equal(isPublished({ ...data, draft: true }, now, true), false);
 assert.equal(isPublished({ ...data, demo: true }, now), false);
 assert.equal(isPublished({ ...data, demo: true }, now, true), true);
 assert.equal(isPublished({ published: new Date("2099-01-01") }, now, true), false);
 assert.equal(isPublished({ published: new Date("invalid") }, now), false);
});
test("day-granularity publishing includes the current Shanghai day", () => {
 assert.equal(isPublished({ published: new Date("2026-09-10") }, new Date("2026-09-09T16:01:00Z")), true);
});
test("sorting is descending by day and stable by slug for ties", () => {
 const post = (slug, day) => ({ slug, data: { published: new Date(day) } });
 const posts = [post("z", "2026-09-09"), post("old", "2026-01-01"), post("a", "2026-09-09")];
 assert.deepEqual(posts.sort(comparePosts).map(p => p.slug), ["a", "z", "old"]);
 assert.equal(comparePosts(posts[0], posts[0]), 0);
});
