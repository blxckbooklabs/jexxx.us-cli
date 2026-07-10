#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import figlet from "figlet";
import gradient from "gradient-string";
import * as fs from "fs";

import { importContacts } from "./lib/contacts.js";
import { parseCsvFile, rowsToContacts } from "./lib/csv.js";
import { runDoctorFromEnv } from "./lib/doctor.js";
import { loadOperatorEnv } from "./lib/env.js";
import { getImportOwnerError } from "./lib/guards.js";
import {
  createNotificationsClient,
  sendSystemNotification,
  type NotificationType,
} from "./lib/notifications.js";
import {
  getBibleSections,
  getBibleBooks,
  getBibleChapters,
  getBibleVerses,
  getVerse,
  getChapter,
  findBook,
  findVerse,
} from "./lib/bible.js";
import { createOperatorClient } from "./lib/supabase.js";
import type { DashboardTarget } from "./lib/supabase.js";
import {
  listProvidersRedacted,
  resolveStartupProvider,
  runConfigureFlow,
} from "./lib/blxckchat/config.js";
import { resolveProvider } from "./lib/blxckchat/providers/registry.js";
import { buildToolRegistry } from "./lib/blxckchat/tools/registry.js";
import { runAgent } from "./lib/blxckchat/agent-loop.js";
import { startInteractiveChat } from "./lib/blxckchat/repl-ui.js";
import { logCrash } from "./lib/blxckchat/crash-log.js";
import {
  loadCredentials,
  saveCredentials,
  deleteCredentials,
  getTokenExpiryMinutes,
  promptYesNo,
  runInteractiveDeviceLogin,
  refreshAccessTokenViaServer,
} from "./lib/auth.js";

function printBanner(): void {
  const jexxxusArt = figlet.textSync("JEXXXUS", { font: "Slant" });
  console.log(
    gradient(["#FF1A8C", "#FFB6C1", "#E11D8A", "#FF69B4"])(jexxxusArt),
  );
  const welcomeMessages = [
    "Welcome to the kingdom.",
    "Welcome to the garden.",
  ];
  const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
  console.log(
    gradient(["#FF1A8C", "#FFB6C1"])(
      `                            ${randomMessage}\n`,
    ),
  );
}

interface BlxckchatInvocationOptions {
  provider?: string;
  shell?: boolean;
  resume?: boolean;
}

async function launchBlxckchat(
  prompt: string | undefined,
  options: BlxckchatInvocationOptions,
): Promise<void> {
  const storedConfig = resolveStartupProvider(options.provider);

  if (!storedConfig) {
    console.error(
      chalk.red(
        "[ERROR] No BLXCKCHAT provider configured yet. Run 'jexxxus blxckchat configure' first."
      )
    );
    process.exit(1);
  }

  const provider = resolveProvider(storedConfig);
  const authed = Boolean(loadCredentials({ quiet: true }));
  const tools = buildToolRegistry({
    allowShell: Boolean(options.shell),
    includeAccountQuery: authed,
  });

  if (options.shell) {
    console.log(
      chalk.yellow(
        "[BLXCKCHAT] Shell access enabled for this session. Every command still requires confirmation and is checked against a hard-blocked pattern list."
      )
    );
  }

  if (prompt) {
    const { response } = await runAgent(provider, tools, prompt);
    console.log(chalk.white(`\n${response}\n`));
    process.exit(0);
  }

  // Interactive blessed terminal UI — conversationHistory persists across
  // turns within this process. Falls back to readline on narrow/non-TTY
  // terminals. One-shot mode above stays intentionally stateless.
  await startInteractiveChat(provider, tools, {
    providerLabel: `${storedConfig.provider}/${storedConfig.model}`,
    storedConfig,
    resume: Boolean(options.resume),
  });
}

function requireOperatorClient(target: DashboardTarget = "blxckbook") {
  const env = loadOperatorEnv();
  if (!env) {
    console.error(
      chalk.red(
        "[ERROR] Missing operator credentials. Copy .env.example to .env and configure locally.",
      ),
    );
    process.exit(1);
  }
  return createOperatorClient(env, target);
}

const program = new Command();

program
  .name("jexxxus")
  .description("JEXXXUS CLI — unified control plane for the JEXXXUS Ecosystem")
  .version("1.0.0")
  .argument("[prompt]", "One-shot prompt for BLXCKCHAT. Omit to enter interactive REPL mode.")
  .option("-p, --provider <name>", "Named provider config to use for this invocation")
  .option("--resume", "Resume the last autosaved BLXCKCHAT session")
  .option("--shell", "Opt in to shell access for this session (off by default; every call still requires confirmation and is checked against a hard blocklist)")
  .hook("preAction", (_thisCommand, actionCommand) => {
    // Interactive BLXCKCHAT TUI owns the screen — figlet banner on stdout
    // breaks blessed init and flashes back to the shell. This applies both
    // to the bare `jexxxus` default action and the explicit `blxckchat`
    // subcommand, since both launch the same interactive agent.
    const isAgentLaunch =
      actionCommand.name() === "blxckchat" || actionCommand.name() === "jexxxus";
    if (isAgentLaunch && actionCommand.args.length === 0) {
      return;
    }
    printBanner();
  })
  .action(async (prompt: string | undefined, options: BlxckchatInvocationOptions) => {
    await launchBlxckchat(prompt, options);
  });

const doctorCmd = program
  .command("doctor")
  .description(
    "Verify operator credentials and connectivity to JEXXXUS datastores",
  )
  .option(
    "-t, --target <dashboard>",
    "Target a specific dashboard: blxckbook (default) or nxt. Omitting checks both.",
  )
  .action(async (options: { target?: DashboardTarget }) => {
    const report = await runDoctorFromEnv(options.target);

    for (const check of report.checks) {
      const label = check.ok ? chalk.green("[OK]") : chalk.red("[FAIL]");
      console.log(`${label} ${check.name}: ${check.detail}`);
    }

    process.exit(report.ok ? 0 : 1);
  });

const authCmd = program
  .command("auth")
  .description("Manage CLI authentication (Clerk device flow)");

authCmd
  .command("login")
  .description("Authenticate CLI via Clerk (device authorization flow)")
  .action(async () => {
    try {
      const credentials = await runInteractiveDeviceLogin();
      saveCredentials(credentials);

      console.log(chalk.green(`\n[SUCCESS] Authenticated as ${credentials.email}.`));
      process.exit(0);
    } catch (err) {
      console.error(
        chalk.red(`\n[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`)
      );
      process.exit(1);
    }
  });

authCmd
  .command("status")
  .description("Show current authentication status")
  .action(() => {
    try {
      const creds = loadCredentials();
      if (!creds) {
        console.log(chalk.yellow("[AUTH] Not authenticated. Run: jexxxus auth login"));
        process.exit(0);
      }

      const expiryMinutes = getTokenExpiryMinutes(creds);
      const expiryStatus = expiryMinutes < 0
        ? chalk.red("EXPIRED")
        : expiryMinutes < 5
          ? chalk.yellow(`${Math.floor(expiryMinutes)}m remaining`)
          : chalk.green(`${Math.floor(expiryMinutes)}m remaining`);

      console.log(chalk.green("[AUTH] Authenticated"));
      console.log(`  Email: ${creds.email}`);
      console.log(`  User ID: ${creds.userId}`);
      console.log(`  Token expires: ${expiryStatus}`);
      console.log(`  Last refreshed: ${new Date(creds.refreshedAt).toLocaleString()}`);
      process.exit(0);
    } catch (err) {
      console.error(
        chalk.red(`[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`)
      );
      process.exit(1);
    }
  });

authCmd
  .command("logout")
  .description("Revoke CLI authentication (delete stored credentials)")
  .action(async () => {
    try {
      const creds = loadCredentials();
      if (!creds) {
        console.log(chalk.yellow("[AUTH] Not authenticated."));
        process.exit(0);
      }

      const confirmed = await promptYesNo(
        chalk.yellow("Revoke authentication and delete stored credentials?")
      );
      if (!confirmed) {
        console.log(chalk.dim("Cancelled."));
        process.exit(0);
      }

      deleteCredentials();
      console.log(chalk.green("[AUTH] Credentials deleted. Run 'jexxxus auth login' to re-authenticate."));
      process.exit(0);
    } catch (err) {
      console.error(
        chalk.red(`[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`)
      );
      process.exit(1);
    }
  });

authCmd
  .command("refresh")
  .description("Manually refresh access token")
  .action(async () => {
    try {
      const creds = loadCredentials();
      if (!creds) {
        console.error(chalk.red("[ERROR] Not authenticated. Run: jexxxus auth login"));
        process.exit(1);
      }

      const refreshed = await refreshAccessTokenViaServer(creds.refreshToken);
      saveCredentials(refreshed);

      console.log(chalk.green(`[SUCCESS] Token refreshed for ${refreshed.email}.`));
      process.exit(0);
    } catch (err) {
      console.error(
        chalk.red(`[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`)
      );
      process.exit(1);
    }
  });

program
  .command("import")
  .description("Import contacts from a CSV file into a JEXXXUS dashboard")
  .argument("<file>", "Path to the CSV file")
  .option("-f, --force", "Skip duplicate rows and import the rest")
  .option(
    "-u, --user <userId>",
    "Vault account (user_id) to own the imported profiles. Required for production imports.",
    "SYSTEM",
  )
  .option(
    "--allow-system-user",
    "Permit the default SYSTEM owner (dev/test only)",
  )
  .option(
    "-t, --target <dashboard>",
    "Target dashboard: blxckbook (default) or nxt",
    "blxckbook",
  )
  .action(async (file, options) => {
    const ownerError = getImportOwnerError(
      options.user,
      Boolean(options.allowSystemUser),
    );
    if (ownerError) {
      console.error(chalk.red(`[ERROR] ${ownerError}`));
      process.exit(1);
    }

    if (!fs.existsSync(file)) {
      console.error(chalk.red(`[ERROR] File not found: ${file}`));
      process.exit(1);
    }

    let records;
    try {
      records = await parseCsvFile(file);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown parse error";
      console.error(chalk.red(`[ERROR] Error parsing CSV: ${message}`));
      process.exit(1);
    }

    const targetLabel = options.target === "nxt" ? "NXT" : "BLXCKBOOK";
    console.log(
      chalk.blue(
        `[INFO] Parsed ${records.length} CSV row(s). Importing to ${targetLabel} MAMAbase...`,
      ),
    );

    const { contacts, skippedInvalid } = rowsToContacts(records, options.user);

    if (skippedInvalid > 0) {
      console.log(
        chalk.yellow(
          `[WARN] Skipped ${skippedInvalid} row(s) with empty Name.`,
        ),
      );
    }

    if (contacts.length === 0) {
      console.log(chalk.yellow("[WARN] No valid contacts to import."));
      process.exit(1);
    }

    const supabase = requireOperatorClient(options.target);
    const imported = await importContacts(
      supabase,
      contacts,
      Boolean(options.force),
    );

    if (imported > 0) {
      const schema =
        options.target === "nxt" ? "public.vessels" : "api.contacts";
      console.log(
        chalk.green(
          `[SUCCESS] Imported ${imported} contact(s) into ${schema}.`,
        ),
      );
      process.exit(0);
    }

    if (!options.force) {
      console.log(
        chalk.yellow("[WARN] Duplicate entry detected in batch import."),
      );
      console.log(
        chalk.yellow("Use --force to skip duplicates and import the rest."),
      );
    }

    process.exit(1);
  });

program
  .command("notify")
  .description(
    "Push a system notification into a user's bell in either dashboard (Realtime, no refresh needed)",
  )
  .requiredOption("-u, --user <clerkUserId>", "Recipient's Clerk user id")
  .requiredOption("-m, --message <text>", "Notification message")
  .option(
    "-y, --type <type>",
    "Notification type: info (default), success, warning, or error",
    "info",
  )
  .action(async (options: { user: string; message: string; type: string }) => {
    const validTypes: NotificationType[] = [
      "info",
      "success",
      "warning",
      "error",
    ];
    if (!validTypes.includes(options.type as NotificationType)) {
      console.error(
        chalk.red(
          `[ERROR] --type must be one of: ${validTypes.join(", ")}`,
        ),
      );
      process.exit(1);
    }

    const env = loadOperatorEnv();
    if (!env) {
      console.error(
        chalk.red(
          "[ERROR] Missing operator credentials. Copy .env.example to .env and configure locally.",
        ),
      );
      process.exit(1);
    }

    const client = createNotificationsClient(env);
    const result = await sendSystemNotification(client, {
      recipientUserId: options.user,
      message: options.message,
      type: options.type as NotificationType,
    });

    if (!result.ok) {
      console.error(chalk.red(`[ERROR] ${result.error}`));
      process.exit(1);
    }

    console.log(
      chalk.green(
        `[SUCCESS] Notification sent to ${options.user} (visible in both dashboards).`,
      ),
    );
    process.exit(0);
  });

const bibleCmd = program
  .command("bible")
  .description("Query the Obsidian Bible vault (verses, chapters, books, sections)");

bibleCmd
  .command("section")
  .description("List all major sections (Torah, Historical, Poetic, etc.)")
  .action(() => {
    try {
      const sections = getBibleSections();
      console.log(chalk.green("[Bible Sections]"));
      sections.forEach((section) => {
        const cleanName = section.replace(/^\d{2}-/, "");
        console.log(`  • ${cleanName} (${section})`);
      });
      process.exit(0);
    } catch (err) {
      console.error(
        chalk.red(
          `[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`
        )
      );
      process.exit(1);
    }
  });

bibleCmd
  .command("book <section>")
  .description("List all books in a section")
  .action((section: string) => {
    try {
      const books = getBibleBooks(section);
      console.log(chalk.green(`[Books in ${section}]`));
      books.forEach((book) => {
        const cleanName = book.replace(/^\d{2}-/, "");
        console.log(`  • ${cleanName}`);
      });
      process.exit(0);
    } catch (err) {
      console.error(
        chalk.red(
          `[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`
        )
      );
      process.exit(1);
    }
  });

bibleCmd
  .command("chapter <section> <book>")
  .description("List all chapters in a book")
  .action((section: string, book: string) => {
    try {
      const chapters = getBibleChapters(section, book);
      console.log(chalk.green(`[Chapters in ${book}]`));
      chapters.forEach((ch) => {
        const chNum = ch.replace("Chapter ", "");
        console.log(`  • Chapter ${chNum}`);
      });
      process.exit(0);
    } catch (err) {
      console.error(
        chalk.red(
          `[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`
        )
      );
      process.exit(1);
    }
  });

bibleCmd
  .command("verse <book> <chapter> <verse>")
  .description("Get a specific verse (e.g., Genesis 1 1)")
  .action((book: string, chapter: string, verse: string) => {
    try {
      const bookInfo = findBook(book);
      if (!bookInfo) {
        console.error(chalk.red(`[ERROR] Book not found: ${book}`));
        process.exit(1);
      }
      const verseData = getVerse(
        bookInfo.section,
        bookInfo.book,
        `Chapter ${chapter}`,
        `${chapter}-${verse}.md`
      );
      console.log(chalk.blue(`${book} ${chapter}:${verse}`));
      console.log(chalk.dim("─".repeat(60)));
      console.log(verseData.text);
      console.log(chalk.dim("─".repeat(60)));
      if (verseData.canon) {
        console.log(chalk.gray(`Canon: ${verseData.canon}`));
      }
      process.exit(0);
    } catch (err) {
      console.error(
        chalk.red(
          `[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`
        )
      );
      process.exit(1);
    }
  });

bibleCmd
  .command("query <query>")
  .description("Query a verse (e.g., \"Genesis 1:1\" or \"John 3 16\")")
  .action((query: string) => {
    try {
      const verseData = findVerse(query);
      if (!verseData) {
        console.error(chalk.red(`[ERROR] Verse not found: ${query}`));
        process.exit(1);
      }
      console.log(
        chalk.blue(
          `${verseData.book} ${verseData.chapter}:${verseData.verse}`
        )
      );
      console.log(chalk.dim("─".repeat(60)));
      console.log(verseData.text);
      console.log(chalk.dim("─".repeat(60)));
      if (verseData.canon) {
        console.log(chalk.gray(`Canon: ${verseData.canon}`));
      }
      process.exit(0);
    } catch (err) {
      console.error(
        chalk.red(
          `[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`
        )
      );
      process.exit(1);
    }
  });

const blxckchatCmd = program
  .command("blxckchat")
  .description(
    "BLXCKCHAT — the native AI agent for the JEXXXUS kingdom/garden. Bring your own LLM (Anthropic, OpenAI, or local Ollama)."
  );

blxckchatCmd
  .command("configure")
  .description("Set up an LLM provider (Anthropic, OpenAI, or Ollama) for BLXCKCHAT")
  .option("-l, --list", "List configured providers (API keys redacted)")
  .action(async (options: { list?: boolean }) => {
    if (options.list) {
      const providers = listProvidersRedacted();
      if (providers.length === 0) {
        console.log(chalk.yellow("No providers configured yet. Run 'jexxxus blxckchat configure'."));
        process.exit(0);
      }
      console.log(chalk.green("[Configured Providers]"));
      providers.forEach((p) => {
        const defaultTag = p.isDefault ? chalk.cyan(" (default)") : "";
        const keyStatus = p.hasKey ? "key set" : "no key (local)";
        console.log(`  • ${p.name}: ${p.provider}/${p.model} — ${keyStatus}${defaultTag}`);
      });
      process.exit(0);
    }

    try {
      await runConfigureFlow();
      process.exit(0);
    } catch (err) {
      console.error(
        chalk.red(`[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`)
      );
      process.exit(1);
    }
  });

blxckchatCmd
  .argument("[prompt]", "One-shot prompt for BLXCKCHAT. Omit to enter interactive REPL mode.")
  .option("-p, --provider <name>", "Named provider config to use for this invocation")
  .option("--resume", "Resume the last autosaved BLXCKCHAT session")
  .option("--shell", "Opt in to shell access for this session (off by default; every call still requires confirmation and is checked against a hard blocklist)")
  .action(async (prompt: string | undefined, options: BlxckchatInvocationOptions) => {
    await launchBlxckchat(prompt, options);
  });

program
  .command("shell")
  .description("Show the JEXXXUS CLI command list (non-interactive) — bare 'jexxxus' now opens BLXCKCHAT directly.")
  .action(() => {
    program.outputHelp();
  });

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Unexpected CLI failure";
  logCrash("top-level CLI failure", err);
  console.error(chalk.red(`[ERROR] ${message} — full trace: ~/.jexxxus/crash.log`));
  process.exit(1);
});
