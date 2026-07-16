import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateDevotionScore,
  heavyRankerShuffle,
  recommendTvVideos,
} from "../lib/tv-algorithm.js";
import type { TvVideoMeta } from "../lib/tv.js";

function video(overrides: Partial<TvVideoMeta> & { slug: string }): TvVideoMeta {
  return {
    title: overrides.slug,
    description: overrides.slug,
    url: `https://tv.jexxx.us/video/${overrides.slug}`,
    categories: [],
    tags: [],
    source: "local",
    ...overrides,
  };
}

test("calculateDevotionScore weights saves highest, then shares, likes, views", () => {
  const base = video({ slug: "base", uploadDate: "2020-01-01" });
  const withViews = video({ slug: "views", views: 50, uploadDate: "2020-01-01" });
  const withSaves = video({
    slug: "saves",
    interactions: { likes: 0, saves: 1, shares: 0 },
    uploadDate: "2020-01-01",
  });

  const baseScore = calculateDevotionScore(base);
  const viewsScore = calculateDevotionScore(withViews);
  const savesScore = calculateDevotionScore(withSaves);

  assert.ok(viewsScore > baseScore);
  // One save (weight 100) should outscore 50 raw views (weight 1 each).
  assert.ok(savesScore > viewsScore);
});

test("heavyRankerShuffle returns every video exactly once", () => {
  const videos = Array.from({ length: 20 }, (_, i) =>
    video({ slug: `video-${i}`, views: i * 10 }),
  );
  const shuffled = heavyRankerShuffle(videos);
  assert.equal(shuffled.length, videos.length);
  const slugs = new Set(shuffled.map((v) => v.slug));
  assert.equal(slugs.size, videos.length);
});

test("heavyRankerShuffle produces a different order across calls (catalog no longer static)", () => {
  const videos = Array.from({ length: 40 }, (_, i) => video({ slug: `video-${i}` }));
  const orders = new Set<string>();
  for (let i = 0; i < 8; i++) {
    orders.add(heavyRankerShuffle(videos).map((v) => v.slug).join(","));
  }
  // With 40 videos and pure random jitter, getting the identical order on
  // every one of 8 calls is effectively impossible unless shuffling broke.
  assert.ok(orders.size > 1);
});

test("recommendTvVideos respects the limit", () => {
  const videos = Array.from({ length: 30 }, (_, i) => video({ slug: `video-${i}` }));
  const recs = recommendTvVideos(videos, 10);
  assert.equal(recs.length, 10);
});

test("heavyRankerShuffle handles videos with no ranking signals at all", () => {
  const videos = [video({ slug: "a" }), video({ slug: "b" }), video({ slug: "c" })];
  const shuffled = heavyRankerShuffle(videos);
  assert.equal(shuffled.length, 3);
});
