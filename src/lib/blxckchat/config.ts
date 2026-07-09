import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import type { ProviderName } from "./providers/types.js";
import {
  defaultModelFor,
  getCatalogEntry,
  listCatalogEntries,
  resolveBaseUrl,
  resolveEnvApiKey,
} from "./providers/catalog.js";

const CONFIG_DIR = path.join(os.homedir(), ".jexxxus");
export const CREDENTIALS_PATH = path.join(CONFIG_DIR, "credentials.json");

export interface StoredProviderConfig {
  name: string;
  provider: ProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  isDefault?: boolean;
}

/** Last LLM profile active when the TUI closed or the user switched models. */
export interface LastUsedProvider {
  name: string;
  provider: ProviderName;
  model: string;
  savedAt: string;
}

export interface BlxckchatCredentialsFile {
  providers: StoredProviderConfig[];
  lastUsed?: LastUsedProvider;
}

type UnifiedCredentialsFile = BlxckchatCredentialsFile & {
  credentials?: unknown;
  accessToken?: unknown;
};

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function readUnifiedFile(): UnifiedCredentialsFile {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    return { providers: [] };
  }
  const raw = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
  try {
    const parsed = JSON.parse(raw) as UnifiedCredentialsFile;
    if (!Array.isArray(parsed.providers)) {
      return { ...parsed, providers: [] };
    }
    return parsed;
  } catch {
    return { providers: [] };
  }
}

function writeUnifiedFile(mutator: (file: UnifiedCredentialsFile) => void): void {
  ensureConfigDir();
  const file = readUnifiedFile();
  mutator(file);
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(file, null, 2), {
    mode: 0o600,
  });
}

export function loadCredentials(): BlxckchatCredentialsFile {
  const file = readUnifiedFile();
  return { providers: file.providers };
}

export function saveCredentials(file: BlxckchatCredentialsFile): void {
  writeUnifiedFile((existing) => {
    existing.providers = file.providers;
  });
}

export function getDefaultProvider(): StoredProviderConfig | null {
  const file = loadCredentials();
  return file.providers.find((p) => p.isDefault) ?? file.providers[0] ?? null;
}

function mergeLastUsedModel(
  config: StoredProviderConfig | null,
  lastUsed?: LastUsedProvider,
): StoredProviderConfig | null {
  if (!config) return null;
  if (lastUsed && lastUsed.name === config.name) {
    return {
      ...config,
      provider: lastUsed.provider,
      model: lastUsed.model,
    };
  }
  return config;
}

/**
 * Resolve which provider profile BLXCKCHAT should start with.
 *
 * 1. `--provider <name>` when given (explicit override)
 * 2. Pinned default (`isDefault` from "set as default? y") — always this profile;
 *    model comes from `lastUsed` when it matches the same profile name
 * 3. `lastUsed` from the previous TUI session (most recently active LLM)
 * 4. First configured provider
 */
export function resolveStartupProvider(explicitName?: string): StoredProviderConfig | null {
  const file = readUnifiedFile();
  const lastUsed = file.lastUsed;

  if (explicitName?.trim()) {
    return mergeLastUsedModel(getProviderByName(explicitName.trim()), lastUsed);
  }

  const pinned = file.providers.find((p) => p.isDefault);
  if (pinned) {
    return mergeLastUsedModel(pinned, lastUsed);
  }

  if (lastUsed) {
    const match = file.providers.find((p) => p.name === lastUsed.name);
    if (match) {
      return {
        ...match,
        provider: lastUsed.provider,
        model: lastUsed.model,
      };
    }
  }

  return file.providers[0] ?? null;
}

/** Persist the active LLM for the next TUI launch (does not change pinned default). */
export function saveLastUsedProvider(config: StoredProviderConfig): void {
  writeUnifiedFile((file) => {
    file.lastUsed = {
      name: config.name,
      provider: config.provider,
      model: config.model,
      savedAt: new Date().toISOString(),
    };
  });
}

export function getProviderByName(name: string): StoredProviderConfig | null {
  const file = loadCredentials();
  return file.providers.find((p) => p.name === name) ?? null;
}

export function upsertProvider(config: StoredProviderConfig): void {
  writeUnifiedFile((file) => {
    const existingIndex = file.providers.findIndex((p) => p.name === config.name);

    if (config.isDefault) {
      file.providers.forEach((p) => {
        p.isDefault = false;
      });
    }

    if (existingIndex >= 0) {
      file.providers[existingIndex] = config;
    } else {
      file.providers.push(config);
    }

    // Legacy: auto-pin first profile only when default was not explicitly declined (setup "n").
    if (
      config.isDefault !== false &&
      !file.providers.some((p) => p.isDefault) &&
      file.providers.length > 0
    ) {
      const first = file.providers[0];
      if (first) first.isDefault = true;
    }
  });
}

export function deleteProvider(name: string): boolean {
  let removed = false;
  writeUnifiedFile((file) => {
    const before = file.providers.length;
    file.providers = file.providers.filter((p) => p.name !== name);
    removed = file.providers.length < before;
    if (!file.providers.some((p) => p.isDefault) && file.providers.length > 0) {
      const first = file.providers[0];
      if (first) first.isDefault = true;
    }
  });
  return removed;
}

export function listProvidersRedacted(): Array<{
  name: string;
  provider: ProviderName;
  model: string;
  isDefault: boolean;
  hasKey: boolean;
  label: string;
}> {
  const file = loadCredentials();
  return file.providers.map((p) => {
    const entry = getCatalogEntry(p.provider);
    const hasKey = Boolean(p.apiKey?.trim() || (entry && resolveEnvApiKey(entry)));
    return {
      name: p.name,
      provider: p.provider,
      model: p.model,
      isDefault: Boolean(p.isDefault),
      hasKey,
      label: entry?.label ?? p.provider,
    };
  });
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export interface ConnectProviderInput {
  catalogId: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  name: string;
  isDefault?: boolean;
}

/** Build a stored config from catalog + user input (TUI or CLI). */
export function buildProviderConfig(input: ConnectProviderInput): StoredProviderConfig {
  const entry = getCatalogEntry(input.catalogId);
  if (!entry) {
    throw new Error(`Unknown provider: ${input.catalogId}`);
  }

  const apiKey =
    input.apiKey?.trim() ||
    (entry.requiresApiKey ? resolveEnvApiKey(entry) : undefined);

  if (entry.requiresApiKey && !apiKey) {
    throw new Error(`API key required for ${entry.label}`);
  }

  const baseUrl = resolveBaseUrl(entry, input.baseUrl);
  if (entry.requiresBaseUrl && !baseUrl) {
    throw new Error(`Base URL required for ${entry.label}`);
  }

  const config: StoredProviderConfig = {
    name: input.name.trim() || input.catalogId,
    provider: input.catalogId,
    model: input.model.trim() || defaultModelFor(entry),
  };
  if (apiKey) config.apiKey = apiKey;
  if (baseUrl) config.baseUrl = baseUrl;
  if (input.isDefault !== undefined) config.isDefault = input.isDefault;
  return config;
}

export async function runConfigureFlow(): Promise<void> {
  console.log("\nAvailable providers:");
  for (const entry of listCatalogEntries()) {
    console.log(`  ${entry.id.padEnd(22)} ${entry.label}`);
  }

  const providerAnswer = await prompt(
    "\nProvider id (anthropic, openrouter, ollama, …): ",
  );
  const catalogId = providerAnswer.toLowerCase().trim();
  const entry = getCatalogEntry(catalogId);
  if (!entry) {
    throw new Error(`Invalid provider: ${providerAnswer}`);
  }

  let apiKey: string | undefined;
  let baseUrl: string | undefined;

  if (entry.requiresApiKey) {
    const env = resolveEnvApiKey(entry);
    if (env) {
      const useEnv = await prompt(`Use ${entry.envKeys?.[0]} from environment? (Y/n): `);
      if (!useEnv.toLowerCase().startsWith("n")) {
        apiKey = env;
      }
    }
    if (!apiKey) {
      apiKey = await prompt(`${entry.label} API key: `);
      if (!apiKey) throw new Error("API key is required.");
    }
  }

  if (entry.requiresBaseUrl || entry.baseUrl) {
    const defaultUrl = entry.baseUrl ?? "";
    const urlAnswer = await prompt(
      `Base URL${defaultUrl ? ` (default: ${defaultUrl})` : ""}: `,
    );
    baseUrl = urlAnswer || defaultUrl || undefined;
    if (entry.requiresBaseUrl && !baseUrl) {
      throw new Error("Base URL is required.");
    }
  }

  const modelAnswer = await prompt(
    `Model (default: ${defaultModelFor(entry)}): `,
  );
  const nameAnswer = await prompt(`Config name (default: ${catalogId}): `);
  const isDefaultAnswer = await prompt("Set as default provider? (y/n): ");

  const connectInput: ConnectProviderInput = {
    catalogId,
    model: modelAnswer || defaultModelFor(entry),
    name: nameAnswer || catalogId,
    isDefault: isDefaultAnswer.toLowerCase().startsWith("y"),
  };
  if (apiKey) connectInput.apiKey = apiKey;
  if (baseUrl) connectInput.baseUrl = baseUrl;
  const config = buildProviderConfig(connectInput);

  upsertProvider(config);
  console.log(`\nSaved provider config "${config.name}" to ~/.jexxxus/credentials.json`);
}