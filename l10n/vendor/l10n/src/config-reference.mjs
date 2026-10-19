/**
 * config-reference.mjs — The configuration reference, generated from the
 * configuration's schema.
 *
 * READS nothing from disk: it walks `ConfigSchema` (`config.mjs`) and the key
 * documentation every key carries there — its sentence, the commands that read
 * it, any default applied outside the schema — and renders one table row per
 * key: its type, its default and the commands that read it. `spliceReference`
 * places the result between the README's markers; the package script
 * `scripts/config-reference.mjs` writes it, or with `--check` compares it.
 * WRITES nothing.
 *
 * A key with no documentation, a reader that is not a command and a schema
 * shape the renderer has no notation for each throw, naming the key, so the
 * reference cannot silently omit what the schema accepts.
 */

import { COMMANDS } from './cli.mjs';
import { ConfigSchema, EVERY_COMMAND, keyDoc, typeName } from './config.mjs';

/** The name of the README's generated section. */
export const REFERENCE_SECTION = 'config-reference';

/** The marker lines that open and close a generated section. */
export const sectionMarkers = (name) => [`<!-- BEGIN GENERATED: ${name} -->`, `<!-- END GENERATED: ${name} -->`];

/** A schema node's Zod kind. */
const kindOf = (schema) => schema && schema._def && schema._def.typeName;

/** A key path's components, joined for display. */
const keyPath = (parts) => parts.join('.');

/**
 * The schema with its optional, default and refinement wrappers removed, and
 * what the wrappers said. A schema `named` gave a type name stops the walk,
 * since the name is what the reference prints.
 */
function unwrap(schema) {
  let node = schema;
  let optional = false;
  let defaultValue;
  let hasDefault = false;
  for (;;) {
    if (typeName(node)) break;
    const kind = kindOf(node);
    if (kind === 'ZodOptional') {
      optional = true;
      node = node._def.innerType;
    } else if (kind === 'ZodDefault') {
      if (!hasDefault) {
        hasDefault = true;
        defaultValue = node._def.defaultValue();
      }
      node = node._def.innerType;
    } else if (kind === 'ZodEffects') {
      node = node._def.schema;
    } else {
      break;
    }
  }
  return { node, optional, hasDefault, defaultValue };
}

/**
 * The TypeScript-like notation of a value schema. Named types are recorded in
 * `used`, so the reference can define each one it prints.
 */
function typeOf(schema, used, where) {
  const named = typeName(schema);
  if (named) {
    used.set(named.name, named.text);
    return named.name;
  }
  const kind = kindOf(schema);
  switch (kind) {
    case 'ZodOptional':
    case 'ZodDefault':
      return typeOf(schema._def.innerType, used, where);
    case 'ZodEffects':
      return typeOf(schema._def.schema, used, where);
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return schema._def.checks.some((c) => c.kind === 'int') ? 'integer' : 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodLiteral':
      return JSON.stringify(schema._def.value);
    case 'ZodEnum':
      return schema._def.values.map((v) => JSON.stringify(v)).join(' | ');
    case 'ZodArray': {
      const item = typeOf(schema._def.type, used, where);
      return item.includes(' | ') ? `(${item})[]` : `${item}[]`;
    }
    case 'ZodRecord':
      return `Record<${typeOf(schema._def.keyType, used, where)}, ${typeOf(schema._def.valueType, used, where)}>`;
    case 'ZodObject': {
      const keys = Object.entries(schema.shape).map(([key, value]) => (unwrap(value).optional || unwrap(value).hasDefault ? `${key}?` : key));
      return `{ ${keys.join(', ')} }`;
    }
    case 'ZodUnion':
      return schema._def.options.map((option) => typeOf(option, used, where)).join(' | ');
    case 'ZodDiscriminatedUnion':
      return [...schema._def.options].map((option) => typeOf(option, used, where)).join(' | ');
    default:
      throw new Error(`config-reference: ${where}: no notation for a ${kind}`);
  }
}

/** The commands a key's documentation names, checked against the command line's, in its order. */
function readersOf(meta, where, commands) {
  if (meta.readBy === EVERY_COMMAND) return 'every command';
  if (!Array.isArray(meta.readBy) || meta.readBy.length === 0) throw new Error(`config-reference: ${where}: names no command that reads it`);
  const unknown = meta.readBy.filter((name) => !commands.includes(name));
  if (unknown.length) throw new Error(`config-reference: ${where}: ${unknown.join(', ')} is not a command`);
  return commands.filter((name) => meta.readBy.includes(name)).map((name) => `\`${name}\``).join(', ');
}

/** Escapes a table cell's pipes and line breaks. */
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * Walks one schema node at `parts`, adding a row per documented key to
 * `tables[table]`, and descending into an undocumented object.
 *
 * @param {Object} state
 * @param {string|null} state.within     the nearest optional ancestor's key path, or null.
 * @param {Object|undefined} state.parentDefault  the default value the parent object supplies.
 * @param {string} state.table           the table rows go to.
 */
function walk(schema, parts, state, ctx) {
  const where = keyPath(parts);
  const meta = keyDoc(schema);
  const { node, optional, hasDefault, defaultValue } = unwrap(schema);
  const kind = kindOf(node);
  const own = hasDefault ? defaultValue : state.parentDefault;

  if (kind === 'ZodDiscriminatedUnion' && !typeName(node)) {
    if (!meta) throw new Error(`config-reference: ${where}: no documentation`);
    const discriminator = node._def.discriminator;
    const options = [...node._def.options];
    const kindParts = [...parts, discriminator];
    addRow(ctx, state.table, {
      key: keyPath(kindParts),
      type: options.map((option) => JSON.stringify(option.shape[discriminator]._def.value)).join(' | '),
      default: own !== undefined && own[discriminator] !== undefined ? `\`${JSON.stringify(own[discriminator])}\`` : requiredText(state.within, optional),
      readBy: readersOf(meta, where, ctx.commands),
      text: meta.text,
    });
    for (const option of options) {
      const value = option.shape[discriminator]._def.value;
      const table = options.length > 1 ? `${keyPath(kindParts)}: ${JSON.stringify(value)}` : state.table;
      for (const [key, child] of Object.entries(option.shape)) {
        if (key === discriminator) continue;
        walk(child, [...parts, key], { within: optional && !hasDefault ? where : state.within, parentDefault: own && own[key], table }, ctx);
      }
    }
    return;
  }

  if (kind === 'ZodObject' && !meta) {
    const within = optional && !hasDefault ? where : state.within;
    for (const [key, child] of Object.entries(node.shape)) {
      walk(child, [...parts, key], { within, parentDefault: own && own[key], table: state.table }, ctx);
    }
    return;
  }

  if (!meta) throw new Error(`config-reference: ${where}: no documentation`);
  let defaultText;
  if (meta.default !== undefined) defaultText = meta.default;
  else if (own !== undefined) defaultText = `\`${JSON.stringify(own)}\``;
  else if (optional) defaultText = 'none';
  else defaultText = requiredText(state.within, false);
  addRow(ctx, state.table, {
    key: where,
    type: typeOf(schema, ctx.used, where),
    default: defaultText,
    readBy: readersOf(meta, where, ctx.commands),
    text: meta.text,
  });
}

/** The default cell of a key with no default. */
function requiredText(within, optional) {
  if (optional) return 'none';
  return within ? `required in \`${within}\`` : 'required';
}

function addRow(ctx, table, row) {
  if (!ctx.tables.has(table)) ctx.tables.set(table, []);
  ctx.tables.get(table).push(row);
}

/** Renders one table. */
function renderTable(rows) {
  const lines = ['| Key | Type | Default | Read by | What it holds |', '|---|---|---|---|---|'];
  for (const row of rows) {
    lines.push(`| \`${row.key}\` | \`${cell(row.type)}\` | ${cell(row.default)} | ${cell(row.readBy)} | ${cell(row.text)} |`);
  }
  return lines.join('\n');
}

/**
 * The configuration reference, as Markdown: one table of the keys every
 * configuration may hold, one table per adapter kind, and the definition of
 * every named type the tables print.
 *
 * @param {Object} [args]
 * @param {Object} [args.schema]      the schema (default: `ConfigSchema`).
 * @param {readonly string[]} [args.commands]  the command names a reader must be one of (default: the command line's).
 * @returns {string}
 */
export function renderConfigReference({ schema = ConfigSchema, commands = COMMANDS } = {}) {
  const ctx = { tables: new Map(), used: new Map(), commands };
  const main = 'main';
  ctx.tables.set(main, []);
  const { node } = unwrap(schema);
  if (kindOf(node) !== 'ZodObject') throw new Error('config-reference: the schema is not an object');
  for (const [key, child] of Object.entries(node.shape)) {
    walk(child, [key], { within: null, parentDefault: undefined, table: main }, ctx);
  }
  const parts = [
    'Generated from the schema in `src/config.mjs` by `npm run reference`: change a key there, then regenerate.',
    renderTable(ctx.tables.get(main)),
  ];
  for (const [table, rows] of ctx.tables) {
    if (table === main) continue;
    parts.push(`With \`${table}\`:`, renderTable(rows));
  }
  if (ctx.used.size) {
    parts.push(
      'The named types:',
      [...ctx.used.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, text]) => `- \`${name}\` — ${text}`)
        .join('\n')
    );
  }
  return parts.join('\n\n');
}

/**
 * Replaces the body of the generated section `name` in `text` with `body`,
 * the markers kept on lines of their own with a blank line on each side of the
 * body. Throws when the section's markers are missing, repeated or out of
 * order.
 */
export function spliceReference(text, body, name = REFERENCE_SECTION) {
  const [begin, end] = sectionMarkers(name);
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start === -1 || stop === -1 || stop < start || text.indexOf(begin, start + 1) !== -1 || text.indexOf(end, stop + 1) !== -1) {
    throw new Error(`config-reference: the text holds no single "${begin}" … "${end}" section`);
  }
  return `${text.slice(0, start)}${begin}\n\n${body}\n\n${text.slice(stop)}`;
}

/** The body of the generated section `name` in `text`, as `spliceReference` writes it, or null without one. */
export function readReference(text, name = REFERENCE_SECTION) {
  const [begin, end] = sectionMarkers(name);
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start === -1 || stop === -1 || stop < start) return null;
  return text.slice(start + begin.length, stop).replace(/^\n\n/, '').replace(/\n\n$/, '');
}

export default { REFERENCE_SECTION, sectionMarkers, renderConfigReference, spliceReference, readReference };
