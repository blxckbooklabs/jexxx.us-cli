import type blessed from "blessed";

import {
  buildProviderConfig,
  getProviderByName,
  listProvidersRedacted,
  upsertProvider,
  type StoredProviderConfig,
} from "../../config.js";
import {
  defaultModelFor,
  getCatalogEntry,
  listCatalogEntries,
  resolveEnvApiKey,
  type ProviderCatalogEntry,
} from "../../providers/catalog.js";
import { resolveProvider } from "../../providers/registry.js";
import type { Provider } from "../../providers/types.js";
import { createPickerOverlay, type PickerItem } from "./picker-overlay.js";
import { createPromptOverlay, type PromptOverlayOptions } from "./prompt-overlay.js";

export interface ConnectOverlayHandle {
  open: (catalogId?: string) => void;
  openProviderSwitch: () => void;
  close: () => void;
  isVisible: () => boolean;
}

export interface ConnectOverlayOptions {
  getActiveConfig: () => StoredProviderConfig;
  setActiveConfig: (config: StoredProviderConfig, provider: Provider) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}

function catalogToPickerItems(): PickerItem[] {
  return listCatalogEntries().map((entry) => ({
    id: entry.id,
    label: entry.label,
    description: entry.hint ?? entry.adapter,
  }));
}

function configuredToPickerItems(activeName: string): PickerItem[] {
  const connectNew: PickerItem = {
    id: "__connect_new__",
    label: "➕ Connect new provider…",
    description: "Browse catalog · add API key (/connect)",
  };
  const saved = listProvidersRedacted().map((p) => {
    const markers = [
      p.name === activeName ? "▸" : " ",
      p.isDefault ? "default" : "",
      p.hasKey ? "" : "no key",
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: p.name,
      label: p.name,
      description: `${p.label} · ${p.provider}/${p.model}${markers ? ` · ${markers}` : ""}`,
    };
  });
  return [connectNew, ...saved];
}

export function createConnectOverlay(
  screen: blessed.Widgets.Screen,
  opts: ConnectOverlayOptions,
): ConnectOverlayHandle {
  const providerPicker = createPickerOverlay(screen);
  const providerSwitchPicker = createPickerOverlay(screen);
  const modelPicker = createPickerOverlay(screen);
  const prompt = createPromptOverlay(screen);
  let flowActive = false;

  const isBusy = (): boolean =>
    flowActive ||
    providerPicker.isVisible() ||
    providerSwitchPicker.isVisible() ||
    modelPicker.isVisible() ||
    prompt.isVisible();

  const runConnectFlow = async (entry: ProviderCatalogEntry): Promise<void> => {
    flowActive = true;
    let apiKey: string | undefined;
    let baseUrl: string | undefined;

    if (entry.requiresApiKey) {
      const envKey = resolveEnvApiKey(entry);
      const envHint = envKey
        ? `Env ${entry.envKeys?.[0] ?? "key"} detected — leave blank to use it`
        : undefined;
      const keyPrompt: PromptOverlayOptions = {
        title: `░ connect · ${entry.label} ░`,
        label: "API key",
        secret: true,
      };
      const keyHint = entry.hint ?? envHint;
      if (keyHint) keyPrompt.hint = keyHint;
      const keyAnswer = await prompt.ask(keyPrompt);
      if (keyAnswer === null) {
        flowActive = false;
        opts.onMessage("Connect cancelled");
        return;
      }
      if (keyAnswer) apiKey = keyAnswer;
      else if (envKey) apiKey = envKey;
      else {
        flowActive = false;
        opts.onError(`API key required for ${entry.label}`);
        return;
      }
    }

    if (entry.requiresBaseUrl || entry.baseUrl) {
      const urlPrompt: PromptOverlayOptions = {
        title: `░ ${entry.label} base URL ░`,
        label: "Base URL",
        defaultValue: entry.baseUrl ?? "",
      };
      if (entry.hint) urlPrompt.hint = entry.hint;
      const urlAnswer = await prompt.ask(urlPrompt);
      if (urlAnswer === null) {
        flowActive = false;
        opts.onMessage("Connect cancelled");
        return;
      }
      baseUrl = urlAnswer || entry.baseUrl;
      if (entry.requiresBaseUrl && !baseUrl?.trim()) {
        flowActive = false;
        opts.onError("Base URL is required");
        return;
      }
    }

    let model = defaultModelFor(entry);
    if (entry.suggestedModels.length > 1) {
      await new Promise<void>((resolve) => {
        const items: PickerItem[] = [
          ...entry.suggestedModels.map((id) => ({
            id,
            label: id,
            description: "suggested",
          })),
          { id: "__custom__", label: "Custom model id…", description: "type your own" },
        ];
        modelPicker.setOnPick(async (item) => {
          if (item.id === "__custom__") {
            const custom = await prompt.ask({
              title: "░ custom model ░",
              label: "Model id",
              defaultValue: defaultModelFor(entry),
            });
            if (custom) model = custom;
          } else {
            model = item.id;
          }
          resolve();
        });
        modelPicker.setOnCancel(() => resolve());
        modelPicker.open(items, { title: `░ ${entry.label} model ░` });
      });
    } else {
      const modelAnswer = await prompt.ask({
        title: `░ ${entry.label} model ░`,
        label: "Model id",
        defaultValue: defaultModelFor(entry),
      });
      if (modelAnswer === null) {
        flowActive = false;
        opts.onMessage("Connect cancelled");
        return;
      }
      if (modelAnswer) model = modelAnswer;
    }

    const existing = listProvidersRedacted().find((p) => p.provider === entry.id);
    const nameAnswer = await prompt.ask({
      title: "░ config name ░",
      label: "Name",
      defaultValue: existing?.name ?? entry.id,
      hint: "Saved profile — use /provider <name> to switch",
    });
    if (nameAnswer === null) {
      flowActive = false;
      opts.onMessage("Connect cancelled");
      return;
    }

    const defaultAnswer = await prompt.ask({
      title: "░ set default? ░",
      label: "Default (y/n)",
      defaultValue: "y",
      hint: "Default profile loads on next BLXCKCHAT start",
    });
    if (defaultAnswer === null) {
      flowActive = false;
      opts.onMessage("Connect cancelled");
      return;
    }

    try {
      const built = buildProviderConfig({
        catalogId: entry.id,
        model,
        name: nameAnswer || entry.id,
        isDefault: !defaultAnswer || defaultAnswer.toLowerCase().startsWith("y"),
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
      });
      upsertProvider(built);
      opts.setActiveConfig(built, resolveProvider(built));
      flowActive = false;
      opts.onMessage(`Connected ${entry.label} as "${built.name}" (${built.provider}/${built.model})`);
    } catch (err) {
      flowActive = false;
      opts.onError(err instanceof Error ? err.message : "Connect failed");
    }
  };

  providerPicker.setOnPick((item) => {
    const entry = getCatalogEntry(item.id);
    if (!entry) {
      opts.onError(`Unknown provider: ${item.id}`);
      return;
    }
    void runConnectFlow(entry);
  });

  providerPicker.setOnCancel(() => {
    opts.onMessage("Connect cancelled");
  });

  providerSwitchPicker.setOnPick((item) => {
    if (item.id === "__connect_new__") {
      providerPicker.open(catalogToPickerItems(), { title: "░ connect provider ░" });
      return;
    }
    const resolved = getProviderByName(item.id);
    if (!resolved) {
      opts.onError(`Unknown config "${item.id}"`);
      return;
    }
    try {
      opts.setActiveConfig(resolved, resolveProvider(resolved));
      opts.onMessage(
        `Switched to "${resolved.name}" (${resolved.provider}/${resolved.model})`,
      );
    } catch (err) {
      opts.onError(err instanceof Error ? err.message : "Switch failed");
    }
  });

  return {
    open(catalogId) {
      if (catalogId) {
        const entry = getCatalogEntry(catalogId);
        if (!entry) {
          opts.onError(`Unknown provider: ${catalogId}`);
          return;
        }
        void runConnectFlow(entry);
        return;
      }
      providerPicker.open(catalogToPickerItems(), { title: "░ connect provider ░" });
    },
    openProviderSwitch() {
      const items = configuredToPickerItems(opts.getActiveConfig().name);
      providerSwitchPicker.open(items, { title: "░ providers ░" });
    },
    close() {
      providerPicker.close();
      modelPicker.close();
      providerSwitchPicker.close();
      prompt.cancel();
      flowActive = false;
    },
    isVisible() {
      return isBusy();
    },
  };
}