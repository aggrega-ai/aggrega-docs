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
//
// The generator is deterministic: given the same binary it produces
// byte-identical output. Schema kinds are processed in sorted order, object
// keys are emitted in the order the schema declares them, and the output
// directory is rebuilt from scratch on every run so no stale page survives.
//
// The pages are generated — never hand-edit them. To change a page, change the
// schema the binary emits and regenerate.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = process.env.AGGREGA_BIN || "aggrega";

// Repository root is the parent of this script's directory.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIR);
const SCHEMA_DIR = join(REPO_ROOT, "language-reference", "schema");

// How deep nested inline objects are expanded before the reference stops
// recursing. Deep enough to be useful, shallow enough to stay readable.
const MAX_DEPTH = 3;

// The eleven catalog and authoring entities that also have hand-authored prose
// pages under language-reference/entities/. Each generated schema page for
// these kinds links to its prose companion.
const ENTITY_KINDS = new Set([
  "aggregate",
  "component",
  "feature",
  "featurerecipe",
  "manifest",
  "mappinglibrary",
  "plugin",
  "recipe",
  "release",
  "schemalibrary",
  "workload",
]);

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
    if (noProps && schema.additionalProperties && typeof schema.additionalProperties === "object") {
      return `map of ${describeType(schema.additionalProperties)}`;
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

// The description column for one property: its prose plus any enum, constant,
// or default facets that help a reader.
function describeProp(schema) {
  const parts = [];
  if (schema.description) parts.push(String(schema.description));
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

  if (names.length === 0) {
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
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

  if (schema.additionalProperties === false) {
    out.push("_Additional properties are not permitted._", "");
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
      `See the [${kind} authoring reference](../../../entities/${kind}/) for prose guidance on authoring ${kind} entities; this page documents the structural schema that reference describes.`,
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

  rmSync(SCHEMA_DIR, { recursive: true, force: true });
  mkdirSync(SCHEMA_DIR, { recursive: true });

  const byGroup = { entities: [], plugins: [], other: [] };
  for (const kind of kinds) {
    const schema = getSchema(kind);
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
