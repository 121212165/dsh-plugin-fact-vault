/** Wire-level assembly tests for fact-vault: the real apply() against a mock
 * context, with the fact_save agent tool exercised against a real temp file.
 * @module test/plugin.test */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { apply } from '../src/plugin.ts';

interface CapturedCommand {
  name: string;
  handler: (args: { rawInput?: string }) => { kind: string; text: string };
}
interface CapturedTool {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

const tempDirs: string[] = [];
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

async function mounted(config: Record<string, unknown> = {}) {
  const commands: CapturedCommand[] = [];
  const tools: CapturedTool[] = [];
  const dir = mkdtempSync(join(tmpdir(), 'fact-vault-wire-'));
  tempDirs.push(dir);
  const libraryPath = join(dir, 'facts.jsonl');
  const ctx = {
    logger(name: string) {
      return { info() {}, warn() {}, error() {}, debug() {} } as never;
    },
    commands: { register(definition: CapturedCommand) { commands.push(definition); } },
    tools: { register(definition: CapturedTool) { tools.push(definition); } } as never,
  };
  apply(ctx as never, { enabled: true, libraryPath, limit: 10, ...config } as never);
  const command = (name: string): CapturedCommand => {
    const found = commands.find((c) => c.name === name);
    assert.ok(found, `command ${name} never registered`);
    return found!;
  };
  const tool = (name: string): CapturedTool => {
    const found = tools.find((c) => c.name === name);
    assert.ok(found, `tool ${name} never registered`);
    return found!;
  };
  return { commands, tools, command, tool, libraryPath };
}

test('agents get fact_save alongside fact_find', async () => {
  const h = await mounted();
  assert.deepEqual(h.tools.map((t) => t.name).sort(), ['fact_find', 'fact_save']);
});

test('fact_save writes the library and fact_find recalls it', async () => {
  const h = await mounted();
  const out = await h.tool('fact_save').execute({ text: 'CHAIN-PROBE-1 is a probe-green fact', tags: ['probe'] });
  assert.match(out, /#1.*CHAIN-PROBE-1/);
  assert.ok(out.includes('不注入'));
  assert.ok(existsSync(h.libraryPath));
  const recalled = await h.tool('fact_find').execute({ query: 'probe' });
  assert.ok(recalled.includes('CHAIN-PROBE-1'));
});

test('fact_save normalizes and refuses empty bodies', async () => {
  const h = await mounted();
  const empty = await h.tool('fact_save').execute({ text: '   ' });
  assert.ok(empty.includes('未入库'));
  assert.ok(!existsSync(h.libraryPath), 'nothing written for an empty body');

  await h.tool('fact_save').execute({ text: 'role A needs\n\nthree tokens' });
  assert.ok(readFileSync(h.libraryPath, 'utf8').includes('role A needs three tokens'), 'collapsed to one line');
});

test('ids continue across the command face and the tool face', async () => {
  const h = await mounted();
  h.command('fact').handler({ rawInput: 'save probe-green via command #cmd' });
  const tool = await h.tool('fact_save').execute({ text: 'probe-green via tool', tags: ['tool'] });
  assert.match(tool, /#2/);
  h.command('fact').handler({ rawInput: 'save probe-green third' });
  const list = h.command('fact').handler({ rawInput: 'list' }).text;
  assert.match(list, /#1.*via command/)
  assert.match(list, /#3.*third/);
});

test('/fact rm removes through the same locked store', async () => {
  const h = await mounted();
  h.command('fact').handler({ rawInput: 'save rm probe' });
  assert.ok(h.command('fact').handler({ rawInput: 'rm 1' }).text.includes('已删除'));
  assert.equal(h.command('fact').handler({ rawInput: 'rm 1' }).kind, 'error');
  assert.ok(!readFileSync(h.libraryPath, 'utf8').includes('rm probe'));
});
