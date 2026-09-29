/**
 * dsh wiring for fact-vault: a cross-session notepad. /fact save|find|list|rm
 * in any session, plus the fact_find tool so the agent can recall facts itself.
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-commands';
import type {} from '@deepseek-ai/dsh-tools';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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
    mkdirSync(index === -1 ? '.' : this.path.slice(0, index), { recursive: true });
    writeFileSync(this.path, items.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8');
  }
}

export function apply(ctx: Context, config: Config): void {
  const log = ctx.logger('fact-vault');
  if (!config.enabled) return void log.info('disabled by config');
  const store = new FactStore(config.libraryPath);

  const saveFact = (text: string, tags: string[]): Fact => {
    const items = store.load();
    const fact: Fact = { v: 1, id: nextId(items), text, tags, at: new Date().toISOString() };
    items.push(fact);
    store.save(items);
    return fact;
  };

  ctx.commands.register({
    name: 'fact',
    description: '事实便签库：/fact save <文本[#标签]> · /fact find <关键词> · /fact list · /fact rm <id>',
    input: { hint: 'save <text[#tag]> | find <kw> | list | rm <id>' },
    handler: ({ rawInput }) => {
      const input = String(rawInput ?? '').trim();
      const [verb, ...rest] = input.split(/\s+/);
      const argument = rest.join(' ');
      if (verb === 'save' && argument) {
        const [text, tagPart] = argument.split('#');
        const tags = (tagPart ?? '').split('#').map((tag) => tag.trim()).filter(Boolean);
        const fact = saveFact((text ?? '').trim(), tags);
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
      async execute(args) {
        return renderFound(findFacts(store.load(), args.query), config.limit);
      },
    }),
  );

  log.info(`mounted · ${store.path}`);
}
