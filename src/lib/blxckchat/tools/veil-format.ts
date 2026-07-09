import type {
  VeilArticle,
  VeilArticleMeta,
  VeilContentSourceInfo,
  VeilPublicEndpoints,
} from "../../veil.js";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

export function formatVeilArticleList(
  articles: VeilArticleMeta[],
  total: number,
  source?: VeilContentSourceInfo,
): string {
  if (articles.length === 0) {
    return "No VEIL articles matched.";
  }

  const lines = [
    `VEIL articles (${articles.length} shown${total > articles.length ? ` of ${total}` : ""}):`,
  ];
  if (source) {
    lines.push(`Source: ${source.detail}`);
  }
  lines.push("");

  for (const [i, article] of articles.entries()) {
    const bits = [article.author, article.category, formatDate(article.publishedAt)]
      .filter(Boolean)
      .join(" · ");
    lines.push(`${i + 1}. ${article.title}`);
    lines.push(`   ${article.url}`);
    if (bits) lines.push(`   ${bits}`);
    lines.push("");
  }

  lines.push("Use action=get or action=meta with slug for full text or SEO detail.");
  return lines.join("\n").trimEnd();
}

export function formatVeilArticleMeta(
  meta: VeilArticleMeta,
  endpoints: VeilPublicEndpoints,
): string {
  const lines = [
    meta.title,
    `URL: ${meta.url}`,
    `Slug: ${meta.slug}`,
  ];
  if (meta.description) lines.push(`Description: ${meta.description}`);
  if (meta.publishedAt) lines.push(`Published: ${formatDate(meta.publishedAt)}`);
  if (meta.author) lines.push(`Author: ${meta.author}`);
  if (meta.category) lines.push(`Category: ${meta.category}`);
  lines.push(
    "",
    "Public SEO / discovery:",
    `RSS: ${endpoints.feed}`,
    `Sitemap: ${endpoints.sitemap}`,
    `llms.txt: ${endpoints.llms}`,
  );
  return lines.join("\n");
}

export function formatVeilDiscover(
  endpoints: VeilPublicEndpoints,
  articleCount: number,
  samples: VeilArticleMeta[],
  source?: VeilContentSourceInfo,
): string {
  const lines = [
    "VEIL public endpoints:",
  ];
  if (source) {
    lines.push(`Source: ${source.detail}`);
  }
  lines.push(
    `Site: ${endpoints.site}`,
    `Articles index: ${endpoints.articlesIndex}`,
    `RSS: ${endpoints.feed}`,
    `Sitemap: ${endpoints.sitemap}`,
    `robots.txt: ${endpoints.robots}`,
    `llms.txt: ${endpoints.llms}`,
    "",
    `Published articles: ${articleCount}`,
  );

  if (samples.length > 0) {
    lines.push("", "Recent:");
    for (const article of samples) {
      lines.push(`• ${article.title} — ${article.url}`);
    }
  }

  return lines.join("\n");
}

const MAX_BODY_CHARS = 12_000;

export function formatVeilArticleFull(article: VeilArticle): string {
  const header = [
    article.title,
    `URL: ${article.url}`,
    article.author ? `Author: ${article.author}` : "",
    article.category ? `Category: ${article.category}` : "",
    article.publishedAt ? `Published: ${formatDate(article.publishedAt)}` : "",
    "",
    "---",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  let body = article.body;
  if (body.length > MAX_BODY_CHARS) {
    body = `${body.slice(0, MAX_BODY_CHARS)}\n\n… [article truncated at ${MAX_BODY_CHARS} chars]`;
  }

  return `${header}\n${body}`.trimEnd();
}