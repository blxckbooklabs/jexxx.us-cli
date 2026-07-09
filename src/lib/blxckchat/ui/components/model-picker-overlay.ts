import type blessed from "blessed";

import type { StoredProviderConfig } from "../../config.js";
import { upsertProvider } from "../../config.js";
import { listModelOptions, type ModelOption } from "../../providers/models.js";
import { resolveProvider } from "../../providers/registry.js";
import type { Provider } from "../../providers/types.js";
import { createPickerOverlay, type PickerItem } from "./picker-overlay.js";

export interface ModelPickerOverlayHandle {
  open: () => Promise<void>;
  close: () => void;
  isVisible: () => boolean;
}

export interface ModelPickerOverlayOptions {
  getActiveConfig: () => StoredProviderConfig;
  setActiveConfig: (config: StoredProviderConfig, provider: Provider) => void;
  onApplied: (message: string) => void;
}

function toPickerItems(options: ModelOption[], active: StoredProviderConfig): PickerItem[] {
  return options.map((opt) => {
    const activeMarker =
      opt.id === active.model && opt.provider === active.provider ? "▸ " : "";
    return {
      id: `${opt.provider}/${opt.id}`,
      label: `${activeMarker}${opt.label}`,
      description: opt.source,
    };
  });
}

function findActiveIndex(options: ModelOption[], active: StoredProviderConfig): number {
  const idx = options.findIndex(
    (o) => o.id === active.model && o.provider === active.provider,
  );
  return idx >= 0 ? idx : 0;
}

export function createModelPickerOverlay(
  screen: blessed.Widgets.Screen,
  opts: ModelPickerOverlayOptions,
): ModelPickerOverlayHandle {
  const picker = createPickerOverlay(screen);

  picker.setOnPick((item) => {
    const slash = item.id.indexOf("/");
    if (slash === -1) return;
    const provider = item.id.slice(0, slash);
    const model = item.id.slice(slash + 1);
    const active = opts.getActiveConfig();
    const updated: StoredProviderConfig = {
      ...active,
      provider,
      model,
    };
    upsertProvider(updated);
    opts.setActiveConfig(updated, resolveProvider(updated));
    opts.onApplied(`Model → ${provider}/${model}`);
  });

  picker.setOnCancel(() => {});

  return {
    async open() {
      const active = opts.getActiveConfig();
      const options = await listModelOptions(active);
      const items = toPickerItems(options, active);
      picker.open(items, {
        title: "░ models ░",
        selectedIndex: findActiveIndex(options, active),
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