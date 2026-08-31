// Schema-reference generator.
//
// Turns the machine-readable JSON Schemas emitted by the `aggrega get-schema`
// command into human-readable Markdown reference pages under
// language-reference/schema/. The pages are committed so every documentation
// version renders itself with no binary at site-build time.
//
// Usage:
//   node scripts/gen-schema-reference.mjs
//   AGGREGA_BIN=/path/to/aggrega node scripts/gen-schema-reference.mjs
//   AGGREGA_SCHEMA_OUT=/path/to/out node scripts/gen-schema-reference.mjs
//
// The generator is deterministic: given the same binary it produces
// byte-identical output. Schema kinds are processed in sorted order, object
// keys are emitted in the order the schema declares them, and the output
// directory is rebuilt from scratch on every run so no stale page survives.
//
// The pages are generated — never hand-edit them. To change a page, change the
// schema the binary emits and regenerate.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = process.env.AGGREGA_BIN || "aggrega";

// Repository root is the parent of this script's directory.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIR);

// Output directory for the generated pages. Defaults to the committed
// language-reference/schema tree; set AGGREGA_SCHEMA_OUT to redirect the whole
// generation elsewhere. The directory is rebuilt from scratch on every run, so
// an override into an empty directory yields a complete, self-contained set of
// pages built solely from the binary's output.
const SCHEMA_DIR = process.env.AGGREGA_SCHEMA_OUT || join(REPO_ROOT, "language-reference", "schema");

// How deep nested inline objects are expanded before the reference stops
// recursing. Deep enough to be useful, shallow enough to stay readable.
const MAX_DEPTH = 3;

// The catalog and authoring entities that also have a hand-authored prose page
// under language-reference/entities/. Each generated schema page for these
// kinds links to its prose companion, and the sidebar files them under
// Entities.
//
// The set is DERIVED from that directory rather than declared, so it cannot
// fall behind it. A declared copy of a directory listing is a second copy of
// the same information, and the copy is what goes stale: a kind whose prose
// page was authored but whose name was never added here would be filed under
// the catch-all group and would lose its companion link, with nothing failing
// to say so. Deriving it also means the link emitted below can never point at
// a page that does not exist.
const ENTITIES_DIR = join(REPO_ROOT, "language-reference", "entities");

function proseEntityKinds() {
  const names = readdirSync(ENTITIES_DIR)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -".md".length))
    .sort();
  if (names.length === 0) {
    // An empty read must not pass as "no entity kinds": it would file every
    // kind under the catch-all group and drop every prose link, and the run
    // would still report success.
    console.error(`No prose entity pages found under ${ENTITIES_DIR}.`);
    process.exit(1);
  }
  return new Set(names);
}

const ENTITY_KINDS = proseEntityKinds();

// Sidebar grouping: entity schemas, plugin ABI and payload schemas (the
// wasm-* wire shapes), and everything else (workspace and internal schemas).
function groupFor(kind) {
  if (ENTITY_KINDS.has(kind)) return "entities";
  if (kind.startsWith("wasm-")) return "plugins";
  return "other";
}

const GROUP_TITLES = {
  entities: "Entities",
  plugins: "Plugin ABI & payload schemas",
  other: "Other & workspace schemas",
};

function run(args) {
  return execFileSync(BIN, args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}

function listKinds() {
  return run(["get-schema", "--list"])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

function getSchema(kind) {
  return JSON.parse(run(["get-schema", kind]));
}

// Collapses whitespace and escapes the pipe character so a value is safe to
// place inside a Markdown table cell.
function cell(text) {
  return String(text)
    .replace(/\r?\n+/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

// Renders a free-standing description block: paragraph breaks are preserved,
// single line breaks fold into spaces.
function paragraph(text) {
  return String(text)
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block.length > 0)
    .join("\n\n");
}

function refName(ref) {
  return ref.split("/").pop();
}

// Splits a reference into the document it addresses and its JSON Pointer
// fragment. An empty document part means the reference stays inside the
// schema that carries it.
function splitRef(ref) {
  const hash = ref.indexOf("#");
  if (hash < 0) return { doc: ref, pointer: "" };
  return { doc: ref.slice(0, hash), pointer: ref.slice(hash + 1) };
}

// Whether a reference supplies a usable type NAME, which is what decides
// whether the reference can be rendered as-is or has to be followed.
//
// The last path segment of a reference is only a type name when the reference
// addresses a named thing: a definition, which this reference documents once
// in its schema's own Definitions section, or a whole schema, which has its own
// generated page. A fragment ending in a property, by contrast, addresses a
// LOCATION — its last segment is the name of a field, not of a type — so
// rendering it in the Type column presents the reader with an identifier that
// matches nothing they can write. Those references are followed instead, and
// the value they point at is described in their place.
function refNamesAType(ref) {
  const { pointer } = splitRef(ref);
  if (pointer === "") return true;
  const segments = pointer.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 2) return true;
  const parent = segments[segments.length - 2];
  return parent === "$defs" || parent === "definitions";
}

// Resolves a reference's document part to the absolute schema id it addresses.
// Relative references resolve against the referring schema's own id, which is
// how a reference such as `other-v1alpha1.schema.json#/properties/x` finds its
// target regardless of which schema carries it.
function absoluteDocumentId(ref, baseId) {
  const { doc } = splitRef(ref);
  if (doc === "") return baseId;
  if (!baseId) return null;
  return new URL(doc, baseId).href;
}

// Walks a JSON Pointer into a document, per RFC 6901 escaping. Returns
// undefined when any step is missing, which the caller reports as a broken
// reference rather than rendering something wrong.
function resolvePointer(doc, pointer) {
  if (pointer === "") return doc;
  let node = doc;
  for (const raw of pointer.split("/").slice(1)) {
    if (node === null || typeof node !== "object") return undefined;
    const token = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    node = Array.isArray(node) ? node[Number(token)] : node[token];
    if (node === undefined) return undefined;
  }
  return node;
}

// Replaces every reference that does not name a type with the value it points
// at, so the renderer downstream sees a plain subschema and needs to know
// nothing about references. Doing this once, here, is what keeps the type
// label and the allowed-values line in agreement: both are derived from the
// same resolved node rather than from two separate lookups that could diverge.
//
// Keys written at the referring site win over the target's, so a field keeps
// the description written for it while gaining the target's type and value
// set. The returned structure is new; the input is never mutated.
function inlineUnnamedRefs(node, baseId, registry, seen = new Set()) {
  if (Array.isArray(node)) {
    return node.map((item) => inlineUnnamedRefs(item, baseId, registry, seen));
  }
  if (!node || typeof node !== "object") return node;

  if (typeof node.$ref === "string" && !refNamesAType(node.$ref)) {
    const documentId = absoluteDocumentId(node.$ref, baseId);
    if (!documentId) {
      console.error(`Cannot resolve ${node.$ref}: the referring schema declares no $id.`);
      process.exit(1);
    }
    const absolute = `${documentId}#${splitRef(node.$ref).pointer}`;
    if (seen.has(absolute)) {
      console.error(`Reference cycle while resolving ${absolute}.`);
      process.exit(1);
    }
    const document = registry.get(documentId);
    if (!document) {
      console.error(`Cannot resolve ${node.$ref}: no schema is published with id ${documentId}.`);
      process.exit(1);
    }
    const target = resolvePointer(document, splitRef(node.$ref).pointer);
    if (target === undefined || target === null || typeof target !== "object") {
      console.error(`Cannot resolve ${node.$ref}: it points at nothing in ${documentId}.`);
      process.exit(1);
    }
    const { $ref: _followed, ...written } = node;
    const resolved = inlineUnnamedRefs(target, documentId, registry, new Set(seen).add(absolute));
    return { ...resolved, ...written };
  }

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = inlineUnnamedRefs(value, baseId, registry, seen);
  }
  return out;
}

// The characters a key may be built from, named so a reader can say them out
// loud. A key constraint is published as a regular expression, and two maps
// whose expressions differ by a single character accept different key shapes —
// one takes a single name, the other a qualified dotted one. Naming the
// characters turns that one-character difference into a word.
const LETTERS = { article: "a", noun: "letter", plural: "letters" };
const CHARACTER_NAMES = {
  "a-z": { article: "a", noun: "lower-case letter", plural: "lower-case letters" },
  "A-Z": { article: "an", noun: "upper-case letter", plural: "upper-case letters" },
  "0-9": { article: "a", noun: "digit", plural: "digits" },
  _: { article: "an", noun: "underscore", plural: "underscores" },
  ".": { article: "a", noun: "dot", plural: "dots" },
  "-": { article: "a", noun: "hyphen", plural: "hyphens" },
  "/": { article: "a", noun: "slash", plural: "slashes" },
  ":": { article: "a", noun: "colon", plural: "colons" },
};

// Splits a character-class body into its atoms: a range such as `a-z`, or a
// single literal character. A trailing hyphen is a literal, which is why the
// range test requires a character to follow it.
function classAtoms(body) {
  const atoms = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] === "\\") {
      atoms.push(body[i + 1]);
      i += 2;
      continue;
    }
    if (body[i + 1] === "-" && i + 2 < body.length) {
      atoms.push(`${body[i]}-${body[i + 2]}`);
      i += 3;
      continue;
    }
    atoms.push(body[i]);
    i += 1;
  }
  return atoms;
}

// Names one character class, in the order the class declares its atoms. Returns
// null as soon as an atom has no name, so a key alphabet is never described
// partially — the caller then states the pattern verbatim instead.
function nameCharacterClass(body) {
  const atoms = classAtoms(body);
  const bothCases = atoms.includes("a-z") && atoms.includes("A-Z");
  const named = [];
  const seen = new Set();
  for (const atom of atoms) {
    const name = bothCases && (atom === "a-z" || atom === "A-Z") ? LETTERS : CHARACTER_NAMES[atom];
    if (!name) return null;
    if (seen.has(name.noun)) continue;
    seen.add(name.noun);
    named.push(name);
  }
  return named.length > 0 ? named : null;
}

// Joins named characters into a list. `plural` reads after a quantity ("one or
// more letters, digits or hyphens"), `article` opens a clause ("a letter or
// digit"), and `bare` follows a word that already carries the article.
function joinNames(names, form) {
  const words = names.map((name, index) => {
    if (form === "plural") return name.plural;
    if (form === "article" && index === 0) return `${name.article} ${name.noun}`;
    return name.noun;
  });
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

// Splits an anchored pattern into a sequence of character-class terms, each with
// its quantifier. Returns null for a pattern built from anything else — a group,
// an alternation, a repetition count, a negated class — so nothing paraphrases a
// shape it did not read.
function patternTerms(pattern) {
  if (!pattern.startsWith("^") || !pattern.endsWith("$")) return null;
  const body = pattern.slice(1, -1);
  const terms = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] !== "[" || body[i + 1] === "^") return null;
    let j = i + 1;
    let cls = "";
    while (j < body.length && body[j] !== "]") {
      if (body[j] === "\\") {
        cls += body[j] + body[j + 1];
        j += 2;
        continue;
      }
      cls += body[j];
      j += 1;
    }
    if (j >= body.length) return null;
    i = j + 1;
    let quantifier = "";
    if ("+*?".includes(body[i])) {
      quantifier = body[i];
      i += 1;
    }
    terms.push({ cls, quantifier });
  }
  return terms.length > 0 ? terms : null;
}

// Prose for a key pattern, in the terms an author writes keys in, plus whether
// the pattern admits a dot. Returns null for a pattern this cannot phrase.
function describeKeyPattern(pattern) {
  const terms = patternTerms(pattern);
  if (!terms) return null;
  const named = terms.map((term) => ({ ...term, names: nameCharacterClass(term.cls) }));
  if (named.some((term) => term.names === null)) return null;

  const clauses = named.map((term, index) => {
    const lead = index === 0 ? "" : "then ";
    if (term.quantifier === "+") return `${lead}one or more ${joinNames(term.names, "plural")}`;
    if (term.quantifier === "*") return `${lead}any number of ${joinNames(term.names, "plural")}`;
    if (term.quantifier === "?") return `${lead}an optional ${joinNames(term.names, "bare")}`;
    return index === 0 ? `begins with ${joinNames(term.names, "article")}` : `then ${joinNames(term.names, "article")}`;
  });

  const admitsDot = terms.some((term) => classAtoms(term.cls).includes("."));
  return { clause: clauses.join(", "), admitsDot };
}

// A length bound on a key, stated as a sentence.
function describeLengthBound(minLength, maxLength) {
  if (minLength !== undefined && maxLength !== undefined) {
    return `Between ${minLength} and ${maxLength} characters long.`;
  }
  if (minLength !== undefined) return `At least ${minLength} characters long.`;
  return `At most ${maxLength} characters long.`;
}

// What a key of this object may look like, as one sentence sequence, or an empty
// string when the object constrains its keys in no way.
//
// Two JSON Schema mechanisms carry a key constraint and both are read here:
// `propertyNames` constrains every key of the object, and `patternProperties`
// admits keys matching a regular expression. Each reaches the reader as prose
// about the characters a key is built from, with the expression beside it —
// never as a bare expression on its own, because an author cannot be asked to
// tell two maps apart by spotting a one-character difference between two of
// them. Where the schema writes its own prose for the constraint, that prose is
// what is published: it was written for this key, and a generated paraphrase
// beside it would be a second copy of the same fact.
//
// One sentence sequence serves both the property table and the section body, so
// a map documented in both places is described the same way in each.
function keyConstraint(schema) {
  const parts = [];

  const names = schema.propertyNames;
  if (names && typeof names === "object") {
    if (names.description) {
      parts.push(cell(names.description));
    } else if (names.pattern) {
      const prose = describeKeyPattern(names.pattern);
      if (prose) {
        parts.push(`${prose.clause}.${prose.admitsDot ? "" : " A dot is not permitted."}`);
      }
    }
    if (names.enum) {
      parts.push(`One of ${names.enum.map((v) => `\`${JSON.stringify(v)}\``).join(", ")}.`);
    }
    if (names.minLength !== undefined || names.maxLength !== undefined) {
      parts.push(describeLengthBound(names.minLength, names.maxLength));
    }
    // Prose that already quotes the expression states it once; restating it
    // below would publish the same expression twice in one sentence sequence.
    if (names.pattern && !parts.some((part) => part.includes(names.pattern))) {
      parts.push(`Pattern: \`${names.pattern}\`.`);
    }
  }

  const patterns =
    schema.patternProperties && typeof schema.patternProperties === "object"
      ? Object.keys(schema.patternProperties)
      : [];
  for (const pattern of patterns) {
    const prose = describeKeyPattern(pattern);
    let explanation = "";
    if (prose) {
      explanation = `${prose.clause}.${prose.admitsDot ? "" : " A dot is not permitted."}`;
    } else {
      // A pattern too involved to phrase is explained by what the schema says a
      // key matching it names, so the expression never lands unexplained.
      const entry = schema.patternProperties[pattern];
      if (entry && typeof entry === "object" && entry.description) explanation = cell(entry.description);
    }
    if (explanation) parts.push(explanation);
    if (!explanation.includes(pattern)) parts.push(`Pattern: \`${pattern}\`.`);
  }

  return parts.filter((part) => part.length > 0).join(" ");
}

// The value schema of a pattern-keyed map, when exactly one pattern is declared.
// With more than one there is no single value type to name, so this returns null
// and the caller says nothing rather than picking one of them.
function patternValueSchema(schema) {
  if (!schema || typeof schema !== "object") return null;
  const patterns = schema.patternProperties;
  if (!patterns || typeof patterns !== "object") return null;
  const keys = Object.keys(patterns);
  if (keys.length !== 1) return null;
  const value = patterns[keys[0]];
  return value && typeof value === "object" ? value : null;
}

// A short human type label for one subschema, suitable for a table cell.
function describeType(schema) {
  if (!schema || typeof schema !== "object") return "any";
  if (schema.$ref) return refName(schema.$ref);
  if (schema.const !== undefined) return `const ${JSON.stringify(schema.const)}`;
  if (schema.enum) return schema.type ? `${labelOfType(schema.type)} (enum)` : "enum";
  if (schema.oneOf || schema.anyOf) {
    return (schema.oneOf || schema.anyOf).map(describeType).join(" or ");
  }
  if (schema.type === "array") {
    return schema.items ? `${describeType(schema.items)}[]` : "array";
  }
  if (schema.type === "object") {
    const noProps = !schema.properties || Object.keys(schema.properties).length === 0;
    if (noProps) {
      // A pattern-keyed map is a map, and calling it an object hides both that
      // its keys are constrained and what its values are.
      const patternValue = patternValueSchema(schema);
      if (patternValue) return `map of ${describeType(patternValue)}`;
      if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        return `map of ${describeType(schema.additionalProperties)}`;
      }
    }
    return "object";
  }
  if (Array.isArray(schema.type)) return schema.type.join(" or ");
  if (schema.type) return schema.type;
  return "any";
}

function labelOfType(type) {
  return Array.isArray(type) ? type.join(" or ") : String(type);
}

// The description column for one property: its prose plus any key-constraint,
// enum, constant, or default facets that help a reader.
//
// The key constraint belongs here as well as in a section body: a map whose
// values are a named type is documented as a single table row and nothing
// recurses into it, so a row is the only place its key shape can reach a reader.
function describeProp(schema) {
  const parts = [];
  if (schema.description) parts.push(String(schema.description));
  const keys = keyConstraint(schema);
  if (keys) parts.push(`Keys: ${keys}`);
  if (schema.enum) {
    parts.push("Allowed values: " + schema.enum.map((v) => `\`${JSON.stringify(v)}\``).join(", "));
  } else if (schema.const !== undefined) {
    parts.push(`Constant: \`${JSON.stringify(schema.const)}\``);
  }
  if (schema.default !== undefined) {
    parts.push(`Default: \`${JSON.stringify(schema.default)}\``);
  }
  return parts.join(" ");
}

// Renders one object schema as a properties table, then recurses into any
// inline nested objects (not $ref targets — those are documented once in the
// Definitions section). Returns a Markdown string.
function renderObjectSection(schema, path, depth, headingLevel, showDescription) {
  const out = [];
  if (showDescription && schema.description) {
    out.push(paragraph(schema.description), "");
  }
  const props = schema.properties || {};
  const names = Object.keys(props);
  const requiredSet = new Set(schema.required || []);
  const keys = keyConstraint(schema);
  const patternValue = patternValueSchema(schema);

  if (names.length === 0) {
    if (keys) {
      // A map that constrains its keys is not free-form, and it does not
      // "permit none" either: it permits exactly the keys described here.
      out.push(`**Keys:** ${keys}`, "");
      const values = patternValue || (typeof schema.additionalProperties === "object" ? schema.additionalProperties : null);
      if (values) out.push(`Values are \`${cell(describeType(values))}\`.`, "");
      if (schema.additionalProperties === false) out.push("_Any other key is not permitted._", "");
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      out.push(`Free-form object; values are \`${cell(describeType(schema.additionalProperties))}\`.`, "");
    } else if (schema.additionalProperties === false) {
      out.push("_This object declares no fixed properties and permits none._", "");
    }
    return out.join("\n");
  }

  out.push("| Property | Type | Required | Description |");
  out.push("| --- | --- | --- | --- |");
  const children = [];
  for (const name of names) {
    const prop = props[name];
    const type = cell(describeType(prop));
    const required = requiredSet.has(name) ? "yes" : "no";
    const description = cell(describeProp(prop));
    out.push(`| \`${name}\` | ${type} | ${required} | ${description} |`);
    if (!prop.$ref && depth < MAX_DEPTH) {
      if (prop.type === "object" && prop.properties) {
        children.push([`${path}.${name}`, prop]);
      } else if (
        prop.type === "array" &&
        prop.items &&
        !prop.items.$ref &&
        prop.items.type === "object" &&
        prop.items.properties
      ) {
        children.push([`${path}.${name}[]`, prop.items]);
      }
    }
  }
  out.push("");

  if (keys) {
    // A pattern admits keys beyond the ones listed above, so it is labelled as
    // additional; propertyNames constrains every key, listed ones included.
    out.push(`**${schema.patternProperties ? "Additional keys" : "Keys"}:** ${keys}`, "");
  }

  if (schema.additionalProperties === false) {
    out.push(
      schema.patternProperties
        ? "_Any other property is not permitted._"
        : "_Additional properties are not permitted._",
      ""
    );
  } else if (schema.additionalProperties === true) {
    out.push("_Additional properties are permitted._", "");
  }

  const childHashes = "#".repeat(Math.min(headingLevel, 6));
  for (const [childPath, childSchema] of children) {
    out.push(`${childHashes} \`${childPath}\``, "");
    out.push(renderObjectSection(childSchema, childPath, depth + 1, headingLevel + 1, true));
  }
  return out.join("\n");
}

// Builds the full Markdown page for one schema kind.
function renderPage(kind, schema) {
  const title = schema.title ? `${schema.title} schema` : `${kind} schema`;
  const out = [];
  out.push(`# ${title}`, "");
  out.push("_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._", "");
  if (schema.$id) out.push(`Schema id: \`${schema.$id}\``, "");
  if (schema.description) out.push(paragraph(schema.description), "");

  if (ENTITY_KINDS.has(kind)) {
    // Link to the prose page's built route (a base-relative directory URL), not
    // its source path, so the link resolves in the static build and stays
    // portable across the version-prefixed builds that share this source tree.
    out.push(
      `See the [${kind} authoring reference](../../entities/${kind}.md) for prose guidance on authoring ${kind} entities; this page documents the structural schema that reference describes.`,
      ""
    );
  }

  if (schema.type && !Array.isArray(schema.type)) {
    out.push(`**Top-level type:** \`${schema.type}\``, "");
  }

  if (schema.properties && Object.keys(schema.properties).length > 0) {
    out.push("## Properties", "");
    out.push(renderObjectSection(schema, kind, 0, 4, false));
  }

  const variants = schema.oneOf || schema.anyOf;
  if (variants && Array.isArray(variants)) {
    out.push(schema.oneOf ? "## One of the following shapes" : "## Any of the following shapes", "");
    for (const variant of variants) {
      out.push(`- \`${cell(describeType(variant))}\``);
    }
    out.push("");
  }

  if (schema.$defs && Object.keys(schema.$defs).length > 0) {
    out.push("## Definitions", "");
    for (const defName of Object.keys(schema.$defs)) {
      const def = schema.$defs[defName];
      out.push(`### \`${defName}\``, "");
      if (def.type === "object" || def.properties) {
        out.push(renderObjectSection(def, defName, 0, 4, true));
      } else {
        if (def.description) out.push(paragraph(def.description), "");
        out.push(`**Type:** \`${cell(describeType(def))}\``, "");
      }
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function renderIndex(byGroup) {
  const out = [];
  out.push("# Schema reference", "");
  out.push(
    "_Generated reference. Do not edit by hand — regenerate from the published JSON Schemas._",
    ""
  );
  out.push(
    "This section documents the JSON Schemas that define every Aggrega entity, plugin wire shape, and workspace file. Each page is generated from the schema the compiler emits, so it stays in lock-step with the shipped contract.",
    ""
  );
  for (const group of ["entities", "plugins", "other"]) {
    const kinds = byGroup[group];
    if (!kinds || kinds.length === 0) continue;
    out.push(`## ${GROUP_TITLES[group]}`, "");
    for (const kind of kinds) {
      out.push(`- [${kind}](${group}/${kind}.md)`);
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function main() {
  const kinds = listKinds();
  if (kinds.length === 0) {
    console.error("No schema kinds returned by `get-schema --list`.");
    process.exit(1);
  }

  // Read every schema before rendering any page. A schema may reference one
  // that sorts after it, so resolving references while rendering page by page
  // would depend on the order the kinds happen to come back in.
  const sources = new Map();
  const registry = new Map();
  for (const kind of kinds) {
    const schema = getSchema(kind);
    sources.set(kind, schema);
    if (schema.$id) registry.set(schema.$id, schema);
  }

  rmSync(SCHEMA_DIR, { recursive: true, force: true });
  mkdirSync(SCHEMA_DIR, { recursive: true });

  const byGroup = { entities: [], plugins: [], other: [] };
  for (const kind of kinds) {
    const source = sources.get(kind);
    const schema = inlineUnnamedRefs(source, source.$id, registry);
    const group = groupFor(kind);
    const page = renderPage(kind, schema);
    const groupDir = join(SCHEMA_DIR, group);
    mkdirSync(groupDir, { recursive: true });
    writeFileSync(join(groupDir, `${kind}.md`), page, "utf-8");
    byGroup[group].push(kind);
  }

  writeFileSync(join(SCHEMA_DIR, "README.md"), renderIndex(byGroup), "utf-8");

  const total = kinds.length;
  console.log(`Generated ${total} schema pages + 1 index under ${SCHEMA_DIR}`);
  for (const group of ["entities", "plugins", "other"]) {
    console.log(`  ${group}: ${byGroup[group].length}`);
  }
}

main();
