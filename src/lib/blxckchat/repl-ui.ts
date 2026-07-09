import chalk from "chalk";

import type { Provider } from "./providers/types.js";
import type { BlxckchatTool } from "./tools/types.js";
import { runAgent } from "./agent-loop.js";
import type { ChatMessage } from "./providers/types.js";

export interface InteractiveChatOptions {
  providerLabel?: string;
}

const MIN_TERMINAL_COLS = 40;

async function startReadlineFallback(
  provider: Provider,
  tools: BlxckchatTool[],
  providerLabel: string,
): Promise<void> {
  console.log(
    chalk.cyan(
      `[BLXCKCHAT] Interactive mode (readline fallback) — ${providerLabel}. Type /exit to quit, /reset to clear.\n`,
    ),
  );

  let conversationHistory: ChatMessage[] = [];

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
    if (trimmed === "/reset") {
      conversationHistory = [];
      console.log(chalk.dim("\n[BLXCKCHAT] Conversation history cleared.\n"));
      rl.prompt();
      return;
    }
    if (!trimmed) {
      rl.prompt();
      return;
    }

    try {
      process.stdout.write(chalk.white("\nblxckchat> "));
      const { response, history } = await runAgent(
        provider,
        tools,
        trimmed,
        conversationHistory,
      );
      conversationHistory = history;
      if (!provider.chatStream) {
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
  options: InteractiveChatOptions = {},
): Promise<void> {
  const cols = process.stdout.columns ?? 80;
  const providerLabel = options.providerLabel ?? "BLXCKCHAT";

  if (!process.stdout.isTTY) {
    console.error(
      chalk.yellow("[BLXCKCHAT] Non-TTY stdout — using readline fallback."),
    );
    await startReadlineFallback(provider, tools, providerLabel);
    return;
  }

  if (cols < MIN_TERMINAL_COLS) {
    console.error(
      chalk.yellow(
        `[BLXCKCHAT] Terminal too narrow (${cols} cols, need ${MIN_TERMINAL_COLS}+). Using readline fallback.`,
      ),
    );
    await startReadlineFallback(provider, tools, providerLabel);
    return;
  }

  const { startTerminalChat } = await import("./ui/terminal.js");
  await startTerminalChat(provider, tools, {
    providerLabel,
    toolCount: tools.length,
  });
}