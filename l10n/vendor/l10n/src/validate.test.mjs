import '../test/no-network.mjs';
import { describe, it, expect } from 'vitest';

import { validateTranslations } from './validate.mjs';
import { doNotTranslateOf } from './translator-prompt.mjs';
import { segmentMarkdown } from './adapters/markdown/segment.mjs';

/** A Markdown unit for a one-paragraph slice, its protected spans computed as the adapter computes them. */
function markdownItem(srcHash, source) {
  const [segment] = segmentMarkdown(source).segments;
  return { srcHash, source, format: 'markdown', protected: segment.protected.map(([s, e]) => [s - segment.start, e - segment.start]) };
}

const MD_SOURCE = 'Esegui `npm ci`, leggi [la guida](https://example.dev/guida) e <!-- BEGIN GENERATED: opts --> sotto.';
const MD_GOOD = 'Run `npm ci`, read [the guide](https://example.dev/guida) and <!-- BEGIN GENERATED: opts --> below.';
const HTML_SOURCE = '<p>Scrivi <a href="/contatti/">qui</a></p>';
const HTML_GOOD = '<p>Write <a href="/contatti/">here</a></p>';
const DNT = ['Cognitio', 'Kubernetes'];

describe('validateTranslations — one fault per row, against a positive control', () => {
  const md = markdownItem('md', MD_SOURCE);
  const html = { srcHash: 'html', source: HTML_SOURCE, format: 'html' };
  const text = { srcHash: 'txt', source: 'I servizi Cognitio su Kubernetes', format: 'text' };
  const items = [md, html, text];
  const good = { md: MD_GOOD, html: HTML_GOOD, txt: 'Cognitio services on Kubernetes' };
  const entriesOf = (texts) => Object.entries(texts).map(([id, t]) => ({ id, text: t }));

  it('positive control: a faithful reply is accepted whole', () => {
    expect(validateTranslations({ items, entries: entriesOf(good), doNotTranslate: DNT })).toEqual({ accepted: good, rejected: {}, dropped: [] });
  });

  const segmentRows = [
    { kind: 'inline code', id: 'md', text: MD_GOOD.replace('`npm ci`', '`npm install`'), names: '`npm ci`' },
    { kind: 'a link destination', id: 'md', text: MD_GOOD.replace('https://example.dev/guida', 'https://example.dev/guide'), names: '](https://example.dev/guida)' },
    { kind: 'a generated-section marker', id: 'md', text: MD_GOOD.replace('GENERATED: opts', 'GENERATED: options'), names: '<!-- BEGIN GENERATED: opts -->' },
    { kind: 'added inline code', id: 'md', text: `${MD_GOOD} \`extra\``, names: 'added' },
    { kind: 'an HTML tag', id: 'html', text: HTML_GOOD.replace('href="/contatti/"', 'href="/contact/"'), names: '<a href=\\"/contatti/\\">' },
    { kind: 'an HTML tag dropped', id: 'html', text: '<p>Write here</p>', names: 'missing' },
    { kind: 'a dropped do-not-translate term', id: 'txt', text: 'Cognito services on Kubernetes', names: '"Cognitio"' },
    { kind: 'a do-not-translate term in another casing', id: 'txt', text: 'COGNITIO services on Kubernetes', names: '"Cognitio"' },
    { kind: 'HTML introduced into a text segment', id: 'txt', text: 'Cognitio services on <b>Kubernetes</b>', names: 'added "<b>"' },
    { kind: 'an empty translation', id: 'txt', text: '  ', names: 'the translation is empty' },
  ];
  for (const row of segmentRows) {
    it(`rejects ${row.kind}, and only that segment`, () => {
      const { accepted, rejected } = validateTranslations({ items, entries: entriesOf({ ...good, [row.id]: row.text }), doNotTranslate: DNT });
      expect(Object.keys(rejected)).toEqual([row.id]);
      expect(rejected[row.id]).toContain(row.names);
      expect(Object.keys(accepted).sort()).toEqual(items.map((i) => i.srcHash).filter((id) => id !== row.id).sort());
    });
  }

  it('rejects an omitted identifier, and only that segment', () => {
    const { accepted, rejected } = validateTranslations({ items, entries: entriesOf({ md: good.md, html: good.html }), doNotTranslate: DNT });
    expect(rejected).toEqual({ txt: 'no translation was returned for this identifier' });
    expect(Object.keys(accepted).sort()).toEqual(['html', 'md']);
  });

  // A reply carrying an identifier the request did not ask for: the grid of the extra identifier by the
  // requested segments' validity. Each requested segment is judged on its own; the extra one is dropped.
  const unrequestedRows = [
    {
      scenario: 'keeps every requested segment of a reply that adds an identifier, when all pass, and drops the extra one',
      texts: good,
      accepted: good,
      rejected: {},
    },
    {
      scenario: 'rejects only the failing requested segment of a reply that adds an identifier, accepts the others, and drops the extra one',
      texts: { ...good, txt: 'Cognito services on Kubernetes' },
      accepted: { md: good.md, html: good.html },
      rejected: { txt: 'the do-not-translate term "Cognitio" is missing; keep it verbatim' },
    },
  ];
  for (const row of unrequestedRows) {
    it(row.scenario, () => {
      const entries = [...entriesOf(row.texts), { id: 'other', text: 'x' }, { id: 'other', text: 'y' }, { id: 'context-segment', text: 'z' }];
      expect(validateTranslations({ items, entries, doNotTranslate: DNT })).toEqual({
        accepted: row.accepted,
        rejected: row.rejected,
        dropped: ['other', 'context-segment'],
      });
    });
  }

  it('accepts an identifier returned twice with the same text, as a page holding one text twice lists it twice', () => {
    const entries = [...entriesOf(good), { id: 'md', text: MD_GOOD }];
    expect(validateTranslations({ items, entries, doNotTranslate: DNT })).toEqual({ accepted: good, rejected: {}, dropped: [] });
  });

  it('rejects only the segment an identifier returned with two different texts names, and accepts the others', () => {
    const entries = [...entriesOf(good), { id: 'md', text: MD_GOOD.replace('below', 'underneath') }];
    const result = validateTranslations({ items, entries, doNotTranslate: DNT });
    expect(result.accepted).toEqual({ html: good.html, txt: good.txt });
    expect(result.rejected).toEqual({ md: 'this identifier was returned 2 times with different texts; return it exactly once' });
    expect(result).not.toHaveProperty('replyDefect');
  });

  it('judges a repeated identifier per segment even when the reply also adds one, which it drops', () => {
    const entries = [...entriesOf(good), { id: 'md', text: MD_GOOD }, { id: 'other', text: 'x' }];
    const { accepted, rejected, dropped } = validateTranslations({ items, entries, doNotTranslate: DNT });
    expect(accepted).toEqual(good);
    expect(rejected).toEqual({});
    expect(dropped).toEqual(['other']);
  });

  it('rejects every segment of a reply that carried no entries, stating why', () => {
    const { accepted, rejected } = validateTranslations({ items, entries: null, replyDefect: 'the reply carried no text' });
    expect(accepted).toEqual({});
    expect(rejected).toEqual({ md: 'the reply carried no text', html: 'the reply carried no text', txt: 'the reply carried no text' });
  });

  it('returns the defect of a reply with no entries as replyDefect, so the caller states it once', () => {
    expect(validateTranslations({ items, entries: null, replyDefect: 'the reply carried no text' }).replyDefect).toBe('the reply carried no text');
  });
});

describe('validateTranslations — UTF-8 decoded in a single-byte code page', () => {
  const de = { srcHash: 'de', source: 'The compiler holds the line — always.', format: 'text' };
  const fr = { srcHash: 'fr', source: 'The café.', format: 'text' };
  const ja = { srcHash: 'ja', source: 'The compiler holds the line.', format: 'text' };
  const rows = [
    { scenario: 'a Windows-1250 reading of ä, as measured in a German reply', item: de, text: 'Der Compiler hĂ¤lt die Linie — immer.', names: '"Ă¤"' },
    { scenario: 'a Windows-1252 reading of an em dash, as measured in a German reply', item: de, text: 'Der Compiler hält die Linie â€” immer.', names: '"â€”"' },
    { scenario: 'a Latin-1 reading of é', item: fr, text: 'Le cafÃ©.', names: '"Ã©"' },
    { scenario: 'a Windows-1252 reading of a Japanese character', item: ja, text: 'ã‚³ãƒ³ãƒ‘ã‚¤ãƒ©', names: '"ã‚³"' },
  ];
  for (const row of rows) {
    it(`rejects ${row.scenario}, naming the sequence`, () => {
      const { accepted, rejected } = validateTranslations({ items: [row.item], entries: [{ id: row.item.srcHash, text: row.text }] });
      expect(accepted).toEqual({});
      expect(rejected[row.item.srcHash]).toContain('decoded in a single-byte code page');
      expect(rejected[row.item.srcHash]).toContain(row.names);
    });
  }

  const passing = [
    { scenario: 'a clean German translation with umlauts, an em dash and quotation marks', item: de, text: 'Der Compiler hält die Linie — „immer“.' },
    { scenario: 'a clean French translation with a no-break space before a guillemet', item: fr, text: '« LE CAFÉ\u00a0»' },
    { scenario: 'a clean Japanese translation', item: ja, text: 'コンパイラは一線を守ります。' },
    { scenario: 'a sequence the source itself holds', item: { srcHash: 's', source: 'The file is named cafÃ©.txt.', format: 'text' }, text: 'Il file si chiama cafÃ©.txt.' },
  ];
  for (const row of passing) {
    it(`accepts ${row.scenario}`, () => {
      const { accepted, rejected } = validateTranslations({ items: [row.item], entries: [{ id: row.item.srcHash, text: row.text }] });
      expect(rejected).toEqual({});
      expect(accepted[row.item.srcHash]).toBe(row.text);
    });
  }
});

describe('validateTranslations — the do-not-translate case mode, read from the glossary through doNotTranslateOf', () => {
  // One segment holding the product noun as written and the same word as an ordinary noun.
  const item = { srcHash: 'c', source: 'Each Component declares the component it provides.', format: 'text' };
  const KEEPS_BOTH = 'Ogni Component dichiara il component che fornisce.';
  const TRANSLATES_LOWER = 'Ogni Component dichiara il componente che fornisce.';
  const TRANSLATES_NOUN = 'Ogni Componente dichiara il componente che fornisce.';
  // The grid of the mode by the translation: every cell, each with its verdict.
  const rows = [
    { scenario: 'sensitive mode, Component kept and component translated: accepted', glossary: { do_not_translate: ['Component'], do_not_translate_case: 'sensitive' }, text: TRANSLATES_LOWER, rejects: null },
    { scenario: 'sensitive mode, Component translated: rejected, naming Component', glossary: { do_not_translate: ['Component'], do_not_translate_case: 'sensitive' }, text: TRANSLATES_NOUN, rejects: '"Component"' },
    { scenario: 'sensitive mode, both kept: accepted', glossary: { do_not_translate: ['Component'], do_not_translate_case: 'sensitive' }, text: KEEPS_BOTH, rejects: null },
    { scenario: 'default mode, component translated: rejected, naming component, as before', glossary: { do_not_translate: ['Component'] }, text: TRANSLATES_LOWER, rejects: '"component"' },
    { scenario: 'default mode, Component translated: rejected, naming both casings', glossary: { do_not_translate: ['Component'] }, text: TRANSLATES_NOUN, rejects: '"Component", "component"' },
    { scenario: 'default mode, both kept: accepted', glossary: { do_not_translate: ['Component'] }, text: KEEPS_BOTH, rejects: null },
    { scenario: 'explicit insensitive mode, component translated: rejected, as the default', glossary: { do_not_translate: ['Component'], do_not_translate_case: 'insensitive' }, text: TRANSLATES_LOWER, rejects: '"component"' },
  ];
  for (const row of rows) {
    it(row.scenario, () => {
      const { terms, caseSensitive } = doNotTranslateOf(row.glossary);
      const { accepted, rejected } = validateTranslations({ items: [item], entries: [{ id: 'c', text: row.text }], doNotTranslate: terms, caseSensitive });
      if (row.rejects === null) {
        expect(rejected).toEqual({});
        expect(accepted).toEqual({ c: row.text });
      } else {
        expect(accepted).toEqual({});
        expect(rejected.c).toBe(`the do-not-translate term ${row.rejects} is missing; keep it verbatim`);
      }
    });
  }
});

describe('validateTranslations — a term protected only as written, in a list matched in any casing', () => {
  // The product name in capitals and the common Italian word in lower case, in one segment.
  const item = { srcHash: 'l', source: 'La LASTRA è una lastra di resina; il VELATO è velato.', format: 'text' };
  const glossary = { do_not_translate: ['Errelab', { term: 'LASTRA', case: 'sensitive' }, { term: 'VELATO', case: 'sensitive' }] };
  const rows = [
    { scenario: 'the names kept, the common words translated: accepted', text: 'LASTRA is a resin slab; VELATO is veiled.', rejects: null },
    { scenario: 'the name translated: rejected, naming it in its casing alone', text: 'The SLAB is a resin slab; VELATO is veiled.', rejects: '"LASTRA"' },
    { scenario: 'every occurrence kept: accepted', text: 'LASTRA is a lastra of resin; VELATO is velato.', rejects: null },
  ];
  for (const row of rows) {
    it(row.scenario, () => {
      const { entries, caseSensitive } = doNotTranslateOf(glossary);
      const { accepted, rejected } = validateTranslations({ items: [item], entries: [{ id: 'l', text: row.text }], doNotTranslate: entries, caseSensitive });
      if (row.rejects === null) {
        expect(rejected).toEqual({});
        expect(accepted).toEqual({ l: row.text });
      } else {
        expect(rejected.l).toBe(`the do-not-translate term ${row.rejects} is missing; keep it verbatim`);
      }
    });
  }

  it('a plain term of the same list still matches in any casing', () => {
    const { entries, caseSensitive } = doNotTranslateOf(glossary);
    const source = { srcHash: 'e', source: 'Il sito errelab.', format: 'text' };
    const { rejected } = validateTranslations({ items: [source], entries: [{ id: 'e', text: 'The site.' }], doNotTranslate: entries, caseSensitive });
    expect(rejected.e).toBe('the do-not-translate term "errelab" is missing; keep it verbatim');
  });
});

describe('validateTranslations — the do-not-translate boundary applies within the term’s own script', () => {
  // Each row: one source, one translation, one verdict, run in both case modes. A term in Latin letters is
  // bounded by a Latin letter or a digit only, so a particle or word of another script may stand against it.
  const TERMS = ['Aggrega', 'Component', 'Recipe', '株式会社'];
  const rows = [
    { scenario: 'Aggrega의 keeps the term: accepted', source: 'The Aggrega catalogue.', text: 'Aggrega의 카탈로그.', rejects: null },
    { scenario: 'Component를 keeps the term: accepted', source: 'Declare the Component.', text: 'Component를 선언합니다.', rejects: null },
    { scenario: 'Aggrega가 in Korean: accepted', source: 'Aggrega compiles it.', text: 'Aggrega가 컴파일합니다.', rejects: null },
    { scenario: 'Componentを in Japanese: accepted', source: 'Declare the Component.', text: 'Componentを宣言します。', rejects: null },
    { scenario: 'Component的 in Chinese: accepted', source: 'The Component configuration.', text: 'Component的配置。', rejects: null },
    { scenario: 'a Hangul syllable directly before the term: accepted', source: 'With the Component.', text: '와Component 함께.', rejects: null },
    { scenario: 'Recipes against a source Recipe: still rejected', source: 'Each Recipe applies.', text: 'Ogni Recipes si applica.', rejects: '"Recipe"' },
    { scenario: 'Componentize against a source Component: still rejected', source: 'Each Component applies.', text: 'Ogni Componentize si applica.', rejects: '"Component"' },
    { scenario: 'a Latin letter directly before the term: still rejected', source: 'Each Component applies.', text: 'Ogni xComponent si applica.', rejects: '"Component"' },
    { scenario: 'a digit directly after the term: still rejected', source: 'Each Component applies.', text: 'Ogni Component2 si applica.', rejects: '"Component"' },
    { scenario: 'a term in CJK characters keeps the letter-or-digit bound of any script: rejected', source: 'Il marchio 株式会社 è registrato.', text: 'The mark 株式会社の is registered.', rejects: '"株式会社"' },
  ];
  const modes = [
    { name: 'default mode', caseSensitive: false },
    { name: 'sensitive mode', caseSensitive: true },
  ];
  for (const mode of modes) {
    for (const row of rows) {
      it(`${mode.name}, ${row.scenario}`, () => {
        const item = { srcHash: 'b', source: row.source, format: 'text' };
        const { accepted, rejected } = validateTranslations({ items: [item], entries: [{ id: 'b', text: row.text }], doNotTranslate: TERMS, caseSensitive: mode.caseSensitive });
        if (row.rejects === null) {
          expect(rejected).toEqual({});
          expect(accepted).toEqual({ b: row.text });
        } else {
          expect(accepted).toEqual({});
          expect(rejected.b).toBe(`the do-not-translate term ${row.rejects} is missing; keep it verbatim`);
        }
      });
    }
  }
});
