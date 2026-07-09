import type blessed from "blessed";

import { escapeBlessed } from "../renderer/markdown.js";
import { copyToClipboard } from "../session/tui-snapshot.js";
import {
  applySelectionHighlight,
  getSelectedText,
  mouseToTextCell,
  selectionHasText,
  shouldCopyOnMouseUp,
  shouldCopyOnRightMouseDown,
  type TextSelectionState,
} from "./text-selection.js";

export interface AttachBlessedTextSelectionOptions {
  element: blessed.Widgets.BoxElement;
  screen: blessed.Widgets.Screen;
  getScroll: () => number;
  getSourceLines: () => string[];
  restoreRichContent: () => void;
  onCopied: () => void;
  onCopyFailed?: () => void;
  shouldIgnoreMouse?: (data: { x: number; y: number }) => boolean;
  enabled?: () => boolean;
}

export interface BlessedTextSelectionHandle {
  clear: () => void;
  hasSelection: () => boolean;
  isDragging: () => boolean;
}

export function attachBlessedTextSelection(
  options: AttachBlessedTextSelectionOptions,
): BlessedTextSelectionHandle {
  const { element, screen } = options;
  let selection: TextSelectionState | null = null;
  let showingHighlight = false;

  const isEnabled = (): boolean => options.enabled?.() ?? true;

  const clear = (): void => {
    if (!selection && !showingHighlight) return;
    selection = null;
    if (showingHighlight) {
      showingHighlight = false;
      options.restoreRichContent();
    }
  };

  const renderHighlight = (): void => {
    const lines = options.getSourceLines();
    if (!selection || lines.length === 0) return;
    const content = applySelectionHighlight(
      lines,
      selection.anchor,
      selection.focus,
      escapeBlessed,
    );
    (element as blessed.Widgets.BoxElement & { setContent: (c: string) => void }).setContent(
      content,
    );
    showingHighlight = true;
    screen.render();
  };

  const copySelection = async (): Promise<void> => {
    if (!selection) return;
    const lines = options.getSourceLines();
    const text = getSelectedText(lines, selection.anchor, selection.focus).trim();
    if (!text) return;
    const copied = await copyToClipboard(text);
    if (copied) {
      options.onCopied();
    } else {
      options.onCopyFailed?.();
    }
  };

  const finishSelection = (): void => {
    if (!selection) return;
    const lines = options.getSourceLines();
    const hadText = selectionHasText(lines, selection.anchor, selection.focus);
    selection.dragging = false;
    if (hadText) {
      void copySelection().finally(() => clear());
      return;
    }
    clear();
  };

  const onMouseDown = (data: { x: number; y: number; button?: string }): void => {
    if (!isEnabled() || options.shouldIgnoreMouse?.(data)) return;

    if (shouldCopyOnRightMouseDown() && data.button === "right") {
      if (selection && selectionHasText(options.getSourceLines(), selection.anchor, selection.focus)) {
        void copySelection().finally(() => clear());
      }
      return;
    }

    if (data.button && data.button !== "left") return;

    const cell = mouseToTextCell(element, data, options.getScroll());
    selection = { anchor: cell, focus: cell, dragging: true };
    renderHighlight();
  };

  const onMouseMove = (data: { x: number; y: number }): void => {
    if (!isEnabled() || !selection?.dragging || options.shouldIgnoreMouse?.(data)) return;
    selection.focus = mouseToTextCell(element, data, options.getScroll());
    renderHighlight();
  };

  const onMouseUp = (data: { x: number; y: number; button?: string }): void => {
    if (!isEnabled() || options.shouldIgnoreMouse?.(data)) return;
    if (!selection?.dragging) return;
    selection.focus = mouseToTextCell(element, data, options.getScroll());
    if (shouldCopyOnMouseUp()) {
      finishSelection();
      return;
    }
    selection.dragging = false;
    if (!selectionHasText(options.getSourceLines(), selection.anchor, selection.focus)) {
      clear();
    }
  };

  element.on("mousedown", onMouseDown);
  element.on("mousemove", onMouseMove);
  element.on("mouseup", onMouseUp);

  return {
    clear,
    hasSelection() {
      if (!selection) return false;
      return selectionHasText(
        options.getSourceLines(),
        selection.anchor,
        selection.focus,
      );
    },
    isDragging() {
      return selection?.dragging ?? false;
    },
  };
}