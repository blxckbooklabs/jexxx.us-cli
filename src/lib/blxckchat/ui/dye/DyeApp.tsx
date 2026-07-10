import React from "react";
import {
  AlternateScreen,
  Box,
  useInput,
  useApp,
  useWindowSize,
  useSelection,
  usePaste,
} from "@sauerapple/dye";
import { THEME } from "../theme.js";
import type { MessageStore } from "./message-store.js";
import { MessageView } from "./MessageView.js";
import { InputView } from "./InputView.js";
import { TopBar } from "./TopBar.js";
import { StatusBar } from "./StatusBar.js";
import { ToastView } from "./ToastView.js";
import { ConfirmModal } from "./ConfirmModal.js";
import { SearchOverlay } from "./SearchOverlay.js";
import { HotkeysOverlay } from "./HotkeysOverlay.js";
import { PickerOverlay, type PickerDisplayState } from "./PickerOverlay.js";
import { PromptOverlay, type PromptDisplayState } from "./PromptOverlay.js";
import { DeviceLoginOverlay } from "./DeviceLoginOverlay.js";
import type { DyeActionCallbacks, PickerItemDef } from "./dye-types.js";
import type { SlashSuggestion } from "../slash/autocomplete.js";
import {
  detectSlashInputMode,
  getCommandSuggestions,
} from "../slash/autocomplete.js";
import { SlashPopup } from "./SlashPopup.js";
import {
  lineScrollStep,
  pageScrollDelta,
  halfPageScrollDelta,
} from "../components/scroll-state.js";
import { readClipboard } from "../session/tui-snapshot.js";

export interface DyeAppOverlayHandles {
  showPicker: (
    items: PickerItemDef[],
    options?: {
      title?: string;
      selectedIndex?: number;
      hideFilter?: boolean;
      statusHeader?: string;
    },
  ) => Promise<PickerItemDef | null>;
  showPrompt: (
    options: import("./dye-types.js").PromptOverlayOptions,
  ) => Promise<string | null>;
  startDeviceLogin: () => Promise<import("../../../auth.js").Credentials>;
}

interface DyeAppProps {
  store: MessageStore;
  callbacks: DyeActionCallbacks;
  initialInputValue?: string;
  overlayRef?: React.MutableRefObject<DyeAppOverlayHandles | null>;
}

export const DyeApp: React.FC<DyeAppProps> = ({
  store,
  callbacks,
  initialInputValue = "",
  overlayRef,
}) => {
  const { columns: termWidth, rows: termHeight } = useWindowSize();

  const [scrollOffset, setScrollOffset] = React.useState(0);
  const [inputValue, setInputValue] = React.useState(initialInputValue);
  const [typedQuery, setTypedQuery] = React.useState("");

  const [slashSuggestions, setSlashSuggestions] = React.useState<
    SlashSuggestion[]
  >([]);
  const [slashSelectedIndex, setSlashSelectedIndex] = React.useState(0);
  const [messageFocus, setMessageFocus] = React.useState(false);
  const previousStatusRef = React.useRef("");

  const [pickerState, setPickerState] =
    React.useState<PickerDisplayState | null>(null);
  const [pickerFilterFocused, setPickerFilterFocused] = React.useState(false);
  const pickerResolveRef = React.useRef<
    ((v: PickerItemDef | null) => void) | null
  >(null);

  const [promptState, setPromptState] =
    React.useState<PromptDisplayState | null>(null);
  const promptResolveRef = React.useRef<((v: string | null) => void) | null>(
    null,
  );

  const [deviceLoginText, setDeviceLoginText] = React.useState<string | null>(
    null,
  );
  const deviceLoginResolveRef = React.useRef<((v: unknown) => void) | null>(
    null,
  );

  React.useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
  );

  React.useEffect(() => {
    if (overlayRef) {
      overlayRef.current = {
        showPicker: (
          items: PickerItemDef[],
          options?: {
            title?: string;
            selectedIndex?: number;
            hideFilter?: boolean;
            statusHeader?: string;
          },
        ): Promise<PickerItemDef | null> =>
          new Promise((resolve) => {
            pickerResolveRef.current = resolve;
            setPickerState({
              items,
              selectedIndex: options?.selectedIndex ?? 0,
              filterQuery: "",
              ...(options?.title !== undefined ? { title: options.title } : {}),
              ...(options?.hideFilter !== undefined
                ? { hideFilter: options.hideFilter }
                : {}),
              ...(options?.statusHeader !== undefined
                ? { statusHeader: options.statusHeader }
                : {}),
            });
            setPickerFilterFocused(!options?.hideFilter);
            setTypedQuery("");
          }),
        showPrompt: (
          opts: import("./dye-types.js").PromptOverlayOptions,
        ): Promise<string | null> =>
          new Promise((resolve) => {
            promptResolveRef.current = resolve;
            setPromptState({ options: opts, input: opts.defaultValue ?? "" });
          }),
        startDeviceLogin: async () => {
          const { startDeviceAuth, pollDeviceAuth, openDeviceAuthBrowser } =
            await import("../../../auth.js");
          const { userCode, codeVerifier, expiresIn, verificationUrl } =
            await startDeviceAuth();
          openDeviceAuthBrowser(verificationUrl);
          setDeviceLoginText(`Visit: ${verificationUrl}\nCode: ${userCode}`);

          return new Promise((resolve, reject) => {
            deviceLoginResolveRef.current = (val: unknown) => {
              if (val instanceof Error) reject(val);
              else resolve(val as import("../../../auth.js").Credentials);
            };
            pollDeviceAuth(userCode, codeVerifier, expiresIn)
              .then((creds: import("../../../auth.js").Credentials) => {
                deviceLoginResolveRef.current?.(creds);
                deviceLoginResolveRef.current = null;
                setDeviceLoginText(null);
              })
              .catch((err: Error) => {
                deviceLoginResolveRef.current?.(err);
                deviceLoginResolveRef.current = null;
                setDeviceLoginText(null);
              });
          });
        },
      };
      store.notify();
    }
  }, []);

  const overlayActive = Boolean(
    store.confirmDialog || pickerState || promptState || deviceLoginText,
  );

  const maxScrollLines = React.useMemo(
    () => store.blocks.flatMap((b) => (b.content || "").split("\n")).length,
    [store.blocks],
  );

  // Text selection auto-copy via Dye's SelectionManager. Enabled by
  // mouseTracking on AlternateScreen — click-drag highlights visually
  // through Dye's built-in selection overlay. Copies + shows the toast
  // exactly on mouse release, not on a fixed timer: the original 200ms
  // "no change for 200ms" debounce fired mid-drag whenever the user paused
  // dragging for a beat, well before actually releasing the mouse.
  // `dragging` (patches/@sauerapple+dye+...patch) reflects the manager's
  // real press/drag/release state, notified on every transition including
  // release (which the unpatched manager never notified on at all).
  const { selectedText, dragging, copy, clearSelection } = useSelection();
  const prevDraggingRef = React.useRef(dragging);

  React.useEffect(() => {
    const wasDragging = prevDraggingRef.current;
    prevDraggingRef.current = dragging;
    if (wasDragging && !dragging && selectedText && selectedText.length >= 3) {
      copy().then((success) => {
        if (success) store.showToast("Copied to clipboard");
      });
    }
    // Clear zero-width selection on simple clicks (no drag) — without this,
    // Dye's global SelectionManager paints a pink cell highlight on every
    // click that never disappears until an arrow key triggers clearSel().
    if (wasDragging && !dragging && (!selectedText || selectedText.length < 3)) {
      clearSelection();
    }
  }, [dragging, selectedText, copy, clearSelection, store]);

  // Paste support when the prompt overlay is open. This is the PRIMARY
  // paste path -- usePaste hooks into Dye's 'paste' event channel, which is
  // separate from useInput's 'input' channel (past text is NEVER forwarded
  // to useInput while a usePaste handler is active). Bracketed paste mode
  // is managed automatically by the hook.
  usePaste(
    (text) => {
      if (!promptState) return;
      const normalized = text.replace(/\r?\n/g, "").replace(/\t/g, "");
      if (!normalized) return;
      setPromptState((s) => (s ? { ...s, input: s.input + normalized } : s));
    },
    { isActive: Boolean(promptState) },
  );

  useInput((input, key) => {
    if (store.confirmDialog) {
      if (input === "y" || input === "Y") {
        store.confirmDialog.resolve(true);
        store.setConfirmDialog(null);
      } else if (input === "n" || input === "N" || key.escape) {
        store.confirmDialog.resolve(false);
        store.setConfirmDialog(null);
      }
      return;
    }

    if (pickerState) {
      const resolve = pickerResolveRef.current;
      if (key.escape) {
        resolve?.(null);
        pickerResolveRef.current = null;
        setPickerState(null);
        return;
      }
      if (key.tab) {
        setPickerFilterFocused((f) => !f);
        return;
      }
      if (key.upArrow) {
        setPickerState((s) => {
          if (!s) return s;
          const len = pickerItemsFiltered(s).length;
          if (len === 0) return s;
          const next = ((s.selectedIndex - 1 + len) % len);
          return { ...s, selectedIndex: next };
        });
        return;
      }
      if (key.downArrow) {
        setPickerState((s) => {
          if (!s) return s;
          const len = pickerItemsFiltered(s).length;
          if (len === 0) return s;
          const next = ((s.selectedIndex + 1) % len);
          return { ...s, selectedIndex: next };
        });
        return;
      }
      if (key.return) {
        if (pickerResolveRef.current) {
          const filtered = pickerItemsFiltered(pickerState);
          const picked = filtered[pickerState.selectedIndex];
          resolve?.(picked ?? null);
          pickerResolveRef.current = null;
          setPickerState(null);
          return;
        }
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setTypedQuery((q) => q + input);
        return;
      }
      if (key.backspace) {
        setTypedQuery((q) => q.slice(0, -1));
        return;
      }
      return;
    }

    if (promptState) {
      const resolve = promptResolveRef.current;
      if (key.escape) {
        resolve?.(null);
        promptResolveRef.current = null;
        setPromptState(null);
        return;
      }
      if (key.return) {
        resolve?.(promptState.input.trim());
        promptResolveRef.current = null;
        setPromptState(null);
        return;
      }
      if (key.backspace) {
        setPromptState((s) => (s ? { ...s, input: s.input.slice(0, -1) } : s));
        return;
      }
      // Secret-mode fallback: Shift+P reads clipboard via readClipboard.
      // Cmd+V is intercepted by macOS terminals and Ctrl+V reliability
      // varies; the primary paste path is usePaste (separate channel).
      if (promptState.options.secret && key.shift && !key.ctrl && !key.meta && input.toLowerCase() === "p") {
        void readClipboard().then((clip) => {
          const normalized = clip.replace(/\r?\n/g, "").replace(/\t/g, "");
          if (!normalized) return;
          setPromptState((s) => (s ? { ...s, input: normalized } : s));
        });
        return;
      }
      // Regular character input. Paste is handled by usePaste on its own
      // event channel and never reaches useInput while active.
      if (input && !key.ctrl && !key.meta) {
        setPromptState((s) => (s ? { ...s, input: s.input + input } : s));
        return;
      }
      return;
    }

    if (deviceLoginText) {
      if (key.escape || input === "q") {
        deviceLoginResolveRef.current?.(new Error("cancelled"));
        deviceLoginResolveRef.current = null;
        setDeviceLoginText(null);
      }
      return;
    }

    if (store.searchVisible) {
      if (key.escape) {
        store.setSearchVisible(false);
        store.setSearchQuery("");
        setTypedQuery("");
        return;
      }
      if (key.return) {
        store.setSearchVisible(false);
        store.setSearchQuery(typedQuery);
        return;
      }
      if (key.backspace) {
        setTypedQuery((q) => q.slice(0, -1));
        return;
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setTypedQuery((q) => q + input);
        return;
      }
      return;
    }

    if (store.hotkeysVisible) {
      if (key.escape || input === "q" || input === "?") {
        store.setHotkeysVisible(false);
      }
      return;
    }

    if (slashSuggestions.length > 0) {
      if (key.upArrow) {
        setSlashSelectedIndex((i) =>
          i <= 0 ? slashSuggestions.length - 1 : i - 1,
        );
        return;
      }
      if (key.downArrow) {
        setSlashSelectedIndex((i) =>
          i >= slashSuggestions.length - 1 ? 0 : i + 1,
        );
        return;
      }
      if (key.return || key.tab) {
        const s = slashSuggestions[slashSelectedIndex];
        if (s) {
          const cmdName = s.label.replace(/^\//, "");
          const newValue = `/${cmdName} `;
          store.inputValue = newValue;
          setInputValue(newValue);
        }
        setSlashSuggestions([]);
        setSlashSelectedIndex(0);
        return;
      }
      if (key.escape) {
        setSlashSuggestions([]);
        setSlashSelectedIndex(0);
        return;
      }
      return;
    }

    if (key.escape) {
      if (messageFocus) {
        setMessageFocus(false);
        store.setStatusMessage(previousStatusRef.current);
        return;
      }
      if (store.isProcessing) {
        callbacks.onAbort();
      } else {
        callbacks.onEscape();
      }
      return;
    }
    if (key.ctrl && input === "c") return;
    if (key.ctrl && input === "d") return;
    if (key.ctrl && input === "z") {
      process.kill(process.pid, "SIGTSTP");
      return;
    }
    if (key.ctrl && input === "b") {
      if (messageFocus) {
        setMessageFocus(false);
        store.setStatusMessage(previousStatusRef.current);
      } else {
        previousStatusRef.current = store.statusMessage;
        setMessageFocus(true);
        store.setStatusMessage("Focus: ↑↓ scroll · Ctrl+B exit");
      }
      return;
    }
    if (key.ctrl && input === "g") {
      callbacks.onOpenExternalEditor(inputValue).then((result) => {
        if (result !== null) {
          store.inputValue = result;
          setInputValue(result);
        }
      });
      return;
    }
    if (key.ctrl && input === "s") {
      callbacks.onExportSession().then((path) => {
        if (path) store.showToast(`Session exported`);
      });
      return;
    }
    if (key.ctrl && input === "n") {
      callbacks.onNewSession();
      return;
    }
    if (key.ctrl && input === "f") {
      store.setSearchVisible(true);
      setTypedQuery("");
      return;
    }
    if (input === "?" && !store.hotkeysVisible) {
      store.setHotkeysVisible(true);
      return;
    }
    if (key.ctrl && input === "l") {
      callbacks.onOpenModelPicker();
      return;
    }
    if (key.ctrl && input === "p") {
      callbacks.onCycleModelNext();
      return;
    }
    if (key.ctrl && input === "o") {
      callbacks.onCopyLastReply();
      return;
    }
    if (key.ctrl && input === "t") {
      callbacks.onToggleThinking();
      return;
    }
    if (key.ctrl && input === "y") {
      if (key.shift) callbacks.onCopyChrome();
      else callbacks.onCopySnapshot();
      return;
    }
    if (key.meta && input === "z") {
      callbacks.onBranchUndo();
      return;
    }
    if (messageFocus) {
      const thinkingBlocksExist = store.getThinkingBlockCount() > 0;
      if (input === " ") {
        if (thinkingBlocksExist) {
          store.toggleFocusedThinking();
        } else {
          callbacks.onToggleThinking();
        }
        return;
      }
      if (key.upArrow) {
        if (thinkingBlocksExist) {
          store.moveFocusedThinking(-1);
        } else {
          callbacks.onScrollUp();
        }
        return;
      }
      if (key.downArrow) {
        if (thinkingBlocksExist) {
          store.moveFocusedThinking(1);
        } else {
          callbacks.onScrollDown();
        }
        return;
      }
      if (key.pageUp) {
        callbacks.onScrollPageUp();
        return;
      }
      if (key.pageDown) {
        callbacks.onScrollPageDown();
        return;
      }
      if (key.home) {
        callbacks.onScrollToTop();
        return;
      }
      if (key.end) {
        callbacks.onScrollToBottom();
        return;
      }
    }
    if (key.pageUp) {
      callbacks.onScrollPageUp();
      return;
    }
    if (key.pageDown) {
      callbacks.onScrollPageDown();
      return;
    }
    if (key.home) {
      callbacks.onScrollToTop();
      return;
    }
    if (key.end) {
      callbacks.onScrollToBottom();
      return;
    }
    if (key.shift && key.upArrow) {
      callbacks.onScrollUp();
      return;
    }
    if (key.shift && key.downArrow) {
      callbacks.onScrollDown();
      return;
    }
  });

  const handleSubmit = React.useCallback(
    (line: string) => {
      if (!line.trim() || overlayActive) return;
      setInputValue("");
      store.inputValue = "";
      callbacks.onSubmit(line);
    },
    [callbacks, store, overlayActive],
  );

  const handleInputChange = React.useCallback(
    (value: string) => {
      store.inputValue = value;
      setInputValue(value);
      if (value.startsWith("/")) {
        const { mode, commandFilter } = detectSlashInputMode(value);
        if (mode === "command") {
          setSlashSuggestions(getCommandSuggestions(commandFilter));
          setSlashSelectedIndex(0);
        } else {
          setSlashSuggestions([]);
        }
      } else {
        setSlashSuggestions([]);
      }
    },
    [store],
  );

  return (
    <AlternateScreen mouseTracking>
      <Box
        width={termWidth}
        height={termHeight}
        flexDirection="column"
        backgroundColor={THEME.bg}
      >
        <TopBar subtitle={store.subtitle} glitchSeed={store.glitchSeed} />
        <Box
          flexGrow={1}
          flexDirection="column"
          backgroundColor={THEME.bgInset}
        >
          <MessageView
            store={store}
            scrollOffset={scrollOffset}
            onScroll={setScrollOffset}
            terminalWidth={termWidth}
            terminalHeight={termHeight}
          />
        </Box>
        <StatusBar message={store.statusMessage} messageFocus={messageFocus} />
        <SlashPopup
          suggestions={slashSuggestions}
          selectedIndex={slashSelectedIndex}
          visible={slashSuggestions.length > 0}
        />
        <InputView
          value={inputValue}
          onChange={handleInputChange}
          onSubmit={handleSubmit}
          onEscape={() => {}}
          disabled={overlayActive}
          slashVisible={slashSuggestions.length > 0}
          messageFocus={messageFocus}
        />

        <PickerOverlay
          state={
            pickerState
              ? (() => {
                  const filtered = pickerItemsFiltered(pickerState);
                  const len = Math.max(filtered.length, 0);
                  const si =
                    len === 0
                      ? 0
                      : Math.min(pickerState.selectedIndex, len - 1);
                  return { ...pickerState, selectedIndex: si, filterQuery: typedQuery };
                })()
              : null
          }
          filterFocused={pickerFilterFocused}
        />
        <PromptOverlay state={promptState} />
        {deviceLoginText ? (
          <DeviceLoginOverlay state={{ status: deviceLoginText }} />
        ) : null}
        <ConfirmModal dialog={store.confirmDialog} />
        {store.searchVisible ? <SearchOverlay query={typedQuery} /> : null}
        {store.hotkeysVisible ? <HotkeysOverlay /> : null}
        <ToastView
          message={store.toast?.message ?? null}
          variant={store.toast?.variant ?? "info"}
          onDismiss={() => store.dismissToast()}
        />
      </Box>
    </AlternateScreen>
  );
};

function pickerItemsFiltered(state: PickerDisplayState): PickerItemDef[] {
  const q = state.filterQuery.trim().toLowerCase();
  if (!q) return state.items;
  return state.items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      (item.description?.toLowerCase().includes(q) ?? false),
  );
}
