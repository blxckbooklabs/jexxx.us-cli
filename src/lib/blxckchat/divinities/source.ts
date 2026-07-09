import * as fs from "fs";
import * as path from "path";

import {
  extractPersonaPrompt,
  parsePersonaMetadata,
} from "./prompt.js";

function getDivinitiesSearchPaths(): string[] {
  return [
    process.env.DIVINITIES_VAULT_PATH?.trim() ?? "",
    path.join(
      process.env.JEXXXUS_ROOT?.trim() ?? "",
      "jexxx.us-obsidian",
      "Divinities",
    ),
    "/Users/dylanroberts/Documents/non-music/Dev/GitHub/JEXXXUS/jexxx.us-obsidian/Divinities",
  ].filter((p) => p.length > 0);
}

export interface DivinityPersona {
  id: string;
  name: string;
  role?: string;
  type?: string;
  pillar?: string;
  relativePath: string;
  systemPrompt: string;
}

let cachedPersonas: DivinityPersona[] | null = null;
let cachedRoot: string | null = null;

function slugify(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveDivinitiesRoot(): string | null {
  for (const base of getDivinitiesSearchPaths()) {
    const personasDir = path.join(base, "Personas");
    if (fs.existsSync(personasDir)) {
      return base;
    }
  }
  return null;
}

function walkMarkdownFiles(dir: string, out: string[]): void {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkMarkdownFiles(full, out);
    } else if (ent.name.endsWith(".md")) {
      out.push(full);
    }
  }
}

function inferPillar(personasRoot: string, filePath: string): string | undefined {
  const rel = path.relative(personasRoot, filePath);
  const parts = rel.split(path.sep);
  if (parts.length < 2) return undefined;
  const top = parts[0];
  if (top === "Biblical") return undefined;
  return top;
}

function loadPersonaFile(personasRoot: string, filePath: string): DivinityPersona {
  const markdown = fs.readFileSync(filePath, "utf-8");
  const meta = parsePersonaMetadata(markdown);
  const relFromPersonas = path.relative(personasRoot, filePath);
  const id = slugify(relFromPersonas.replace(/\.md$/i, "").replace(/[/\\]/g, "/"));
  const pillar = inferPillar(personasRoot, filePath);

  const persona: DivinityPersona = {
    id,
    name: meta.name,
    relativePath: relFromPersonas,
    systemPrompt: extractPersonaPrompt(markdown),
  };
  if (meta.role) persona.role = meta.role;
  if (meta.type) persona.type = meta.type;
  if (pillar) persona.pillar = pillar;
  return persona;
}

/** Load all persona entries from the Obsidian Divinities vault. */
export function listDivinityPersonas(forceReload = false): DivinityPersona[] {
  if (!forceReload && cachedPersonas && cachedRoot) {
    return cachedPersonas;
  }

  const root = resolveDivinitiesRoot();
  if (!root) {
    cachedPersonas = [];
    cachedRoot = null;
    return [];
  }

  const personasRoot = path.join(root, "Personas");
  const files: string[] = [];
  walkMarkdownFiles(personasRoot, files);

  const personas = files
    .map((file) => loadPersonaFile(personasRoot, file))
    .filter((p) => p.systemPrompt.trim().length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  cachedPersonas = personas;
  cachedRoot = root;
  return personas;
}

export function findDivinityPersona(query: string): DivinityPersona | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const personas = listDivinityPersonas();
  const byId = personas.find((p) => p.id === q || p.id.endsWith(`/${q}`));
  if (byId) return byId;

  const byName = personas.find((p) => p.name.toLowerCase() === q);
  if (byName) return byName;

  const partial = personas.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.id.includes(q) ||
      (p.pillar?.toLowerCase().includes(q) ?? false),
  );
  if (partial.length === 1) return partial[0]!;
  return null;
}

export function getDivinityPersonaById(id: string): DivinityPersona | null {
  return listDivinityPersonas().find((p) => p.id === id) ?? null;
}

/** Reset cached persona index (for tests). */
export function clearDivinityPersonaCache(): void {
  cachedPersonas = null;
  cachedRoot = null;
}