import '../test/no-network.mjs';
import { describe, it, expect } from 'vitest';

import { CUSTOM_ID_PATTERN, customIdFor, fallsBackAfterRefusal, queueDefect, clearQueued } from './pending.mjs';

describe('custom identifiers satisfy the API’s pattern', () => {
  const longPath = `content/it/${'una-cartella-molto-profonda/'.repeat(12)}pagina con spazi, accenti è ü e simboli #?&.json`;

  it('generates identifiers for a long path that match ^[a-zA-Z0-9_-]{1,64}$', () => {
    const ids = [];
    for (let index = 0; index < 1000; index++) {
      ids.push(customIdFor({ index, lang: index % 2 ? 'pt-BR' : 'en', page: longPath, section: index % 3 ? `blocks[${index}]` : null }));
    }
    for (const id of ids) {
      expect(id).toMatch(CUSTOM_ID_PATTERN);
      expect(id.length).toBeLessThanOrEqual(64);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the locale and the start of the page readable', () => {
    expect(customIdFor({ index: 7, lang: 'en', page: 'content/it/home.json', section: null })).toBe('000007-en-content-it-home-json');
  });

  it('stays valid for a page or locale with no admitted character', () => {
    expect(customIdFor({ index: 3, lang: '…', page: '/// ' })).toBe('000003');
  });
});

describe('the one refusal rule', () => {
  const rows = [
    { scenario: 'a refusal on the primary with a fallback configured falls back', args: { fallbackId: 'claude-opus-4-8', wasFallback: false }, expected: true },
    { scenario: 'no fallback configured: the primary again', args: { fallbackId: undefined, wasFallback: false }, expected: false },
    { scenario: 'a refusal on the fallback does not fall back again', args: { fallbackId: 'claude-opus-4-8', wasFallback: true }, expected: false },
    { scenario: 'segments that used the fallback before do not fall back again', args: { fallbackId: 'claude-opus-4-8', wasFallback: false, usedFallback: true }, expected: false },
  ];
  for (const row of rows) {
    it(row.scenario, () => expect(fallsBackAfterRefusal(row.args)).toBe(row.expected));
  }
});

describe('the resubmission queue', () => {
  it('sets the attempt count rather than incrementing it, so one outcome applied twice is applied once', () => {
    const queue = {};
    queueDefect(queue, { lang: 'en', ids: ['a'], attempt: 2, defect: 'x' });
    const once = JSON.stringify(queue);
    queueDefect(queue, { lang: 'en', ids: ['a'], attempt: 2, defect: 'x' });
    expect(JSON.stringify(queue)).toBe(once);
    expect(queue.en.a).toEqual({ attempts: 2, defect: 'x', whole: true });
  });

  it('marks a refused segment for the fallback once, and records that it used it', () => {
    const queue = {};
    queueDefect(queue, { lang: 'en', ids: ['a'], attempt: 1, defect: 'declined', refusal: true, fallbackId: 'f' });
    expect(queue.en.a).toEqual({ attempts: 1, defect: 'declined', whole: true, fallback: true });
    queueDefect(queue, { lang: 'en', ids: ['a'], attempt: 2, defect: 'declined', refusal: true, wasFallback: true, fallbackId: 'f' });
    expect(queue.en.a).toEqual({ attempts: 2, defect: 'declined', whole: true, usedFallback: true });
  });

  it('takes one defect per identifier, and clears accepted segments', () => {
    const queue = {};
    queueDefect(queue, { lang: 'en', ids: ['a', 'b'], attempt: 1, defect: { a: 'one', b: 'two' } });
    expect(queue.en).toEqual({ a: { attempts: 1, defect: 'one' }, b: { attempts: 1, defect: 'two' } });
    clearQueued(queue, 'en', ['a', 'b']);
    expect(queue).toEqual({});
  });
});
