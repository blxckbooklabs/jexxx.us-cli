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

function printBanner(): void {
  const jexxxusArt = figlet.textSync("JEXXXUS", { font: "Slant" });
  console.log(
    gradient(["#FF1A8C", "#FFB6C1", "#E11D8A", "#FF69B4"])(jexxxusArt),
  );
  console.log(
    gradient(["#FF1A8C", "#FFB6C1"])(
      "                            Welcome to the Vault.\n",
    ),
  );
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
  .hook("preAction", () => {
    printBanner();
  });

// Show banner before displaying help when no command is given
if (process.argv.length < 3) {
  printBanner();
}

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

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Unexpected CLI failure";
  console.error(chalk.red(`[ERROR] ${message}`));
  process.exit(1);
});
