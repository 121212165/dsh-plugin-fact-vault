/** Pure fact-vault model: tagged one-line facts, JSONL persisted, recall by
 * keyword with tag-hit > recency text-hit scoring. A fact is a single line —
 * this is a notepad, not a document store. */
export function nextId(items) {
    let max = 0;
    for (const item of items) {
        const numeric = Number.parseInt(item.id, 10);
        if (Number.isInteger(numeric) && numeric > max)
            max = numeric;
    }
    return String(max + 1);
}
export function parseLine(line) {
    const text = line.trim();
    if (!text)
        return null;
    try {
        const value = JSON.parse(text);
        if (value.v !== 1 || typeof value.id !== 'string' || typeof value.text !== 'string' || !Array.isArray(value.tags) || typeof value.at !== 'string')
            return null;
        return value;
    }
    catch {
        return null;
    }
}
export function parseLibrary(content) {
    const items = [];
    let skipped = 0;
    for (const line of content.split(/\r?\n/)) {
        const fact = parseLine(line);
        if (fact)
            items.push(fact);
        else if (line.trim())
            skipped++;
    }
    return { items, skipped };
}
/** Recall scoring: tag hits weigh 3x text hits; later facts win ties so the
 * freshest memory surfaces first. */
export function findFacts(items, query) {
    const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
    if (!terms.length)
        return [];
    const scored = [];
    for (const fact of items) {
        const tags = fact.tags.join(' ').toLowerCase();
        const text = fact.text.toLowerCase();
        let score = 0;
        for (const term of terms) {
            if (tags.includes(term))
                score += 3;
            if (text.includes(term))
                score += 1;
        }
        if (score > 0)
            scored.push({ fact, score });
    }
    return scored.sort((a, b) => b.score - a.score || (a.fact.at < b.fact.at ? 1 : -1));
}
export function renderList(items) {
    if (!items.length)
        return '便签库还是空的。/fact save <一句话> 记下第一条。';
    return items
        .slice(-20)
        .reverse()
        .map((fact) => `  [#${fact.id}] ${fact.text}${fact.tags.length ? `  [${fact.tags.join(',')}]` : ''}`)
        .join('\n');
}
export function renderFound(scored, limit) {
    if (!scored.length)
        return '没有命中的事实。';
    return scored
        .slice(0, limit)
        .map((entry) => `  [#${entry.fact.id}] ${entry.fact.text}${entry.fact.tags.length ? `  [${entry.fact.tags.join(',')}]` : ''}`)
        .join('\n');
}
//# sourceMappingURL=library.js.map