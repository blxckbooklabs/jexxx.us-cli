import blessed from "blessed";

import { runAgent } from "../agent-loop.js";
import type { Provider } from "../providers/types.js";
import type { BlxckchatTool } from "../tools/types.js";
import { loadCredentials } from "../../auth.js";

import { createTopBar } from "./components/top-bar.js";
import { createMessageBox } from "./components/message-box.js";
import { createInputBox } from "./components/input-box.js";
import { createStatusBar } from "./components/status-bar.js";
import {
  createSession,
  addUserMessage,
  addAssistantMessage,
  addToolResult,
  updateToolResult,
  exportSessionToFile,
  type TerminalSession,
  type ToolStatus,
} from "./session/session-store.js";
import { StreamBuffer, formatStreamingChunk } from "./renderer/streaming.js";
import { extractThinkingBlocks } from "./components/thinking-block.js";

export interface TerminalChatOptions {
  providerLabel?: string;
  toolCount?: number;
}

function truncateEmail(email: string, maxLen = 18): string {
  if (email.length <= maxLen) return email;
  return `${email.slice(0, maxLen - 3)}...`;
}

function buildWelcomeBanner(authEmail: string, toolCount: number): string {
  const email = truncateEmail(authEmail || "operator");
  const inner = [
    "  Welcome to the kingdom.",
    "",
    `  You are authenticated as ${email}`,
    `  BLXCKCHAT loaded with ${toolCount} tools.`,
    "",
    "  Type a message to begin, or",
    "  /help for commands.",
  ];
  const width = 42;
  const lines = [
    `╔${"═".repeat(width - 2)}╗`,
    ...inner.map((line) => {
      const padded = line.padEnd(width - 4);
      return `║${padded}║`;
    }),
    `╚${"═".repeat(width - 2)}╝`,
  ];
  return `{#ec4899-fg}${lines.join("\n")}{/}`;
}

function createBlessedConfirm(
  screen: blessed.Widgets.Screen,
  toolName: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  return new Promise((resolve) => {
    const argsPreview = JSON.stringify(args, null, 2).slice(0, 400);
    const modal = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: "80%",
      height: 12,
      border: { type: "line" },
      tags: true,
      label: " Confirm Tool ",
      style: {
        fg: "white",
        bg: "#1a1a1a",
        border: { fg: "yellow" },
      },
      content: [
        `{yellow-fg}BLXCKCHAT wants to run:{/yellow-fg} {bold}${toolName}{/bold}`,
        "",
        `{gray-fg}${argsPreview.replace(/\{/g, "{open}")}{/gray-fg}`,
        "",
        "{cyan-fg}Press Y to allow, N to decline{/cyan-fg}",
      ].join("\n"),
    });

    modal.key(["y", "Y"], () => {
      modal.destroy();
      screen.render();
      resolve(true);
    });

    modal.key(["n", "N", "escape"], () => {
      modal.destroy();
      screen.render();
      resolve(false);
    });

    modal.focus();
    screen.render();
  });
}

export async function startTerminalChat(
  provider: Provider,
  tools: BlxckchatTool[],
  options: TerminalChatOptions = {},
): Promise<void> {
  const screen = blessed.screen({
    smartCSR: true,
    title: "BLXCKCHAT",
    fullUnicode: true,
  });

  const session: TerminalSession = createSession();
  const creds = loadCredentials();
  const toolCount = options.toolCount ?? tools.length;
  const authEmail = creds?.email ?? "not authenticated";

  const topBar = createTopBar(screen);
  const messageBox = createMessageBox(screen);
  const statusBar = createStatusBar(screen);

  let isProcessing = false;
  let inputHasFocus = true;

  const handleSubmit = async (line: string): Promise<void> => {
    if (isProcessing) return;

    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed === "/exit" || trimmed === "/quit") {
      screen.destroy();
      process.exit(0);
    }

    if (trimmed === "/reset") {
      session.conversationHistory = [];
      session.messages = [];
      session.toolResults = [];
      session.thinkingBlocks = [];
      messageBox.appendSystem("Conversation history cleared.");
      statusBar.setMessage("History cleared — type a new message");
      return;
    }

    if (trimmed === "/help") {
      messageBox.appendSystem(
        "Commands: /help, /reset, /exit. Shortcuts: Ctrl+C/Q/Esc exit, Ctrl+S save, Space toggle thinking, ↑↓ scroll.",
      );
      return;
    }

    isProcessing = true;
    statusBar.setMessage("Thinking...");
    addUserMessage(session, trimmed);
    messageBox.appendUser(trimmed);

    const assistantBlockIndex = messageBox.appendAssistantStart();
    const streamBuffer = new StreamBuffer();

    const showToolPending = (toolName: string): void => {
      addToolResult(session, toolName, "Running...", "pending");
      statusBar.setMessage(`⏳ Running tool: ${toolName}...`);
    };

    const showToolComplete = (
      toolName: string,
      result: string,
      status: ToolStatus,
    ): void => {
      const entry = updateToolResult(session, toolName, result, status);
      if (entry) {
        messageBox.appendTools([entry]);
      }
      statusBar.setMessage("Ready — Ctrl+S to save session");
    };

    try {
      const { response, history } = await runAgent(
        provider,
        tools,
        trimmed,
        session.conversationHistory,
        {
          onStream: (chunk) => {
            streamBuffer.append(chunk);
            messageBox.updateAssistantStream(
              assistantBlockIndex,
              formatStreamingChunk(streamBuffer.getContent()),
            );
          },
          onToolStart: showToolPending,
          onToolComplete: showToolComplete,
          confirmToolCall: (toolName, args) =>
            createBlessedConfirm(screen, toolName, args),
        },
      );

      session.conversationHistory = history;

      const parsed = extractThinkingBlocks(response);
      session.thinkingBlocks.push(...parsed.blocks);

      const visible =
        parsed.visibleContent || streamBuffer.getContent() || response;
      addAssistantMessage(session, visible);
      messageBox.finalizeAssistant(
        assistantBlockIndex,
        visible,
        parsed.blocks,
      );

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      messageBox.appendError(`[ERROR] ${msg}`);
      statusBar.setMessage(`Error: ${msg}`);
    } finally {
      isProcessing = false;
      inputBox.focus();
    }
  };

  const inputBox = createInputBox(screen, (line) => {
    void handleSubmit(line);
  });

  inputBox.element.on("focus", () => {
    inputHasFocus = true;
  });
  inputBox.element.on("blur", () => {
    inputHasFocus = false;
  });

  messageBox.appendWelcome(buildWelcomeBanner(authEmail, toolCount));
  topBar.setSubtitle(options.providerLabel ?? "Interactive mode");

  screen.key(["escape", "q", "C-c"], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(["C-s"], () => {
    const path = exportSessionToFile(session);
    statusBar.setMessage(`Session saved to ${path}`);
    messageBox.appendSystem(`Session exported to ${path}`);
  });

  screen.key(["space"], () => {
    messageBox.toggleFocusedThinking();
  });

  screen.key(["up"], () => {
    if (!inputHasFocus) {
      messageBox.scrollUp();
    }
  });

  screen.key(["down"], () => {
    if (!inputHasFocus) {
      messageBox.scrollDown();
    }
  });

  inputBox.focus();
  screen.render();

  await new Promise<void>(() => {
    // Keep process alive until exit shortcut
  });
}