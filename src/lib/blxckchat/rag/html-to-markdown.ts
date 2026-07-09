/**
 * Converts RSS content:encoded HTML (rendered from markdown at build time)
 * back into a markdown-ish text the existing H2-boundary chunker can split
 * consistently, whether the source is a local .md file or a remote feed.
 */
export function htmlToMarkdownish(html: string): string {
  return html
    .replace(/<h2[^>]*>/gi, "\n\n## ")
    .replace(/<\/h2>/gi, "\n")
    .replace(/<h3[^>]*>/gi, "\n\n### ")
    .replace(/<\/h3>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|ul|ol|table|tr|thead|tbody)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<strong>|<\/strong>/gi, "**")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
