import Schema from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, appendFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseLibrary, findFacts, renderList, renderFound, nextId } from './library.js';
export const name = 'fact-vault';
export const inject = ['commands', 'tools'];
export const Config = Schema.object({
    enabled: Schema.boolean().default(true),
    libraryPath: Schema.string(),
    limit: Schema.natural().default(10),
});
export function expandHome(path) {
    return path.startsWith('~') ? join(homedir(), path.slice(1)) : path;
}
export const LOCK_TIMEOUT_MS = 400;
export const LOCK_STALE_MS = 5000;
/** Exclusive-create advisory lock, identical to pinboard's helper (family
 * mutate pattern): spin, take over a stale, degrade to unlocked saves. */
export function acquireLock(lockPath) {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
        try {
            closeSync(openSync(lockPath, 'wx'));
            return true;
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                return true;
            if (Date.now() >= deadline)
                return false;
            try {
                if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS)
                    unlinkSync(lockPath);
            }
            catch {
                // vanished or lost the takeover race — retry the create instead
            }
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        }
    }
}
function releaseLock(lockPath) {
    try {
        unlinkSync(lockPath);
    }
    catch {
        // nothing to clean or someone else handles it
    }
}
export class FactStore {
    path;
    /** set by apply() so lock degradation is visible in the plugin log */
    warn;
    constructor(libraryPath) {
        this.path = libraryPath ? expandHome(libraryPath) : join(homedir(), '.dsh', 'fact-vault', 'facts.jsonl');
    }
    load() {
        if (!existsSync(this.path))
            return [];
        return parseLibrary(readFileSync(this.path, 'utf8')).items;
    }
    save(items) {
        const dir = dirname(this.path);
        mkdirSync(dir, { recursive: true });
        // temp+rename: a crash mid-write must never leave a torn library behind
        const tmp = join(dir, `.facts-${process.pid}-${Date.now()}.tmp`);
        writeFileSync(tmp, items.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8');
        renameSync(tmp, this.path);
    }
    /** Append-only save: two processes saving concurrently each keep their line,
     * where a load-modify-rewrite race would silently drop one side's fact. */
    append(item) {
        mkdirSync(dirname(this.path), { recursive: true });
        appendFileSync(this.path, JSON.stringify(item) + '\n', 'utf8');
    }
    /** The one write path for id-allocating mutations: load nextId and append
     * under the lock, so concurrent processes do not mint duplicate ids. */
    mutate(fn) {
        mkdirSync(dirname(this.path), { recursive: true });
        const lockPath = `${this.path}.lock`;
        const locked = acquireLock(lockPath);
        if (!locked)
            this.warn?.('fact-vault lock busy — saved without lock');
        try {
            return fn({ load: () => this.load(), append: (item) => this.append(item), save: (items) => this.save(items) });
        }
        finally {
            if (locked)
                releaseLock(lockPath);
        }
    }
}
export function apply(ctx, config) {
    const log = ctx.logger('fact-vault');
    if (!config.enabled)
        return void log.info('disabled by config');
    const store = new FactStore(config.libraryPath);
    store.warn = (message) => log.warn(message);
    const saveFact = (text, tags) => {
        let fact;
        store.mutate((view) => {
            fact = { v: 1, id: nextId(view.load()), text, tags, at: new Date().toISOString() };
            view.append(fact);
        });
        return fact;
    };
    // (definition kept separate so the guard below can wrap it)
    const factHandler = ({ rawInput }) => {
        const input = String(rawInput ?? '').trim();
        const [verb, ...rest] = input.split(/\s+/);
        const argument = rest.join(' ');
        if (verb === 'save' && argument) {
            const [text, tagPart] = argument.split('#');
            const tags = (tagPart ?? '').split('#').map((tag) => tag.trim()).filter(Boolean);
            const body = (text ?? '').trim();
            if (!body)
                return { kind: 'error', text: '没有正文，只有标签的事实不入库。写成 `save <文本>#<标签>`。' };
            const fact = saveFact(body, tags);
            return { kind: 'success', text: `已记录 #${fact.id}：${fact.text}` };
        }
        if (verb === 'find') {
            const scored = findFacts(store.load(), argument);
            return { kind: 'success', text: renderFound(scored, config.limit) };
        }
        if (verb === 'list' || !verb)
            return { kind: 'success', text: renderList(store.load()) };
        if (verb === 'rm') {
            let removed = null;
            store.mutate((view) => {
                const items = view.load();
                const kept = items.filter((item) => item.id !== argument);
                if (kept.length !== items.length)
                    removed = items.find((item) => item.id === argument) ?? null;
                view.save(kept);
            });
            if (!removed)
                return { kind: 'error', text: `没有 #${argument}` };
            return { kind: 'success', text: `已删除 #${argument}` };
        }
        return { kind: 'error', text: `看不懂 "${verb}"。用法：save <text[#tag]> · find <kw> · list · rm <id>` };
    };
    ctx.commands.register({
        name: 'fact',
        description: '事实便签库：/fact save <文本[#标签]> · /fact find <关键词> · /fact list · /fact rm <id>',
        input: { hint: 'save <text[#tag]> | find <kw> | list | rm <id>' },
        handler: ({ rawInput }) => {
            try {
                return factHandler({ rawInput });
            }
            catch (error) {
                return { kind: 'error', text: `命令 fact 内部出错：${String(error)}。重试一次；持续出现请反馈。` };
            }
        },
    });
    ctx.tools.register(defineTool({
        name: 'fact_find',
        description: '在跨会话事实便签库里按关键词召回。回答"之前说过/记过什么"类问题时用。',
        parameters: {
            query: { type: 'string', required: true, description: '空格分隔的关键词' },
        },
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
        },
        presentCall: () => ({ card: 'generic', title: '搜事实库', kind: 'search' }),
        presentResult: (_args, value) => ({
            card: 'generic',
            title: String(value).split('\n')[0].slice(0, 60),
            kind: 'search',
            rawInput: value,
        }),
        async execute(args) {
            return renderFound(findFacts(store.load(), args.query), config.limit);
        },
    }));
    ctx.tools.register(defineTool({
        name: 'fact_save',
        description: '往跨会话事实便签库里存一条事实（**不注入**系统提示，任何会话里用 fact_find 召回）。用户说"记住/记下来/这个事实以后有用"时用它，不要写临时文件。',
        parameters: {
            text: { type: 'string', required: true, description: '事实正文，一句话，入库时压成单行' },
            tags: { type: 'array', items: { type: 'string' }, description: '可选标签；召回时标签命中 3 分' },
        },
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
        },
        presentCall: () => ({ card: 'generic', title: '存事实', kind: 'edit' }),
        presentResult: (_args, value) => ({
            card: 'generic',
            title: String(value).split('\n')[0].slice(0, 60),
            kind: 'edit',
            rawInput: value,
        }),
        async execute(args) {
            const text = String(args.text ?? '').replace(/\s+/g, ' ').trim();
            if (!text)
                return '内容为空，未入库。给一句事实正文。';
            const tags = [...new Set((args.tags ?? []).map((tag) => String(tag).replace(/^#/, '').trim().toLowerCase()).filter(Boolean))];
            const fact = saveFact(text, tags);
            const hint = fact.tags.length ? `fact_find ${fact.tags[0]}` : 'fact_find <关键词>';
            return `已记录 #${fact.id}：${fact.text}（不注入系统提示；用 ${hint} 召回）`;
        },
    }));
    log.info(`mounted · ${store.path}`);
}
//# sourceMappingURL=plugin.js.map