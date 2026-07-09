import type blessed from "blessed";

export type BlessedKey = {
  name?: string;
  full?: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  ch?: string;
};

export function isPrintableKey(ch: string, key: BlessedKey): boolean {
  return (
    Boolean(ch) &&
    ch.length === 1 &&
    !key.ctrl &&
    !key.meta &&
    !/^[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]$/.test(ch)
  );
}

type BlessedProgram = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
};

export interface ModalKeypressController {
  start: (handler: (ch: string, key: BlessedKey) => void) => void;
  stop: () => void;
}

/** Capture keystrokes at the program level while an overlay is open. */
export function createModalKeypress(screen: blessed.Widgets.Screen): ModalKeypressController {
  let listener: ((ch: unknown, key: unknown) => void) | null = null;

  const program = screen.program as unknown as BlessedProgram;

  return {
    start(handler) {
      this.stop();
      listener = (ch, key) => {
        handler(String(ch ?? ""), (key ?? {}) as BlessedKey);
      };
      program.on("keypress", listener as (...args: unknown[]) => void);
      screen.grabKeys = true;
    },
    stop() {
      if (listener) {
        program.removeListener("keypress", listener as (...args: unknown[]) => void);
        listener = null;
      }
      screen.grabKeys = false;
    },
  };
}