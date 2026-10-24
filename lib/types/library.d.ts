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
export declare function nextId(items: Fact[]): string;
export declare function parseLine(line: string): Fact | null;
export declare function parseLibrary(content: string): {
    items: Fact[];
    skipped: number;
};
export interface ScoredFact {
    fact: Fact;
    score: number;
}
/** Recall scoring: tag hits weigh 3x text hits; later facts win ties so the
 * freshest memory surfaces first. */
export declare function findFacts(items: Fact[], query: string): ScoredFact[];
export declare function renderList(items: Fact[]): string;
export declare function renderFound(scored: ScoredFact[], limit: number): string;
//# sourceMappingURL=library.d.ts.map