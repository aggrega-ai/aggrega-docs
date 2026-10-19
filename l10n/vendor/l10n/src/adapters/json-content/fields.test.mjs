import '../../../test/no-network.mjs';
import { describe, it, expect } from 'vitest';
import { createFieldRules } from './fields.mjs';

/** The smallest rule set; each row varies one rule. */
const BASE = {
  denylistKeys: [],
  pageFields: {},
  valueGuards: { refPrefixes: [], assetExtensions: [], excludeNumbers: false, excludeBooleans: false },
};
const withRules = (patch) => createFieldRules({ ...BASE, ...patch, valueGuards: { ...BASE.valueGuards, ...(patch.valueGuards || {}) } });

const page = (data, extra = {}) => ({ path: '/x/', template: 'T', blocks: [{ name: 'B', data }], ...extra });
const values = (rules, p) => rules.translatableLeaves(p).map((l) => l.value);

describe('createFieldRules — each rule is data, and each does exactly its one thing', () => {
  const rows = [
    {
      scenario: 'with no rules, every non-empty string leaf in block data is translatable',
      rules: {},
      data: { a: 'Testo', b: '/x', c: '42', d: 'true', e: 'foto.png', f: '' },
      expected: ['Testo', '/x', '42', 'true', 'foto.png'],
    },
    {
      scenario: 'a denylisted key drops its whole subtree, matched case-insensitively',
      rules: { denylistKeys: ['Image'] },
      data: { IMAGE: { alt: 'Alt', src: 'x' }, caption: 'Didascalia' },
      expected: ['Didascalia'],
    },
    {
      scenario: 'a reference prefix excludes a value that starts with it',
      rules: { valueGuards: { refPrefixes: ['/', '#'] } },
      data: { a: '/servizi/', b: '#anchor', c: 'a/b' },
      expected: ['a/b'],
    },
    {
      scenario: 'an asset extension excludes a value ending in it, a query string allowed',
      rules: { valueGuards: { assetExtensions: ['png', 'pdf'] } },
      data: { a: 'foto.PNG', b: 'doc.pdf?v=2', c: 'doc.pdf#p=1', d: 'pdf' },
      expected: ['doc.pdf#p=1', 'pdf'],
    },
    {
      scenario: 'excludeNumbers drops a bare number with either decimal separator',
      rules: { valueGuards: { excludeNumbers: true } },
      data: { a: '104.05', b: '-3,5', c: '3 GB' },
      expected: ['3 GB'],
    },
    {
      scenario: 'excludeBooleans drops true and false in any case',
      rules: { valueGuards: { excludeBooleans: true } },
      data: { a: 'TRUE', b: 'false', c: 'vero' },
      expected: ['vero'],
    },
  ];

  for (const row of rows) {
    it(row.scenario, () => {
      expect(values(withRules(row.rules), page(row.data))).toEqual(row.expected);
    });
  }
});

describe('page-level fields', () => {
  it('extracts only the listed fields of the listed objects, before the blocks, in configuration order', () => {
    const rules = withRules({ pageFields: { seo: ['title', 'description'], meta: ['summary'] } });
    const p = page({ heading: 'Corpo' }, {
      seo: { title: 'Titolo', description: 'Descrizione', ogTitle: 'No' },
      meta: { summary: 'Sommario', author: 'No' },
      extra: { title: 'No' },
    });
    const leaves = rules.translatableLeaves(p);
    expect(leaves.map((l) => l.path)).toEqual(['seo.title', 'seo.description', 'meta.summary', 'blocks[0].data.heading']);
    expect(leaves[0].context).toBe('seo:title');
  });

  it('never walks the block discriminator, the page path or the template', () => {
    const rules = withRules({});
    const p = { path: 'Percorso', template: 'Modello', blocks: [{ name: 'Nome', id: 'ident', data: { name: 'Voce' } }] };
    expect(values(rules, p)).toEqual(['Voce']);
  });
});
