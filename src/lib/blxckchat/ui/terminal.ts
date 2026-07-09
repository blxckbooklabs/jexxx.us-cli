import blessed from "blessed";

import { runAgent } from "../agent-loop.js";
import type { Provider } from "../providers/types.js";
import type { BlxckchatTool } from "../tools/types.js";
import type { StoredProviderConfig } from "../config.js";
import { loadCredentials } from "../../auth.js";
import { resolveProvider } from "../providers/registry.js";
import { listModelOptions } from "../providers/models.js";

import { createTopBar } from "./components/top-bar.js";
import { createMessageBox } from "./components/message-box.js";
import { createInputBox } from "./components/input-box.js";
import { createStatusBar } from "./components/status-bar.js";
import { createSlashPopup } from "./components/slash-popup.js";
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
import { buildTuISnapshot, buildWelcomeBannerPlain } from "./renderer/plain-text.js";
import {
  copyToClipboard,
  getSnapshotPath,
  writeSnapshot,
} from "./session/tui-snapshot.js";
import { getSlashSuggestions } from "./slash/autocomplete.js";
import { dispatchSlashCommand, isSlashCommand } from "./slash/handler.js";
import { formatSlashHelp } from "./slash/registry.js";
import { bindExitKeys, gracefulTuiExit } from "./exit.js";

export interface TerminalChatOptions {
  providerLabel?: string;
  toolCount?: number;
  storedConfig: StoredProviderConfig;
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

    modal.key(["C-c", "C-d"], () => {
      modal.destroy();
      gracefulTuiExit(screen);
    });

    modal.focus();
    screen.render();
  });
}

export async function startTerminalChat(
  provider: Provider,
  tools: BlxckchatTool[],
  options: TerminalChatOptions,
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

  let activeConfig: StoredProviderConfig = { ...options.storedConfig };
  let activeProvider: Provider = provider;

  let topBar!: ReturnType<typeof createTopBar>;
  let messageBox!: ReturnType<typeof createMessageBox>;
  let statusBar!: ReturnType<typeof createStatusBar>;
  let inputBox!: ReturnType<typeof createInputBox>;
  const slashPopup = createSlashPopup(screen);

  let cachedModelOptions = await listModelOptions(activeConfig);

  const syncSnapshot = (): void => {
    const snapshot = buildTuISnapshot({
      width: (screen.width as number) || 80,
      topBar: topBar.getPlainText(),
      messages: messageBox.getPlainText(),
      statusBar: statusBar.getPlainText(),
      input: inputBox.getPlainText(),
    });
    writeSnapshot(snapshot);
  };

  const copySnapshot = async (): Promise<{ path: string; copied: boolean }> => {
    const snapshot = buildTuISnapshot({
      width: (screen.width as number) || 80,
      topBar: topBar.getPlainText(),
      messages: messageBox.getPlainText(),
      statusBar: statusBar.getPlainText(),
      input: inputBox.getPlainText(),
    });
    const path = writeSnapshot(snapshot);
    const copied = await copyToClipboard(snapshot);
    return { path, copied };
  };

  const onSnapshotUpdate = (): void => {
    syncSnapshot();
  };

  const setActiveConfig = (config: StoredProviderConfig, nextProvider: Provider): void => {
    activeConfig = config;
    activeProvider = nextProvider;
    topBar.setSubtitle(`${config.provider}/${config.model}`);
    void listModelOptions(activeConfig).then((opts) => {
      cachedModelOptions = opts;
    });
  };

  topBar = createTopBar(screen, { onUpdate: onSnapshotUpdate });
  messageBox = createMessageBox(screen, { onUpdate: onSnapshotUpdate });
  statusBar = createStatusBar(screen, { onUpdate: onSnapshotUpdate });

  let isProcessing = false;
  let inputHasFocus = true;

  const handleSubmit = async (line: string): Promise<void> => {
    if (isProcessing) return;

    const trimmed = line.trim();
    if (!trimmed) return;

    inputBox.hideSlashPopup();

    if (isSlashCommand(trimmed)) {
      const result = await dispatchSlashCommand(trimmed, {
        session,
        activeConfig,
        toolCount,
        setActiveConfig,
        copySnapshot,
      });
      for (const msg of result.messages) {
        messageBox.appendSystem(msg);
      }
      if (result.exit) {
        gracefulTuiExit(screen);
      }
      statusBar.setMessage("Ready — type / for commands");
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
      statusBar.setMessage("Ready — type / for commands");
    };

    try {
      const { response, history } = await runAgent(
        activeProvider,
        tools,
        trimmed,
        session.conversationHistory,
        {
          onStream: (chunk) => {
            streamBuffer.append(chunk);
            messageBox.updateAssistantStream(
              assistantBlockIndex,
              formatStreamingChunk(streamBuffer.getContent()),
              streamBuffer.getContent(),
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

  const requestExit = (): void => gracefulTuiExit(screen);

  inputBox = createInputBox(
    screen,
    (line) => {
      void handleSubmit(line);
    },
    {
      onUpdate: onSnapshotUpdate,
      onExit: requestExit,
      slashPopup,
      getSlashSuggestions: (value) =>
        getSlashSuggestions(value, {
          activeConfig,
          modelOptions: cachedModelOptions,
        }),
    },
  );

  bindExitKeys(
    screen,
    [screen, inputBox.element, messageBox.element],
    () => {
      if (slashPopup.isVisible()) {
        inputBox.hideSlashPopup();
        return true;
      }
      return false;
    },
  );

  inputBox.element.on("focus", () => {
    inputHasFocus = true;
  });
  inputBox.element.on("blur", () => {
    inputHasFocus = false;
  });

  messageBox.appendWelcome(buildWelcomeBannerPlain(authEmail, toolCount));
  topBar.setSubtitle(options.providerLabel ?? `${activeConfig.provider}/${activeConfig.model}`);

  const snapshotPath = getSnapshotPath();
  statusBar.setMessage(
    `Type / for commands · snapshot: ${snapshotPath}`,
  );
  messageBox.appendSystem(formatSlashHelp());
  syncSnapshot();

  screen.key(["q"], () => {
    if (!inputHasFocus) {
      gracefulTuiExit(screen);
    }
  });

  screen.key(["C-s"], () => {
    const path = exportSessionToFile(session);
    statusBar.setMessage(`Session saved to ${path}`);
    messageBox.appendSystem(`Session exported to ${path}`);
  });

  screen.key(["C-y"], async () => {
    const { path, copied } = await copySnapshot();
    const hint = copied ? "TUI copied to clipboard" : `Snapshot: ${path}`;
    statusBar.setMessage(hint);
    messageBox.appendSystem(
      copied ? `TUI copied to clipboard (${path})` : `TUI snapshot: ${path}`,
    );
  });

  screen.key(["space"], () => {
    if (!inputHasFocus) {
      messageBox.toggleFocusedThinking();
    }
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