import '../../../test/no-network.mjs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '../../cli.mjs';
import { loadConfig, parseConfig, ConfigError } from '../../config.mjs';
import { keyOf } from '../../normalize.mjs';
import { createPseudoLocalizer } from '../../pseudo-localizer.mjs';
import { createMarkdownAdapter } from './index.mjs';
import { segmentMarkdown } from './segment.mjs';
import { parseMarkdown } from './parse.mjs';
import { markdownTreeShape } from './shape.mjs';
import { applyHeadingIds } from './heading-id.mjs';
import { MarkdownSourceError } from './source-error.mjs';
import { capture, copyFixtureProject, copyMarkdownFixture, writeJson } from '../../../test/helpers.mjs';

const TARGETS = ['it', 'de'];
/** The source files the fixture configuration selects: every page but the excluded draft. */
const SOURCE_FILES = [
  'README.md',
  'frontmatter.md',
  'guide/headings.md',
  'guide/links.md',
  'guide/regions.md',
  'reference/generated-schema.md',
];

/** Runs a command in-process against a project directory. */
async function run(dir, argv, deps = {}) {
  const io = capture();
  const code = await runCli(argv, { cwd: dir, env: {}, log: io.log, errlog: io.errlog, ...deps });
  return { code, out: io.text(), err: io.errors() };
}

/** extract, translate with the pseudo-localizer, generate — each must exit 0. */
async function pseudoRun(dir) {
  for (const argv of [['extract'], ['translate'], ['generate']]) {
    const r = await run(dir, argv, { backend: createPseudoLocalizer() });
    expect(r.code, `${argv[0]}: ${r.err}`).toBe(0);
  }
}

const source = (dir, rel) => fs.readFileSync(path.join(dir, 'docs', rel), 'utf8');
const output = (dir, lang, rel) => fs.readFileSync(path.join(dir, 'out', lang, rel), 'utf8');

/** The segments the fixture policies translate: none in a kept path, none in a kept section. */
function translatedSegments(rel, text) {
  if (rel.startsWith('reference/generated-')) return [];
  return segmentMarkdown(text, { file: rel }).segments.filter((s) => s.region !== 'kept-options');
}

/** The text with each range replaced by one NUL character. */
function mask(text, segments) {
  let out = '';
  let at = 0;
  for (const s of segments) {
    out += text.slice(at, s.start) + '\u0000';
    at = s.end;
  }
  return out + text.slice(at);
}

/** Every heading's id after the package's plugin runs, in document order. */
function headingIds(text) {
  const { tree } = parseMarkdown(text);
  applyHeadingIds(tree);
  const ids = [];
  (function visit(node) {
    if (node.type === 'heading') ids.push(node.data && node.data.id !== undefined ? node.data.id : null);
    for (const child of node.children || []) visit(child);
  })(tree);
  return ids;
}

describe('the Markdown adapter segments structure, not lines', () => {
  const readme = fs.readFileSync(
    fileURLToPath(new URL('../../../test/fixtures/markdown/docs/README.md', import.meta.url)),
    'utf8'
  );
  const doc = segmentMarkdown(readme, { file: 'README.md' });
  const slices = doc.segments.map((s) => readme.slice(s.start, s.end));
  const kinds = new Set(doc.segments.map((s) => s.kind));

  it('segments headings, paragraphs, list-item and blockquote paragraphs, and table cells', () => {
    expect([...kinds].sort()).toEqual(['heading', 'paragraph', 'tableCell']);
    for (const expected of [
      'Lists', // ATX heading
      'Setext heading', // setext heading
      'First item\n  continues on a second line.', // list-item paragraph, raw slice
      'Nested item',
      'A finished task', // the task checkbox stays outside the segment
      'A quoted paragraph\n> over two lines.', // blockquote paragraph, raw slice
      'A list inside the quote',
      'A footnote paragraph is a segment.',
      'Name', // header cell
      'Alpha cell',
      'Beta cell \\| escaped',
      '`x` and words', // a cell with code and words
    ]) {
      expect(slices).toContain(expected);
    }
  });

  it('skips a table cell of only inline code, numbers, punctuation, symbols or nothing', () => {
    const cells = doc.segments.filter((s) => s.kind === 'tableCell').map((s) => readme.slice(s.start, s.end));
    expect(cells).toEqual(['Name', 'Code', 'Count', 'Mark', 'Empty', 'Alpha cell', 'Beta cell \\| escaped', '`x` and words']);
  });

  const cellRows = [
    { scenario: 'a cell of words', cell: 'Plain words', segmented: true },
    { scenario: 'a cell of only inline code', cell: '`a` `b`', segmented: false },
    { scenario: 'a cell of only numbers and punctuation', cell: '1,024 — 3.5%', segmented: false },
    { scenario: 'a cell of only a symbol', cell: '✓', segmented: false },
    { scenario: 'a cell of only emphasis markers around code', cell: '**`x`**', segmented: false },
    { scenario: 'a cell of only an autolink', cell: '<https://cell.example>', segmented: true },
    { scenario: 'a cell of only inline HTML', cell: '<br>', segmented: true },
  ];
  for (const row of cellRows) {
    it(`${row.segmented ? 'segments' : 'skips'} ${row.scenario}`, () => {
      const text = `| H |\n|---|\n| ${row.cell} |\n`;
      const cells = segmentMarkdown(text).segments.filter((s) => s.kind === 'tableCell').map((s) => text.slice(s.start, s.end));
      expect(cells).toEqual(row.segmented ? ['H', row.cell] : ['H']);
    });
  }

  it('never segments fenced or indented code, an HTML block or an HTML comment', () => {
    for (const never of ['neverSegmented', 'indented code', 'An HTML block', 'An HTML comment']) {
      expect(slices.filter((s) => s.includes(never))).toEqual([]);
    }
  });

  it('segments frontmatter only for the keys the configuration lists, and none by default', () => {
    const text = fs.readFileSync(
      fileURLToPath(new URL('../../../test/fixtures/markdown/docs/frontmatter.md', import.meta.url)),
      'utf8'
    );
    const byDefault = segmentMarkdown(text, { file: 'frontmatter.md' }).segments;
    expect(byDefault.filter((s) => s.start < text.indexOf('\n---\n'))).toEqual([]);
    expect(byDefault.map((s) => text.slice(s.start, s.end))).toEqual([
      'Frontmatter page',
      'The frontmatter above is never segmented by default.',
    ]);
    const listed = segmentMarkdown(text, { file: 'frontmatter.md', frontmatterKeys: ['title', 'description'] });
    const values = listed.segments.filter((s) => s.kind === 'frontmatter').map((s) => text.slice(s.start, s.end));
    expect(values).toEqual(['Frontmatter page', 'A quoted description']);
  });

  const refusals = [
    { scenario: 'a listed key holding a sequence', key: 'tags', text: '---\ntags:\n  - one\n---\n\nBody.\n', names: 'frontmatter key "tags" holds a nested or multi-line value' },
    { scenario: 'a listed key holding a block scalar', key: 'title', text: '---\ntitle: |\n  Two\n---\n\nBody.\n', names: 'frontmatter key "title" holds a block scalar' },
    { scenario: 'a listed key continued on the next line', key: 'title', text: '---\ntitle: One\n  two\n---\n\nBody.\n', names: 'frontmatter key "title" continues on the next line' },
    { scenario: 'a listed key with an unclosed quote', key: 'title', text: '---\ntitle: "One\n---\n\nBody.\n', names: 'frontmatter key "title" holds a quoted value that does not close on its line' },
  ];
  for (const row of refusals) {
    it(`refuses ${row.scenario}, naming the file and the key`, () => {
      let thrown;
      try {
        segmentMarkdown(row.text, { file: 'page.md', frontmatterKeys: [row.key] });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(MarkdownSourceError);
      expect(thrown.message).toContain(`page.md: ${row.names}`);
    });
  }

  const sections = [
    { scenario: 'a section never closed', text: '<!-- BEGIN GENERATED: a -->\n\nText.\n', names: 'page.md:1: generated section "a" is never closed.' },
    { scenario: 'a section closed but never opened', text: 'Text.\n\n<!-- END GENERATED: a -->\n', names: 'page.md:3: generated section "a" closes but was never opened.' },
    { scenario: 'a section closed under another name', text: '<!-- BEGIN GENERATED: a -->\n\n<!-- END GENERATED: b -->\n', names: 'page.md:3: generated section "a" (opened at line 1) is closed as "b".' },
    { scenario: 'a section nested in another', text: '<!-- BEGIN GENERATED: a -->\n\n<!-- BEGIN GENERATED: b -->\n', names: 'page.md:3: generated section "b" opens inside "a"' },
  ];
  for (const row of sections) {
    it(`refuses ${row.scenario}, naming the file and the line`, () => {
      let thrown;
      try {
        segmentMarkdown(row.text, { file: 'page.md' });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(MarkdownSourceError);
      expect(thrown.message).toContain(row.names);
    });
  }

  it('keeps every offset an index into the file when it opens with a byte-order mark', () => {
    const text = '﻿# Title\n\nBody text.\n';
    expect(segmentMarkdown(text).segments.map((s) => text.slice(s.start, s.end))).toEqual(['Title', 'Body text.']);
  });
});

describe('one hash function', () => {
  let dir;
  beforeEach(() => {
    dir = copyMarkdownFixture();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keys a Markdown paragraph with the engine’s own keyOf', () => {
    // A decomposed "é": a hash that skipped the engine's normalization would read another key.
    const paragraph = 'Café with `code` and **strong** text.';
    fs.writeFileSync(path.join(dir, 'docs', 'hash.md'), `# Hash\n\n${paragraph}\n`);
    const adapter = createMarkdownAdapter({ project: loadConfig({ configPath: path.join(dir, 'l10n.config.json') }) });
    const { units } = adapter.extract();
    const keys = Object.keys(units).filter((k) => units[k].source === paragraph);
    expect(keys).toEqual([keyOf(paragraph)]);
  });

  it('no adapter module computes a hash of its own', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const modules = fs.readdirSync(here).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));
    expect(modules.length).toBeGreaterThan(0);
    for (const file of modules) {
      const text = fs.readFileSync(path.join(here, file), 'utf8');
      expect(text, file).not.toMatch(/node:crypto|createHash|sha256/);
    }
    expect(fs.readFileSync(path.join(here, 'index.mjs'), 'utf8')).toMatch(
      /import \{ keyOf \} from '\.\.\/\.\.\/normalize\.mjs';/
    );
  });
});

describe('a pseudo-localized run over the fixture corpus', () => {
  let dir;
  beforeAll(async () => {
    dir = copyMarkdownFixture();
    await pseudoRun(dir);
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('emits every source file in every target locale under out/<locale>/<path>, and no excluded file', () => {
    for (const lang of TARGETS) {
      const written = fs.globSync('**/*.md', { cwd: path.join(dir, 'out', lang) }).sort();
      expect(written).toEqual([...SOURCE_FILES].sort());
    }
  });

  it('changes the bytes inside translated segments only: outside them, every output file equals its source', () => {
    for (const lang of TARGETS) {
      for (const rel of SOURCE_FILES) {
        const src = source(dir, rel);
        const out = output(dir, lang, rel);
        const before = translatedSegments(rel, src);
        const after = translatedSegments(rel, out);
        expect(after.length, `${lang}/${rel}`).toBe(before.length);
        expect(mask(out, after), `${lang}/${rel}`).toBe(mask(src, before));
        // And the translation did happen: a translated segment with prose differs from its source.
        for (let i = 0; i < before.length; i++) {
          if (/[A-Za-z]/.test(src.slice(before[i].start, before[i].end).replace(/`[^`]*`/g, ''))) {
            expect(out.slice(after[i].start, after[i].end), `${lang}/${rel}`).not.toBe(src.slice(before[i].start, before[i].end));
          }
        }
      }
    }
  });

  it('keeps inline code, link and image destinations, HTML tags and generated-section markers byte-identical', () => {
    const planted = {
      'README.md': [
        '`planted_inline_code`',
        '](https://planted.example/destination "Planted title")',
        '](images/planted-image.png)',
        '<kbd>',
        '</kbd>',
        '<https://autolink.example/path>',
        '&amp;',
        '[^note]',
      ],
      'guide/regions.md': [
        '<!-- BEGIN GENERATED: kept-options -->',
        '<!-- END GENERATED: kept-options -->',
        '<!-- BEGIN GENERATED: translated-list -->',
        '<!-- END GENERATED: translated-list -->',
      ],
      'guide/headings.md': ['<img src="logo.png" alt="logo">', '](badge.svg)', '`_x_`', '`run`'],
    };
    const count = (text, needle) => text.split(needle).length - 1;
    for (const lang of TARGETS) {
      for (const [rel, needles] of Object.entries(planted)) {
        for (const needle of needles) {
          expect(count(source(dir, rel), needle), `${rel}: ${needle}`).toBeGreaterThan(0);
          expect(count(output(dir, lang, rel), needle), `${lang}/${rel}: ${needle}`).toBe(count(source(dir, rel), needle));
        }
      }
      // The alt text and the link text around them are translated.
      expect(output(dir, lang, 'README.md')).not.toContain('planted alt text');
      expect(output(dir, lang, 'README.md')).not.toContain('[planted link]');
    }
  });

  it('every protected span the adapter found is reproduced in every output file', () => {
    const spans = (text, rel) =>
      translatedSegments(rel, text)
        .flatMap((s) => s.protected.map(([a, b]) => text.slice(a, b)))
        .sort();
    for (const lang of TARGETS) {
      for (const rel of SOURCE_FILES) {
        expect(spans(output(dir, lang, rel), rel), `${lang}/${rel}`).toEqual(spans(source(dir, rel), rel));
      }
    }
  });

  it('re-parses every generated file to the source’s tree shape', () => {
    for (const lang of TARGETS) {
      for (const rel of SOURCE_FILES) {
        const want = markdownTreeShape(source(dir, rel));
        const got = markdownTreeShape(output(dir, lang, rel));
        expect(got, `${lang}/${rel}`).toEqual(want);
      }
    }
    const readme = markdownTreeShape(source(dir, 'README.md'));
    expect(readme).toMatchObject({ listItems: 8, tableRows: 3, tableCells: 15 });
  });

  it('ends every heading outside a kept scope with the source slug, numbering a duplicate as the slugger does', () => {
    for (const lang of TARGETS) {
      const out = output(dir, lang, 'guide/headings.md');
      expect(headingIds(out)).toEqual([
        'headings',
        'overview',
        'overview-1',
        'install--the-tool-',
        'the-_x_-option',
        'ends-with-code-run',
      ]);
      expect(out).toMatch(/^## Óṽéŕṽíéŵ \{#overview-1\}$/m);
      // The suffix follows the heading's last node, inline code included.
      expect(out).toMatch(/^## Éñďš ŵíţĥ çóďé `run` \{#ends-with-code-run\}$/m);
    }
  });

  it('gives a heading in a kept section no identifier, while it still advances the file’s slugger', () => {
    const out = output(dir, 'it', 'guide/regions.md');
    expect(out).toContain('\n## Options\n'); // kept: the source bytes, no suffix
    expect(out).toContain('\n## Óþţíóñš {#options-1}\n'); // the later duplicate keeps the source numbering
  });

  it('keeps a reference link’s label, so the link still resolves; a slice parsed on its own would lose it', () => {
    for (const lang of TARGETS) {
      const out = output(dir, lang, 'guide/links.md');
      expect(out).toContain('][guide-ref]');
      expect(out).toContain('[shortcut]');
      const types = markdownTreeShape(out).types;
      expect(types.filter((t) => t === 'linkReference')).toHaveLength(2);
    }
    // Why the spans travel on the unit rather than being re-detected from the slice.
    const text = source(dir, 'guide/links.md');
    const slice = segmentMarkdown(text).segments.find((s) => s.kind === 'paragraph');
    const isolated = markdownTreeShape(text.slice(slice.start, slice.end)).types;
    expect(isolated).not.toContain('linkReference');
  });
});

describe('policies by path and by generated-section name', () => {
  let dir;
  beforeAll(async () => {
    dir = copyMarkdownFixture();
    await pseudoRun(dir);
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('copies a kept path byte for byte', () => {
    const src = fs.readFileSync(path.join(dir, 'docs', 'reference', 'generated-schema.md'));
    for (const lang of TARGETS) {
      expect(fs.readFileSync(path.join(dir, 'out', lang, 'reference', 'generated-schema.md')).equals(src)).toBe(true);
    }
  });

  it('copies a kept section byte for byte inside an otherwise translated page', () => {
    const src = source(dir, 'guide/regions.md');
    const begin = '<!-- BEGIN GENERATED: kept-options -->';
    const end = '<!-- END GENERATED: kept-options -->';
    const keptSource = src.slice(src.indexOf(begin), src.indexOf(end) + end.length);
    for (const lang of TARGETS) {
      const out = output(dir, lang, 'guide/regions.md');
      expect(out.slice(out.indexOf(begin), out.indexOf(end) + end.length)).toBe(keptSource);
      expect(out).not.toContain('Hand-written introduction.');
      expect(out).not.toContain('Generated item one'); // the translated section is translated
    }
  });

  it('contributes no catalogue unit for kept text', () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'memory', 'source.json'), 'utf8'));
    const sources = Object.values(catalog.units).map((u) => u.source);
    expect(sources).not.toContain('Runs quickly');
    expect(sources).not.toContain('The entity name');
    expect(sources).toContain('Generated item one');
  });
});

describe('what the adapter writes is never read back as a source', () => {
  let dir;
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const layouts = [
    { scenario: 'an output directory inside the corpus', outDir: 'docs/translated', written: (lang, rel) => `docs/translated/${lang}/${rel}` },
    { scenario: 'the corpus root as the output directory', outDir: 'docs', written: (lang, rel) => `docs/${lang}/${rel}` },
  ];
  for (const row of layouts) {
    it(`with ${row.scenario}`, async () => {
      dir = copyMarkdownFixture();
      const configPath = path.join(dir, 'l10n.config.json');
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      cfg.adapter.outDir = row.outDir;
      writeJson(configPath, cfg);
      await pseudoRun(dir);
      expect(fs.existsSync(path.join(dir, row.written('it', 'guide/regions.md')))).toBe(true);
      const project = loadConfig({ configPath });
      expect(createMarkdownAdapter({ project }).listFiles()).toEqual([...SOURCE_FILES].sort());
    });
  }
});

describe('a segment with no translation', () => {
  let dir;
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps its source text at its position, and its heading keeps the identifier', async () => {
    dir = copyMarkdownFixture();
    for (const argv of [['extract'], ['translate']]) {
      expect((await run(dir, argv, { backend: createPseudoLocalizer() })).code).toBe(0);
    }
    const machineFile = path.join(dir, 'memory', 'machine', 'it.json');
    const machine = JSON.parse(fs.readFileSync(machineFile, 'utf8'));
    for (const s of ['Hand-written closing paragraph.', 'Options']) delete machine[keyOf(s)];
    writeJson(machineFile, machine);
    expect((await run(dir, ['generate'])).code).toBe(0);

    const out = output(dir, 'it', 'guide/regions.md');
    expect(out).toContain('\n## Options {#options-1}\n\nHand-written closing paragraph.\n');
    expect(out).toContain('Ĥáñď-ŵŕíţţéñ íñţŕóďúçţíóñ.'); // its neighbours are translated
    expect(output(dir, 'de', 'guide/regions.md')).not.toContain('Hand-written closing paragraph.');
  });
});

describe('extract reports what it read', () => {
  let dir;
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('prints the file, segment and word counts for a Markdown corpus', async () => {
    dir = copyMarkdownFixture();
    const r = await run(dir, ['extract']);
    expect(r.code).toBe(0);
    const project = loadConfig({ configPath: path.join(dir, 'l10n.config.json') });
    const { stats, units } = createMarkdownAdapter({ project }).extract();
    expect(stats.files).toBe(SOURCE_FILES.length);
    expect(stats.segments).toBeGreaterThan(Object.keys(units).length - 1);
    expect(r.out.split('\n')).toEqual([
      `extract: catalog written, ${Object.keys(units).length} source units.`,
      `extract: ${SOURCE_FILES.length} files, ${stats.segments} segments, ${stats.words} words.`,
    ]);
  });

  it('counts a word outside protected spans only', async () => {
    dir = copyMarkdownFixture();
    fs.rmSync(path.join(dir, 'docs'), { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'docs', 'one.md'), 'Two words `not counted` [and three](https://not.counted/here).\n');
    const project = loadConfig({ configPath: path.join(dir, 'l10n.config.json') });
    expect(createMarkdownAdapter({ project }).extract().stats).toEqual({ files: 1, segments: 1, words: 4 });
  });

  it('prints the one catalogue line, unchanged, for a JSON-content project', async () => {
    dir = copyFixtureProject();
    const r = await run(dir, ['extract']);
    expect(r.code).toBe(0);
    expect(r.out.split('\n')).toHaveLength(1);
    expect(r.out).toMatch(/^extract: catalog written, \d+ source units\.$/);
  });
});

describe('the Markdown adapter’s configuration', () => {
  const base = () =>
    JSON.parse(
      fs.readFileSync(fileURLToPath(new URL('../../../test/fixtures/markdown/l10n.config.json', import.meta.url)), 'utf8')
    );

  it('is selected by adapter.kind and applies its defaults', () => {
    const cfg = base();
    delete cfg.adapter.policies;
    delete cfg.adapter.exclude;
    const parsed = parseConfig(cfg);
    expect(parsed.adapter).toMatchObject({ kind: 'markdown', exclude: [], frontmatterKeys: [], policies: { paths: [], regions: {} } });
  });

  const defects = [
    { scenario: 'an unknown key', mutate: (c) => (c.adapter.outdir = 'x'), names: 'adapter.outdir: unknown key' },
    { scenario: 'a policy that is neither translate nor keep', mutate: (c) => (c.adapter.policies.regions.x = 'skip'), names: 'adapter.policies.regions.x' },
    { scenario: 'an empty include list', mutate: (c) => (c.adapter.include = []), names: 'adapter.include' },
    { scenario: 'a path rule with an unknown key', mutate: (c) => (c.adapter.policies.paths[0].mode = 'keep'), names: 'adapter.policies.paths.0.mode: unknown key' },
  ];
  for (const row of defects) {
    it(`refuses ${row.scenario}, naming the key`, () => {
      const cfg = base();
      row.mutate(cfg);
      let thrown;
      try {
        parseConfig(cfg);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(ConfigError);
      expect(thrown.message).toContain(row.names);
    });
  }
});
