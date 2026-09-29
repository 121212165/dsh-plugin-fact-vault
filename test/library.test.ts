import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLibrary, findFacts, renderList, renderFound, nextId, type Fact } from '../src/library.ts';

const fact = (over: Partial<Fact>): Fact => ({ v: 1, id: '1', text: '', tags: [], at: '2026-09-29T00:00:00.000Z', ...over });

test('parsing tolerates junk and future versions', () => {
  const good = JSON.stringify(fact({ id: '3', text: '番茄发文高峰 12 点' }));
  const result = parseLibrary(`${good}\nnot json\n{"v":2}\n`);
  assert.equal(result.items.length, 1);
  assert.equal(result.skipped, 2);
});

test('ids are numeric-sequential over the max', () => {
  assert.equal(nextId([fact({ id: '1' }), fact({ id: '7' }), fact({ id: 'x' })]), '8');
  assert.equal(nextId([]), '1');
});

test('tag hits weigh 3x text hits; fresher wins ties', () => {
  const items = [
    fact({ id: '1', text: '简单提及预算', at: '2026-09-28T00:00:00.000Z' }),
    fact({ id: '2', text: '无关', tags: ['预算'], at: '2026-09-28T00:00:00.000Z' }),
    fact({ id: '3', text: '另一条', tags: ['预算'], at: '2026-09-29T00:00:00.000Z' }),
  ];
  const scored = findFacts(items, '预算');
  assert.equal(scored[0]!.fact.id, '3'); // same 3x tag hit, fresher
  assert.equal(scored[0]!.score, scored[1]!.score);
  assert.ok(scored[0]!.score > scored[2]!.score);
});

test('multi-term is OR-recall with additive scoring', () => {
  const items = [fact({ id: '1', text: '番茄 高峰', tags: [] }), fact({ id: '2', text: '只提番茄', tags: [] })];
  const scored = findFacts(items, '番茄 高峰');
  assert.equal(scored[0]!.fact.id, '1');
  assert.equal(scored.length, 2);
});

test('empty results and rendering', () => {
  assert.ok(renderFound([], 10).includes('没有命中'));
  assert.ok(renderList([]).includes('还是空的'));
  const text = renderList([fact({ id: '2', text: '记一笔', tags: ['工作'] })]);
  assert.ok(text.includes('[#2] 记一笔  [工作]'));
  assert.ok(renderFound([ { fact: fact({ id: '1', text: 'x' }), score: 3 } ], 10).includes('[#1]'));
});
