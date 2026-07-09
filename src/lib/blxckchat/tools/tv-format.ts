import type {
  TvContentSourceInfo,
  TvPublicEndpoints,
  TvVideo,
  TvVideoMeta,
} from "../../tv.js";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

export function formatTvVideoList(
  videos: TvVideoMeta[],
  total: number,
  source?: TvContentSourceInfo,
): string {
  if (videos.length === 0) {
    return "No JEXXXUS | TV videos matched.";
  }

  const lines = [
    `JEXXXUS | TV videos (${videos.length} shown${total > videos.length ? ` of ${total}` : ""}):`,
  ];
  if (source) {
    lines.push(`Source: ${source.detail}`);
  }
  lines.push("");

  for (const [i, video] of videos.entries()) {
    const bits = [
      video.categories.join(", ") || undefined,
      video.channel,
      video.duration,
      formatDate(video.uploadDate ?? ""),
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(`${i + 1}. ${video.title}`);
    lines.push(`   ${video.url}`);
    if (bits) lines.push(`   ${bits}`);
    if (video.description && video.description !== video.title) {
      const preview =
        video.description.length > 160
          ? `${video.description.slice(0, 160)}…`
          : video.description;
      lines.push(`   ${preview}`);
    }
    lines.push("");
  }

  lines.push("Use action=get or action=meta with slug for full description and SEO detail.");
  return lines.join("\n").trimEnd();
}

export function formatTvVideoMeta(
  meta: TvVideoMeta,
  endpoints: TvPublicEndpoints,
): string {
  const lines = [
    meta.title,
    `URL: ${meta.url}`,
    `Slug: ${meta.slug}`,
  ];
  if (meta.description) lines.push(`Description: ${meta.description}`);
  if (meta.duration) lines.push(`Duration: ${meta.duration}`);
  if (meta.uploadDate) lines.push(`Published: ${formatDate(meta.uploadDate)}`);
  if (meta.channel) lines.push(`Channel: ${meta.channel}`);
  if (meta.categories.length) lines.push(`Categories: ${meta.categories.join(", ")}`);
  if (meta.tags.length) lines.push(`Tags: ${meta.tags.join(", ")}`);
  lines.push(
    "",
    "Public SEO / discovery:",
    `RSS: ${endpoints.feed}`,
    `Sitemap: ${endpoints.sitemap}`,
    `Video sitemap: ${endpoints.sitemapVideo}`,
    `llms.txt: ${endpoints.llms}`,
    `llms-full.txt: ${endpoints.llmsFull}`,
  );
  return lines.join("\n");
}

export function formatTvDiscover(
  endpoints: TvPublicEndpoints,
  videoCount: number,
  samples: TvVideoMeta[],
  categories: string[],
  source?: TvContentSourceInfo,
): string {
  const lines = ["JEXXXUS | TV public endpoints:"];
  if (source) {
    lines.push(`Source: ${source.detail}`);
  }
  lines.push(
    `Site: ${endpoints.site}`,
    `Playlists: ${endpoints.playlists}`,
    `Subscription: ${endpoints.subscription}`,
    `RSS: ${endpoints.feed}`,
    `Sitemap: ${endpoints.sitemap}`,
    `Video sitemap: ${endpoints.sitemapVideo}`,
    `robots.txt: ${endpoints.robots}`,
    `llms.txt: ${endpoints.llms}`,
    `llms-full.txt: ${endpoints.llmsFull}`,
    "",
    `Published videos: ${videoCount}`,
  );

  if (categories.length > 0) {
    lines.push("", `Categories (${categories.length}): ${categories.slice(0, 12).join(", ")}${categories.length > 12 ? "…" : ""}`);
  }

  if (samples.length > 0) {
    lines.push("", "Recent:");
    for (const video of samples) {
      lines.push(`• ${video.title} — ${video.url}`);
    }
  }

  return lines.join("\n");
}

const MAX_BODY_CHARS = 12_000;

export function formatTvVideoFull(video: TvVideo): string {
  const header = [
    video.title,
    `URL: ${video.url}`,
    video.channel ? `Channel: ${video.channel}` : "",
    video.categories.length ? `Categories: ${video.categories.join(", ")}` : "",
    video.tags.length ? `Tags: ${video.tags.join(", ")}` : "",
    video.duration ? `Duration: ${video.duration}` : "",
    video.uploadDate ? `Published: ${formatDate(video.uploadDate)}` : "",
    "",
    "18+ fictionalized adult entertainment on JEXXXUS | TV.",
    "",
    "---",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  let body = video.body;
  if (body.length > MAX_BODY_CHARS) {
    body = `${body.slice(0, MAX_BODY_CHARS)}\n\n… [description truncated at ${MAX_BODY_CHARS} chars]`;
  }

  return `${header}\n${body}`.trimEnd();
}