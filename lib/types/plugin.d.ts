/**
 * dsh wiring for fact-vault: a cross-session notepad. /fact save|find|list|rm
 * in any session, plus the fact_find tool so the agent can recall facts itself.
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { type Fact } from './library.ts';
export declare const name = "fact-vault";
export declare const inject: string[];
export interface Config {
    enabled: boolean;
    libraryPath?: string;
    limit: number;
}
export declare const Config: Schema<Schemastery.ObjectS<{
    enabled: Schema<boolean, boolean>;
    libraryPath: Schema<string, string>;
    limit: Schema<number, number>;
}>, Schemastery.ObjectT<{
    enabled: Schema<boolean, boolean>;
    libraryPath: Schema<string, string>;
    limit: Schema<number, number>;
}>>;
export declare function expandHome(path: string): string;
export declare const LOCK_TIMEOUT_MS = 400;
export declare const LOCK_STALE_MS = 5000;
/** Exclusive-create advisory lock, identical to pinboard's helper (family
 * mutate pattern): spin, take over a stale, degrade to unlocked saves. */
export declare function acquireLock(lockPath: string): boolean;
export declare class FactStore {
    readonly path: string;
    /** set by apply() so lock degradation is visible in the plugin log */
    warn?: (message: string) => void;
    constructor(libraryPath: string | undefined);
    load(): Fact[];
    save(items: Fact[]): void;
    /** Append-only save: two processes saving concurrently each keep their line,
     * where a load-modify-rewrite race would silently drop one side's fact. */
    append(item: Fact): void;
    /** The one write path for id-allocating mutations: load nextId and append
     * under the lock, so concurrent processes do not mint duplicate ids. */
    mutate<T>(fn: (view: {
        load(): Fact[];
        append(item: Fact): void;
        save(items: Fact[]): void;
    }) => T): T;
}
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=plugin.d.ts.map