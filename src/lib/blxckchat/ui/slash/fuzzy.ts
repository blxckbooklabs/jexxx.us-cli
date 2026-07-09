export interface FuzzyMatch<T> {
  item: T;
  score: number;
}

/** Subsequence fuzzy match — chars of query must appear in order in target. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 100 + q.length;
  if (t.includes(q)) return 50 + q.length;

  let qi = 0;
  let score = 0;
  let consecutive = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 2 + consecutive;
      consecutive++;
      qi++;
    } else {
      consecutive = 0;
    }
  }

  return qi === q.length ? score : 0;
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getSearchText: (item: T) => string,
  limit = 10,
): T[] {
  if (!query.trim()) return items.slice(0, limit);

  const scored: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const score = fuzzyScore(query, getSearchText(item));
    if (score > 0) scored.push({ item, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}