import type { LawPolicy, LawPolicyMeta, LawPublicEndpoints } from "../../law.js";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

/** Strips HTML tags from law.jexxx.us's RSS content:encoded into readable plain text. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<h([1-4])[^>]*>/gi, "\n\n")
    .replace(/<\/h[1-4]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|ul|table|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatLawPolicyList(
  policies: LawPolicyMeta[],
  total: number,
): string {
  if (policies.length === 0) {
    return "No Law policies matched.";
  }

  const lines = [
    `Law policies (${policies.length} shown${total > policies.length ? ` of ${total}` : ""}):`,
    "",
  ];

  for (const [i, policy] of policies.entries()) {
    const bits = [policy.category, formatDate(policy.publishedAt)].filter(Boolean).join(" · ");
    lines.push(`${i + 1}. ${policy.title}`);
    lines.push(`   Read: [${policy.title}](${policy.url})`);
    lines.push(`   URL (copy exactly): ${policy.url}`);
    if (bits) lines.push(`   ${bits}`);
    lines.push("");
  }

  lines.push("Use action=get or action=meta with slug for full text or SEO detail.");
  return lines.join("\n").trimEnd();
}

export function formatLawPolicyMeta(
  meta: LawPolicyMeta,
  endpoints: LawPublicEndpoints,
): string {
  const lines = [meta.title, `URL: ${meta.url}`, `Slug: ${meta.slug}`];
  if (meta.description) lines.push(`Description: ${meta.description}`);
  if (meta.publishedAt) lines.push(`Published: ${formatDate(meta.publishedAt)}`);
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

export function formatLawDiscover(
  endpoints: LawPublicEndpoints,
  policyCount: number,
  samples: LawPolicyMeta[],
): string {
  const lines = [
    "Law public endpoints:",
    `Site: ${endpoints.site}`,
    `RSS: ${endpoints.feed}`,
    `Sitemap: ${endpoints.sitemap}`,
    `robots.txt: ${endpoints.robots}`,
    `llms.txt: ${endpoints.llms}`,
    "",
    `Published policies: ${policyCount}`,
  ];

  if (samples.length > 0) {
    lines.push("", "Recent:");
    for (const policy of samples) {
      lines.push(`• ${policy.title} — ${policy.url}`);
    }
  }

  return lines.join("\n");
}

const MAX_BODY_CHARS = 12_000;

export function formatLawPolicyFull(policy: LawPolicy): string {
  const header = [
    policy.title,
    `URL: ${policy.url}`,
    policy.category ? `Category: ${policy.category}` : "",
    policy.publishedAt ? `Published: ${formatDate(policy.publishedAt)}` : "",
    "",
    "---",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  let body = htmlToPlainText(policy.body);
  if (body.length > MAX_BODY_CHARS) {
    body = `${body.slice(0, MAX_BODY_CHARS)}\n\n… [policy truncated at ${MAX_BODY_CHARS} chars]`;
  }

  return `${header}\n${body}`.trimEnd();
}
