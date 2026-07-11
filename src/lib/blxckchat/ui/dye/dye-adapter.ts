import { render, type Instance } from "@sauerapple/dye";
import React from "react";
import { MessageStore } from "./message-store.js";
import { DyeApp, type DyeAppOverlayHandles } from "./DyeApp.js";
import type {
  DyeActionCallbacks,
  ScrollState,
  JexxxusHeroMeta,
} from "./dye-types.js";
import type {
  ThinkingBlock,
  ToolResult,
  TerminalSession,
} from "../session/session-store.js";

export interface DyeMessageBoxHandle {
  showHero: (plain: string, meta?: JexxxusHeroMeta) => void;
  dismissHero: () => boolean;
  hasHero: () => boolean;
  appendWelcome: (plainContent: string) => void;
  appendUser: (text: string) => void;
  appendAssistantStart: () => number;
  updateAssistantStream: (
    blockIndex: number,
    partial: string,
    rawPlain?: string,
    rawThinking?: string,
  ) => void;
  finalizeAssistant: (
    blockIndex: number,
    content: string,
    thinkingBlocks: ThinkingBlock[],
  ) => void;
  appendTools: (tools: ToolResult[]) => void;
  appendError: (message: string) => void;
  appendSystem: (message: string) => void;
  scrollUp: () => void;
  scrollDown: () => void;
  scrollPageUp: () => void;
  scrollPageDown: () => void;
  scrollHalfPageUp: () => void;
  scrollHalfPageDown: () => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  getScrollState: () => ScrollState;
  isPinnedToBottom: () => boolean;
  getThinkingBlocks: () => ThinkingBlock[];
  toggleFocusedThinking: () => void;
  toggleAllThinking: () => void;
  getLastAssistantPlainText: () => string | null;
  popLastExchange: () => void;
  cancelInFlightAssistant: () => void;
  setSearchQuery: (query: string) => void;
  replaySession: (session: TerminalSession) => void;
  clearChat: () => void;
}

export interface DyeInputBoxHandle {
  focus: () => void;
  clear: () => void;
  setValue: (value: string) => void;
  getValue: () => string;
}

export interface DyeTopBarHandle {
  setSubtitle: (text: string) => void;
  getSubtitle: () => string;
  tickGlitch: () => void;
}

export interface DyeStatusBarHandle {
  setMessage: (text: string) => void;
  getMessage: () => string;
}

export interface DyeTuiHandles {
  messageBox: DyeMessageBoxHandle;
  inputBox: DyeInputBoxHandle;
  topBar: DyeTopBarHandle;
  statusBar: DyeStatusBarHandle;
  store: MessageStore;
  overlay: DyeAppOverlayHandles | null;
  callbacks: DyeActionCallbacks;
  waitUntilExit: () => Promise<void>;
  ready: () => Promise<void>;
}

export interface DyeAdapterOptions {
  callbacks: DyeActionCallbacks;
  initialInputValue?: string;
  subtitle?: string;
}

const { stdout } = require("process");

function getViewportHeight(): number {
  try {
    return (stdout as any).rows ?? 24;
  } catch {
    return 24;
  }
}

export function createDyeTui(options: DyeAdapterOptions): DyeTuiHandles {
  const store = new MessageStore();
  const termHeight = getViewportHeight();
  if (options.subtitle) store.subtitle = options.subtitle;

  const overlayRef: { current: DyeAppOverlayHandles | null } = {
    current: null,
  };

  const callbacks: DyeActionCallbacks = {
    ...options.callbacks,
    onConfirmTool: async (
      toolName: string,
      args: Record<string, unknown>,
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        store.setConfirmDialog({
          title: toolName,
          message: JSON.stringify(args, null, 2).slice(0, 400),
          resolve,
        });
      });
    },
  };

  const messageBox: DyeMessageBoxHandle = {
    showHero(plain: string, meta?: JexxxusHeroMeta) {
      store.showHero(plain, meta);
    },
    dismissHero() {
      return store.dismissHero();
    },
    hasHero() {
      return store.hasHero();
    },
    appendWelcome(plainContent: string) {
      store.blocks.push({ type: "welcome", content: plainContent });
      store.pinnedToBottom = true;
      store.notify();
    },
    appendUser(text: string) {
      store.appendUser(text);
    },
    appendAssistantStart() {
      return store.appendAssistantStart();
    },
    updateAssistantStream(blockIndex, partial, rawPlain, rawThinking) {
      store.updateAssistantStream(blockIndex, partial, rawPlain, rawThinking);
    },
    finalizeAssistant(blockIndex, content, thinkingBlocks) {
      store.finalizeAssistant(blockIndex, content, thinkingBlocks);
    },
    appendTools(tools) {
      store.appendTools(tools);
    },
    appendError(message) {
      store.appendError(message);
    },
    appendSystem(message) {
      store.appendSystem(message);
    },
    scrollUp() {
      store.scrollUp();
    },
    scrollDown() {
      store.scrollDown();
    },
    scrollPageUp() {
      store.scrollPageUp(termHeight);
    },
    scrollPageDown() {
      store.scrollPageDown(termHeight);
    },
    scrollHalfPageUp() {
      store.setScrollOffset(store.scrollOffset + Math.floor(termHeight / 2));
    },
    scrollHalfPageDown() {
      store.setScrollOffset(Math.max(0, store.scrollOffset - Math.floor(termHeight / 2)));
    },
    scrollToTop() {
      store.scrollToTop();
    },
    scrollToBottom() {
      store.setScrollOffset(0);
      store.pinnedToBottom = true;
    },
    getScrollState(): ScrollState {
      return {
        pinnedToBottom: store.pinnedToBottom,
        percent: store.pinnedToBottom ? 100 : 50,
      };
    },
    isPinnedToBottom() {
      return store.pinnedToBottom;
    },
    getThinkingBlocks() {
      return store.blocks.flatMap((b) => b.thinkingBlocks ?? []);
    },
    toggleFocusedThinking() {
      store.toggleFocusedThinking();
    },
    toggleAllThinking() {
      store.toggleAllThinking();
    },
    getLastAssistantPlainText() {
      return store.getLastAssistantPlainText();
    },
    popLastExchange() {
      store.popLastExchange();
    },
    cancelInFlightAssistant() {
      store.cancelInFlightAssistant();
    },
    setSearchQuery(query: string) {
      store.setSearchQuery(query);
    },
    replaySession(session: TerminalSession) {
      store.replaySession(session);
    },
    clearChat() {
      store.clearChat();
    },
  };

  const inputBox: DyeInputBoxHandle = {
    focus() {},
    clear() {
      store.inputValue = "";
    },
    setValue(value: string) {
      store.inputValue = value;
    },
    getValue() {
      return store.inputValue;
    },
  };

  const topBar: DyeTopBarHandle = {
    setSubtitle(text: string) {
      store.setSubtitle(text);
    },
    getSubtitle() {
      return store.subtitle;
    },
    tickGlitch() {
      store.tickGlitch();
    },
  };

  const statusBar: DyeStatusBarHandle = {
    setMessage(text: string) {
      store.setStatusMessage(text);
    },
    getMessage() {
      return store.statusMessage;
    },
  };

  const app = React.createElement(DyeApp, {
    store,
    callbacks,
    initialInputValue: options.initialInputValue ?? "",
    overlayRef,
  });

  const instance: Instance = render(app);

  let readyResolve: (() => void) | undefined;
  const readyPromise = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  setImmediate(() => {
    readyResolve?.();
  });

  const handles: DyeTuiHandles = {
    messageBox,
    inputBox,
    topBar,
    statusBar,
    store,
    overlay: null,
    callbacks,
    waitUntilExit: () => instance.waitUntilExit() as Promise<void>,
    ready: () => readyPromise,
  };

  Object.defineProperty(handles, "overlay", {
    get() {
      return overlayRef.current;
    },
    enumerable: true,
    configurable: true,
  });

  return handles;
}
