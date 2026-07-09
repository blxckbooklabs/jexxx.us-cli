/**
 * JEXXXUS empire surface names — must not be mistaken for BLXCKBOOK contact names
 * when users ask "tell me about Docs and Law" etc.
 */

const KINGDOM_SURFACE_NAME =
  /^(?:jexxxus\s*\|\s*)?(?:docs?|law|veil|tv|blxckbook|nxt|mamabase|bible|docs\.jexxx\.us|law\.jexxx\.us|veil\.jexxx\.us|tv\.jexxx\.us)$/i;

/** True when a captured "contact" name is actually an empire surface. */
export function isKingdomSurfaceName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (/\bdocs?\s+and\s+law\b/i.test(trimmed)) return true;
  if (KINGDOM_SURFACE_NAME.test(trimmed)) return true;
  return false;
}

/** True when the user is asking about Docs, Law, or both — not a vault contact. */
export function isKingdomSurfacePrompt(userPrompt: string): boolean {
  const p = userPrompt.trim();
  if (/\bdocs?\s+and\s+law\b/i.test(p)) return true;
  if (
    /\b(?:what\s+(?:can you\s+)?tell me about|tell me about|what(?:'s| is)|about|overview of)\s+(?:jexxxus\s*\|\s*)?(docs?|law)\b/i.test(
      p,
    )
  ) {
    return true;
  }
  if (/\b(?:jexxxus\s*\|\s*docs?|docs\.jexxx\.us)\b/i.test(p) && /\b(?:about|what|tell|overview)\b/i.test(p)) {
    return true;
  }
  if (/\b(?:jexxxus\s*\|\s*law|law\.jexxx\.us)\b/i.test(p) && /\b(?:about|what|tell|overview|policy|policies|terms|privacy)\b/i.test(p)) {
    return true;
  }
  return false;
}