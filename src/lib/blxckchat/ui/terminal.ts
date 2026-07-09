import blessed from "blessed";

import { AgentAbortedError, runAgent } from "../agent-loop.js";
import type { Provider } from "../providers/types.js";
import type { BlxckchatTool } from "../tools/types.js";
import type { StoredProviderConfig } from "../config.js";
import { upsertProvider } from "../config.js";
import { loadCredentials } from "../../auth.js";
import { resolveProvider } from "../providers/registry.js";
import { cycleModelOption, listModelOptions } from "../providers/models.js";

import { createTopBar } from "./components/top-bar.js";
import { createCrtBackdrop } from "./components/crt-backdrop.js";
import {
  renderJexxxusHeroBlessed,
  renderJexxxusHeroPlain,
  type JexxxusHeroMeta,
} from "./components/jexxxus-hero.js";
import { THEME } from "./theme.js";
import { createMessageBox } from "./components/message-box.js";
import { createInputBox } from "./components/input-box.js";
import { createStatusBar } from "./components/status-bar.js";
import { createSlashPopup } from "./components/slash-popup.js";
import { createSearchOverlay } from "./components/search-overlay.js";
import {
  createSession,
  addUserMessage,
  addAssistantMessage,
  addToolResult,
  updateToolResult,
  type TerminalSession,
  type ToolStatus,
} from "./session/session-store.js";
import { autosaveSession, loadAutosaveSession, shouldAutosave } from "./session/autosave.js";
import { branchUndo } from "./session/branch.js";
import { StreamBuffer, formatStreamingChunk } from "./renderer/streaming.js";
import { extractThinkingBlocks } from "./components/thinking-block.js";
import { buildTuISnapshot } from "./renderer/plain-text.js";
import {
  copyToClipboard,
  getSnapshotPath,
  writeSnapshot,
} from "./session/tui-snapshot.js";
import { getSlashSuggestions } from "./slash/autocomplete.js";
import { coerceSlashLine } from "./slash/coerce.js";
import { dispatchSlashCommand, isSlashCommand, parseSlashInput } from "./slash/handler.js";

import { bindExitKeys, gracefulTuiExit } from "./exit.js";
import { createHotkeysOverlay } from "./components/hotkeys-overlay.js";
import { createModelPickerOverlay } from "./components/model-picker-overlay.js";
import { createConnectOverlay } from "./components/connect-overlay.js";
import { MessageQueue } from "./message-queue.js";
import { openExternalEditor } from "./external-editor.js";
import { isBlessedMouseEnabled, restoreTerminalForReadline } from "./tty.js";

/** Blessed program hide/show exist at runtime but are missing from @types. */
type BlessedProgramVisibility = {
  hide: () => void;
  show: () => void;
};

function blessedProgram(screen: blessed.Widgets.Screen): BlessedProgramVisibility {
  return screen.program as unknown as BlessedProgramVisibility;
}

export interface TerminalChatOptions {
  providerLabel?: string;
  toolCount?: number;
  storedConfig: StoredProviderConfig;
  resume?: boolean;
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
        fg: THEME.text,
        bg: THEME.bgElevated,
        border: { fg: THEME.pink },
      },
      content: [
        `{#ec4899-fg}░░ tool confirm ░░{/}`,
        `{#ec4899-fg}BLXCKCHAT{/} wants to run {bold}${toolName}{/bold}`,
        "",
        `{gray-fg}${argsPreview.replace(/\{/g, "{open}")}{/gray-fg}`,
        "",
        "{#67e8f9-fg}Y{/} allow  {#f87171-fg}N{/} decline",
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
  // Load auth before blessed takes over stdout (console.warn corrupts the TUI).
  const creds = loadCredentials({ quiet: true });
  const authEmail = creds?.email ?? "not authenticated";
  const toolCount = options.toolCount ?? tools.length;

  const session: TerminalSession = options.resume
    ? (loadAutosaveSession() ?? createSession())
    : createSession();

  let screenRef: blessed.Widgets.Screen | undefined;
  try {
    const screen = blessed.screen({
      smartCSR: true,
      title: "BLXCKCHAT",
      fullUnicode: true,
      mouse: isBlessedMouseEnabled(),
      terminal: process.env.TERM,
      style: { bg: THEME.bg },
    });
    screenRef = screen;

    const crtBackdrop = createCrtBackdrop(screen, { top: 2, bottom: 4 });

  let activeConfig: StoredProviderConfig = { ...options.storedConfig };
  let activeProvider: Provider = provider;

  let topBar!: ReturnType<typeof createTopBar>;
  let messageBox!: ReturnType<typeof createMessageBox>;
  let statusBar!: ReturnType<typeof createStatusBar>;
  let inputBox!: ReturnType<typeof createInputBox>;
  const slashPopup = createSlashPopup(screen);
  const hotkeysOverlay = createHotkeysOverlay(screen);
  const messageQueue = new MessageQueue();

  let modelPickerOverlay!: ReturnType<typeof createModelPickerOverlay>;
  let connectOverlay!: ReturnType<typeof createConnectOverlay>;

  let isProcessing = false;
  let abortController: AbortController | null = null;

  let cachedModelOptions = await listModelOptions(activeConfig);

  const heroMeta: JexxxusHeroMeta = {
    authEmail,
    toolCount,
    providerLabel: options.providerLabel ?? `${activeConfig.provider}/${activeConfig.model}`,
  };

  const showIdleHero = (): void => {
    const heroWidth = Math.max(40, (screen.width as number) - 4);
    messageBox.showHero(
      renderJexxxusHeroPlain(heroWidth, heroMeta),
      renderJexxxusHeroBlessed(heroWidth, heroMeta),
    );
  };

  const runSlash = async (command: string): Promise<void> => {
    const parsed = parseSlashInput(command);
    const result = await dispatchSlashCommand(command, {
      session,
      activeConfig,
      toolCount,
      setActiveConfig,
      copySnapshot,
      openModelPicker: () => modelPickerOverlay.open(),
      openConnect: (catalogId) => connectOverlay.open(catalogId),
      openProviderPicker: () => connectOverlay.openProviderSwitch(),
    });
    if (parsed.command === "reset") {
      messageBox.clearChat();
      showIdleHero();
      statusBar.setMessage("Session reset — type a message to begin");
      return;
    }
    for (const msg of result.messages) {
      messageBox.appendSystem(msg);
    }
    if (result.exit) {
      requestExit();
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

  const canSnapshot = (): boolean =>
    Boolean(topBar && messageBox && statusBar && inputBox);

  const syncSnapshot = (): void => {
    if (!canSnapshot()) return;
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
    if (!canSnapshot()) {
      return { path: getSnapshotPath(), copied: false };
    }
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

  modelPickerOverlay = createModelPickerOverlay(screen, {
    getActiveConfig: () => activeConfig,
    setActiveConfig,
    onApplied: (message) => {
      messageBox.appendSystem(message);
      statusBar.setMessage(message);
      inputBox.focus();
    },
  });

  connectOverlay = createConnectOverlay(screen, {
    getActiveConfig: () => activeConfig,
    setActiveConfig,
    onMessage: (message) => {
      messageBox.appendSystem(message);
      statusBar.setMessage(message);
      inputBox.focus();
    },
    onError: (message) => {
      messageBox.appendError(message);
      statusBar.setMessage(message);
      inputBox.focus();
    },
  });

  const maybeAutosave = (): void => {
    if (shouldAutosave(session.messages.length)) {
      const path = autosaveSession(session);
      statusBar.setMessage(`Autosaved → ${path}`);
    }
  };

  const abortInFlight = (): void => {
    abortController?.abort();
  };

  const runTurn = async (trimmed: string): Promise<void> => {
    isProcessing = true;
    abortController = new AbortController();
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
      statusBar.setMessage("Ready — ? for hotkeys · / for commands");
    };

    try {
      const { response, history } = await runAgent(
        activeProvider,
        tools,
        trimmed,
        session.conversationHistory,
        {
          signal: abortController.signal,
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
      maybeAutosave();
    } catch (err) {
      if (err instanceof AgentAbortedError) {
        messageBox.cancelInFlightAssistant();
        messageBox.appendSystem("Turn aborted.");
        statusBar.setMessage("Aborted — ready");
      } else {
        const msg = err instanceof Error ? err.message : "Unknown error";
        messageBox.cancelInFlightAssistant();
        messageBox.appendError(`[ERROR] ${msg}`);
        statusBar.setMessage(`Error: ${msg}`);
      }
    } finally {
      abortController = null;
      isProcessing = false;

      const queued = messageQueue.dequeue();
      if (queued) {
        statusBar.setMessage(
          messageQueue.length > 0
            ? `Processing queued (${messageQueue.length} remaining)...`
            : "Processing queued message...",
        );
        void runTurn(queued);
        return;
      }

      inputBox.focus();
    }
  };

  const handleSubmit = async (line: string): Promise<void> => {
    if (isProcessing) return;

    const trimmed = line.trim();
    if (!trimmed) return;

    inputBox.hideSlashPopup();

    const slashLine = coerceSlashLine(trimmed);
    if (isSlashCommand(slashLine)) {
      await runSlash(slashLine);
      statusBar.setMessage("Ready — ? for hotkeys · / for commands");
      return;
    }

    await runTurn(trimmed);
  };

  const requestExit = (): void => {
    if (session.messages.length > 0) {
      autosaveSession(session);
    }
    gracefulTuiExit(screen);
  };

  const updateScrollStatus = (): void => {
    const { pinnedToBottom, percent } = messageBox.getScrollState();
    if (pinnedToBottom) {
      statusBar.setMessage(
        "Shift+↑↓ scroll · Ctrl+B history · / commands · Ctrl+Y copy · ? hotkeys",
      );
    } else {
      statusBar.setMessage(`History ${percent}% · End jump latest · Ctrl+B scroll · ? hotkeys`);
    }
  };

  const focusMessages = (): void => {
    hotkeysOverlay.hide();
    searchOverlay.close();
    messageBox.element.focus();
    updateScrollStatus();
  };

  const bindInputScrollKeys = (): void => {
    const scrollKeys: Array<[string[], () => void]> = [
      [["S-up", "C-up"], () => messageBox.scrollUp()],
      [["S-down", "C-down"], () => messageBox.scrollDown()],
      [["S-pageup"], () => messageBox.scrollPageUp()],
      [["S-pagedown"], () => messageBox.scrollPageDown()],
    ];
    for (const [keys, fn] of scrollKeys) {
      inputBox.element.key(keys, () => {
        fn();
        updateScrollStatus();
      });
    }
  };

  const searchOverlay = createSearchOverlay(screen, (query) => {
    messageBox.setSearchQuery(query);
    statusBar.setMessage(query ? `Search: "${query}"` : "Search cleared");
    inputBox.focus();
  });

  const openEditorDraft = async (): Promise<void> => {
    if (isProcessing) return;
    const draft = inputBox.getValue();
    try {
      blessedProgram(screen).hide();
      const edited = await openExternalEditor(draft);
      blessedProgram(screen).show();
      screen.render();
      if (edited !== null) {
        inputBox.setValue(edited);
        statusBar.setMessage("Draft updated from editor");
      } else if (!process.env.EDITOR?.trim() && !process.env.VISUAL?.trim()) {
        statusBar.setMessage("Set $EDITOR or $VISUAL for external editor");
      }
    } catch {
      blessedProgram(screen).show();
      screen.render();
      statusBar.setMessage("External editor failed");
    }
  };

  const suspendTui = (): void => {
    blessedProgram(screen).hide();
    const onCont = (): void => {
      process.off("SIGCONT", onCont);
      blessedProgram(screen).show();
      screen.render();
      inputBox.focus();
    };
    process.on("SIGCONT", onCont);
    process.kill(process.pid, "SIGTSTP");
  };

  const runBranchUndo = (): void => {
    if (isProcessing) return;
    if (branchUndo(session)) {
      messageBox.popLastExchange();
      statusBar.setMessage("Branch undo — last exchange removed");
      syncSnapshot();
    } else {
      statusBar.setMessage("Nothing to undo");
    }
  };

  topBar = createTopBar(screen, { onUpdate: onSnapshotUpdate });
  messageBox = createMessageBox(screen, {
    onUpdate: onSnapshotUpdate,
    onScrollChange: () => updateScrollStatus(),
  });
  statusBar = createStatusBar(screen, { onUpdate: onSnapshotUpdate });

  inputBox = createInputBox(
    screen,
    (line) => {
      void handleSubmit(line);
    },
    {
      onUpdate: onSnapshotUpdate,
      onExit: requestExit,
      onShowHotkeys: () => hotkeysOverlay.toggle(),
      onQueueIfProcessing: () => {
        if (!isProcessing) return false;
        const value = inputBox.getValue().trim();
        if (!value) return false;
        if (messageQueue.enqueue(value)) {
          inputBox.clear();
          statusBar.setMessage(`Queued (${messageQueue.length}) — Tab to queue more`);
          return true;
        }
        return false;
      },
      onOpenExternalEditor: () => void openEditorDraft(),
      shortcuts: {
        onSave: () => void runSlash("/save"),
        onCopyTui: async () => {
          const { path, copied } = await copySnapshot();
          statusBar.setMessage(copied ? "TUI copied" : `Snapshot: ${path}`);
        },
        onCopyLastReply: () => void copyLastReply(),
        onModelList: () => void modelPickerOverlay.open(),
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

  const handleEscapeLayer = (): boolean => {
    if (isProcessing) {
      abortInFlight();
      return true;
    }
    if (connectOverlay.isVisible()) {
      connectOverlay.close();
      inputBox.focus();
      return true;
    }
    if (modelPickerOverlay.isVisible()) {
      modelPickerOverlay.close();
      inputBox.focus();
      return true;
    }
    if (searchOverlay.isVisible()) {
      searchOverlay.close();
      messageBox.setSearchQuery("");
      inputBox.focus();
      return true;
    }
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
  };

  bindExitKeys(
    screen,
    [screen, inputBox.element, messageBox.element],
    handleEscapeLayer,
  );

  inputBox.element.key(["C-i"], () => {
    inputBox.focus();
    statusBar.setMessage("Input focus — Enter send · / commands · ? hotkeys");
  });

  inputBox.element.key(["C-f"], () => searchOverlay.open());
  inputBox.element.key(["C-z"], () => suspendTui());
  inputBox.element.key(["C-M-z", "M-z"], () => runBranchUndo());

  messageBox.element.key(["pageup"], () => {
    messageBox.scrollPageUp();
    updateScrollStatus();
  });
  messageBox.element.key(["pagedown"], () => {
    messageBox.scrollPageDown();
    updateScrollStatus();
  });
  messageBox.element.key(["home"], () => {
    messageBox.scrollToTop();
    updateScrollStatus();
  });
  messageBox.element.key(["end"], () => {
    messageBox.scrollToBottom();
    updateScrollStatus();
  });
  messageBox.element.key(["up"], () => {
    messageBox.scrollUp();
    updateScrollStatus();
  });
  messageBox.element.key(["down"], () => {
    messageBox.scrollDown();
    updateScrollStatus();
  });
  messageBox.element.key(["space"], () => messageBox.toggleFocusedThinking());
  messageBox.element.key(["C-t"], () => messageBox.toggleAllThinking());
  messageBox.element.key(["C-o"], () => void copyLastReply());
  messageBox.element.key(["?"], () => hotkeysOverlay.toggle());
  messageBox.element.key(["C-i"], () => inputBox.focus());
  messageBox.element.key(["C-f"], () => searchOverlay.open());
  messageBox.element.key(["C-z"], () => suspendTui());
  messageBox.element.key(["C-M-z", "M-z"], () => runBranchUndo());

  topBar.setSubtitle(options.providerLabel ?? `${activeConfig.provider}/${activeConfig.model}`);

  if (options.resume && session.messages.length > 0) {
    messageBox.replaySession(session);
    messageBox.appendSystem(
      `Resumed autosave (${session.messages.length} messages, ${session.conversationHistory.length} history turns).`,
    );
    updateScrollStatus();
  } else {
    showIdleHero();
    updateScrollStatus();
  }

  bindInputScrollKeys();
  syncSnapshot();

  inputBox.focus();
  screen.render();

  const glitchTimer = setInterval(() => {
    topBar.tickGlitch();
    crtBackdrop.setGlitchSeed(Date.now() % 9);
  }, 2800);

  screen.on("destroy", () => {
    clearInterval(glitchTimer);
  });

  await new Promise<void>(() => {
    // Keep process alive until exit shortcut
  });
  } catch (err) {
    restoreTerminalForReadline(screenRef);
    throw err;
  }
}