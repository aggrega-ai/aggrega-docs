import '../test/no-network.mjs';
import { describe, it, expect } from 'vitest';
import { doNotTranslateOf, generalRules, glossaryRules, readTranslationMessage, isBalancedHtml, isTransient } from './translator-prompt.mjs';
import { refusalMessage, replyMessage } from '../test/helpers.mjs';

const GLOSSARY = {
  site_context: 'You are a professional translator for a sample company website.',
  target_lang_names: { en: 'English' },
  do_not_translate: ['Cognitio', 'Kubernetes', 'DEVOPS'],
  glossary: { en: { 'Servizi Cloud': 'Cloud services', 'sviluppo software': 'software development' } },
};

describe('generalRules names the configured languages', () => {
  const rows = [
    { scenario: 'an Italian source, as this site sends it', lang: 'en', sourceLang: 'it', glossary: { target_lang_names: { en: 'English' } }, says: 'You translate pages from Italian into English.' },
    { scenario: 'an English source', lang: 'de', sourceLang: 'en', glossary: {}, says: 'You translate pages from English into German.' },
    { scenario: 'the glossary name over the platform name', lang: 'pt-BR', sourceLang: 'en', glossary: { target_lang_names: { 'pt-BR': 'Brazilian Portuguese' } }, says: 'from English into Brazilian Portuguese.' },
  ];
  for (const row of rows) {
    it(row.scenario, () => {
      expect(generalRules(row)).toContain(row.says);
    });
  }

  it('refuses a call without a source language', () => {
    expect(() => generalRules({ lang: 'en', glossary: {} })).toThrow(/sourceLang is required/);
  });
});

describe('generalRules — the four rules, in priority order, and the request shape', () => {
  it('states do-not-translate, glossary, markup (text, html and markdown) and literals, in that order', () => {
    const rules = generalRules({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY });
    const i1 = rules.indexOf('1. DO-NOT-TRANSLATE');
    const i2 = rules.indexOf('2. GLOSSARY');
    const i3 = rules.indexOf('3. MARKUP');
    const i4 = rules.indexOf('4. LITERALS');
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(i3);
    expect(i3).toBeLessThan(i4);
    expect(rules).toMatch(/CASE-INSENSITIVELY/);
    expect(rules).toMatch(/PRESERVE THE CASING OF THE OCCURRENCE/);
    expect(rules).toContain('byte-for-byte identical');
    expect(rules).toContain('"format" is "markdown"');
    expect(rules).toContain('"keep" list');
    expect(rules).toContain('"•"');
    expect(rules).toContain('pipe separators');
    expect(rules).toContain('"translation" is already translated: it is fixed context');
    expect(rules).toContain('{ "translations": [{ "id": string, "text": string }] }');
  });

  it('carries nothing site-specific: the same rules for two different glossaries of one language pair', () => {
    const other = { ...GLOSSARY, site_context: 'Another site.', do_not_translate: ['Other'] };
    expect(generalRules({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY })).toBe(generalRules({ lang: 'en', sourceLang: 'it', glossary: other }));
  });
});

describe('do_not_translate_case — the one reading of how do-not-translate terms match, and rule 1 stating it', () => {
  /** Rule 1 of the general rules, its whole line. */
  const ruleOne = (glossary) => generalRules({ lang: 'en', sourceLang: 'it', glossary }).split('\n').find((line) => line.startsWith('1. DO-NOT-TRANSLATE'));
  /** Rule 1's closing sentence in either mode: where a term begins and ends. */
  const BOUNDARY =
    ' A term written in Latin letters is an occurrence only where no Latin letter or digit stands directly before or after it, so a longer word that contains it, such as its plural, is not that term; it may stand directly against Hangul, kana, CJK or any other script, so a particle or word attached in the target script keeps the term (for example "Acme의" or "Acmeの" for a term "Acme").';
  const DEFAULT_RULE_ONE =
    '1. DO-NOT-TRANSLATE terms. Never translate the terms the glossary section lists; reproduce each one VERBATIM wherever it occurs, including inline inside a longer sentence. Match them CASE-INSENSITIVELY, but PRESERVE THE CASING OF THE OCCURRENCE exactly as it appears in the source (do not upper-case or lower-case them).' +
    BOUNDARY;

  const modes = [
    { scenario: 'no key: case-insensitive, rule 1 unchanged', glossary: GLOSSARY, caseSensitive: false, rule: DEFAULT_RULE_ONE },
    { scenario: 'an explicit "insensitive": the same as no key', glossary: { ...GLOSSARY, do_not_translate_case: 'insensitive' }, caseSensitive: false, rule: DEFAULT_RULE_ONE },
    {
      scenario: '"sensitive": rule 1 says the terms match only as written',
      glossary: { ...GLOSSARY, do_not_translate_case: 'sensitive' },
      caseSensitive: true,
      rule: '1. DO-NOT-TRANSLATE terms. Never translate the terms the glossary section lists; reproduce each one VERBATIM wherever it occurs, including inline inside a longer sentence. Match them CASE-SENSITIVELY: a term matches only where it occurs exactly as the glossary section writes it, capital letters included; the same word in any other casing is ordinary text, and you translate it like the rest of the sentence.' + BOUNDARY,
    },
  ];
  for (const row of modes) {
    it(`reads ${row.scenario}`, () => {
      expect(doNotTranslateOf(row.glossary)).toMatchObject({ terms: GLOSSARY.do_not_translate, caseSensitive: row.caseSensitive });
      expect(ruleOne(row.glossary)).toBe(row.rule);
    });
  }

  it('keeps the glossary part the same bytes whatever the mode, rule 1 alone stating it', () => {
    const sensitive = { ...GLOSSARY, do_not_translate_case: 'sensitive' };
    expect(glossaryRules({ lang: 'en', glossary: sensitive })).toBe(glossaryRules({ lang: 'en', glossary: GLOSSARY }));
    expect(ruleOne(sensitive)).not.toMatch(/CASE-INSENSITIVELY/);
  });

  it('reads a glossary without terms as no terms, in the default mode', () => {
    expect(doNotTranslateOf({})).toEqual({ terms: [], caseSensitive: false, entries: [] });
    expect(doNotTranslateOf(undefined)).toEqual({ terms: [], caseSensitive: false, entries: [] });
  });

  const unknown = [
    { scenario: 'a capitalized mode', value: 'Sensitive' },
    { scenario: 'another word', value: 'exact' },
    { scenario: 'a boolean', value: true },
    { scenario: 'null', value: null },
  ];
  for (const row of unknown) {
    it(`refuses ${row.scenario}, naming the key and the value, and never reads it as the default`, () => {
      const glossary = { ...GLOSSARY, do_not_translate_case: row.value };
      const named = `the glossary's "do_not_translate_case" is ${JSON.stringify(row.value)}`;
      expect(() => doNotTranslateOf(glossary)).toThrow(named);
      expect(() => generalRules({ lang: 'en', sourceLang: 'it', glossary })).toThrow(named);
      expect(() => glossaryRules({ lang: 'en', glossary })).toThrow(named);
    });
  }
});

describe('a do-not-translate entry with its own case — one term protected only as written', () => {
  const ruleOne = (glossary) => generalRules({ lang: 'en', sourceLang: 'it', glossary }).split('\n').find((line) => line.startsWith('1. DO-NOT-TRANSLATE'));
  const MIXED = { ...GLOSSARY, do_not_translate: ['Errelab', { term: 'LASTRA', case: 'sensitive' }, { term: 'VELATO', case: 'sensitive' }] };

  it('reads each entry with the mode it is matched in, marking the exceptions to the list', () => {
    expect(doNotTranslateOf(MIXED)).toEqual({
      terms: ['Errelab', 'LASTRA', 'VELATO'],
      caseSensitive: false,
      entries: [
        { term: 'Errelab', caseSensitive: false, own: false },
        { term: 'LASTRA', caseSensitive: true, own: true },
        { term: 'VELATO', caseSensitive: true, own: true },
      ],
    });
    const insideSensitive = doNotTranslateOf({ do_not_translate: [{ term: 'Kubernetes', case: 'insensitive' }, 'Component'], do_not_translate_case: 'sensitive' });
    expect(insideSensitive.entries).toEqual([
      { term: 'Kubernetes', caseSensitive: false, own: true },
      { term: 'Component', caseSensitive: true, own: false },
    ]);
  });

  it('marks the exceptions in the glossary part and states them in rule 1; an entry restating the list’s mode is no exception', () => {
    const text = glossaryRules({ lang: 'en', glossary: MIXED });
    expect(text).toContain('  - "Errelab"\n  - "LASTRA" (exact case)\n  - "VELATO" (exact case)');
    expect(ruleOne(MIXED)).toContain('A term the glossary section marks "(exact case)" is the exception: it matches only where it occurs exactly as written');
    const restating = { ...GLOSSARY, do_not_translate: [{ term: 'Cognitio', case: 'insensitive' }, 'Kubernetes', 'DEVOPS'] };
    expect(glossaryRules({ lang: 'en', glossary: restating })).toBe(glossaryRules({ lang: 'en', glossary: GLOSSARY }));
    expect(ruleOne(restating)).toBe(ruleOne(GLOSSARY));
    expect(ruleOne({ ...GLOSSARY, do_not_translate: [{ term: 'Kubernetes', case: 'insensitive' }], do_not_translate_case: 'sensitive' })).toContain(
      'A term the glossary section marks "(any case)" is the exception: it matches CASE-INSENSITIVELY'
    );
  });

  it('leaves the instructions byte-identical for a list of plain terms', () => {
    const plain = { ...GLOSSARY, do_not_translate: ['Cognitio', 'Kubernetes', 'DEVOPS'] };
    expect(generalRules({ lang: 'en', sourceLang: 'it', glossary: plain })).toBe(generalRules({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY }));
    expect(ruleOne(plain)).not.toContain('exception');
  });

  const malformed = [
    { scenario: 'an unknown case', entry: { term: 'LASTRA', case: 'upper' } },
    { scenario: 'no term', entry: { case: 'sensitive' } },
    { scenario: 'an empty term', entry: { term: '', case: 'sensitive' } },
    { scenario: 'an unknown key', entry: { term: 'LASTRA', exact: true } },
  ];
  for (const row of malformed) {
    it(`refuses an entry with ${row.scenario}, naming its position`, () => {
      expect(() => doNotTranslateOf({ do_not_translate: ['Errelab', row.entry] })).toThrow(`the glossary's "do_not_translate" entry 1 is ${JSON.stringify(row.entry)}`);
    });
  }
});

describe('glossaryRules — the project part of the instructions', () => {
  it('carries the site context, the do-not-translate terms and the terminology for the language', () => {
    const text = glossaryRules({ lang: 'en', glossary: GLOSSARY });
    expect(text.startsWith('You are a professional translator for a sample company website.')).toBe(true);
    for (const term of GLOSSARY.do_not_translate) expect(text).toContain(`"${term}"`);
    expect(text).toContain('"Servizi Cloud" -> "Cloud services"');
    expect(text).toContain('"sviluppo software" -> "software development"');
  });

  it('degrades to "(none)" when the language has no terms and no terminology', () => {
    const text = glossaryRules({ lang: 'de', glossary: { target_lang_names: {} } });
    expect(text).toContain('Terminology for German (rule 2):');
    expect(text.match(/\(none\)/g)).toHaveLength(2);
  });
});

describe('readTranslationMessage — the one reading of a reply', () => {
  const rows = [
    {
      scenario: 'the output format’s JSON gives the entries',
      message: replyMessage([{ id: 'a', text: 'One' }]),
      expected: { entries: [{ id: 'a', text: 'One' }] },
    },
    { scenario: 'a refusal gives its category', message: refusalMessage('bio'), expected: { refusal: { category: 'bio' } } },
    {
      scenario: 'a reply cut off at max_tokens is a defect',
      message: { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"translations":[{"id":' }] },
      expected: { defect: 'the reply was cut off at max_tokens before its JSON ended' },
    },
    { scenario: 'a reply with no text is a defect', message: { stop_reason: 'end_turn', content: [] }, expected: { defect: 'the reply carried no text' } },
    {
      scenario: 'JSON of another shape is a defect',
      message: { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"a":"One"}' }] },
      expected: { defect: 'the reply is not { "translations": [{ "id": string, "text": string }] }' },
    },
  ];
  for (const row of rows) {
    it(row.scenario, () => {
      expect(readTranslationMessage(row.message)).toEqual(row.expected);
    });
  }

  it('reads only text blocks, so a thinking block before the text is ignored', () => {
    const message = replyMessage([{ id: 'a', text: 'One' }]);
    message.content.unshift({ type: 'thinking', thinking: '', signature: 'x' });
    expect(readTranslationMessage(message)).toEqual({ entries: [{ id: 'a', text: 'One' }] });
  });

  it('names a parse failure rather than throwing', () => {
    expect(readTranslationMessage({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }).defect).toMatch(/^the reply is not valid JSON/);
  });
});

describe('isBalancedHtml', () => {
  it('accepts balanced HTML, void tags and self-closing tags', () => {
    expect(isBalancedHtml('<p>Ciao <strong>mondo</strong></p>')).toBe(true);
    expect(isBalancedHtml('Riga uno<br>Riga due')).toBe(true);
    expect(isBalancedHtml('<img src="x.jpg" />')).toBe(true);
    expect(isBalancedHtml('testo semplice con &amp; entità')).toBe(true);
  });

  it('rejects unclosed or badly nested tags', () => {
    expect(isBalancedHtml('<p>Ciao <strong>mondo</p>')).toBe(false);
    expect(isBalancedHtml('<strong><em>x</strong></em>')).toBe(false);
    expect(isBalancedHtml('<div>aperto')).toBe(false);
  });
});

describe('isTransient', () => {
  it('classifies errors for retry and backoff', () => {
    expect(isTransient({ status: 503 })).toBe(true);
    expect(isTransient({ status: 429 })).toBe(true);
    expect(isTransient({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isTransient({ name: 'AbortError' })).toBe(true);
    expect(isTransient({ transient: true })).toBe(true);
    expect(isTransient({ status: 400 })).toBe(false);
    expect(isTransient({ transient: false, status: 503 })).toBe(false);
  });
});
