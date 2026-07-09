import type blessed from "blessed";

import {
  listDivinityPersonas,
  type DivinityPersona,
} from "../../divinities/source.js";
import type { TerminalSession } from "../session/session-store.js";
import {
  activateDivinityPersona,
  formatDivinityActivationMessage,
} from "../../divinities/session.js";
import { createPickerOverlay, type PickerItem } from "./picker-overlay.js";

export interface DivinityPickerOverlayHandle {
  open: () => void;
  close: () => void;
  isVisible: () => boolean;
}

export interface DivinityPickerOverlayOptions {
  session: TerminalSession;
  getActiveDivinityId: () => string | null;
  onActivated: (message: string) => void;
  onChatCleared: () => void;
}

function toPickerItems(
  personas: DivinityPersona[],
  activeId: string | null,
): PickerItem[] {
  const clearRow: PickerItem = {
    id: "__clear__",
    label: "  Return to BLXCKCHAT (clear persona)",
    description: "Default agent · no divinity overlay",
  };

  const rows = personas.map((p) => {
    const marker = p.id === activeId ? "▸ " : "  ";
    const desc = [p.role, p.pillar].filter(Boolean).join(" · ");
    return {
      id: p.id,
      label: `${marker}${p.name}`,
      description: desc || p.relativePath,
    };
  });

  return [clearRow, ...rows];
}

function findActiveIndex(items: PickerItem[], activeId: string | null): number {
  if (!activeId) return 0;
  const idx = items.findIndex((i) => i.id === activeId);
  return idx >= 0 ? idx : 0;
}

export function createDivinityPickerOverlay(
  screen: blessed.Widgets.Screen,
  opts: DivinityPickerOverlayOptions,
): DivinityPickerOverlayHandle {
  const picker = createPickerOverlay(screen);

  picker.setOnPick((item) => {
    if (item.id === "__clear__") {
      opts.session.activeDivinity = null;
      opts.session.conversationHistory = [];
      opts.session.messages = [];
      opts.session.toolResults = [];
      opts.session.thinkingBlocks = [];
      opts.onChatCleared();
      opts.onActivated("Divinity cleared — BLXCKCHAT default agent restored.");
      return;
    }

    const persona = listDivinityPersonas().find((p) => p.id === item.id);
    if (!persona) return;

    activateDivinityPersona(opts.session, persona);
    opts.onChatCleared();
    opts.onActivated(formatDivinityActivationMessage(persona));
  });

  picker.setOnCancel(() => {});

  return {
    open() {
      const personas = listDivinityPersonas();
      if (personas.length === 0) {
        opts.onActivated(
          "No Divinities found. Set DIVINITIES_VAULT_PATH to your jexxx.us-obsidian/Divinities folder.",
        );
        return;
      }
      const activeId = opts.getActiveDivinityId();
      const items = toPickerItems(personas, activeId);
      picker.open(items, {
        title: "░ divinities ░",
        selectedIndex: findActiveIndex(items, activeId),
      });
    },
    close() {
      picker.close();
    },
    isVisible() {
      return picker.isVisible();
    },
  };
}