import '../../../test/no-network.mjs';
import { describe, it, expect } from 'vitest';
import GithubSlugger from 'github-slugger';

import { formatHeadingId, parseHeadingId, applyHeadingIds, remarkHeadingIds } from './heading-id.mjs';
import { headingSlugText } from './slug.mjs';
import { parseMarkdown } from './parse.mjs';
import { segmentMarkdown } from './segment.mjs';

/** The first heading of a parsed Markdown string. */
function firstHeading(text) {
  const { tree } = parseMarkdown(text);
  return tree.children.find((n) => n.type === 'heading');
}

describe('the ` {#slug}` suffix: one writer and one parser', () => {
  const slugs = [
    { scenario: 'a plain slug', slug: 'getting-started', written: ' {#getting-started}' },
    { scenario: 'an underscore between letters', slug: 'snake_case', written: ' {#snake_case}' },
    { scenario: 'an underscore next to a hyphen', slug: 'the-_x_-option', written: ' {#the-\\_x\\_-option}' },
    { scenario: 'leading and trailing underscores', slug: '__init__', written: ' {#\\_\\_init\\_\\_}' },
    { scenario: 'a non-ASCII slug', slug: 'ünïcödé-straße', written: ' {#ünïcödé-straße}' },
    { scenario: 'the empty slug', slug: '', written: ' {#}' },
  ];
  for (const row of slugs) {
    it(`writes and reads back ${row.scenario}`, () => {
      expect(formatHeadingId(row.slug)).toBe(row.written);
      expect(parseHeadingId(`Some heading${row.written}`)).toEqual({ text: 'Some heading', id: row.slug });
    });

    it(`keeps ${row.scenario} plain text in Markdown, even after a delimiter in the heading`, () => {
      for (const prefix of ['Plain', 'A _lead', 'Two__words', '`code`']) {
        const heading = firstHeading(`## ${prefix}${formatHeadingId(row.slug)}\n`);
        applyHeadingIds({ type: 'root', children: [heading] });
        expect(heading.data.id, `${prefix}${row.written}`).toBe(row.slug);
      }
    });
  }

  it('reads a raw heading line as a title loader would, stripping the suffix', () => {
    expect(parseHeadingId('Getting started {#getting-started}')).toEqual({ text: 'Getting started', id: 'getting-started' });
    expect(parseHeadingId('No identifier here')).toEqual({ text: 'No identifier here', id: null });
    expect(parseHeadingId('Braces {#not an id}')).toEqual({ text: 'Braces {#not an id}', id: null });
  });

  it('refuses a slug that cannot be written', () => {
    for (const bad of ['two words', 'a{b', 'a}b', 'back\\slash']) {
      expect(() => formatHeadingId(bad)).toThrow(TypeError);
    }
  });
});

describe('the syntax-tree plugin', () => {
  it('strips the suffix from the heading text and sets the heading id', () => {
    const { tree } = parseMarkdown('## Getting started {#getting-started}\n\nText.\n');
    remarkHeadingIds()(tree);
    const heading = tree.children[0];
    expect(heading.children).toHaveLength(1);
    expect(heading.children[0]).toMatchObject({ type: 'text', value: 'Getting started' });
    expect(heading.data).toEqual({ id: 'getting-started', hProperties: { id: 'getting-started' } });
  });

  it('removes a text node left empty after inline code, and keeps other properties', () => {
    const { tree } = parseMarkdown('## Run `l10n` {#run-l10n}\n');
    const heading = tree.children[0];
    heading.data = { hProperties: { className: ['x'] } };
    applyHeadingIds(tree);
    expect(heading.children.map((c) => c.type)).toEqual(['text', 'inlineCode']);
    expect(heading.data.hProperties).toEqual({ className: ['x'], id: 'run-l10n' });
  });

  it('reads the id from the source text, so a typographic step that rewrote `--` before it changes nothing', () => {
    const source = '## Errors & warnings {#errors--warnings}\n';
    const { tree } = parseMarkdown(source);
    const last = tree.children[0].children[0];
    last.value = last.value.replace('--', '—'); // what typographic dashes do to the text node
    remarkHeadingIds()(tree, { value: source });
    expect(tree.children[0].data.id).toBe('errors--warnings');
    expect(tree.children[0].children[0].value).toBe('Errors & warnings');
  });

  it('numbers offsets after a byte-order mark, as the parser does', () => {
    const source = '﻿## Errors & warnings {#errors--warnings}\n';
    const { tree } = parseMarkdown(source.slice(1)); // a parser that drops the mark, as micromark does
    tree.children[0].children[0].value = tree.children[0].children[0].value.replace('--', '—');
    remarkHeadingIds()(tree, { value: source });
    expect(tree.children[0].data.id).toBe('errors--warnings');
  });

  it('leaves a heading without a suffix, and a suffix inside inline code, alone', () => {
    const { tree } = parseMarkdown('## Plain heading\n\n## Code `{#nope}`\n');
    applyHeadingIds(tree);
    expect(tree.children.map((h) => h.data)).toEqual([undefined, undefined]);
    expect(tree.children[1].children[1].value).toBe('{#nope}');
  });
});

describe('the slug rule', () => {
  it('excludes inline HTML and image alt text, as a heading-id step reading text nodes before raw HTML does', () => {
    const heading = firstHeading('## Install <img src="logo.png" alt="logo"> the tool ![badge](badge.svg)\n');
    // What such a step reads: the text nodes, the raw HTML and the image contributing nothing.
    const siteText = 'Install  the tool ';
    expect(headingSlugText(heading)).toBe(siteText);
    expect(new GithubSlugger().slug(headingSlugText(heading))).toBe('install--the-tool-');
    // A plain text rendering that kept the HTML and the alt text would compute another slug.
    const withHtmlAndAlt = 'Install <img src="logo.png" alt="logo"> the tool badge';
    expect(new GithubSlugger().slug(withHtmlAndAlt)).not.toBe('install--the-tool-');
  });

  it('includes inline code values and link text', () => {
    expect(headingSlugText(firstHeading('## Use `l10n gate` with [the docs](x.md)\n'))).toBe('Use l10n gate with the docs');
  });

  it('uses one slugger per file in document order, so a duplicate is numbered and files do not share counts', () => {
    const page = '# Intro\n\n## Intro\n\n## Intro\n';
    expect(segmentMarkdown(page).headings.map((h) => h.slug)).toEqual(['intro', 'intro-1', 'intro-2']);
    expect(segmentMarkdown(page).headings.map((h) => h.slug)).toEqual(['intro', 'intro-1', 'intro-2']);
  });
});
