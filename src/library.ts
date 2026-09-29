/** Pure fact-vault model: tagged one-line facts, JSONL persisted, recall by
 * keyword with tag-hit > recency text-hit scoring. A fact is a single line —
 * this is a notepad, not a document store. */

export interface Fact {
  v: 1;
  id: string;
  text: string;
  tags: string[];
  at: string;
}

export function nextId(items: Fact[]): string {
  let max = 0;
  for (const item of items) {
    const numeric = Number.parseInt(item.id, 10);
    if (Number.isInteger(numeric) && numeric > max) max = numeric;
  }
  return String(max + 1);
}

export function parseLine(line: string): Fact | null {
  const text = line.trim();
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (value.v !== 1 || typeof value.id !== 'string' || typeof value.text !== 'string' || !Array.isArray(value.tags) || typeof value.at !== 'string') return null;
    return value as unknown as Fact;
  } catch {
    return null;
  }
}

export function parseLibrary(content: string): { items: Fact[]; skipped: number } {
  const items: Fact[] = [];
  let skipped = 0;
  for (const line of content.split(/\r?\n/)) {
    const fact = parseLine(line);
    if (fact) items.push(fact);
    else if (line.trim()) skipped++;
  }
  return { items, skipped };
}

export interface ScoredFact {
  fact: Fact;
  score: number;
}

/** Recall scoring: tag hits weigh 3x text hits; later facts win ties so the
 * freshest memory surfaces first. */
export function findFacts(items: Fact[], query: string): ScoredFact[] {
  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
  if (!terms.length) return [];
  const scored: ScoredFact[] = [];
  for (const fact of items) {
    const tags = fact.tags.join(' ').toLowerCase();
    const text = fact.text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (tags.includes(term)) score += 3;
      if (text.includes(term)) score += 1;
    }
    if (score > 0) scored.push({ fact, score });
  }
  return scored.sort((a, b) => b.score - a.score || (a.fact.at < b.fact.at ? 1 : -1));
}

export function renderList(items: Fact[]): string {
  if (!items.length) return '便签库还是空的。/fact save <一句话> 记下第一条。';
  return items
    .slice(-20)
    .reverse()
    .map((fact) => `  [#${fact.id}] ${fact.text}${fact.tags.length ? `  [${fact.tags.join(',')}]` : ''}`)
    .join('\n');
}

export function renderFound(scored: ScoredFact[], limit: number): string {
  if (!scored.length) return '没有命中的事实。';
  return scored
    .slice(0, limit)
    .map((entry) => `  [#${entry.fact.id}] ${entry.fact.text}${entry.fact.tags.length ? `  [${entry.fact.tags.join(',')}]` : ''}`)
    .join('\n');
}
