import type { MusicCatalogEntry, MusicPublicEndpoints } from "../../music.js";

export function formatMusicCatalogList(
  entries: MusicCatalogEntry[],
  total: number,
): string {
  if (entries.length === 0) {
    return "No JEXXXUS Music catalog entries matched.";
  }

  const lines = [
    `JEXXXUS Music (${entries.length} shown${total > entries.length ? ` of ${total}` : ""}):`,
    "",
  ];

  for (const [i, entry] of entries.entries()) {
    lines.push(`${i + 1}. ${entry.title} [${entry.category}]`);
    lines.push(`   Link: [${entry.title}](${entry.url})`);
    lines.push(`   URL (copy exactly): ${entry.url}`);
    if (entry.description) lines.push(`   ${entry.description}`);
    lines.push("");
  }

  lines.push(
    "Beats and kits are licensed via Traktrain — use action=get with slug for detail, or action=discover for llms.txt.",
  );
  return lines.join("\n").trimEnd();
}

export function formatMusicEntryFull(entry: MusicCatalogEntry): string {
  const lines = [
    entry.title,
    `Category: ${entry.category}`,
    `URL: ${entry.url}`,
    `Slug: ${entry.slug}`,
    "",
    entry.description,
    "",
    "---",
    "",
    "Listen & browse:",
    `• Beat store: https://music.jexxx.us/#beats`,
    `• Sound kits: https://music.jexxx.us/#kits`,
    `• Traktrain catalog: https://traktrain.com/a/cruciflyrecords`,
    `• Docs: https://docs.jexxx.us/music`,
  ];
  if (entry.tags?.length) {
    lines.push("", `Tags: ${entry.tags.join(", ")}`);
  }
  return lines.join("\n");
}

export function formatMusicEntryMeta(
  entry: MusicCatalogEntry,
  endpoints: MusicPublicEndpoints,
): string {
  const lines = [
    entry.title,
    `URL: ${entry.url}`,
    `Slug: ${entry.slug}`,
    `Category: ${entry.category}`,
    entry.description ? `Description: ${entry.description}` : "",
    "",
    "Public discovery:",
    `Site: ${endpoints.site}`,
    `Docs: ${endpoints.docs}`,
    `RSS: ${endpoints.feed}`,
    `llms.txt: ${endpoints.llms}`,
  ].filter((line) => line !== "");
  return lines.join("\n");
}

export function formatMusicDiscover(
  endpoints: MusicPublicEndpoints,
  catalogCount: number,
  samples: MusicCatalogEntry[],
  llmsExcerpt?: string | null,
): string {
  const lines = [
    "JEXXXUS Music public endpoints:",
    `Site: ${endpoints.site}`,
    `Docs: ${endpoints.docs}`,
    `RSS: ${endpoints.feed}`,
    `Sitemap: ${endpoints.sitemap}`,
    `robots.txt: ${endpoints.robots}`,
    `llms.txt: ${endpoints.llms}`,
    "",
    `Catalog entries (curated): ${catalogCount}`,
    "Beats/kits: Traktrain widget on music.jexxx.us — no public JSON track list.",
  ];

  if (samples.length > 0) {
    lines.push("", "Key surfaces:");
    for (const entry of samples) {
      lines.push(`• ${entry.title} — ${entry.url}`);
    }
  }

  if (llmsExcerpt) {
    const excerpt =
      llmsExcerpt.length > 2_000
        ? `${llmsExcerpt.slice(0, 2_000)}\n… [llms.txt truncated]`
        : llmsExcerpt;
    lines.push("", "--- llms.txt ---", excerpt);
  }

  return lines.join("\n");
}