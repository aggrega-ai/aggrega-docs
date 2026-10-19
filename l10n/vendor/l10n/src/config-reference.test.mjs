import '../test/no-network.mjs';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { COMMANDS } from './cli.mjs';
import { ConfigSchema, doc } from './config.mjs';
import { REFERENCE_SECTION, readReference, renderConfigReference, spliceReference } from './config-reference.mjs';

const README = fileURLToPath(new URL('../README.md', import.meta.url));

/**
 * Every key path the schema accepts, from its own shape: the leaves the
 * reference must hold a row for. Written apart from the generator's walk on
 * purpose, so a key the generator skipped is a difference between the two.
 */
function schemaKeys(schema, prefix = []) {
  let node = schema;
  while (['ZodOptional', 'ZodDefault', 'ZodEffects'].includes(node._def.typeName)) node = node._def.innerType || node._def.schema;
  if (node._def.typeName === 'ZodDiscriminatedUnion' && prefix.length) {
    const d = node._def.discriminator;
    return [[...prefix, d].join('.'), ...[...node._def.options].flatMap((o) => Object.entries(o.shape).filter(([k]) => k !== d).flatMap(([k, v]) => schemaKeys(v, [...prefix, k])))];
  }
  if (node._def.typeName === 'ZodObject') {
    return Object.entries(node.shape).flatMap(([k, v]) => schemaKeys(v, [...prefix, k]));
  }
  return [prefix.join('.')];
}

/** The keys the reference's tables hold, in order. */
const rowKeys = (text) => [...text.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);

describe('the configuration reference', () => {
  it('the README’s generated section is a fresh generation from the schema', () => {
    const committed = readReference(fs.readFileSync(README, 'utf8'));
    expect(committed).not.toBeNull();
    expect(committed).toBe(renderConfigReference());
  });

  it('holds one row per key the schema accepts, each with a type, a default and the commands that read it', () => {
    const rendered = renderConfigReference();
    const keys = schemaKeys(ConfigSchema);
    expect(keys).toContain('ci.workflow');
    expect(keys).toContain('adapter.policies.regions');
    // A key two kinds of one union share (the backends' model, say) has a row in each kind's table.
    expect([...new Set(rowKeys(rendered))].sort()).toEqual([...new Set(keys)].sort());
    expect(keys).toContain('backend.tokenEnv');
    for (const line of rendered.split('\n').filter((l) => /^\| `/.test(l))) {
      const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
      expect(cells).toHaveLength(5);
      expect(cells.every((c) => c !== '')).toBe(true);
      const readers = cells[3] === 'every command' ? COMMANDS : [...cells[3].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      expect(readers.filter((r) => !COMMANDS.includes(r))).toEqual([]);
    }
  });

  it('refuses a key without documentation, naming it', () => {
    const schema = z.object({ documented: doc(z.string(), { text: 'A key.', readBy: ['extract'] }), bare: z.string() });
    expect(() => renderConfigReference({ schema })).toThrow('config-reference: bare: no documentation');
  });

  it('refuses a reader that is not a command, naming the key', () => {
    const schema = z.object({ k: doc(z.string(), { text: 'A key.', readBy: ['extract', 'publish'] }) });
    expect(() => renderConfigReference({ schema })).toThrow('config-reference: k: publish is not a command');
  });

  it('splices the section between its markers and refuses a text without them', () => {
    const text = `# T\n\n<!-- BEGIN GENERATED: ${REFERENCE_SECTION} -->\n\nold\n\n<!-- END GENERATED: ${REFERENCE_SECTION} -->\n\nafter\n`;
    const next = spliceReference(text, 'new');
    expect(readReference(next)).toBe('new');
    expect(next.endsWith('\n\nafter\n')).toBe(true);
    expect(() => spliceReference('# T\n', 'new')).toThrow(/no single/);
  });
});
