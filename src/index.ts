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

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Unexpected CLI failure";
  console.error(chalk.red(`[ERROR] ${message}`));
  process.exit(1);
});
