import React from "react";
import {
  AlternateScreen,
  Box,
  useInput,
  useApp,
  useWindowSize,
  useSelection,
  usePaste,
  measureElement,
  type DOMElement,
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
import {
  normalizeSecretClipboardPaste,
  readClipboardRobust,
} from "../session/tui-snapshot.js";
import { isSecretPromptPasteKey } from "../secret-prompt-input.js";
import { useMouseScroll } from "./use-mouse-scroll.js";
import {
  filterPickerItems,
  resolvePickerSelection,
} from "./picker-filter.js";

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
  const [filterCursorPos, setFilterCursorPos] = React.useState(0);
  const [filterSelectionStart, setFilterSelectionStart] = React.useState<number | null>(null);
  // Search overlay cursor/selection state
  const [searchCursorPos, setSearchCursorPos] = React.useState(0);
  const [searchSelectionStart, setSearchSelectionStart] = React.useState<number | null>(null);
  const pickerResolveRef = React.useRef<
    ((v: PickerItemDef | null) => void) | null
  >(null);

  const [promptState, setPromptState] =
    React.useState<PromptDisplayState | null>(null);
  const promptResolveRef = React.useRef<((v: string | null) => void) | null>(
    null,
  );
  const [promptCursorPos, setPromptCursorPos] = React.useState(0);
  const [promptSelectionStart, setPromptSelectionStart] = React.useState<number | null>(null);

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
            setFilterCursorPos(0);
            setFilterSelectionStart(null);
          }),
        showPrompt: (
          opts: import("./dye-types.js").PromptOverlayOptions,
        ): Promise<string | null> =>
          new Promise((resolve) => {
            promptResolveRef.current = resolve;
            setPromptState({ options: opts, input: opts.defaultValue ?? "" });
            setPromptCursorPos((opts.defaultValue ?? "").length);
            setPromptSelectionStart(null);
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

  // The message area's real row count is whatever Yoga computes for its
  // flexGrow=1 box after TopBar/StatusBar/InputView claim their fixed
  // heights — a hardcoded "terminalHeight - N" guess in MessageView drifts
  // whenever that chrome's total height changes. Overlays and the slash
  // popup are `position="absolute"` (don't affect sibling layout), so a
  // resize is the only thing that changes this; measureElement only
  // returns real numbers post-layout, hence the effect + ref instead of
  // computing it inline during render.
  const messageAreaRef = React.useRef<DOMElement>(null);
  const [messageAreaHeight, setMessageAreaHeight] = React.useState<
    number | undefined
  >(undefined);

  React.useLayoutEffect(() => {
    if (!messageAreaRef.current) return;
    const { height } = measureElement(messageAreaRef.current);
    if (height > 0) setMessageAreaHeight(height);
  }, [termWidth, termHeight]);

  useMouseScroll(
    {
      onScrollUp: callbacks.onScrollUp,
      onScrollDown: callbacks.onScrollDown,
    },
    !overlayActive,
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
      const normalized = normalizeSecretClipboardPaste(text);
      if (!normalized) return;
      if (promptState) {
        // For non-secret prompts, paste at cursor position
        if (!promptState.options.secret) {
          const cp = promptCursorPos;
          const sel = promptSelectionStart;
          setPromptState((s) => {
            if (!s) return s;
            const prev = s.input;
            if (sel != null && sel !== cp) {
              const a = Math.min(sel, cp);
              const b = Math.max(sel, cp);
              const next = a + normalized.length;
              setPromptCursorPos(next);
              setPromptSelectionStart(null);
              return { ...s, input: prev.slice(0, a) + normalized + prev.slice(b) };
            }
            const next = cp + normalized.length;
            setPromptCursorPos(next);
            return { ...s, input: prev.slice(0, cp) + normalized + prev.slice(cp) };
          });
        } else {
          // Secret mode: replace entire input
          setPromptState((s) => (s ? { ...s, input: normalized } : s));
        }
        return;
      }
      if (pickerState && pickerFilterFocused) {
        const cp = filterCursorPos;
        const sel = filterSelectionStart;
        setTypedQuery((prev) => {
          if (sel != null && sel !== cp) {
            const a = Math.min(sel, cp);
            const b = Math.max(sel, cp);
            return prev.slice(0, a) + normalized + prev.slice(b);
          }
          return prev.slice(0, cp) + normalized + prev.slice(cp);
        });
        setFilterCursorPos((sel != null && sel !== cp ? Math.min(sel, cp) : cp) + normalized.length);
        setFilterSelectionStart(null);
        return;
      }
      if (store.searchVisible) {
        const cp = searchCursorPos;
        const sel = searchSelectionStart;
        setTypedQuery((prev) => {
          if (sel != null && sel !== cp) {
            const a = Math.min(sel, cp);
            const b = Math.max(sel, cp);
            return prev.slice(0, a) + normalized + prev.slice(b);
          }
          return prev.slice(0, cp) + normalized + prev.slice(cp);
        });
        setSearchCursorPos((sel != null && sel !== cp ? Math.min(sel, cp) : cp) + normalized.length);
        setSearchSelectionStart(null);
      }
    },
    { isActive: Boolean(promptState || (pickerState && pickerFilterFocused) || store.searchVisible) },
  );

  // Word-boundary helpers (mirrors the same logic in InputView.tsx)
  const wordBoundaryLeft = (text: string, pos: number): number => {
    let p = pos;
    while (p > 0 && text[p - 1] === " ") p--;
    while (p > 0 && text[p - 1] !== " ") p--;
    return p;
  };

  const wordBoundaryRight = (text: string, pos: number): number => {
    let p = pos;
    while (p < text.length && text[p] === " ") p++;
    while (p < text.length && text[p] !== " ") p++;
    return p;
  };

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
      const pickerFilterQuery = typedQuery;
      const resetPickerSelection = (): void => {
        setPickerState((s) => (s ? { ...s, selectedIndex: 0 } : s));
      };
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
          const len = filterPickerItems(s.items, pickerFilterQuery).length;
          if (len === 0) return s;
          const next = ((s.selectedIndex - 1 + len) % len);
          return { ...s, selectedIndex: next };
        });
        return;
      }
      if (key.downArrow) {
        setPickerState((s) => {
          if (!s) return s;
          const len = filterPickerItems(s.items, pickerFilterQuery).length;
          if (len === 0) return s;
          const next = ((s.selectedIndex + 1) % len);
          return { ...s, selectedIndex: next };
        });
        return;
      }
      if (key.return) {
        if (pickerResolveRef.current) {
          const picked = resolvePickerSelection(
            pickerState.items,
            pickerFilterQuery,
            pickerState.selectedIndex,
          );
          resolve?.(picked ?? null);
          pickerResolveRef.current = null;
          setPickerState(null);
          setTypedQuery("");
          return;
        }
      }
      if (pickerFilterFocused) {
        // ---- Editor shortcuts for picker filter input (mirrors InputView.tsx) ----
        if ((key.meta || key.ctrl) && !key.shift && key.leftArrow) {
          setFilterSelectionStart(null);
          setFilterCursorPos((prev) => wordBoundaryLeft(typedQuery, prev));
          return;
        }
        if ((key.meta || key.ctrl) && !key.shift && key.rightArrow) {
          setFilterSelectionStart(null);
          setFilterCursorPos((prev) => wordBoundaryRight(typedQuery, prev));
          return;
        }
        if ((key.meta || key.ctrl) && key.shift && key.leftArrow) {
          setFilterCursorPos((prev) => {
            if (filterSelectionStart == null) setFilterSelectionStart(prev);
            return wordBoundaryLeft(typedQuery, prev);
          });
          return;
        }
        if ((key.meta || key.ctrl) && key.shift && key.rightArrow) {
          setFilterCursorPos((prev) => {
            if (filterSelectionStart == null) setFilterSelectionStart(prev);
            return wordBoundaryRight(typedQuery, prev);
          });
          return;
        }
        if (!key.ctrl && !key.meta && !key.shift && key.leftArrow) {
          setFilterSelectionStart(null);
          setFilterCursorPos((prev) => Math.max(0, prev - 1));
          return;
        }
        if (!key.ctrl && !key.meta && !key.shift && key.rightArrow) {
          setFilterSelectionStart(null);
          setFilterCursorPos((prev) => Math.min(typedQuery.length, prev + 1));
          return;
        }
        if (!key.ctrl && !key.meta && key.shift && key.leftArrow) {
          setFilterCursorPos((prev) => {
            if (filterSelectionStart == null) setFilterSelectionStart(prev);
            return Math.max(0, prev - 1);
          });
          return;
        }
        if (!key.ctrl && !key.meta && key.shift && key.rightArrow) {
          setFilterCursorPos((prev) => {
            if (filterSelectionStart == null) setFilterSelectionStart(prev);
            return Math.min(typedQuery.length, prev + 1);
          });
          return;
        }
        if (key.home || (key.ctrl && input === "a")) {
          setFilterSelectionStart(null);
          setFilterCursorPos(0);
          return;
        }
        if (key.end || (key.ctrl && input === "e")) {
          setFilterSelectionStart(null);
          setFilterCursorPos(typedQuery.length);
          return;
        }
        if (key.ctrl && input === "u") {
          setTypedQuery("");
          setFilterCursorPos(0);
          setFilterSelectionStart(null);
          resetPickerSelection();
          return;
        }
        if (key.ctrl && input === "k") {
          setTypedQuery((prev) => prev.slice(0, filterCursorPos));
          resetPickerSelection();
          return;
        }
        if (key.ctrl && input === "w") {
          setTypedQuery((prev) => {
            const cp = filterCursorPos;
            const start = wordBoundaryLeft(prev, cp);
            setFilterCursorPos(start);
            setFilterSelectionStart(null);
            return prev.slice(0, start) + prev.slice(cp);
          });
          resetPickerSelection();
          return;
        }
        if (key.meta && input === "d") {
          setTypedQuery((prev) => {
            const cp = filterCursorPos;
            const end = wordBoundaryRight(prev, cp);
            return prev.slice(0, cp) + prev.slice(end);
          });
          resetPickerSelection();
          return;
        }
        if ((key.meta || key.ctrl) && key.backspace) {
          setTypedQuery((prev) => {
            const cp = filterCursorPos;
            const start = wordBoundaryLeft(prev, cp);
            setFilterCursorPos(start);
            setFilterSelectionStart(null);
            return prev.slice(0, start) + prev.slice(cp);
          });
          resetPickerSelection();
          return;
        }
        if (key.backspace && !key.ctrl && !key.meta) {
          setTypedQuery((prev) => {
            const cp = filterCursorPos;
            if (filterSelectionStart != null) {
              const a = Math.min(filterSelectionStart, cp);
              const b = Math.max(filterSelectionStart, cp);
              setFilterCursorPos(a);
              setFilterSelectionStart(null);
              return prev.slice(0, a) + prev.slice(b);
            }
            if (cp > 0) {
              setFilterCursorPos(cp - 1);
              return prev.slice(0, cp - 1) + prev.slice(cp);
            }
            return prev;
          });
          resetPickerSelection();
          return;
        }
        if (key.delete) {
          setTypedQuery((prev) => {
            const cp = filterCursorPos;
            if (filterSelectionStart != null) {
              const a = Math.min(filterSelectionStart, cp);
              const b = Math.max(filterSelectionStart, cp);
              setFilterCursorPos(a);
              setFilterSelectionStart(null);
              return prev.slice(0, a) + prev.slice(b);
            }
            if (cp < prev.length) {
              return prev.slice(0, cp) + prev.slice(cp + 1);
            }
            return prev;
          });
          resetPickerSelection();
          return;
        }
        if (!key.ctrl && !key.meta && input && input.length === 1) {
          const cp = filterCursorPos;
          const sel = filterSelectionStart;
          setTypedQuery((prev) => {
            if (sel != null && sel !== cp) {
              const a = Math.min(sel, cp);
              const b = Math.max(sel, cp);
              return prev.slice(0, a) + input + prev.slice(b);
            }
            return prev.slice(0, cp) + input + prev.slice(cp);
          });
          setFilterCursorPos((sel != null && sel !== cp ? Math.min(sel, cp) : cp) + 1);
          setFilterSelectionStart(null);
          resetPickerSelection();
          return;
        }
      } else {
        // Items-focused: typing always appends, backspace removes last char
        if (input && input.length === 1 && !key.ctrl && !key.meta) {
          setTypedQuery((q) => q + input);
          resetPickerSelection();
          return;
        }
        if (key.backspace && !key.ctrl && !key.meta) {
          setTypedQuery((q) => q.slice(0, -1));
          resetPickerSelection();
          return;
        }
      }
      return;
    }

    // ---- Secret prompt overlay (API keys) ----
    if (promptState?.options.secret) {
      const resolve = promptResolveRef.current;

      const pasteSecretFromClipboard = (): void => {
        void readClipboardRobust().then((clip) => {
          const normalized = normalizeSecretClipboardPaste(clip);
          if (!normalized) return;
          setPromptState((s) => (s ? { ...s, input: normalized } : s));
        });
      };

      if (key.escape) {
        resolve?.(null);
        promptResolveRef.current = null;
        setPromptState(null);
        setPromptCursorPos(0);
        setPromptSelectionStart(null);
        return;
      }
      if (key.return) {
        resolve?.(promptState.input.trim());
        promptResolveRef.current = null;
        setPromptState(null);
        setPromptCursorPos(0);
        setPromptSelectionStart(null);
        return;
      }
      if (isSecretPromptPasteKey(input, key)) {
        pasteSecretFromClipboard();
        return;
      }
      if (key.backspace && !key.ctrl && !key.meta) {
        setPromptState((s) => (s ? { ...s, input: s.input.slice(0, -1) } : s));
        return;
      }
      if (!key.ctrl && !key.meta && input && input.length === 1) {
        setPromptState((s) => (s ? { ...s, input: s.input + input } : s));
        return;
      }
      return;
    }

    // ---- Prompt overlay editor shortcuts (non-secret) ----
    if (promptState && !promptState.options.secret) {
      const resolve = promptResolveRef.current;
      const cp = promptCursorPos;
      const sel = promptSelectionStart;

      if (key.escape) {
        resolve?.(null);
        promptResolveRef.current = null;
        setPromptState(null);
        setPromptCursorPos(0);
        setPromptSelectionStart(null);
        return;
      }
      if (key.return) {
        resolve?.(promptState.input.trim());
        promptResolveRef.current = null;
        setPromptState(null);
        setPromptCursorPos(0);
        setPromptSelectionStart(null);
        return;
      }

      // Word jump (Ctrl/Meta + Left/Right, no Shift)
      if ((key.meta || key.ctrl) && !key.shift && key.leftArrow) {
        setPromptSelectionStart(null);
        setPromptCursorPos((prev) => wordBoundaryLeft(promptState.input, prev));
        return;
      }
      if ((key.meta || key.ctrl) && !key.shift && key.rightArrow) {
        setPromptSelectionStart(null);
        setPromptCursorPos((prev) => wordBoundaryRight(promptState.input, prev));
        return;
      }

      // Word selection (Ctrl/Meta + Shift + Left/Right)
      if ((key.meta || key.ctrl) && key.shift && key.leftArrow) {
        setPromptCursorPos((prev) => {
          if (promptSelectionStart == null) setPromptSelectionStart(prev);
          return wordBoundaryLeft(promptState.input, prev);
        });
        return;
      }
      if ((key.meta || key.ctrl) && key.shift && key.rightArrow) {
        setPromptCursorPos((prev) => {
          if (promptSelectionStart == null) setPromptSelectionStart(prev);
          return wordBoundaryRight(promptState.input, prev);
        });
        return;
      }

      // Character navigation (Left/Right without modifiers)
      if (!key.ctrl && !key.meta && !key.shift && key.leftArrow) {
        setPromptSelectionStart(null);
        setPromptCursorPos((prev) => Math.max(0, prev - 1));
        return;
      }
      if (!key.ctrl && !key.meta && !key.shift && key.rightArrow) {
        setPromptSelectionStart(null);
        setPromptCursorPos((prev) => Math.min(promptState.input.length, prev + 1));
        return;
      }

      // Character selection (Shift+Left/Right without Ctrl/Meta)
      if (!key.ctrl && !key.meta && key.shift && key.leftArrow) {
        setPromptCursorPos((prev) => {
          if (promptSelectionStart == null) setPromptSelectionStart(prev);
          return Math.max(0, prev - 1);
        });
        return;
      }
      if (!key.ctrl && !key.meta && key.shift && key.rightArrow) {
        setPromptCursorPos((prev) => {
          if (promptSelectionStart == null) setPromptSelectionStart(prev);
          return Math.min(promptState.input.length, prev + 1);
        });
        return;
      }

      // Home / Ctrl+A
      if (key.home || (key.ctrl && input === "a")) {
        setPromptSelectionStart(null);
        setPromptCursorPos(0);
        return;
      }

      // End / Ctrl+E
      if (key.end || (key.ctrl && input === "e")) {
        setPromptSelectionStart(null);
        setPromptCursorPos(promptState.input.length);
        return;
      }

      // Ctrl+U — delete line
      if (key.ctrl && input === "u") {
        setPromptState((s) => (s ? { ...s, input: "" } : s));
        setPromptCursorPos(0);
        setPromptSelectionStart(null);
        return;
      }

      // Ctrl+K — delete to end
      if (key.ctrl && input === "k") {
        setPromptState((s) => (s ? { ...s, input: s.input.slice(0, promptCursorPos) } : s));
        return;
      }

      // Ctrl+W — delete word left
      if (key.ctrl && input === "w") {
        setPromptState((s) => {
          if (!s) return s;
          const c = s.input;
          const start = wordBoundaryLeft(c, promptCursorPos);
          setPromptCursorPos(start);
          setPromptSelectionStart(null);
          return { ...s, input: c.slice(0, start) + c.slice(promptCursorPos) };
        });
        return;
      }

      // Meta+D — delete word right
      if (key.meta && input === "d") {
        setPromptState((s) => {
          if (!s) return s;
          const c = s.input;
          const end = wordBoundaryRight(c, promptCursorPos);
          return { ...s, input: c.slice(0, promptCursorPos) + c.slice(end) };
        });
        return;
      }

      // Ctrl/Meta + Backspace — delete word left
      if ((key.meta || key.ctrl) && key.backspace) {
        setPromptState((s) => {
          if (!s) return s;
          const c = s.input;
          const start = wordBoundaryLeft(c, promptCursorPos);
          setPromptCursorPos(start);
          setPromptSelectionStart(null);
          return { ...s, input: c.slice(0, start) + c.slice(promptCursorPos) };
        });
        return;
      }

      // Backspace
      if (key.backspace && !key.ctrl && !key.meta) {
        setPromptState((s) => {
          if (!s) return s;
          const c = s.input;
          if (promptSelectionStart != null) {
            const a = Math.min(promptSelectionStart, promptCursorPos);
            const b = Math.max(promptSelectionStart, promptCursorPos);
            setPromptCursorPos(a);
            setPromptSelectionStart(null);
            return { ...s, input: c.slice(0, a) + c.slice(b) };
          }
          if (promptCursorPos > 0) {
            setPromptCursorPos(promptCursorPos - 1);
            return { ...s, input: c.slice(0, promptCursorPos - 1) + c.slice(promptCursorPos) };
          }
          return s;
        });
        return;
      }

      // Delete
      if (key.delete) {
        setPromptState((s) => {
          if (!s) return s;
          const c = s.input;
          if (promptSelectionStart != null) {
            const a = Math.min(promptSelectionStart, promptCursorPos);
            const b = Math.max(promptSelectionStart, promptCursorPos);
            setPromptCursorPos(a);
            setPromptSelectionStart(null);
            return { ...s, input: c.slice(0, a) + c.slice(b) };
          }
          if (promptCursorPos < c.length) {
            return { ...s, input: c.slice(0, promptCursorPos) + c.slice(promptCursorPos + 1) };
          }
          return s;
        });
        return;
      }

      // Regular character typing with cursor support
      if (!key.ctrl && !key.meta && input && input.length === 1) {
        setPromptState((s) => {
          if (!s) return s;
          const c = s.input;
          if (sel != null && sel !== cp) {
            const a = Math.min(sel, cp);
            const b = Math.max(sel, cp);
            return { ...s, input: c.slice(0, a) + input + c.slice(b) };
          }
          return { ...s, input: c.slice(0, cp) + input + c.slice(cp) };
        });
        setPromptCursorPos((sel != null && sel !== cp ? Math.min(sel, cp) : cp) + 1);
        setPromptSelectionStart(null);
        return;
      }
    }

    if (deviceLoginText) {
      if (key.escape || input === "q") {
        deviceLoginResolveRef.current?.(new Error("cancelled"));
        deviceLoginResolveRef.current = null;
        setDeviceLoginText(null);
      }
      return;
    }

    // ---- Editor shortcuts for search filter (same pattern as picker) ----
    if (store.searchVisible) {
      const cp = searchCursorPos;
      const sel = searchSelectionStart;

      if (key.escape) {
        store.setSearchVisible(false);
        store.setSearchQuery("");
        setTypedQuery("");
        setSearchCursorPos(0);
        setSearchSelectionStart(null);
        return;
      }
      if (key.return) {
        store.setSearchVisible(false);
        store.setSearchQuery(typedQuery);
        return;
      }

      // Word jump (Ctrl/Meta + Left/Right, no Shift)
      if ((key.meta || key.ctrl) && !key.shift && key.leftArrow) {
        setSearchSelectionStart(null);
        setSearchCursorPos((prev) => wordBoundaryLeft(typedQuery, prev));
        return;
      }
      if ((key.meta || key.ctrl) && !key.shift && key.rightArrow) {
        setSearchSelectionStart(null);
        setSearchCursorPos((prev) => wordBoundaryRight(typedQuery, prev));
        return;
      }

      // Word selection (Ctrl/Meta + Shift + Left/Right)
      if ((key.meta || key.ctrl) && key.shift && key.leftArrow) {
        setSearchCursorPos((prev) => {
          if (searchSelectionStart == null) setSearchSelectionStart(prev);
          return wordBoundaryLeft(typedQuery, prev);
        });
        return;
      }
      if ((key.meta || key.ctrl) && key.shift && key.rightArrow) {
        setSearchCursorPos((prev) => {
          if (searchSelectionStart == null) setSearchSelectionStart(prev);
          return wordBoundaryRight(typedQuery, prev);
        });
        return;
      }

      // Character navigation (Left/Right without modifiers)
      if (!key.ctrl && !key.meta && !key.shift && key.leftArrow) {
        setSearchSelectionStart(null);
        setSearchCursorPos((prev) => Math.max(0, prev - 1));
        return;
      }
      if (!key.ctrl && !key.meta && !key.shift && key.rightArrow) {
        setSearchSelectionStart(null);
        setSearchCursorPos((prev) => Math.min(typedQuery.length, prev + 1));
        return;
      }

      // Character selection (Shift+Left/Right without Ctrl/Meta)
      if (!key.ctrl && !key.meta && key.shift && key.leftArrow) {
        setSearchCursorPos((prev) => {
          if (searchSelectionStart == null) setSearchSelectionStart(prev);
          return Math.max(0, prev - 1);
        });
        return;
      }
      if (!key.ctrl && !key.meta && key.shift && key.rightArrow) {
        setSearchCursorPos((prev) => {
          if (searchSelectionStart == null) setSearchSelectionStart(prev);
          return Math.min(typedQuery.length, prev + 1);
        });
        return;
      }

      // Home / Ctrl+A → cursor to start
      if (key.home || (key.ctrl && input === "a")) {
        setSearchSelectionStart(null);
        setSearchCursorPos(0);
        return;
      }

      // End / Ctrl+E → cursor to end
      if (key.end || (key.ctrl && input === "e")) {
        setSearchSelectionStart(null);
        setSearchCursorPos(typedQuery.length);
        return;
      }

      // Ctrl+U → delete entire line
      if (key.ctrl && input === "u") {
        setTypedQuery("");
        setSearchCursorPos(0);
        setSearchSelectionStart(null);
        return;
      }

      // Ctrl+K → delete from cursor to end
      if (key.ctrl && input === "k") {
        setTypedQuery((prev) => prev.slice(0, searchCursorPos));
        return;
      }

      // Ctrl+W → delete word left
      if (key.ctrl && input === "w") {
        setTypedQuery((prev) => {
          const c = searchCursorPos;
          const start = wordBoundaryLeft(prev, c);
          setSearchCursorPos(start);
          setSearchSelectionStart(null);
          return prev.slice(0, start) + prev.slice(c);
        });
        return;
      }

      // Meta+D → delete word right
      if (key.meta && input === "d") {
        setTypedQuery((prev) => {
          const c = searchCursorPos;
          const end = wordBoundaryRight(prev, c);
          return prev.slice(0, c) + prev.slice(end);
        });
        return;
      }

      // Ctrl/Meta + Backspace → delete word left
      if ((key.meta || key.ctrl) && key.backspace) {
        setTypedQuery((prev) => {
          const c = searchCursorPos;
          const start = wordBoundaryLeft(prev, c);
          setSearchCursorPos(start);
          setSearchSelectionStart(null);
          return prev.slice(0, start) + prev.slice(c);
        });
        return;
      }

      // Backspace
      if (key.backspace && !key.ctrl && !key.meta) {
        setTypedQuery((prev) => {
          const c = searchCursorPos;
          if (searchSelectionStart != null) {
            const a = Math.min(searchSelectionStart, c);
            const b = Math.max(searchSelectionStart, c);
            setSearchCursorPos(a);
            setSearchSelectionStart(null);
            return prev.slice(0, a) + prev.slice(b);
          }
          if (c > 0) {
            setSearchCursorPos(c - 1);
            return prev.slice(0, c - 1) + prev.slice(c);
          }
          return prev;
        });
        return;
      }

      // Delete
      if (key.delete) {
        setTypedQuery((prev) => {
          const c = searchCursorPos;
          if (searchSelectionStart != null) {
            const a = Math.min(searchSelectionStart, c);
            const b = Math.max(searchSelectionStart, c);
            setSearchCursorPos(a);
            setSearchSelectionStart(null);
            return prev.slice(0, a) + prev.slice(b);
          }
          if (c < prev.length) {
            return prev.slice(0, c) + prev.slice(c + 1);
          }
          return prev;
        });
        return;
      }

      // Regular character typing
      if (!key.ctrl && !key.meta && input && input.length === 1) {
        setTypedQuery((prev) => {
          if (sel != null && sel !== cp) {
            const a = Math.min(sel, cp);
            const b = Math.max(sel, cp);
            return prev.slice(0, a) + input + prev.slice(b);
          }
          return prev.slice(0, cp) + input + prev.slice(cp);
        });
        setSearchCursorPos((sel != null && sel !== cp ? Math.min(sel, cp) : cp) + 1);
        setSearchSelectionStart(null);
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
          if (s.connectProvider && callbacks.onSetupProvider) {
            setSlashSuggestions([]);
            setSlashSelectedIndex(0);
            setInputValue("");
            store.inputValue = "";
            void callbacks.onSetupProvider(s.connectProvider);
            return;
          }
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
          ref={messageAreaRef}
          flexGrow={1}
          flexDirection="column"
          backgroundColor={THEME.bgInset}
        >
          <MessageView
            store={store}
            scrollOffset={store.scrollOffset}
            onScroll={(offset) => store.setScrollOffset(offset)}
            terminalWidth={termWidth}
            terminalHeight={termHeight}
            viewportHeight={messageAreaHeight}
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
                  const filtered = filterPickerItems(pickerState.items, typedQuery);
                  const len = Math.max(filtered.length, 0);
                  const si =
                    len === 0
                      ? 0
                      : Math.min(pickerState.selectedIndex, len - 1);
                  return { ...pickerState, selectedIndex: si, filterQuery: typedQuery, filterCursorPos: pickerFilterFocused ? filterCursorPos : undefined, filterSelectionStart: pickerFilterFocused ? (filterSelectionStart ?? undefined) : undefined };
                })()
              : null
          }
          filterFocused={pickerFilterFocused}
        />
        <PromptOverlay state={promptState ? { ...promptState, cursorPos: promptCursorPos, selectionStart: promptSelectionStart ?? undefined } : null} />
        {deviceLoginText ? (
          <DeviceLoginOverlay state={{ status: deviceLoginText }} />
        ) : null}
        <ConfirmModal dialog={store.confirmDialog} />
        {store.searchVisible ? <SearchOverlay query={typedQuery} cursorPos={searchCursorPos} selectionStart={searchSelectionStart ?? undefined} /> : null}
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
