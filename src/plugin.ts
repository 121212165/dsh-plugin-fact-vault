/**
 * dsh wiring for fact-vault: a cross-session notepad. /fact save|find|list|rm
 * in any session, plus the fact_find tool so the agent can recall facts itself.
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-commands';
import type {} from '@deepseek-ai/dsh-tools';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { parseLibrary, findFacts, renderList, renderFound, nextId, type Fact } from './library.ts';

export const name = 'fact-vault';
export const inject = ['commands', 'tools'];

export interface Config {
  enabled: boolean;
  libraryPath?: string;
  limit: number;
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(true),
  libraryPath: Schema.string(),
  limit: Schema.natural().default(10),
});

export function expandHome(path: string): string {
  return path.startsWith('~') ? join(homedir(), path.slice(1)) : path;
}

export class FactStore {
  readonly path: string;

  constructor(libraryPath: string | undefined) {
    this.path = libraryPath ? expandHome(libraryPath) : join(homedir(), '.dsh', 'fact-vault', 'facts.jsonl');
  }

  load(): Fact[] {
    if (!existsSync(this.path)) return [];
    return parseLibrary(readFileSync(this.path, 'utf8')).items;
  }

  save(items: Fact[]): void {
    const index = Math.max(this.path.lastIndexOf('/'), this.path.lastIndexOf('\\'));
    const dir = index === -1 ? '.' : this.path.slice(0, index);
    mkdirSync(dir, { recursive: true });
    // temp+rename: a crash mid-write must never leave a torn library behind
    const tmp = join(dir, `.facts-${process.pid}-${Date.now()}.tmp`);
    writeFileSync(tmp, items.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8');
    renameSync(tmp, this.path);
  }

  /** Append-only save: two processes saving concurrently each keep their line,
   * where a load-modify-rewrite race would silently drop one side's fact. */
  append(item: Fact): void {
    const index = Math.max(this.path.lastIndexOf('/'), this.path.lastIndexOf('\\'));
    const dir = index === -1 ? '.' : this.path.slice(0, index);
    mkdirSync(dir, { recursive: true });
    appendFileSync(this.path, JSON.stringify(item) + '\n', 'utf8');
  }
}

export function apply(ctx: Context, config: Config): void {
  const log = ctx.logger('fact-vault');
  if (!config.enabled) return void log.info('disabled by config');
  const store = new FactStore(config.libraryPath);

  const saveFact = (text: string, tags: string[]): Fact => {
    const items = store.load();
    const fact: Fact = { v: 1, id: nextId(items), text, tags, at: new Date().toISOString() };
    store.append(fact);
    return fact;
  };

  // (definition kept separate so the guard below can wrap it)
  const factHandler = ({ rawInput }: { rawInput?: string }): { kind: 'success' | 'error'; text: string } => {
      const input = String(rawInput ?? '').trim();
      const [verb, ...rest] = input.split(/\s+/);
      const argument = rest.join(' ');
      if (verb === 'save' && argument) {
        const [text, tagPart] = argument.split('#');
        const tags = (tagPart ?? '').split('#').map((tag) => tag.trim()).filter(Boolean);
        const body = (text ?? '').trim();
        if (!body) return { kind: 'error', text: '没有正文，只有标签的事实不入库。写成 `save <文本>#<标签>`。' };
        const fact = saveFact(body, tags);
        return { kind: 'success', text: `已记录 #${fact.id}：${fact.text}` };
      }
      if (verb === 'find') {
        const scored = findFacts(store.load(), argument);
        return { kind: 'success', text: renderFound(scored, config.limit) };
      }
      if (verb === 'list' || !verb) return { kind: 'success', text: renderList(store.load()) };
      if (verb === 'rm') {
        const items = store.load();
        const kept = items.filter((item) => item.id !== argument);
        if (kept.length === items.length) return { kind: 'error', text: `没有 #${argument}` };
        store.save(kept);
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
      } catch (error) {
        return { kind: 'error' as const, text: `命令 fact 内部出错：${String(error)}。重试一次；持续出现请反馈。` };
      }
    },
  });

  ctx.tools.register(
    defineTool({
      name: 'fact_find',
      description: '在跨会话事实便签库里按关键词召回。回答"之前说过/记过什么"类问题时用。',
      parameters: {
        query: { type: 'string', required: true, description: '空格分隔的关键词' },
      },
      output: {
        schema: { type: 'string' } as const,
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      presentCall: () => ({ card: 'generic' as const, title: '搜事实库', kind: 'search' as const }),
      presentResult: (_args, value) => ({
        card: 'generic' as const,
        title: String(value).split('\n')[0]!.slice(0, 60),
        kind: 'search' as const,
        rawInput: value,
      }),
      async execute(args) {
        return renderFound(findFacts(store.load(), args.query), config.limit);
      },
    }),
  );

  log.info(`mounted · ${store.path}`);
}
