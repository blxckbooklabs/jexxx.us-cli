import React from "react";
import { Box, Text, useInput, useStdin, usePaste } from "@sauerapple/dye";
import { copyToClipboard } from "../session/tui-snapshot.js";

const PINK = "#ec4899";
const PINK_DIM = "#9d174d";
const PINK_GLOW = "#f472b6";
const TEXT = "#f5f5f5";
const TEXT_MUTED = "#a3a3a3";
const BG_ELEVATED = "#111111";
const BG_PANEL = "#0a0a0a";

interface InputViewProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onEscape: () => void;
  placeholder?: string;
  disabled?: boolean;
  slashVisible?: boolean;
  messageFocus?: boolean;
}

export const InputView: React.FC<InputViewProps> = ({
  value,
  onChange,
  onSubmit,
  onEscape,
  placeholder = "type a message…",
  disabled = false,
  slashVisible = false,
  messageFocus = false,
}) => {
  const [focused, setFocused] = React.useState(true);
  const [cursorPos, setCursorPos] = React.useState(value.length);
  const [selectionAnchor, setSelectionAnchor] = React.useState<number | null>(
    null,
  );
  const [history, setHistory] = React.useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = React.useState(-1);
  const [draft, setDraft] = React.useState("");

  React.useEffect(() => {
    setCursorPos((prev) => Math.min(prev, value.length));
  }, [value]);

  usePaste((text) => {
    if (disabled) return;
    let next: string;
    let newPos: number;
    if (hasSelection()) {
      const s = selRange();
      next = value.slice(0, s[0]) + text + value.slice(s[1]);
      newPos = s[0] + text.length;
      setSelectionAnchor(null);
    } else {
      next = value.slice(0, cursorPos) + text + value.slice(cursorPos);
      newPos = cursorPos + text.length;
    }
    setCursorPos(newPos);
    onChange(next);
  });

  const selCopyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  React.useEffect(() => {
    if (selCopyTimerRef.current) clearTimeout(selCopyTimerRef.current);
    const hasSel = selectionAnchor !== null && selectionAnchor !== cursorPos;
    if (hasSel) {
      selCopyTimerRef.current = setTimeout(() => {
        const s = selRange();
        const selected = value.slice(s[0], s[1]);
        if (selected) copyToClipboard(selected);
      }, 200);
    }
    return () => {
      if (selCopyTimerRef.current) clearTimeout(selCopyTimerRef.current);
    };
  }, [selectionAnchor, cursorPos, value]);

  function hasSelection(): boolean {
    return selectionAnchor !== null && selectionAnchor !== cursorPos;
  }

  function selRange(): [number, number] {
    const a = selectionAnchor ?? cursorPos;
    return a < cursorPos ? [a, cursorPos] : [cursorPos, a];
  }

  function clearSel(): void {
    setSelectionAnchor(null);
  }

  function deleteSelection(): void {
    const s = selRange();
    onChange(value.slice(0, s[0]) + value.slice(s[1]));
    setCursorPos(s[0]);
    clearSel();
  }

  useInput((input, key) => {
    if (disabled) return;

    if (key.escape) {
      if (slashVisible) return;
      if (hasSelection()) {
        clearSel();
        return;
      }
      onEscape();
      return;
    }
    if (key.ctrl && input === "c") return;
    if (key.ctrl && input === "d") return;

    if (key.return) {
      if (slashVisible) return;
      if (hasSelection()) clearSel();
      const trimmed = value.trim();
      if (trimmed) {
        setHistory((prev) => [...prev, trimmed]);
        setHistoryIdx(history.length + 1);
      }
      onSubmit(trimmed);
      return;
    }

    if ((key.backspace || key.delete) && hasSelection()) {
      deleteSelection();
      return;
    }

    if (key.backspace || key.delete) {
      if (cursorPos > 0) {
        const next = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
        setCursorPos(cursorPos - 1);
        onChange(next);
      }
      return;
    }

    // --- Selection with Shift ---
    if (key.shift && key.leftArrow && !key.ctrl && !key.meta) {
      if (!hasSelection()) setSelectionAnchor(cursorPos);
      if (cursorPos > 0) setCursorPos(cursorPos - 1);
      return;
    }

    if (key.shift && key.rightArrow && !key.ctrl && !key.meta) {
      if (!hasSelection()) setSelectionAnchor(cursorPos);
      if (cursorPos < value.length) setCursorPos(cursorPos + 1);
      return;
    }

    if (key.shift && key.home) {
      if (!hasSelection()) setSelectionAnchor(cursorPos);
      setCursorPos(0);
      return;
    }

    if (key.shift && key.end) {
      if (!hasSelection()) setSelectionAnchor(cursorPos);
      setCursorPos(value.length);
      return;
    }

    // --- Line selection: Ctrl+Shift+Left/Right ---
    if (key.ctrl && key.shift && key.leftArrow) {
      if (!hasSelection()) setSelectionAnchor(cursorPos);
      setCursorPos(0);
      return;
    }

    if (key.ctrl && key.shift && key.rightArrow) {
      if (!hasSelection()) setSelectionAnchor(cursorPos);
      setCursorPos(value.length);
      return;
    }

    // --- Word selection: Alt+Shift+Left/Right ---
    if (key.meta && key.shift && input === "B") {
      if (!hasSelection()) setSelectionAnchor(cursorPos);
      let pos = cursorPos;
      while (pos > 0 && value[pos - 1] === " ") pos--;
      while (pos > 0 && value[pos - 1] !== " ") pos--;
      setCursorPos(pos);
      return;
    }

    if (key.meta && key.shift && input === "F") {
      if (!hasSelection()) setSelectionAnchor(cursorPos);
      let pos = cursorPos;
      while (pos < value.length && value[pos] === " ") pos++;
      while (pos < value.length && value[pos] !== " ") pos++;
      setCursorPos(pos);
      return;
    }

    if (key.upArrow) {
      if (slashVisible || messageFocus) return;
      if (hasSelection()) clearSel();
      if (historyIdx > 0) {
        const newIdx = historyIdx - 1;
        if (newIdx === history.length - 1) setDraft(value);
        setHistoryIdx(newIdx);
        onChange(history[newIdx] ?? "");
        setCursorPos((history[newIdx] ?? "").length);
      }
      return;
    }

    if (key.downArrow) {
      if (slashVisible || messageFocus) return;
      if (hasSelection()) clearSel();
      if (historyIdx < history.length - 1) {
        const newIdx = historyIdx + 1;
        setHistoryIdx(newIdx);
        onChange(history[newIdx] ?? "");
        setCursorPos((history[newIdx] ?? "").length);
      } else if (historyIdx === history.length - 1) {
        setHistoryIdx(history.length);
        onChange(draft);
        setCursorPos(draft.length);
      }
      return;
    }

    if (key.leftArrow && !key.shift) {
      clearSel();
      setCursorPos(Math.max(0, cursorPos - 1));
      return;
    }

    if (key.rightArrow && !key.shift) {
      clearSel();
      setCursorPos(Math.min(value.length, cursorPos + 1));
      return;
    }

    if (
      key.home ||
      (key.ctrl && input === "a") ||
      (key.meta && input === "a")
    ) {
      clearSel();
      setCursorPos(0);
      return;
    }

    if (key.end || (key.ctrl && input === "e") || (key.meta && input === "e")) {
      clearSel();
      setCursorPos(value.length);
      return;
    }

    if (key.meta && input === "b") {
      clearSel();
      let pos = cursorPos;
      while (pos > 0 && value[pos - 1] === " ") pos--;
      while (pos > 0 && value[pos - 1] !== " ") pos--;
      setCursorPos(pos);
      return;
    }

    if (key.meta && input === "f") {
      clearSel();
      let pos = cursorPos;
      while (pos < value.length && value[pos] === " ") pos++;
      while (pos < value.length && value[pos] !== " ") pos++;
      setCursorPos(pos);
      return;
    }

    if (key.meta && input === "d") {
      if (hasSelection()) {
        deleteSelection();
        return;
      }
      let end = cursorPos;
      while (end < value.length && value[end] === " ") end++;
      while (end < value.length && value[end] !== " ") end++;
      onChange(value.slice(0, cursorPos) + value.slice(end));
      return;
    }

    if (key.ctrl && input === "u") {
      clearSel();
      onChange("");
      setCursorPos(0);
      return;
    }

    if (key.ctrl && input === "k") {
      if (hasSelection()) {
        deleteSelection();
        return;
      }
      onChange(value.slice(0, cursorPos));
      return;
    }

    if (key.ctrl && input === "w") {
      if (hasSelection()) {
        deleteSelection();
        return;
      }
      const before = value.slice(0, cursorPos);
      const after = value.slice(cursorPos);
      const trimmed = before.replace(/\S+\s*$/, "");
      onChange(trimmed + after);
      setCursorPos(trimmed.length);
      return;
    }

    if (input && input.length > 0 && input.charCodeAt(0) >= 32) {
      if (hasSelection()) {
        const s = selRange();
        const next = value.slice(0, s[0]) + input + value.slice(s[1]);
        setCursorPos(s[0] + input.length);
        clearSel();
        onChange(next);
      } else {
        const next = value.slice(0, cursorPos) + input + value.slice(cursorPos);
        setCursorPos(cursorPos + input.length);
        onChange(next);
      }
    }
  });

  const displayText = value || placeholder;
  const isPlaceholder = value.length === 0;
  const cursorIdx = Math.min(cursorPos, Math.max(0, displayText.length - 1));

  const selForward = selectionAnchor !== null && cursorPos > selectionAnchor;
  const selBackward = selectionAnchor !== null && cursorPos < selectionAnchor;

  return (
    <Box
      width="100%"
      borderStyle="round"
      borderColor={disabled ? PINK : focused ? PINK_GLOW : PINK}
      backgroundColor={focused ? BG_PANEL : BG_ELEVATED}
      paddingLeft={1}
      height={3}
    >
      {isPlaceholder ? (
        <Text color={TEXT_MUTED}>{placeholder}</Text>
      ) : selForward ? (
        <Text color={TEXT}>
          {displayText.slice(0, selectionAnchor)}
          <Text inverse color={PINK}>
            {displayText.slice(selectionAnchor, cursorPos)}
          </Text>
          <Text inverse>{displayText[cursorPos] ?? " "}</Text>
          {displayText.slice(cursorPos + 1)}
        </Text>
      ) : selBackward ? (
        <Text color={TEXT}>
          {displayText.slice(0, cursorPos)}
          <Text inverse>{displayText[cursorPos] ?? " "}</Text>
          <Text inverse color={PINK}>
            {displayText.slice(cursorPos + 1, selectionAnchor ?? 0)}
          </Text>
          {displayText.slice(selectionAnchor ?? 0)}
        </Text>
      ) : (
        <Text color={TEXT}>
          {displayText.slice(0, cursorIdx)}
          <Text inverse>{displayText[cursorIdx] ?? " "}</Text>
          {displayText.slice(cursorIdx + 1)}
        </Text>
      )}
    </Box>
  );
};
