import '../test/no-network.mjs';
import { describe, it, expect } from 'vitest';

import { cachedEstimates, estimateRequest, estimateTokens, outputCeiling, reservesReasoning, MAX_OUTPUT_TOKENS, MIN_OUTPUT_TOKENS, PER_ID_OUTPUT_TOKENS, REASONING_OUTPUT_TOKENS } from './tokens.mjs';

const MARK = Object.freeze({ type: 'ephemeral', ttl: '1h' });
const systemOf = (language) => [{ type: 'text', text: 'the general rules' }, { type: 'text', text: language, cache_control: { ...MARK } }];
const block = (text, marked = false) => ({ type: 'text', text, ...(marked ? { cache_control: { ...MARK } } : {}) });
const paramsOf = ({ model = 'claude-sonnet-5-5', system = systemOf('the Italian guide'), content }) => ({
  model,
  max_tokens: 100,
  system,
  messages: [{ role: 'user', content }],
});

const CONTEXT = '{"page":"a.md","segments":[{"id":"x","format":"markdown","source":"A section."}]}';
const SYSTEM_TOKENS = estimateTokens('the general rules') + estimateTokens('the Italian guide');
const CONTEXT_TOKENS = estimateTokens(CONTEXT);

describe('cachedEstimates — the input a request can read from an entry an earlier request writes', () => {
  // In order: three requests of one locale, each with its own user message and only the system prompt marked,
  // then one on another model, then one of another locale. Each row names what its request can read.
  const rows = [
    { scenario: 'the first request writes and reads nothing', params: paramsOf({ content: [block(CONTEXT), block('{"section":"#a","translate":["x"]}')] }), cached: 0 },
    { scenario: 'a later request of the locale reads the system prompt', params: paramsOf({ content: [block('{"page":"a.md","segments":[]}'), block('{"section":"#b","translate":["y"]}')] }), cached: SYSTEM_TOKENS },
    { scenario: 'another page of the locale reads the system prompt alone', params: paramsOf({ content: [block('{"page":"b.md","segments":[]}'), block('{"translate":["w"]}')] }), cached: SYSTEM_TOKENS },
    { scenario: 'the same locale on another model reads nothing: caches are per model', params: paramsOf({ model: 'claude-opus-5-5', content: [block(CONTEXT), block('{"section":"#a","translate":["x"]}')] }), cached: 0 },
    { scenario: 'another locale’s system prompt reads nothing', params: paramsOf({ system: systemOf('the German guide'), content: [block(CONTEXT), block('{"translate":["x"]}')] }), cached: 0 },
  ];
  const cached = cachedEstimates(rows.map((row) => row.params));
  rows.forEach((row, index) => {
    it(row.scenario, () => {
      expect(cached[index]).toBe(row.cached);
      expect(cached[index]).toBeLessThanOrEqual(estimateRequest(row.params).input);
    });
  });

  it('counts nothing for requests that carry no cache marker', () => {
    const unmarked = paramsOf({ system: [block('the general rules')], content: [block(CONTEXT), block('{"translate":["x"]}')] });
    expect(cachedEstimates([unmarked, unmarked])).toEqual([0, 0]);
  });

  it('reads a prefix only when it is byte-identical: one changed byte in the system prompt reads nothing', () => {
    const first = paramsOf({ content: [block(CONTEXT), block('{"translate":["x"]}')] });
    const changed = paramsOf({ system: systemOf('the Italian guide!'), content: [block(CONTEXT), block('{"translate":["y"]}')] });
    expect(cachedEstimates([first, changed])).toEqual([0, 0]);
  });

  it('counts the longest marked prefix an earlier request also marks, for parameters that mark a later block too', () => {
    const first = paramsOf({ content: [block(CONTEXT, true), block('{"translate":["x"]}')] });
    const same = paramsOf({ content: [block(CONTEXT, true), block('{"translate":["y"]}')] });
    const other = paramsOf({ content: [block(CONTEXT.replace('A section.', 'A section!'), true), block('{"translate":["z"]}')] });
    expect(cachedEstimates([first, same, other])).toEqual([0, SYSTEM_TOKENS + CONTEXT_TOKENS, SYSTEM_TOKENS]);
  });
});

describe('the reasoning allowance — reserved only on a request that can reason', () => {
  const sources = ['Uno', 'Due'];
  // Two short segments sit under the floor, so the reply part is the floor itself.
  const base = Math.max(MIN_OUTPUT_TOKENS, estimateTokens('Uno') + estimateTokens('Due') + 2 * PER_ID_OUTPUT_TOKENS);
  const rows = [
    { scenario: 'no thinking setting: the model’s own default, adaptive on Claude Opus 5.5', thinking: undefined, reserves: true },
    { scenario: 'adaptive', thinking: { type: 'adaptive' }, reserves: true },
    { scenario: 'enabled with a budget', thinking: { type: 'enabled', budget_tokens: 1024 }, reserves: true },
    { scenario: 'disabled', thinking: { type: 'disabled' }, reserves: false },
    { scenario: 'between_tools, with no tool in the request', thinking: { type: 'between_tools' }, reserves: false },
  ];
  for (const row of rows) {
    it(`${row.reserves ? 'reserves' : 'does not reserve'} it — ${row.scenario}`, () => {
      expect(reservesReasoning(row.thinking)).toBe(row.reserves);
      expect(outputCeiling(sources, { thinking: row.thinking })).toBe(base + (row.reserves ? REASONING_OUTPUT_TOKENS : 0));
    });
  }

  it('reserves it when the caller passes no options at all', () => {
    expect(outputCeiling(sources)).toBe(base + REASONING_OUTPUT_TOKENS);
  });
});

describe('the floor on the output ceiling — room for the reply of a small request', () => {
  const rows = [
    { scenario: 'a one-segment request of 7 bytes gets the floor', sources: ['abcdefg'], thinking: { type: 'disabled' }, expected: MIN_OUTPUT_TOKENS },
    { scenario: 'no requested segment still gets the floor', sources: [], thinking: { type: 'disabled' }, expected: MIN_OUTPUT_TOKENS },
    { scenario: 'a request above the floor is unchanged', sources: ['x'.repeat(5000)], thinking: { type: 'disabled' }, expected: 5000 + PER_ID_OUTPUT_TOKENS },
    { scenario: 'the reasoning allowance is added above the floor', sources: ['abcdefg'], thinking: undefined, expected: MIN_OUTPUT_TOKENS + REASONING_OUTPUT_TOKENS },
    { scenario: 'the cap still holds', sources: ['x'.repeat(40000)], thinking: undefined, expected: MAX_OUTPUT_TOKENS },
  ];
  for (const row of rows) {
    it(row.scenario, () => {
      expect(outputCeiling(row.sources, { thinking: row.thinking })).toBe(row.expected);
    });
  }

  it('the floor is 1,024 tokens and lies under the cap', () => {
    expect(MIN_OUTPUT_TOKENS).toBe(1024);
    expect(MIN_OUTPUT_TOKENS).toBeLessThan(MAX_OUTPUT_TOKENS);
  });
});
