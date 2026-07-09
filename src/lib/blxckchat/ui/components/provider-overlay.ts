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
  resolveBaseUrl,
  resolveEnvApiKey,
  type ProviderCatalogEntry,
} from "../../providers/catalog.js";
import {
  listModelsForProvider,
  supportsLiveModelDiscovery,
} from "../../providers/models.js";
import { resolveProvider } from "../../providers/registry.js";
import type { Provider } from "../../providers/types.js";
import { createPickerOverlay, type PickerItem } from "./picker-overlay.js";
import { createPromptOverlay, type PromptOverlayOptions } from "./prompt-overlay.js";

export interface ProviderOverlayHandle {
  open: () => void;
  setup: (catalogId: string) => Promise<void>;
  close: () => void;
  isVisible: () => boolean;
}

export interface ProviderOverlayOptions {
  getActiveConfig: () => StoredProviderConfig;
  setActiveConfig: (config: StoredProviderConfig, provider: Provider) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}

const CATALOG_PREFIX = "catalog:";

function isFreeTierZenModel(catalogId: string, modelId: string): boolean {
  if (catalogId !== "opencode-zen") return false;
  const lower = modelId.toLowerCase();
  return lower.includes("-free") || lower === "big-pickle";
}

function unifiedPickerItems(activeName: string): PickerItem[] {
  const items: PickerItem[] = [];

  for (const p of listProvidersRedacted()) {
    const markers = [
      p.name === activeName ? "▸ active" : "",
      p.isDefault ? "default" : "",
      p.hasKey ? "" : "no key",
    ]
      .filter(Boolean)
      .join(" · ");
    items.push({
      id: `saved:${p.name}`,
      label: p.name,
      description: `${p.label} · ${p.provider}/${p.model}${markers ? ` · ${markers}` : ""}`,
    });
  }

  for (const entry of listCatalogEntries()) {
    items.push({
      id: `${CATALOG_PREFIX}${entry.id}`,
      label: `+ ${entry.label}`,
      description: entry.hint ?? `Add API key · ${entry.id}`,
    });
  }

  return items;
}

export function createProviderOverlay(
  screen: blessed.Widgets.Screen,
  opts: ProviderOverlayOptions,
): ProviderOverlayHandle {
  const picker = createPickerOverlay(screen);
  const modelPicker = createPickerOverlay(screen);
  const prompt = createPromptOverlay(screen);
  let flowActive = false;

  const isBusy = (): boolean =>
    flowActive || picker.isVisible() || modelPicker.isVisible() || prompt.isVisible();

  const showPrompt = (options: PromptOverlayOptions): Promise<string | null> =>
    new Promise((resolve) => {
      setImmediate(() => {
        void prompt.ask(options).then(resolve);
      });
    });

  const runSetupFlow = async (entry: ProviderCatalogEntry): Promise<void> => {
    flowActive = true;
    let apiKey: string | undefined;
    let baseUrl: string | undefined;

    try {
      if (entry.requiresApiKey) {
        const envKey = resolveEnvApiKey(entry);
        const keyPrompt: PromptOverlayOptions = {
          title: `░ ${entry.label} API key ░`,
          label: "API key",
          secret: true,
        };
        const keyHint =
          entry.hint ??
          (envKey
            ? `Env ${entry.envKeys?.[0] ?? "key"} detected — leave blank to use it`
            : undefined);
        if (keyHint) keyPrompt.hint = keyHint;

        const keyAnswer = await showPrompt(keyPrompt);
        if (keyAnswer === null) {
          opts.onMessage("Provider setup cancelled");
          return;
        }
        if (keyAnswer) apiKey = keyAnswer;
        else if (envKey) apiKey = envKey;
        else {
          opts.onError(`API key required for ${entry.label}`);
          return;
        }
      }

      if (entry.requiresBaseUrl) {
        const urlPrompt: PromptOverlayOptions = {
          title: `░ ${entry.label} base URL ░`,
          label: "Base URL",
          defaultValue: entry.baseUrl ?? "",
        };
        if (entry.hint) urlPrompt.hint = entry.hint;
        const urlAnswer = await showPrompt(urlPrompt);
        if (urlAnswer === null) {
          opts.onMessage("Provider setup cancelled");
          return;
        }
        baseUrl = urlAnswer || entry.baseUrl;
        if (!baseUrl?.trim()) {
          opts.onError("Base URL is required");
          return;
        }
      } else if (entry.baseUrl) {
        baseUrl = entry.baseUrl;
      }

      let model = defaultModelFor(entry);
      const resolvedBaseUrl = resolveBaseUrl(entry, baseUrl);

      if (supportsLiveModelDiscovery(entry)) {
        opts.onMessage(`Fetching models from ${entry.label}…`);
      }

      const modelIds = await listModelsForProvider(entry.id, {
        ...(apiKey ? { apiKey } : {}),
        ...(resolvedBaseUrl ? { baseUrl: resolvedBaseUrl } : {}),
      });

      const modelChoice = await new Promise<string | null>((resolve) => {
        const items: PickerItem[] = [
          ...modelIds.map((id) => ({
            id,
            label: id,
            description: isFreeTierZenModel(entry.id, id)
              ? "free tier"
              : entry.suggestedModels.includes(id)
                ? "suggested"
                : "gateway",
          })),
          { id: "__custom__", label: "Custom model id…", description: "type your own" },
        ];

        modelPicker.setOnPick((item) => {
          if (item.id === "__custom__") {
            resolve("__custom__");
            return;
          }
          resolve(item.id);
        });
        modelPicker.setOnCancel(() => resolve(null));
        setImmediate(() => {
          modelPicker.open(items, { title: `░ ${entry.label} model ░` });
        });
      });

      if (modelChoice === null) {
        opts.onMessage("Provider setup cancelled");
        return;
      }
      if (modelChoice === "__custom__") {
        const custom = await showPrompt({
          title: "░ custom model ░",
          label: "Model id",
          defaultValue: defaultModelFor(entry),
        });
        if (custom === null) {
          opts.onMessage("Provider setup cancelled");
          return;
        }
        if (custom) model = custom;
      } else {
        model = modelChoice;
      }

      const existing = listProvidersRedacted().find((p) => p.provider === entry.id);
      const nameAnswer = await showPrompt({
        title: "░ profile name ░",
        label: "Name",
        defaultValue: existing?.name ?? entry.id,
        hint: "Saved as /provider <name>",
      });
      if (nameAnswer === null) {
        opts.onMessage("Provider setup cancelled");
        return;
      }

      const defaultAnswer = await showPrompt({
        title: "░ set default? ░",
        label: "Default (y/n)",
        hint: "y = always start TUI with this profile · n = remember for this session only",
        defaultValue: "n",
      });
      if (defaultAnswer === null) {
        opts.onMessage("Provider setup cancelled");
        return;
      }

      const built = buildProviderConfig({
        catalogId: entry.id,
        model,
        name: nameAnswer || entry.id,
        isDefault: Boolean(defaultAnswer?.toLowerCase().startsWith("y")),
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
      });
      upsertProvider(built);
      opts.setActiveConfig(built, resolveProvider(built));
      opts.onMessage(
        `Provider ready: "${built.name}" (${built.provider}/${built.model})`,
      );
    } catch (err) {
      opts.onError(err instanceof Error ? err.message : "Provider setup failed");
    } finally {
      flowActive = false;
    }
  };

  picker.setOnPick((item) => {
    if (item.id.startsWith(CATALOG_PREFIX)) {
      const catalogId = item.id.slice(CATALOG_PREFIX.length);
      const entry = getCatalogEntry(catalogId);
      if (!entry) {
        opts.onError(`Unknown provider: ${catalogId}`);
        return;
      }
      void runSetupFlow(entry);
      return;
    }

    if (item.id.startsWith("saved:")) {
      const name = item.id.slice("saved:".length);
      const resolved = getProviderByName(name);
      if (!resolved) {
        opts.onError(`Unknown profile "${name}"`);
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
    }
  });

  picker.setOnCancel(() => {
    opts.onMessage("Provider picker closed");
  });

  return {
    open() {
      picker.open(unifiedPickerItems(opts.getActiveConfig().name), {
        title: "░ providers ░",
      });
    },
    async setup(catalogId) {
      const entry = getCatalogEntry(catalogId);
      if (!entry) {
        opts.onError(`Unknown provider: ${catalogId}`);
        return;
      }
      await runSetupFlow(entry);
    },
    close() {
      picker.close();
      modelPicker.close();
      prompt.cancel();
      flowActive = false;
    },
    isVisible() {
      return isBusy();
    },
  };
}