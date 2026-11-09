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
// Which binary answers decides what the pages say, so the generator establishes
// that rather than inheriting it: with no AGGREGA_BIN it builds a compiler from
// the sibling aggrega-cli module, and with AGGREGA_BIN set it uses the binary
// named and builds nothing. Every run reports which binary it used and where
// that binary came from. The full rules, and what each failure path does, are
// beside resolveBinary() below.
//
// The generator is deterministic: the same binary produces byte-identical
// output. Schema kinds are processed in sorted order, object keys are emitted
// in the order the schema declares them, and the output directory is rebuilt
// from scratch on every run so no stale page survives. Determinism is relative
// to a binary, so the generator decides which binary answers rather than
// accepting whichever is on PATH: left to the caller, the same run could
// describe two different sets of schemas and say nothing either way.
//
// The pages are generated — never hand-edit them. To change a page, change the
// schema the binary emits and regenerate.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Repository root is the parent of this script's directory.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIR);

// The sibling compiler module, named the same way the example-build wrapper in
// this directory names it, so the two scripts cannot come to disagree about
// where the module is.
const CLI_DIR = join(dirname(REPO_ROOT), "aggrega-cli");

// Output directory for the generated pages. Defaults to the committed
// language-reference/schema tree; set AGGREGA_SCHEMA_OUT to redirect the whole
// generation elsewhere. The directory is rebuilt from scratch on every run, so
// an override into an empty directory yields a complete, self-contained set of
// pages built solely from the binary's output.
const SCHEMA_DIR = process.env.AGGREGA_SCHEMA_OUT || join(REPO_ROOT, "language-reference", "schema");

// How deep nested inline objects are expanded before the reference stops
// recursing. Deep enough to be useful, shallow enough to stay readable: deep
// enough that every object an author fills in has its fields listed somewhere —
// the Plugin entity's `spec.provider.contract.inputKinds` and its importer's
// `detect[].match[]` predicates sit four levels down — and bounded so a
// recursive or very deep schema cannot run away.
const MAX_DEPTH = 4;

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
    refuse(`No prose entity pages found under ${ENTITIES_DIR}.`);
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

// Every line this script writes to stderr carries its name, because the
// schema-documentation drift gate interleaves this script's output with its own
// and an unattributed line there belongs to nobody.
function note(message) {
  console.error(`gen-schema-reference: ${message}`);
}

function refuse(message) {
  note(message);
  process.exit(1);
}

// Binary resolution.
//
// The pages describe the schemas a compiler emits, so a binary that predates the
// schemas in this working tree regenerates the committed pages unchanged and
// exits zero — a result indistinguishable from "the pages were already current".
// That is why there is no "whatever `aggrega` is on PATH" path here any more.
// The generator either uses a binary the caller named, or builds one:
//
//   1. AGGREGA_BIN, if set — used exactly as given, and NOTHING is built.
//      Naming a binary is a deliberate act, and an override this second-guessed
//      would not be one. Two real flows depend on it: a release process that
//      fetches a published binary rather than building one, and the
//      schema-documentation drift gate, which builds its own binary and points
//      this generator at it.
//   2. Otherwise — a fresh `go build ./cmd/aggrega` in the sibling aggrega-cli
//      module. A build that fails FAILS the generation and writes nothing: a
//      generator that cannot build the compiler cannot know what the schemas
//      say, so refusing is the honest outcome and the compiler's own error is
//      the one worth reading.
//
// Every run reports which binary answered and where it came from. On stderr,
// because a caller that discards stdout — the drift gate does exactly that —
// must still see which artifact produced the pages; and nowhere near the pages
// themselves, because a page whose bytes moved with the binary's version would
// put that same drift gate into refusal on every version bump.
//
// The three fields, and the freshness wording, are the ones the example-build
// wrapper in this directory already prints. Two scripts reporting the same fact
// in different words read as two different facts.
function announce(binary, origin, freshness) {
  note(`binary    = ${binary}`);
  note(`origin    = ${origin}`);
  note(`freshness = ${freshness}`);
}

// How an explicitly named binary is described in the provenance above.
//
// A value carrying a path separator is a path, and is reported symlink-resolved:
// such a binary is commonly a symlink into the module that built it, so naming
// the link rather than its target reports two different-looking origins for what
// is one artifact.
//
// A value with no separator is a COMMAND NAME, which the child process resolves
// against PATH. It is reported as one rather than resolved here, because
// resolving it here would be a second implementation of PATH lookup that can
// disagree with the one that actually runs — and it would also resolve against
// the current directory, which is not where the child would look. A provenance
// line that is confidently wrong is worse than one that is honestly incomplete.
function describeNamed(named) {
  if (!named.includes("/")) return `${named} — a command name; PATH decides which file runs`;
  try {
    return realpathSync(named);
  } catch {
    return named;
  }
}

// The directory holding a binary this run built. Removed when the process ends,
// however it ends — including through the refusals above, which exit(1).
let BUILD_DIR = null;
process.on("exit", () => {
  if (BUILD_DIR) rmSync(BUILD_DIR, { recursive: true, force: true });
});

function buildBinary() {
  if (!existsSync(join(CLI_DIR, "go.mod"))) {
    refuse(
      `no Go module at ${CLI_DIR}, so there is no compiler to build and nothing was written. ` +
        "A standalone aggrega-docs checkout has no sibling module: set AGGREGA_BIN to an aggrega binary and re-run."
    );
  }
  BUILD_DIR = mkdtempSync(join(tmpdir(), "gen-schema-reference-"));
  const binary = join(BUILD_DIR, "aggrega");
  note(`building the compiler from ./cmd/aggrega in ${CLI_DIR} ...`);
  // GOWORK is cleared rather than inherited, which is what the
  // schema-documentation drift gate's own build does. The two builds have to
  // produce the same binary, so they clear the same thing. It is
  // belt-and-braces today — aggrega-cli/go.mod carries its own filesystem
  // replace for each sibling module, and a go.mod replace travels with the
  // module, so GOWORK is not what redirects them. It is load-bearing in the
  // release-time configuration, where those replaces are removed and the
  // require's pinned version is what resolves: an inherited GOWORK=off would
  // then send this compile to the network.
  const env = { ...process.env };
  delete env.GOWORK;
  try {
    execFileSync("go", ["build", "-o", binary, "./cmd/aggrega"], {
      cwd: CLI_DIR,
      env,
      stdio: ["ignore", "inherit", "inherit"],
    });
  } catch (err) {
    if (err && err.code === "ENOENT") {
      refuse(
        `no go toolchain on PATH, so the compiler in ${CLI_DIR} cannot be built and nothing was written. ` +
          "Install Go, or set AGGREGA_BIN to a prebuilt aggrega binary."
      );
    }
    refuse(
      `go build ./cmd/aggrega failed in ${CLI_DIR}; the compiler's own error is above, surfaced unchanged. ` +
        "Nothing was written — a generator that cannot build the compiler cannot know what the schemas say. " +
        "Fix the build, or set AGGREGA_BIN to a binary you trust."
    );
  }
  return binary;
}

function resolveBinary() {
  const named = process.env.AGGREGA_BIN;
  if (named) {
    announce(
      named,
      `AGGREGA_BIN override -> ${describeNamed(named)}`,
      "NOT CHECKED — an explicitly named binary is used as named"
    );
    return named;
  }
  const binary = buildBinary();
  announce(
    binary,
    `built from source in ${CLI_DIR}`,
    "current by construction — built from the module in this working tree"
  );
  return binary;
}

// Assigned by main() before the first run(), so the cheap checks above this line
// refuse in milliseconds rather than after a build.
let BIN = null;

function run(args) {
  try {
    return execFileSync(BIN, args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    if (err && err.code === "ENOENT") {
      refuse(
        process.env.AGGREGA_BIN
          ? `AGGREGA_BIN='${BIN}' names nothing runnable — not an executable path, and not a command on PATH. ` +
              `Unset it to build the compiler from ${CLI_DIR} instead.`
          : `the binary this run built at ${BIN} could not be invoked; nothing was written.`
      );
    }
    // The child's own diagnostics, which execFileSync captures rather than
    // printing. Without this they are swallowed and the reader is left with a
    // stack trace from this script about a failure inside another program.
    const detail =
      err && typeof err.stderr === "string" && err.stderr.trim().length > 0
        ? `\n${err.stderr.trimEnd()}`
        : "";
    const status = err && err.status !== undefined && err.status !== null ? err.status : "unknown";
    refuse(`\`${BIN} ${args.join(" ")}\` exited ${status}; nothing was written.${detail}`);
  }
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
// single line breaks fold into spaces, and indented lines become a list.
//
// A line break is read as a wrap, so folding it reads the prose as written. An
// indented line is not a wrap: a schema writes one under a lead sentence to set
// out a sequence — the stages of a pipeline, say — and folding those lines into
// the lead runs every entry into one sentence a reader has to take apart again.
// Each indented line therefore opens one list entry, and a line that is not
// indented continues the entry above it, so a long entry wrapped at the margin
// stays one entry.
function paragraph(text) {
  return String(text)
    .split(/\n\s*\n/)
    .map(renderBlock)
    .filter((block) => block.length > 0)
    .join("\n\n");
}

function renderBlock(block) {
  const lines = block.split(/\r?\n/);
  const first = lines.findIndex((line, index) => index > 0 && /^[ \t]+\S/.test(line));
  const fold = (text) => text.replace(/\s+/g, " ").trim();
  if (first < 0) return fold(block);
  const lead = fold(lines.slice(0, first).join(" "));
  const entries = [];
  for (const line of lines.slice(first)) {
    if (/^[ \t]+\S/.test(line) || entries.length === 0) entries.push(fold(line));
    else entries[entries.length - 1] = fold(`${entries[entries.length - 1]} ${line}`);
  }
  const list = entries.filter((entry) => entry.length > 0).map((entry) => `- ${entry}`);
  return lead.length > 0 ? `${lead}\n\n${list.join("\n")}` : list.join("\n");
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
// how a reference such as `other-v1beta1.schema.json#/properties/x` finds its
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

// The description to publish for a reference that names a type but carries no
// description of its own.
//
// A property written as a bare reference — `{"$ref": "#/$defs/Selector"}` — has
// no `description` key at all, so the description column for that row would be
// blank however well the definition it points at is documented. The target's
// prose is the only prose available, so it is what gets published.
//
// This resolves the class rather than each instance. Writing a description
// beside every bare reference is the per-property alternative, and it has to be
// repeated at each site, kept in agreement with the definition, and remembered
// for the next reference anyone adds. Reading through to the target covers every
// such reference at once, including the ones added later, and a description
// written at the referring site still wins: that description was written for
// that field, where the target's was written for the type.
//
// A target that is itself a bare reference is followed, bounded by `seen` so a
// cycle terminates instead of recursing.
//
// Returns null — never an error — when the reference cannot be resolved. A
// reference that names a type is not resolved anywhere else in this generator,
// so an unresolvable one is already silent here; refusing on one would reject
// schemas this generator accepts today, which is a wider change than supplying
// a description the reader would otherwise not get.
function referencedDescription(ref, baseId, registry, seen = new Set()) {
  const documentId = absoluteDocumentId(ref, baseId);
  if (!documentId) return null;
  const { pointer } = splitRef(ref);
  const absolute = `${documentId}#${pointer}`;
  if (seen.has(absolute)) return null;
  const document = registry.get(documentId);
  if (!document) return null;
  const target = resolvePointer(document, pointer);
  if (!target || typeof target !== "object") return null;
  if (typeof target.description === "string" && target.description.trim().length > 0) {
    return target.description;
  }
  if (typeof target.$ref === "string") {
    return referencedDescription(target.$ref, documentId, registry, new Set(seen).add(absolute));
  }
  return null;
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
      refuse(`Cannot resolve ${node.$ref}: the referring schema declares no $id.`);
    }
    const absolute = `${documentId}#${splitRef(node.$ref).pointer}`;
    if (seen.has(absolute)) {
      refuse(`Reference cycle while resolving ${absolute}.`);
    }
    const document = registry.get(documentId);
    if (!document) {
      refuse(`Cannot resolve ${node.$ref}: no schema is published with id ${documentId}.`);
    }
    const target = resolvePointer(document, splitRef(node.$ref).pointer);
    if (target === undefined || target === null || typeof target !== "object") {
      refuse(`Cannot resolve ${node.$ref}: it points at nothing in ${documentId}.`);
    }
    const { $ref: _followed, ...written } = node;
    const resolved = inlineUnnamedRefs(target, documentId, registry, new Set(seen).add(absolute));
    return { ...resolved, ...written };
  }

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = inlineUnnamedRefs(value, baseId, registry, seen);
  }

  // A reference that names a type is left standing rather than inlined: it is
  // documented once in its schema's Definitions section, and the Type column
  // shows the name a reader can look up. Only its description is read through,
  // and only when it has none of its own, so the row that is the reference's
  // one appearance is never left with an empty description.
  if (typeof out.$ref === "string" && out.description === undefined) {
    const inherited = referencedDescription(out.$ref, baseId, registry);
    if (inherited !== null) out.description = inherited;
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

// Inline code for a value that may itself carry a backtick — a pattern admitting
// one, say. The fence is one backtick longer than the longest run inside the
// value, and padded with a space where the value starts or ends with a backtick,
// which is how Markdown lets a code span hold one; a single-backtick fence would
// close at the first backtick inside the value and break the rest of the cell.
function code(text) {
  const value = String(text);
  const runs = value.match(/`+/g) || [];
  const fence = "`".repeat(runs.reduce((longest, run) => Math.max(longest, run.length), 0) + 1);
  const pad = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}

// A count with its noun, singular for exactly one.
function counted(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

// A length bound on a key or a string value, stated as a sentence.
function describeLengthBound(minLength, maxLength) {
  if (minLength !== undefined && maxLength !== undefined) {
    return `Between ${minLength} and ${counted(maxLength, "character", "characters")} long.`;
  }
  if (minLength !== undefined) return `At least ${counted(minLength, "character", "characters")} long.`;
  return `At most ${counted(maxLength, "character", "characters")} long.`;
}

// A bound on how many entries a list or a map holds, stated as a sentence.
function describeCountBound(min, max) {
  if (min !== undefined && max !== undefined) return `Between ${min} and ${counted(max, "entry", "entries")}.`;
  if (min !== undefined) return `At least ${counted(min, "entry", "entries")}.`;
  return `At most ${counted(max, "entry", "entries")}.`;
}

// What a value itself may be, beyond its type: the pattern a string matches,
// its length, a number's bounds, how many entries a list or map holds, whether
// a list's entries are unique, and the values or pattern each entry of a list
// takes. The schema refuses a value outside any of these, so a property row
// that left them out would present a constrained field as an open one; they
// are published as the schema states them, the expression verbatim, because a
// paraphrase of a pattern this did not read could be wrong.
function valueConstraints(schema) {
  const parts = [];
  if (typeof schema.pattern === "string") parts.push(`Pattern: ${code(schema.pattern)}.`);
  if (schema.minLength !== undefined || schema.maxLength !== undefined) {
    parts.push(describeLengthBound(schema.minLength, schema.maxLength));
  }
  if (schema.minimum !== undefined) parts.push(`Minimum: \`${schema.minimum}\`.`);
  if (schema.exclusiveMinimum !== undefined) parts.push(`Greater than \`${schema.exclusiveMinimum}\`.`);
  if (schema.maximum !== undefined) parts.push(`Maximum: \`${schema.maximum}\`.`);
  if (schema.exclusiveMaximum !== undefined) parts.push(`Less than \`${schema.exclusiveMaximum}\`.`);
  if (schema.minItems !== undefined || schema.maxItems !== undefined) {
    parts.push(describeCountBound(schema.minItems, schema.maxItems));
  }
  if (schema.minProperties !== undefined || schema.maxProperties !== undefined) {
    parts.push(describeCountBound(schema.minProperties, schema.maxProperties));
  }
  if (schema.uniqueItems === true) parts.push("No entry may appear twice.");
  const items = schema.type === "array" && schema.items && typeof schema.items === "object" ? schema.items : null;
  if (items && Array.isArray(items.enum)) {
    parts.push("Allowed values for each entry: " + items.enum.map((v) => `\`${JSON.stringify(v)}\``).join(", ") + ".");
  }
  if (items && typeof items.pattern === "string") parts.push(`Each entry matches the pattern ${code(items.pattern)}.`);
  return parts;
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

// Whether an alternative only constrains a value whose shape is declared beside
// it — `{ "required": ["secret"] }` under an object's `oneOf`, say — rather than
// naming a shape of its own. Alternatives of this kind choose between field
// combinations of one object; they carry no type, so naming them would label
// the value `any` when the schema declares what it is.
function constrainsOnly(alternative) {
  if (!alternative || typeof alternative !== "object") return false;
  const shapeKeys = ["type", "$ref", "const", "enum", "oneOf", "anyOf", "properties", "items", "additionalProperties", "patternProperties"];
  return !shapeKeys.some((key) => key in alternative);
}

// A short human type label for one subschema, suitable for a table cell.
function describeType(schema) {
  if (!schema || typeof schema !== "object") return "any";
  if (schema.$ref) return refName(schema.$ref);
  if (schema.const !== undefined) return `const ${JSON.stringify(schema.const)}`;
  if (schema.enum) return schema.type ? `${labelOfType(schema.type)} (enum)` : "enum";
  if ((schema.oneOf || schema.anyOf) && !(schema.type && (schema.oneOf || schema.anyOf).every(constrainsOnly))) {
    // A name is published once however many alternatives carry it.
    //
    // Alternatives may differ in SHAPE while sharing a TYPE — an object
    // required to carry a particular key, beside an object required not to —
    // and both render to the same name. Joining the names unmodified prints
    // that name twice, which names no second thing a reader could look for and
    // reads on the page as a rendering fault.
    //
    // What separates such alternatives is not a type name, so the type column
    // is not where it can be said: the distinguishing key belongs to the
    // prose beside the value, which is written to tell an author which form to
    // write. This is the same bound the shape-constraint sentences below keep,
    // where two alternatives sharing a name yield no sentence because there
    // would be no way to say which of them was meant.
    //
    // Order is the schema's own and the first occurrence of a name holds its
    // place, so the reading stays as deterministic as the rest of the output.
    const names = (schema.oneOf || schema.anyOf).map(describeType);
    return [...new Set(names)].join(" or ");
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
  if (Array.isArray(schema.type)) {
    // Each member is labelled as it would be on its own, so a list that may
    // also be null still names what it lists — `Location[] or null`, not
    // `array or null`, which drops the one fact a reader needs about the
    // entries.
    return schema.type
      .map((member) => {
        if (member === "array") return schema.items ? `${describeType(schema.items)}[]` : "array";
        if (member === "object") return describeType({ ...schema, type: "object" });
        return member;
      })
      .join(" or ");
  }
  if (schema.type) return schema.type;
  return "any";
}

function labelOfType(type) {
  return Array.isArray(type) ? type.join(" or ") : String(type);
}

// The alternative shapes whose names the Type column joins, or null when the
// value is not written as a set of alternatives.
//
// There are two places a property's alternatives are written, and both reach the
// Type column the same way. A property may carry them itself, which renders as
// `string or object`; or it may be a map whose entry VALUE carries them, which
// renders as `map of string or object`. Reading both is what lets one sentence
// below address either, and it is why a map's entries are not a separate case
// for the reader: the phrase `the object form` names the same alternative in
// `string or object` and in `map of string or object`.
function alternativeShapes(schema) {
  if (!schema || typeof schema !== "object") return null;
  const own = schema.oneOf || schema.anyOf;
  if (Array.isArray(own) && own.length > 0) return own;
  const values = schema.additionalProperties;
  if (values && typeof values === "object") {
    const nested = values.oneOf || values.anyOf;
    if (Array.isArray(nested) && nested.length > 0) return nested;
  }
  return null;
}

// What a value written in one of its alternative shapes may not be.
//
// A set of alternatives reaches the Type column as its shapes' type names joined
// — `string or object` — so a constraint written inside one of them is dropped
// on the way. That loses the half of the contract a reader cannot infer: the
// prose beside such a value tells an author what to write, and without the
// constraint they cannot tell whether the product rejects the other form or
// merely discourages it. These sentences publish that, alongside the prose
// rather than in place of it.
//
// Bounded three ways, each so that what is published is true rather than nearly
// true.
//
// A shape is addressed by its own type name, and only where that name belongs to
// one shape alone, so `the object form` picks out exactly one of them. Where two
// shapes render to the same name nothing is said, because there would be no way
// to say which was meant.
//
// The constraint is read only from a named field of a shape, and that field's
// name is the subject of the sentence. A constraint written on a shape itself
// says only that this shape is not one of the others, which cannot be stated
// without naming a shape the reader is never shown.
//
// Only a refused pattern is phrased. It is the one form whose meaning survives
// being put in a single clause, and anything else yields nothing rather than a
// paraphrase of something this did not read — the same rule the key-pattern
// prose above follows.
function shapeConstraints(schema) {
  const shapes = alternativeShapes(schema);
  if (!shapes) return [];
  const names = shapes.map((shape) => cell(describeType(shape)));
  const sentences = [];
  shapes.forEach((shape, index) => {
    const name = names[index];
    if (names.indexOf(name) !== names.lastIndexOf(name)) return;
    const fields = shape && typeof shape === "object" ? shape.properties : null;
    if (!fields || typeof fields !== "object") return;
    for (const field of Object.keys(fields)) {
      const refused = fields[field] && fields[field].not;
      if (!refused || typeof refused !== "object") continue;
      if (typeof refused.pattern !== "string") continue;
      sentences.push(
        `In the ${name} form, \`${field}\` must not match \`${refused.pattern}\`; a value that does is rejected.`
      );
    }
  });
  return sentences;
}

// The description column for one property: its prose plus any shape-constraint,
// key-constraint, enum, constant, or default facets that help a reader.
//
// The key constraint belongs here as well as in a section body: a map whose
// values are a named type is documented as a single table row and nothing
// recurses into it, so a row is the only place its key shape can reach a reader.
function describeProp(schema) {
  const parts = [];
  if (schema.description) parts.push(String(schema.description));
  for (const sentence of describeFacets(schema, true)) parts.push(sentence);
  return parts.join(" ");
}

// The values a schema allows when it writes them as alternatives, each one
// constant with a description of its own — a closed set of codes, say, where
// what each code means is the half of the contract a client acts on. The Type
// column names the constants and nothing else, so the descriptions are
// published beside them. Null unless every alternative is a described
// constant: a partial list would present an open set as a closed one.
function describedConstants(schema) {
  const alternatives = schema && (schema.oneOf || schema.anyOf);
  if (!Array.isArray(alternatives) || alternatives.length === 0) return null;
  const described = alternatives.every(
    (alternative) =>
      alternative &&
      typeof alternative === "object" &&
      alternative.const !== undefined &&
      typeof alternative.description === "string" &&
      alternative.description.trim().length > 0
  );
  if (!described) return null;
  return alternatives.map((alternative) => ({ value: alternative.const, description: alternative.description }));
}

// Everything a value's row says beyond its prose: shape, key and value
// constraints, the allowed values, the constant and the default. One list
// serves a property row and a definition rendered without a table, so a value
// is described the same way wherever it is documented. Described constants are
// written inline only where asked: a table cell has no room for a list, and a
// definition section sets them out as one instead.
function describeFacets(schema, inlineConstants) {
  const constants = describedConstants(schema);
  const parts = [];
  // Directly after the prose, because these qualify what that prose describes:
  // the prose names the shapes a value may take, and these say what one of them
  // may not contain. The key facets that follow are about a map's keys instead.
  for (const sentence of shapeConstraints(schema)) parts.push(sentence);
  const keys = keyConstraint(schema);
  if (keys) parts.push(`Keys: ${keys}`);
  for (const sentence of valueConstraints(schema)) parts.push(sentence);
  if (schema.enum) {
    parts.push("Allowed values: " + schema.enum.map((v) => `\`${JSON.stringify(v)}\``).join(", "));
  } else if (schema.const !== undefined) {
    parts.push(`Constant: \`${JSON.stringify(schema.const)}\``);
  } else if (constants && inlineConstants) {
    parts.push(
      "Allowed values: " +
        constants.map((entry) => `\`${JSON.stringify(entry.value)}\` — ${String(entry.description).trim()}`).join(" ")
    );
  }
  if (schema.default !== undefined) {
    parts.push(`Default: \`${JSON.stringify(schema.default)}\``);
  }
  return parts;
}

// Which schema one property takes for each value of another, when the object
// says so as a set of conditions — `allOf` entries each reading "if `method` is
// this constant, then `params` is that shape". The property table can show
// neither half: it lists `params` once, with the type it has before any
// condition applies, so without this a reader cannot tell which shape goes with
// which method, and the method names themselves appear nowhere.
//
// Only that exact form is read: every entry an `if` naming one property bound
// to one constant (and requiring it), a `then` naming one property, no `else`,
// and every entry naming the same two properties. A condition of any other
// shape yields null and nothing is said, so this never paraphrases a condition
// it did not read. A branch's `then` may require its property where the object
// itself does not, and the Required column reports that per value.
function discriminatedBranches(schema, requiredSet) {
  const entries = schema.allOf;
  if (!Array.isArray(entries) || entries.length === 0) return null;
  let key = null;
  let target = null;
  const rows = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || entry.else !== undefined) return null;
    const cond = entry.if;
    const then = entry.then;
    if (!cond || !then || typeof cond !== "object" || typeof then !== "object") return null;
    const condKeys = Object.keys(cond.properties || {});
    const thenKeys = Object.keys(then.properties || {});
    if (condKeys.length !== 1 || thenKeys.length !== 1) return null;
    const bound = cond.properties[condKeys[0]];
    if (!bound || typeof bound !== "object" || bound.const === undefined || Object.keys(bound).length !== 1) return null;
    if (!Array.isArray(cond.required) || !cond.required.includes(condKeys[0])) return null;
    if (key === null) {
      key = condKeys[0];
      target = thenKeys[0];
    } else if (key !== condKeys[0] || target !== thenKeys[0]) {
      return null;
    }
    const required = requiredSet.has(target) || (Array.isArray(then.required) && then.required.includes(target));
    rows.push({ value: bound.const, schema: then.properties[target], required });
  }
  return { key, target, rows };
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

  const branches = discriminatedBranches(schema, requiredSet);
  if (branches) {
    out.push(`**\`${branches.target}\` for each \`${branches.key}\`:**`, "");
    out.push(`| \`${branches.key}\` | \`${branches.target}\` | Required |`);
    out.push("| --- | --- | --- |");
    for (const branch of branches.rows) {
      out.push(`| \`${cell(JSON.stringify(branch.value))}\` | ${cell(describeType(branch.schema))} | ${branch.required ? "yes" : "no"} |`);
    }
    out.push("");
  }

  const childHashes = "#".repeat(Math.min(headingLevel, 6));
  for (const [childPath, childSchema] of children) {
    out.push(`${childHashes} \`${childPath}\``, "");
    out.push(renderObjectSection(childSchema, childPath, depth + 1, headingLevel + 1, true));
  }
  return out.join("\n");
}

// The top-level keyword under which a plugin socket schema maps each export the
// host calls a guest with to the definition of its input and the definition of
// its output. A schema carrying it declares no union of its payloads at its root,
// because one document can be a valid payload of several exports: which shape a
// payload has is named by the export it crosses, and this table is where a reader
// looks that up.
const EXPORT_TABLE_KEYWORD = "x-aggrega-exports";

// The definition an export-table pointer addresses.
//
// A pointer is a JSON Pointer fragment into the same schema's `$defs`, and the
// page names the definition it addresses, which is documented once under
// Definitions below. A pointer addressing anything else would publish a row
// naming a shape the reader cannot find on the page, so the generation refuses
// rather than rendering it, as it refuses a reference it cannot resolve.
function exportTableDefinition(kind, schema, exportName, direction, pointer) {
  const prefix = "#/$defs/";
  const name = typeof pointer === "string" && pointer.startsWith(prefix) ? pointer.slice(prefix.length) : "";
  if (name === "" || name.includes("/") || !(schema.$defs && Object.hasOwn(schema.$defs, name))) {
    refuse(
      `${kind}: the ${EXPORT_TABLE_KEYWORD} table gives ${exportName} the ${direction} ${JSON.stringify(pointer)}, ` +
        "which addresses no definition the schema declares."
    );
  }
  return name;
}

// Renders a schema's export table, or nothing when the schema carries none: one
// row per export, in the order the schema writes them, naming the definition of
// the export's input and the definition of its output.
function renderExportTable(kind, schema) {
  const table = schema[EXPORT_TABLE_KEYWORD];
  if (table === undefined) return [];
  if (table === null || typeof table !== "object" || Array.isArray(table) || Object.keys(table).length === 0) {
    refuse(`${kind}: the ${EXPORT_TABLE_KEYWORD} table is not an object mapping at least one export.`);
  }
  const out = [
    "## Exports",
    "",
    `The schema's \`${EXPORT_TABLE_KEYWORD}\` table maps each export the host calls a guest with to the definition of its input and the definition of its output. A payload's shape is the definition its export names.`,
    "",
    "| Export | Input | Output |",
    "| --- | --- | --- |",
  ];
  for (const [exportName, row] of Object.entries(table)) {
    const input = exportTableDefinition(kind, schema, exportName, "input", row && row.input);
    const output = exportTableDefinition(kind, schema, exportName, "output", row && row.output);
    out.push(`| \`${cell(exportName)}\` | \`${input}\` | \`${output}\` |`);
  }
  out.push("");
  return out;
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
    // The link names the prose page by its source path, relative to this page,
    // so it resolves in the repository as written; the site build rewrites a
    // `.md` target to that page's route, so it resolves on the built site too.
    //
    // The sentence names the entity by the `kind` value its documents carry —
    // `FeatureRecipe`, not the schema's file name `featurerecipe` — because that
    // is the spelling an author writes and the one the prose page teaches.
    const entityName = (schema.properties && schema.properties.kind && schema.properties.kind.const) || kind;
    out.push(
      `See the [${entityName} authoring reference](../../entities/${kind}.md) for prose guidance on authoring ${entityName} entities; this page documents the structural schema that reference describes.`,
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

  out.push(...renderExportTable(kind, schema));

  if (schema.$defs && Object.keys(schema.$defs).length > 0) {
    out.push("## Definitions", "");
    for (const defName of Object.keys(schema.$defs)) {
      const def = schema.$defs[defName];
      out.push(`### \`${defName}\``, "");
      if (def.type === "object" || def.properties) {
        out.push(renderObjectSection(def, defName, 0, 4, true));
      } else {
        // A definition that is not an object has no table to carry its facets,
        // so they follow the type line: without them a closed set of values —
        // every method a request may name, say — is published as a bare type,
        // and the reader is never told what the set holds.
        if (def.description) out.push(paragraph(def.description), "");
        out.push(`**Type:** \`${cell(describeType(def))}\``, "");
        const constants = describedConstants(def);
        if (constants) {
          out.push("Allowed values:", "");
          for (const entry of constants) {
            out.push(`- \`${JSON.stringify(entry.value)}\` — ${cell(entry.description)}`);
          }
          out.push("");
        }
        const facets = describeFacets(def, false);
        if (facets.length > 0) out.push(cell(facets.join(" ")), "");
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
  BIN = resolveBinary();

  const kinds = listKinds();
  if (kinds.length === 0) {
    refuse("No schema kinds returned by `get-schema --list`.");
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
