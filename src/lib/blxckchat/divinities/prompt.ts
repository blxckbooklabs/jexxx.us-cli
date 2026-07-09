/** Max persona prompt chars injected into the system message. */
export const MAX_PERSONA_PROMPT_CHARS = 24_000;

/** Pull ```md fenced blocks from the ## Extracts section (canon persona prompts). */
export function extractPersonaPrompt(markdown: string): string {
  const extractsIdx = markdown.search(/^## Extracts\s*$/m);
  const source = extractsIdx >= 0 ? markdown.slice(extractsIdx) : markdown;

  const blocks: string[] = [];
  const fenceRe = /```(?:md|markdown)?\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(source)) !== null) {
    const body = match[1]?.trim();
    if (body) blocks.push(body);
  }

  if (blocks.length > 0) {
    return blocks.join("\n\n---\n\n").slice(0, MAX_PERSONA_PROMPT_CHARS);
  }

  const stripped = markdown
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/\[\[[^\]]+\]\]/g, "")
    .replace(/^>.*$/gm, "")
    .replace(/^## (?:Source Files|Canon Notes)[\s\S]*?(?=^## |\Z)/gm, "")
    .trim();

  return stripped.slice(0, MAX_PERSONA_PROMPT_CHARS);
}

export function parsePersonaMetadata(markdown: string): {
  name: string;
  role?: string;
  type?: string;
} {
  const titleMatch = /^#\s+(.+)$/m.exec(markdown);
  const name = titleMatch?.[1]?.trim() ?? "Unknown";
  const roleMatch = /^- \*\*Role\*\*:\s*(.+)$/m.exec(markdown);
  const typeMatch = /^- \*\*Type\*\*:\s*(.+)$/m.exec(markdown);
  const meta: { name: string; role?: string; type?: string } = { name };
  const role = roleMatch?.[1]?.trim();
  const type = typeMatch?.[1]?.trim();
  if (role) meta.role = role;
  if (type) meta.type = type;
  return meta;
}