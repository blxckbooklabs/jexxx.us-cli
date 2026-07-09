import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import type { ProviderConfig, ProviderName } from "./providers/types.js";

const CONFIG_DIR = path.join(os.homedir(), ".jexxxus");
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "credentials.json");

export interface StoredProviderConfig extends ProviderConfig {
  name: string;
  isDefault?: boolean;
}

interface CredentialsFile {
  providers: StoredProviderConfig[];
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadCredentials(): CredentialsFile {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    return { providers: [] };
  }
  const raw = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
  try {
    const parsed = JSON.parse(raw) as CredentialsFile;
    // Ensure providers array exists and is valid
    if (!Array.isArray(parsed.providers)) {
      return { providers: [] };
    }
    return parsed;
  } catch {
    return { providers: [] };
  }
}

export function saveCredentials(file: CredentialsFile): void {
  ensureConfigDir();
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(file, null, 2), {
    mode: 0o600,
  });
}

export function getDefaultProvider(): StoredProviderConfig | null {
  const file = loadCredentials();
  return file.providers.find((p) => p.isDefault) ?? file.providers[0] ?? null;
}

export function getProviderByName(name: string): StoredProviderConfig | null {
  const file = loadCredentials();
  return file.providers.find((p) => p.name === name) ?? null;
}

export function upsertProvider(config: StoredProviderConfig): void {
  const file = loadCredentials();
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

  if (!file.providers.some((p) => p.isDefault) && file.providers.length > 0) {
    const first = file.providers[0];
    if (first) first.isDefault = true;
  }

  saveCredentials(file);
}

export function listProvidersRedacted(): Array<{
  name: string;
  provider: ProviderName;
  model: string;
  isDefault: boolean;
  hasKey: boolean;
}> {
  const file = loadCredentials();
  return file.providers.map((p) => ({
    name: p.name,
    provider: p.provider,
    model: p.model,
    isDefault: Boolean(p.isDefault),
    hasKey: Boolean(p.apiKey),
  }));
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

/**
 * Interactive setup flow for `jexxxus blxckchat configure`. Prompts for
 * provider, model, and (for hosted providers) an API key. Ollama skips the
 * key prompt entirely and asks for a base URL instead, since local models
 * need no credential.
 */
export async function runConfigureFlow(): Promise<void> {
  const providerAnswer = await prompt(
    "Provider (anthropic / openai / ollama): "
  );
  const provider = providerAnswer.toLowerCase().trim() as ProviderName;

  if (!["anthropic", "openai", "ollama"].includes(provider)) {
    throw new Error(
      `Invalid provider: ${providerAnswer}. Must be anthropic, openai, or ollama.`
    );
  }

  const defaultModels: Record<ProviderName, string> = {
    anthropic: "claude-sonnet-4-5",
    openai: "gpt-4o",
    ollama: "llama3.1",
  };

  const modelAnswer = await prompt(
    `Model (default: ${defaultModels[provider]}): `
  );
  const model = modelAnswer || defaultModels[provider];

  let apiKey: string | undefined;
  let baseUrl: string | undefined;

  if (provider === "ollama") {
    const baseUrlAnswer = await prompt(
      "Ollama base URL (default: http://localhost:11434/v1): "
    );
    baseUrl = baseUrlAnswer || "http://localhost:11434/v1";
  } else {
    apiKey = await prompt(`${provider} API key: `);
    if (!apiKey) {
      throw new Error("API key is required for hosted providers.");
    }
  }

  const nameAnswer = await prompt(
    `Config name (default: ${provider}): `
  );
  const name = nameAnswer || provider;

  const isDefaultAnswer = await prompt("Set as default provider? (y/n): ");
  const isDefault = isDefaultAnswer.toLowerCase().startsWith("y");

  upsertProvider({
    name,
    provider,
    model,
    apiKey,
    baseUrl,
    isDefault,
  });

  console.log(`\nSaved provider config "${name}" to ~/.jexxxus/credentials.json`);
}
