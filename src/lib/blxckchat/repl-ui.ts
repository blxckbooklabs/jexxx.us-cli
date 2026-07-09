import chalk from "chalk";

import type { Provider } from "./providers/types.js";
import type { BlxckchatTool } from "./tools/types.js";
import { runAgent } from "./agent-loop.js";
import type { ChatMessage } from "./providers/types.js";
import type { StoredProviderConfig } from "./config.js";
import { dispatchSlashCommand, isSlashCommand } from "./ui/slash/handler.js";
import { formatSlashHelp } from "./ui/slash/registry.js";
import { createSession } from "./ui/session/session-store.js";

export interface InteractiveChatOptions {
  providerLabel?: string;
  storedConfig: StoredProviderConfig;
}

const MIN_TERMINAL_COLS = 40;

async function startReadlineFallback(
  provider: Provider,
  tools: BlxckchatTool[],
  providerLabel: string,
  storedConfig: StoredProviderConfig,
): Promise<void> {
  console.log(
    chalk.cyan(
      `[BLXCKCHAT] Interactive mode (readline fallback) — ${providerLabel}. Type /help for commands.\n`,
    ),
  );
  console.log(chalk.dim(formatSlashHelp()));

  const session = createSession();
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
          console.log(
            chalk.cyan(
              `\n[BLXCKCHAT] Now using ${config.provider}/${config.model}\n`,
            ),
          );
        },
        copySnapshot: async () => ({ path: "", copied: false }),
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
      const { response, history } = await runAgent(
        activeProvider,
        tools,
        trimmed,
        session.conversationHistory,
      );
      session.conversationHistory = history;
      if (!activeProvider.chatStream) {
        console.log(response);
      }
      console.log();
    } catch (err) {
      console.error(
        chalk.red(`\n[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`),
      );
    }
    rl.prompt();
  });

  rl.on("close", () => {
    console.log(chalk.dim("\nSession ended."));
    process.exit(0);
  });
}

/**
 * Start the blessed-based interactive BLXCKCHAT terminal UI.
 * Falls back to readline when the terminal is too narrow (< 40 cols).
 */
export async function startInteractiveChat(
  provider: Provider,
  tools: BlxckchatTool[],
  options: InteractiveChatOptions,
): Promise<void> {
  const cols = process.stdout.columns ?? 80;
  const providerLabel = options.providerLabel ?? "BLXCKCHAT";

  if (!process.stdout.isTTY) {
    console.error(
      chalk.yellow("[BLXCKCHAT] Non-TTY stdout — using readline fallback."),
    );
    await startReadlineFallback(provider, tools, providerLabel, options.storedConfig);
    return;
  }

  if (cols < MIN_TERMINAL_COLS) {
    console.error(
      chalk.yellow(
        `[BLXCKCHAT] Terminal too narrow (${cols} cols, need ${MIN_TERMINAL_COLS}+). Using readline fallback.`,
      ),
    );
    await startReadlineFallback(provider, tools, providerLabel, options.storedConfig);
    return;
  }

  const { startTerminalChat } = await import("./ui/terminal.js");
  await startTerminalChat(provider, tools, {
    providerLabel,
    toolCount: tools.length,
    storedConfig: options.storedConfig,
  });
}