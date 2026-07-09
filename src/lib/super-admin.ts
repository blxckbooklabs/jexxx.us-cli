/**
 * Super-admin Clerk IDs are env-only (JEXXXUS_SUPER_ADMIN_CLERK_IDS).
 * No defaults — operators must explicitly grant elevation via env var.
 * This prevents hardcoded IDs from leaking who has super-admin access.
 */
const DEFAULT_SUPER_ADMIN_CLERK_IDS: string[] = [];

function parseEnvSuperAdminIds(): string[] {
  const raw = process.env.JEXXXUS_SUPER_ADMIN_CLERK_IDS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** True when this Clerk user is a JEXXXUS super-admin (elevated operator DB access). */
export function isSuperAdminClerkUser(userId: string): boolean {
  const allowlist = new Set<string>([
    ...DEFAULT_SUPER_ADMIN_CLERK_IDS,
    ...parseEnvSuperAdminIds(),
  ]);
  return allowlist.has(userId);
}