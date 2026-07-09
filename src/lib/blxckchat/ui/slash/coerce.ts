import { BUILTIN_SLASH_COMMANDS } from "./registry.js";
import { fuzzyFilter, fuzzyScore } from "./fuzzy.js";
import { parseSlashInput } from "./handler.js";

function canonicalCommandName(token: string): string {
  const cmd = BUILTIN_SLASH_COMMANDS.find(
    (c) => c.name === token || (c.aliases ?? []).includes(token),
  );
  return cmd?.name ?? token;
}

/** Expand partial slash commands (e.g. /mod → /model) before dispatch. */
export function coerceSlashLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) return line;

  const { command } = parseSlashInput(trimmed);
  if (command) return trimmed;

  const body = trimmed.slice(1);
  const spaceIdx = body.indexOf(" ");
  const token = spaceIdx === -1 ? body : body.slice(0, spaceIdx);
  const argPart = spaceIdx === -1 ? "" : body.slice(spaceIdx + 1).trim();

  const entries = BUILTIN_SLASH_COMMANDS.flatMap((cmd) => {
    const rows: Array<{ name: string }> = [{ name: cmd.name }];
    for (const alias of cmd.aliases ?? []) {
      rows.push({ name: alias });
    }
    return rows;
  });

  const matches = fuzzyFilter(entries, token, (e) => e.name, 8);
  if (matches.length === 0) return trimmed;

  const ranked = matches
    .map((match) => ({
      canonical: canonicalCommandName(match.name),
      score: fuzzyScore(token, match.name),
    }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0]!;
  const runnerUp = ranked.find((r) => r.canonical !== top.canonical);
  if (runnerUp && top.score <= runnerUp.score) return trimmed;

  const cmdName = top.canonical;
  return argPart ? `/${cmdName} ${argPart}` : `/${cmdName}`;
}