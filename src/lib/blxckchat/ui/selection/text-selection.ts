export interface TextCell {
  line: number;
  col: number;
}

export interface TextSelectionState {
  anchor: TextCell;
  focus: TextCell;
  dragging: boolean;
}

export function normalizeSelectionRange(
  anchor: TextCell,
  focus: TextCell,
): { start: TextCell; end: TextCell } {
  if (anchor.line < focus.line || (anchor.line === focus.line && anchor.col <= focus.col)) {
    return { start: anchor, end: focus };
  }
  return { start: focus, end: anchor };
}

export function clampCell(cell: TextCell, lines: string[]): TextCell {
  const line = Math.max(0, Math.min(cell.line, Math.max(0, lines.length - 1)));
  const lineText = lines[line] ?? "";
  return { line, col: Math.max(0, Math.min(cell.col, lineText.length)) };
}

export function getSelectedText(
  lines: string[],
  anchor: TextCell,
  focus: TextCell,
): string {
  const { start, end } = normalizeSelectionRange(
    clampCell(anchor, lines),
    clampCell(focus, lines),
  );

  if (start.line === end.line) {
    return (lines[start.line] ?? "").slice(start.col, end.col);
  }

  const parts: string[] = [];
  for (let li = start.line; li <= end.line; li++) {
    const line = lines[li] ?? "";
    if (li === start.line) parts.push(line.slice(start.col));
    else if (li === end.line) parts.push(line.slice(0, end.col));
    else parts.push(line);
  }
  return parts.join("\n");
}

export function selectionHasText(lines: string[], anchor: TextCell, focus: TextCell): boolean {
  return getSelectedText(lines, anchor, focus).trim().length > 0;
}

/** Apply blessed inverse highlight to a plain-text line grid. */
export function applySelectionHighlight(
  lines: string[],
  anchor: TextCell,
  focus: TextCell,
  escape: (line: string) => string,
): string {
  const { start, end } = normalizeSelectionRange(
    clampCell(anchor, lines),
    clampCell(focus, lines),
  );

  return lines
    .map((line, li) => {
      if (li < start.line || li > end.line) return escape(line);
      const s = li === start.line ? start.col : 0;
      const e = li === end.line ? end.col : line.length;
      if (s >= e) return escape(line);
      const before = escape(line.slice(0, s));
      const mid = escape(line.slice(s, e));
      const after = escape(line.slice(e));
      return `${before}{inverse}${mid}{/inverse}${after}`;
    })
    .join("\n");
}

export function mouseToTextCell(
  element: {
    aleft: number | string;
    atop: number | string;
    padding?: { left?: number; top?: number };
  },
  data: { x: number; y: number },
  scrollLine: number,
): TextCell {
  const aleft = Number(element.aleft) || 0;
  const atop = Number(element.atop) || 0;
  const padL = element.padding?.left ?? 0;
  const padT = element.padding?.top ?? 0;
  const col = Math.max(0, data.x - aleft - 1 - padL);
  const viewLine = Math.max(0, data.y - atop - 1 - padT);
  return { line: scrollLine + viewLine, col };
}

/** OpenCode-style: copy on mouse-up for macOS/Linux; Windows uses right-click. */
export function shouldCopyOnMouseUp(): boolean {
  return process.platform !== "win32";
}

export function shouldCopyOnRightMouseDown(): boolean {
  return process.platform === "win32";
}