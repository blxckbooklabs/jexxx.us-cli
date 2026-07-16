import type { TvVideoMeta } from "./tv.js";

/**
 * Port of tv.jexxx.us/src/lib/algorithm.ts's DevotionRank + heavyRankerShuffle —
 * the actual ranking logic the live site uses for its homepage feed, not the
 * separate `jexxx.us-algorithm`/`jexxx.us-algorithm-ml` repos (those are
 * reference/inspiration material — a full Twitter-scale recommendation
 * pipeline — not what's deployed). Kept as a pure, dependency-free module
 * (no React/Supabase) so it works identically here and on the site.
 *
 * Ranking signals (views/likes/saves/shares) are only present when the
 * catalog came from the local videos.json checkout (see tv.ts); remote
 * llms-full/RSS sources don't carry them, so scores fall back to 0 for
 * those fields — this still produces a per-call randomized shuffle instead
 * of the previous static catalog-order slice, just without the engagement
 * weighting.
 */

function getDaysSinceUpload(dateString: string | undefined): number {
  if (!dateString || dateString === "Just now") return 0;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return 100;
  return Math.max(0, (Date.now() - d.getTime()) / (1000 * 3600 * 24));
}

export function calculateDevotionScore(video: TvVideoMeta): number {
  const views = video.views ?? 0;
  const likes = video.interactions?.likes ?? 0;
  const saves = video.interactions?.saves ?? 0;
  const shares = video.interactions?.shares ?? 0;

  const viewWeight = 1;
  const likeWeight = 10;
  const shareWeight = 25;
  const saveWeight = 100;

  let baseScore =
    views * viewWeight + likes * likeWeight + shares * shareWeight + saves * saveWeight;

  const daysOld = getDaysSinceUpload(video.uploadDate);
  if (daysOld <= 7) {
    const key = video.id ?? video.slug;
    const hash = key.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const multiplier = (hash % 8) + 1;
    baseScore += 300_000 * multiplier;
  } else if (daysOld <= 14) {
    baseScore += 200_000;
  }

  return baseScore;
}

/**
 * Mixes high-authority (DevotionScore) videos with randomized discovery —
 * a fresh, varied order every call, instead of always surfacing whatever
 * happens to sort first/alphabetically in the source catalog.
 */
export function heavyRankerShuffle(videos: TvVideoMeta[]): TvVideoMeta[] {
  if (videos.length === 0) return [];

  const weighted = videos.map((video) => {
    const baseScore = calculateDevotionScore(video);
    const rankWeight = Math.log10(Math.max(baseScore, 100));
    const daysOld = getDaysSinceUpload(video.uploadDate);
    const recencyBonus = daysOld <= 7 ? 2.5 : daysOld <= 14 ? 1.0 : 0;
    const stochasticFactor = Math.random() * 25;

    return { video, score: rankWeight + recencyBonus + stochasticFactor };
  });

  return weighted.sort((a, b) => b.score - a.score).map((w) => w.video);
}

/** Recommendation slice for tv_query action=list with no search query. */
export function recommendTvVideos(videos: TvVideoMeta[], limit: number): TvVideoMeta[] {
  return heavyRankerShuffle(videos).slice(0, limit);
}
