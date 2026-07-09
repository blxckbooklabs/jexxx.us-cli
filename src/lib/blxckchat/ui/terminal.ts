import blessed from "blessed";

import { runAgent } from "../agent-loop.js";
import type { Provider } from "../providers/types.js";
import type { BlxckchatTool } from "../tools/types.js";
import type { StoredProviderConfig } from "../config.js";
import { upsertProvider } from "../config.js";
import { loadCredentials } from "../../auth.js";
import { resolveProvider } from "../providers/registry.js";
import { cycleModelOption, listModelOptions } from "../providers/models.js";

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
import { createHotkeysOverlay } from "./components/hotkeys-overlay.js";

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
  const hotkeysOverlay = createHotkeysOverlay(screen);

  let cachedModelOptions = await listModelOptions(activeConfig);

  const runSlash = async (command: string): Promise<void> => {
    const result = await dispatchSlashCommand(command, {
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
  };

  const cycleModel = async (direction: 1 | -1): Promise<void> => {
    const next = cycleModelOption(cachedModelOptions, activeConfig, direction);
    if (!next) {
      statusBar.setMessage("No models available to cycle");
      return;
    }
    const updated: StoredProviderConfig = {
      ...activeConfig,
      model: next.id,
      provider: next.provider,
    };
    upsertProvider(updated);
    setActiveConfig(updated, resolveProvider(updated));
    messageBox.appendSystem(`Model → ${updated.provider}/${updated.model}`);
    statusBar.setMessage(`${updated.provider}/${updated.model}`);
  };

  const copyLastReply = async (): Promise<void> => {
    const text = messageBox.getLastAssistantPlainText();
    if (!text?.trim()) {
      statusBar.setMessage("No assistant reply to copy");
      return;
    }
    const copied = await copyToClipboard(text);
    statusBar.setMessage(copied ? "Last reply copied" : "Copy failed — see TUI snapshot");
  };

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
      await runSlash(trimmed);
      statusBar.setMessage("Ready — ? for hotkeys · / for commands");
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

  const focusMessages = (): void => {
    hotkeysOverlay.hide();
    messageBox.element.focus();
    inputHasFocus = false;
    statusBar.setMessage("Message focus — PgUp/Dn scroll · Ctrl+I input · ? hotkeys");
  };

  inputBox = createInputBox(
    screen,
    (line) => {
      void handleSubmit(line);
    },
    {
      onUpdate: onSnapshotUpdate,
      onExit: requestExit,
      onShowHotkeys: () => hotkeysOverlay.toggle(),
      shortcuts: {
        onSave: () => void runSlash("/save"),
        onCopyTui: async () => {
          const { path, copied } = await copySnapshot();
          statusBar.setMessage(copied ? "TUI copied" : `Snapshot: ${path}`);
        },
        onCopyLastReply: () => void copyLastReply(),
        onModelList: () => void runSlash("/model"),
        onModelNext: () => void cycleModel(1),
        onModelPrev: () => void cycleModel(-1),
        onToggleAllThinking: () => messageBox.toggleAllThinking(),
        onNewSession: () => void runSlash("/reset"),
        onFocusMessages: focusMessages,
      },
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
      if (hotkeysOverlay.isVisible()) {
        hotkeysOverlay.hide();
        inputBox.focus();
        return true;
      }
      if (slashPopup.isVisible()) {
        inputBox.hideSlashPopup();
        return true;
      }
      return false;
    },
  );

  inputBox.element.key(["C-i"], () => {
    inputBox.focus();
    inputHasFocus = true;
    statusBar.setMessage("Input focus — Enter send · / commands · ? hotkeys");
  });

  messageBox.element.key(["pageup"], () => messageBox.scrollPageUp());
  messageBox.element.key(["pagedown"], () => messageBox.scrollPageDown());
  messageBox.element.key(["home"], () => messageBox.scrollToTop());
  messageBox.element.key(["end", "C-g"], () => messageBox.scrollToBottom());
  messageBox.element.key(["up"], () => messageBox.scrollUp());
  messageBox.element.key(["down"], () => messageBox.scrollDown());
  messageBox.element.key(["space"], () => messageBox.toggleFocusedThinking());
  messageBox.element.key(["C-t"], () => messageBox.toggleAllThinking());
  messageBox.element.key(["C-o"], () => void copyLastReply());
  messageBox.element.key(["?"], () => hotkeysOverlay.toggle());
  messageBox.element.key(["C-i"], () => {
    inputBox.focus();
    inputHasFocus = true;
  });

  inputBox.element.on("focus", () => {
    inputHasFocus = true;
  });
  inputBox.element.on("blur", () => {
    inputHasFocus = false;
  });

  messageBox.appendWelcome(buildWelcomeBannerPlain(authEmail, toolCount));
  topBar.setSubtitle(options.providerLabel ?? `${activeConfig.provider}/${activeConfig.model}`);

  const snapshotPath = getSnapshotPath();
  statusBar.setMessage(`? hotkeys · / commands · Ctrl+B scroll · ${snapshotPath}`);
  messageBox.appendSystem(formatSlashHelp());
  messageBox.appendSystem("Press ? for keyboard shortcuts (pi / opencode / codex style).");
  syncSnapshot();

  inputBox.focus();
  screen.render();

  await new Promise<void>(() => {
    // Keep process alive until exit shortcut
  });
}