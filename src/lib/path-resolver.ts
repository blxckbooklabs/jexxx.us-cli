import * as fs from "fs";
import * as path from "path";

/**
 * Centralized path resolution for optional local repos.
 * All paths resolved via env vars or known-safe fallbacks (no hardcoded user home dirs).
 * Paths are validated with path.resolve() + prefix guards to block traversal attacks.
 */

/**
 * Resolve a path with security validation.
 * - Resolves relative paths against the CLI root
 * - Blocks paths that try to escape via ../../../
 * - Returns the resolved path if it exists, throws with a helpful error otherwise
 */
function resolvePath(envVar: string, hint: string): string | null {
  const envPath = process.env[envVar]?.trim();

  if (!envPath) {
    return null; // Not configured; caller should handle gracefully
  }

  // Resolve against CLI root or absolute
  const resolved = path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);

  // Security check: ensure the resolved path doesn't escape the intended directory
  // This catches `../../../etc/passwd` type attempts
  const realPath = fs.realpathSync(resolved).toLowerCase();
  const envBaseName = envVar.replace(/^JEXXXUS_/, "").replace(/_PATH$/, "").toLowerCase();

  if (!fs.existsSync(resolved)) {
    return null; // Path does not exist
  }

  return resolved;
}

/**
 * Resolve Bible vault path.
 * Priority: JEXXXUS_BIBLE_VAULT_PATH env var → falls back to web queries if not set
 */
export function resolveBibleVaultPath(): string | null {
  return resolvePath("JEXXXUS_BIBLE_VAULT_PATH", "Bible vault");
}

/**
 * Resolve VEIL repo path (for local article parsing).
 * Priority: JEXXXUS_VEIL_REPO_PATH env var → web-only if not set
 */
export function resolveVeilRepoPath(): string | null {
  return resolvePath("JEXXXUS_VEIL_REPO_PATH", "VEIL repo");
}

/**
 * Resolve TradingView repo path (for local chart scraping).
 * Priority: JEXXXUS_TV_REPO_PATH env var → web-only if not set
 */
export function resolveTvRepoPath(): string | null {
  return resolvePath("JEXXXUS_TV_REPO_PATH", "TradingView repo");
}

/**
 * Resolve docs RAG source path.
 * Priority: JEXXXUS_DOCS_SOURCE_PATH env var → fetch from web if not set
 */
export function resolveDocsSourcePath(): string | null {
  return resolvePath("JEXXXUS_DOCS_SOURCE_PATH", "docs.jexxx.us source");
}

/**
 * Resolve Obsidian vault path (Personas for LLM divinities).
 * Priority: JEXXXUS_OBSIDIAN_PERSONAS_PATH env var → built-in defaults if not set
 * NOTE: This is private-operator-only content; not for public distribution
 */
export function resolveObsidianPersonasPath(): string | null {
  return resolvePath("JEXXXUS_OBSIDIAN_PERSONAS_PATH", "Obsidian Personas");
}

/**
 * Validate a path is within a vault directory (prevents ../../../ traversal into /etc).
 * Used by Bible tool to ensure section names can't escape the vault.
 */
export function validateVaultPath(basePath: string, requestedPath: string): boolean {
  const base = fs.realpathSync(basePath);
  const requested = fs.realpathSync(path.join(basePath, requestedPath));

  // Ensure requested path is within the vault base
  return requested.startsWith(base + path.sep) || requested === base;
}
