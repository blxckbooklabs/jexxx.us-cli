/** Remove lines that are only a stray closing paren (streaming/markdown artifact). */
export function stripOrphanParenLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*\)\s*$/.test(line))
    .join("\n");
}

/** Drop lines that look like scattered single-letter streaming garbage. */
export function stripSpacedLetterGarbageLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length < 8) return true;
      const tokens = trimmed.split(/\s+/);
      if (tokens.length < 6) return true;
      const singles = tokens.filter((t) => t.length === 1).length;
      return singles / tokens.length < 0.55;
    })
    .join("\n");
}

export function sanitizeRoleplayProse(text: string): string {
  let out = stripOrphanParenLines(text);
  out = stripSpacedLetterGarbageLines(out);
  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}