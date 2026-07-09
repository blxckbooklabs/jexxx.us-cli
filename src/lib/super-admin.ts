/** Built-in JEXXXUS super-admin Clerk IDs (env can extend, not replace). */
const DEFAULT_SUPER_ADMIN_CLERK_IDS = [
  "user_3AH8ufbCQvjfxL0RkA75RDDGYsy",
] as const;

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