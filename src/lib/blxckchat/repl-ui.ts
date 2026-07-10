import chalk from "chalk";

import type { Provider } from "./providers/types.js";
import type { BlxckchatTool } from "./tools/types.js";
import { runAgent } from "./agent-loop.js";
import { getDivinityPersonaById } from "./divinities/source.js";
import { saveLastUsedProvider, type StoredProviderConfig } from "./config.js";
import { dispatchSlashCommand, isSlashCommand } from "./ui/slash/handler.js";
import { formatSlashHelp } from "./ui/slash/registry.js";
import { createSession } from "./ui/session/session-store.js";
import {
  canRunBlessedTui,
  prepareStdinForTui,
  restoreTerminalForReadline,
} from "./ui/tty.js";
import { loadAutosaveSession } from "./ui/session/autosave.js";
import { logCrash } from "./crash-log.js";

export interface InteractiveChatOptions {
  providerLabel?: string;
  storedConfig: StoredProviderConfig;
  resume?: boolean;
}

const MIN_TERMINAL_COLS = 40;

/** Blessed mouse/key spillover when the TTY was not reset — ignore, do not submit. */
function isSpuriousMouseInput(line: string): boolean {
  if (line.length < 6) return false;
  return /^[CGMF@.,:/\-\d]+$/.test(line) && /C\d|G\d|@\d|M\d/.test(line);
}

async function startReadlineFallback(
  provider: Provider,
  tools: BlxckchatTool[],
  providerLabel: string,
  storedConfig: StoredProviderConfig,
  resume: boolean,
): Promise<void> {
  console.log(
    chalk.cyan(
      `[BLXCKCHAT] Interactive mode (readline fallback) — ${providerLabel}. Type /help for commands.\n`,
    ),
  );
  console.log(chalk.dim(formatSlashHelp()));

  const session = resume ? (loadAutosaveSession() ?? createSession()) : createSession();
  if (resume && session.conversationHistory.length > 0) {
    console.log(
      chalk.dim(
        `[BLXCKCHAT] Resumed autosave (${session.conversationHistory.length} history messages).\n`,
      ),
    );
  }

  let activeConfig = { ...storedConfig };
  let activeProvider = provider;

  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan("you> "),
  });

  rl.prompt();
  rl.on("line", async (line: string) => {
    const trimmed = line.trim();
    if (isSpuriousMouseInput(trimmed)) {
      rl.prompt();
      return;
    }
    if (trimmed === "/exit" || trimmed === "/quit") {
      rl.close();
      return;
    }
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (isSlashCommand(trimmed)) {
      const result = await dispatchSlashCommand(trimmed, {
        session,
        activeConfig,
        toolCount: tools.length,
        setActiveConfig: (config, nextProvider) => {
          activeConfig = config;
          activeProvider = nextProvider;
          saveLastUsedProvider(config);
          console.log(
            chalk.cyan(
              `\n[BLXCKCHAT] Now using ${config.provider}/${config.model}\n`,
            ),
          );
        },
        copySnapshot: async () => ({ path: "", copied: false }),
        onDivinityActivated: () => {
          console.log(chalk.dim("\n[BLXCKCHAT] Divinity switched — chat history cleared.\n"));
        },
      });
      for (const msg of result.messages) {
        console.log(chalk.dim(`\n${msg}\n`));
      }
      if (result.exit) {
        rl.close();
        return;
      }
      rl.prompt();
      return;
    }

    try {
      process.stdout.write(chalk.white("\nblxckchat> "));
      const divinity = session.activeDivinity;
      const personaRecord = divinity ? getDivinityPersonaById(divinity.id) : null;
      const persona =
        personaRecord && divinity
          ? { name: divinity.name, systemPrompt: personaRecord.systemPrompt }
          : undefined;

      const { response, history } = await runAgent(
        activeProvider,
        tools,
        trimmed,
        session.conversationHistory,
        persona ? { persona } : {},
      );
      session.conversationHistory = history;
      if (!activeProvider.chatStream) {
        console.log(response);
      }
      console.log();
    } catch (err) {
      logCrash("readline REPL turn", err);
      console.error(
        chalk.red(
          `\n[ERROR] ${err instanceof Error ? err.message : "Unknown error"} — full trace: ~/.jexxxus/crash.log`,
        ),
      );
    }
    rl.prompt();
  });

  rl.on("close", () => {
    saveLastUsedProvider(activeConfig);
    console.log(chalk.dim("\nSession ended."));
    process.exit(0);
  });
}

/**
 * Start the blessed-based interactive BLXCKCHAT terminal UI.
 * Falls back to readline when the terminal cannot host blessed.
 */
export async function startInteractiveChat(
  provider: Provider,
  tools: BlxckchatTool[],
  options: InteractiveChatOptions,
): Promise<void> {
  const providerLabel = options.providerLabel ?? "BLXCKCHAT";
  const tty = canRunBlessedTui();

  if (!tty.ok) {
    console.error(chalk.yellow(`[BLXCKCHAT] ${tty.reason} — using readline fallback.`));
    await startReadlineFallback(
      provider,
      tools,
      providerLabel,
      options.storedConfig,
      Boolean(options.resume),
    );
    return;
  }

  prepareStdinForTui();

  try {
    const { startTerminalChat } = await import("./ui/terminal.js");
    await startTerminalChat(provider, tools, {
      providerLabel,
      toolCount: tools.length,
      storedConfig: options.storedConfig,
      resume: Boolean(options.resume),
    });
  } catch (err) {
    restoreTerminalForReadline();
    console.error(
      chalk.red(
        `[BLXCKCHAT] TUI failed to start: ${err instanceof Error ? err.message : "Unknown error"}`,
      ),
    );
    if (err instanceof Error && err.stack && process.env.BLXCKCHAT_DEBUG) {
      console.error(chalk.dim(err.stack));
    }
    console.error(chalk.yellow("[BLXCKCHAT] Falling back to readline."));
    await startReadlineFallback(
      provider,
      tools,
      providerLabel,
      options.storedConfig,
      Boolean(options.resume),
    );
  }
}