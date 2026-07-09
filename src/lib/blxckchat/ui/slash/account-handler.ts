import { fetchAccountSummary } from "../../../account-data/account-query.js";
import { exportVaultToDisk } from "../../../account-data/export-to-disk.js";
import { createAuthenticatedAccountSession } from "../../../account-data/session.js";
import { formatAuthStatusLines, loadCredentials } from "../../../auth.js";
import type { SlashResult } from "./handler.js";

export async function handleAccount(args: string): Promise<SlashResult> {
  const sub = args.trim().toLowerCase();
  const creds = loadCredentials({ quiet: true });

  if (!sub || sub === "status") {
    if (!creds) {
      return {
        handled: true,
        messages: [
          "Vault: not available (not signed in)",
          "Run /auth login to access BLXCKBOOK + NXT account data.",
        ],
      };
    }

    const session = await createAuthenticatedAccountSession();
    if (!session) {
      return {
        handled: true,
        messages: [
          "Signed in but vault client unavailable.",
          "Check SUPABASE_URL and SUPABASE_ANON_KEY in operator .env.",
        ],
      };
    }

    try {
      const summary = await fetchAccountSummary(session);
      const bb = summary.blxckbook;
      const nxt = summary.nxt;
      const dist = Object.entries(bb.relationshipStatusDistribution)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");

      return {
        handled: true,
        messages: [
          ...formatAuthStatusLines(creds),
          "",
          "Vault summary (RLS-scoped):",
          `BLXCKBOOK — ${bb.contacts} contacts, ${bb.journalEntries} journals, ${bb.timelineEvents} timeline events`,
          dist ? `  Status mix: ${dist}` : "  Status mix: (empty)",
          `NXT — ${nxt.profiles} profiles, ${nxt.events} logged events`,
          "",
          "Ask in chat: list my contacts · my journal · who am I dating",
          "Export: /account export blxckbook · /account export nxt · /account export all",
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { handled: true, messages: [`Vault fetch failed: ${msg}`] };
    }
  }

  if (sub === "export" || sub.startsWith("export ")) {
    const targetArg = sub.replace(/^export\s*/, "").trim() || "all";
    const target =
      targetArg === "blxckbook" || targetArg === "nxt" || targetArg === "all"
        ? targetArg
        : "all";

    const result = await exportVaultToDisk(target);
    if (result.error) {
      return { handled: true, messages: [result.error] };
    }
    return {
      handled: true,
      messages: [
        `Vault export saved (${target}):`,
        ...result.paths.map((p) => `  ${p}`),
      ],
    };
  }

  return {
    handled: true,
    messages: [
      "Usage: /account · /account status · /account export [blxckbook|nxt|all]",
      "Requires /auth login. Session /save still exports chat history only.",
    ],
  };
}