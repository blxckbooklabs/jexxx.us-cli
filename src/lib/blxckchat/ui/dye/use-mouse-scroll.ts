import { useEffect, useRef } from "react";
import { useStdin, parseMouse } from "@sauerapple/dye";
import { isBlessedMouseEnabled } from "../tty.js";

/**
 * SGR mouse tracking is already enabled app-wide by `<AlternateScreen
 * mouseTracking>` in DyeApp.tsx, and Dye's own input loop already parses
 * every mouse sequence via `parseMouse` — but its dispatcher
 * (App.js#handleMouseEvent) only switches on press/drag/release, silently
 * dropping wheel-up/wheel-down. Since raw stdin is a plain Node stream,
 * attaching a second listener here doesn't steal or duplicate anything
 * Dye's own listener sees; it just recovers the wheel events Dye discards.
 */

const WHEEL_LINES = 3;
const MOUSE_SEQUENCE_RE = /\x1b\[<\d+;\d+;\d+[Mm]/g;

export interface MouseScrollCallbacks {
  onScrollUp: () => void;
  onScrollDown: () => void;
}

export function useMouseScroll(
  callbacks: MouseScrollCallbacks,
  enabled: boolean,
): void {
  const { stdin, isRawModeSupported } = useStdin();
  const stateRef = useRef({ callbacks, enabled });
  stateRef.current = { callbacks, enabled };

  useEffect(() => {
    if (!isRawModeSupported || !isBlessedMouseEnabled()) return;

    const handleData = (chunk: Buffer | string): void => {
      if (!stateRef.current.enabled) return;
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (!text.includes("\x1b[<")) return;
      MOUSE_SEQUENCE_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = MOUSE_SEQUENCE_RE.exec(text)) !== null) {
        const parsed = parseMouse(match[0]);
        if (!parsed) continue;
        if (parsed.action === "wheel-up") {
          for (let i = 0; i < WHEEL_LINES; i++) stateRef.current.callbacks.onScrollUp();
        } else if (parsed.action === "wheel-down") {
          for (let i = 0; i < WHEEL_LINES; i++) stateRef.current.callbacks.onScrollDown();
        }
      }
    };

    stdin.on("data", handleData);
    return () => {
      stdin.off("data", handleData);
    };
  }, [stdin, isRawModeSupported]);
}
