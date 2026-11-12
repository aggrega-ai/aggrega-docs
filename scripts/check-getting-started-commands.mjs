#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Cognitio S.r.l.
//
// check-getting-started-commands.mjs — hold the commands of the Getting started
// page to the pages they come from, and every page that scaffolds an example to
// what `aggrega scaffold --example` prints, so no page can drift from the
// examples.
//
// A command block is a fenced block marked sh, bash, shell, zsh, powershell or
// pwsh; its lines are read with blank lines left out.
//
// A scaffold line is a command line `aggrega scaffold --example <name>`, or the
// same followed by a directory, `aggrega scaffold --example <name> <dir>`. <name>
// must be a directory under language-reference/examples/ holding a README.md.
// The command writes the example and then prints the commands to run next:
// `cd <dir>` (<dir> is <name> where the line names no directory), then the lines
// of the example README's Build block — read by scripts/lib/build-commands.awk,
// the reader scripts/check-build-commands-parity.sh holds to the CLI's own
// reading, which this check runs first — blank lines left out. Those are "the
// lines it prints" below. `aggrega scaffold --example --list` writes nothing and
// is not a scaffold line.
//
// Any line of a page, prose included, that scaffolds an example and changes
// directory on the same line — `aggrega scaffold --example <name> && cd <name>`,
// or with `;`, `||`, `&`, `Set-Location`, `pushd` — fails: the command prints the
// `cd` itself, so the page shows the scaffold line alone and the `cd` in the
// commands after it. A command line naming `aggrega scaffold --example` in any
// other shape fails too, naming the shape to write.
//
// "The commands after a scaffold line" are the lines after it in its own block,
// where it has any; otherwise the lines of the next command block on the page, up
// to that block's own first scaffold line.
//
// The Getting started page walks the examples, and is read the strictest way:
//
//   - before its first scaffold line, every command block is held to install.md;
//   - the commands after a scaffold line must EQUAL the lines it prints, in
//     order; a scaffold line with no command block after it fails;
//   - every later block, up to the next scaffold line, is held to the example's
//     README.
//
// A block is held to a source page when its lines appear there as a run of
// consecutive lines of one command block, in the same order. A block that does
// not hold fails the check, naming the page's line and the command: the first
// command its source's command blocks do not carry, or, where each one is
// carried, the first one that does not follow the one before it there.
//
// Every other Markdown page under the documentation root that carries a scaffold
// line in a command block — the example READMEs, the concept pages, the import
// walkthroughs and the rest; node_modules, dist, site, l10n, testdata and every
// directory whose name starts with a dot left out — is read the lighter way: the
// commands after each scaffold line must be a non-empty PREFIX of the lines it
// prints, so the page shows them in the order the command prints them. Where the
// next fenced block quotes what the command printed — a block, not a command
// block, opening `Wrote the example <name> into <dir>` — or no fenced block
// follows, the page is showing the command rather than walking it, and nothing
// more is held.
//
// Usage:
//   node scripts/check-getting-started-commands.mjs [--page PATH] [--docs-root DIR]
//
//   (no --page)      check getting-started.md under the docs root the strict way,
//                    then every other page the lighter way
//   --page PATH      check that one page the strict way, and no other
//   --docs-root DIR  the documentation root the sources and pages are read from
//                    (default: the directory above this script)
//   --fenced-blocks FILE
//                    check nothing: print every fenced block FILE holds, as
//                    "block <line> <info>" and then "| <line as written>" for each
//                    line, for scripts/check-fenced-block-parity.sh to compare
//
// Exit status: 0 every page holds; 1 a page does not, or the Build-block reader
// is not held to the CLI's reading; 2 the check could not run (an argument it
// does not take, or a page, source or tool it cannot read or run).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMAND_INFO = new Set(["sh", "bash", "shell", "zsh", "powershell", "pwsh"]);
const SCAFFOLD = /^aggrega scaffold --example ([a-z0-9][a-z0-9-]*)(?: ([^\s;&|<>`'"]+))?$/;
const LIST = /^aggrega scaffold --example --list$/;
const NAMES_SCAFFOLD = /\baggrega\s+scaffold\b.*\s--example\b/;
const JOINED =
  /\baggrega\s+scaffold\s+--example(?:\s+|=)\S+.*(?:&&|\|\||;|&)\s*(?:cd|Set-Location|sl|pushd|chdir)(?:\s|$|`)/;
const EXAMPLES = "language-reference/examples";
const SKIP_DIRS = new Set(["node_modules", "dist", "site", "l10n", "testdata"]);
const HERE = path.dirname(fileURLToPath(import.meta.url));

function usage(message) {
  if (message) process.stderr.write(`check-getting-started-commands: ${message}\n`);
  process.stderr.write("usage: check-getting-started-commands.mjs [--page PATH] [--docs-root DIR]\n");
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { docsRoot: path.resolve(HERE, ".."), page: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      // The help is the file's opening comment, after its licence lines.
      const text = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
      const end = text.findIndex((l, n) => n > 0 && !l.startsWith("//"));
      const header = text.slice(1, end).map((l) => l.replace(/^\/\/ ?/, ""));
      process.stdout.write(`${header.slice(header.findIndex((l) => l === "") + 1).join("\n")}\n`);
      process.exit(0);
    }
    const [flag, inline] = arg.split(/=(.*)/s, 2);
    const value = inline ?? argv[++i];
    if (flag === "--page" && value) opts.page = value;
    else if (flag === "--docs-root" && value) opts.docsRoot = path.resolve(value);
    else if (flag === "--fenced-blocks" && value) opts.fencedBlocks = path.resolve(value);
    else usage(`unexpected argument: ${arg}`);
  }
  opts.only = opts.page !== undefined;
  opts.page = path.resolve(opts.page ?? path.join(opts.docsRoot, "getting-started.md"));
  return opts;
}

function read(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (err) {
    usage(`cannot read ${file}: ${err.message}`);
  }
}

// fencedBlocks returns every closed fenced block of a Markdown page, each as the
// line number of its opening fence, its info word and its lines as written, blank
// ones included. A fence opens on a run of three or more backticks or tildes
// indented by at most three spaces, and closes on a line holding nothing but a run
// of the same character at least as long.
//
// 🔴 DELIBERATE NEAR-DUPLICATE: aggrega-docs/scripts/lib/fenced-blocks.awk reads
// fenced blocks by the same rules for check-import-example.sh, which runs in the
// examples workflow's step that builds the examples, before that workflow sets up
// Node, so it cannot import this function. scripts/check-fenced-block-parity.sh
// runs both readers over one fixture, scripts/testdata/fenced-blocks.md, and fails
// where they read different blocks; change the rules in both, and that fixture
// with them.
function fencedBlocks(markdown) {
  const blocks = [];
  let fence = "";
  let current;
  markdown.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trimStart();
    if (fence) {
      const t = line.trim();
      if (t.length >= fence.length && t.split("").every((c) => c === fence[0])) {
        blocks.push(current);
        fence = "";
        current = undefined;
      } else {
        current.lines.push({ text: line, line: index + 1 });
      }
      return;
    }
    const open = line.length - trimmed.length <= 3 && trimmed.match(/^(`{3,}|~{3,})\s*([^\s`]*)/);
    if (open) {
      fence = open[1];
      current = { line: index + 1, info: open[2], lines: [] };
    }
  });
  return blocks;
}

// pageBlocks returns every fenced block of a Markdown page, each as the line
// number of its opening fence, whether it is a command block, and its lines with
// blank lines left out and trailing whitespace dropped.
function pageBlocks(markdown) {
  return fencedBlocks(markdown).map((block) => ({
    line: block.line,
    command: COMMAND_INFO.has(block.info),
    lines: block.lines
      .filter((l) => l.text.trim() !== "")
      .map((l) => ({ text: l.text.trimEnd(), line: l.line })),
  }));
}

// commandBlocks returns the command blocks of a Markdown page, as pageBlocks
// reads them.
function commandBlocks(markdown) {
  return pageBlocks(markdown).filter((block) => block.command);
}

// holds reports whether lines appear, in order, as consecutive lines of one of the
// source's blocks.
function holds(lines, sourceBlocks) {
  return sourceBlocks.some((block) => {
    const src = block.lines.map((l) => l.text);
    for (let start = 0; start + lines.length <= src.length; start++) {
      if (lines.every((text, k) => src[start + k] === text)) return true;
    }
    return false;
  });
}

// firstDiffering names the command of a block that does not hold: the first its
// source carries in no command block, or the first that does not follow the one
// before it in the source.
function firstDiffering(lines, sourceBlocks) {
  const carried = new Set(sourceBlocks.flatMap((b) => b.lines.map((l) => l.text)));
  const missing = lines.find((l) => !carried.has(l.text));
  if (missing) return { line: missing, why: "is not a command it gives" };
  for (let k = 1; k < lines.length; k++) {
    if (!holds([lines[k - 1].text, lines[k].text], sourceBlocks)) {
      return { line: lines[k], why: `does not follow "${lines[k - 1].text}" there` };
    }
  }
  return { line: lines[0], why: "is not given together with the commands after it" };
}

const opts = parseArgs(process.argv.slice(2));
if (opts.fencedBlocks) {
  for (const block of fencedBlocks(read(opts.fencedBlocks))) {
    process.stdout.write(`block ${block.line} ${block.info}\n`);
    for (const l of block.lines) process.stdout.write(`| ${l.text}\n`);
  }
  process.exit(0);
}

const failures = [];
let commands = 0;
let checkedBlocks = 0;
let scaffoldLines = 0;

function nameOf(file) {
  const fromRoot = path.relative(opts.docsRoot, file);
  return fromRoot && !fromRoot.startsWith("..") ? fromRoot : file;
}

// --- what a scaffold line prints ----------------------------------------------------
// The README's Build block is read by build-commands.awk, held first to the CLI's
// own reading by check-build-commands-parity.sh, so no page is judged by a reading
// the CLI does not share.
const BUILD_COMMANDS = path.join(HERE, "lib", "build-commands.awk");
let parityChecked = false;
function checkParity() {
  if (parityChecked) return;
  parityChecked = true;
  try {
    execFileSync(path.join(HERE, "check-build-commands-parity.sh"), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    if (err.status === 1) {
      process.stdout.write(err.stdout ?? "");
      process.stdout.write(
        "check-getting-started-commands: lib/build-commands.awk does not read the Build block as the CLI does, so what a scaffold line prints cannot be computed\n",
      );
      process.exit(1);
    }
    usage(`cannot run check-build-commands-parity.sh: ${(err.stderr || err.message || "").trim()}`);
  }
}

const printedCache = new Map();
// printed returns the lines `aggrega scaffold --example <name> [<dir>]` prints to
// run next, blank lines left out, or undefined where the example does not exist.
function printed(name, dir) {
  const readme = path.join(opts.docsRoot, EXAMPLES, name, "README.md");
  if (!fs.existsSync(readme)) return undefined;
  if (!printedCache.has(readme)) {
    checkParity();
    let out;
    try {
      out = execFileSync("awk", ["-f", BUILD_COMMANDS, readme], { encoding: "utf8" });
    } catch (err) {
      usage(`cannot read the Build block of ${nameOf(readme)}: ${(err.stderr || err.message || "").trim()}`);
    }
    printedCache.set(
      readme,
      out
        .split("\n")
        .filter((l) => l.startsWith("|"))
        .map((l) => l.replace(/^\| ?/, "").trimEnd())
        .filter((l) => l.trim() !== ""),
    );
  }
  return [`cd ${dir}`, ...printedCache.get(readme)];
}

// scaffoldOf reads one command line: { name, dir } for a scaffold line, "list" for
// the list form, a failure reason for any other shape naming `aggrega scaffold
// --example`, and undefined for a line that does not name it.
function scaffoldOf(text) {
  const m = text.match(SCAFFOLD);
  if (m) return { name: m[1], dir: m[2] ?? m[1] };
  if (LIST.test(text)) return "list";
  if (JOINED.test(text)) return undefined; // reported by the joined-form pass over every line
  if (NAMES_SCAFFOLD.test(text)) {
    return 'is not a scaffold line this check reads: write "aggrega scaffold --example <name>", optionally followed by a directory, alone on its line';
  }
  return undefined;
}

// joinedForm fails every line of a page, prose and blocks alike, that scaffolds an
// example and changes directory on the same line.
function joinedForm(pageName, markdown) {
  markdown.split(/\r?\n/).forEach((text, index) => {
    if (!JOINED.test(text)) return;
    failures.push(
      `${pageName}:${index + 1}: "${text.trim()}" scaffolds an example and changes directory on one line: ` +
        'write "aggrega scaffold --example <name>" alone; the command prints "cd <name>" itself, so the commands after it start with that line',
    );
  });
}

// split returns a block's lines cut at its scaffold lines: runs of other lines, and
// each scaffold line on its own, in order.
function split(pageName, block) {
  const parts = [];
  let run = [];
  for (const l of block.lines) {
    const s = scaffoldOf(l.text);
    if (s === undefined || s === "list") {
      run.push(l);
      continue;
    }
    if (typeof s === "string") {
      failures.push(`${pageName}:${l.line}: the command "${l.text}" ${s}`);
      run.push(l);
      continue;
    }
    parts.push({ lines: run });
    run = [];
    parts.push({ scaffold: s, line: l });
  }
  parts.push({ lines: run });
  return parts;
}

// after returns the commands after the scaffold line at part index pi of block bi:
// { lines } from its own block or the next command block, { account: true } where
// (on a page read the lighter way) a block quoting the command's output comes
// first, or undefined where nothing follows.
function after(blocks, parts, bi, pi, strict) {
  const rest = [];
  for (let k = pi + 1; k < parts[bi].length && !parts[bi][k].scaffold; k++) rest.push(...parts[bi][k].lines);
  if (rest.length > 0) return { lines: rest };
  if (parts[bi].slice(pi + 1).some((p) => p.scaffold)) return { lines: [] };
  const s = parts[bi][pi].scaffold;
  for (let j = bi + 1; j < blocks.length; j++) {
    if (blocks[j].command) return { lines: parts[j][0].lines };
    if (!strict && blocks[j].lines[0]?.text.startsWith(`Wrote the example ${s.name} into ${s.dir} `)) return { account: true };
  }
  return undefined;
}

// --- the Getting started page, the strict way ------------------------------------------
function checkStrict(file) {
  const pageName = nameOf(file);
  const markdown = read(file);
  joinedForm(pageName, markdown);
  const sources = new Map();
  const source = (rel) => {
    if (!sources.has(rel)) sources.set(rel, commandBlocks(read(path.join(opts.docsRoot, rel))));
    return sources.get(rel);
  };
  const blocks = pageBlocks(markdown);
  const parts = blocks.map((b) => (b.command ? split(pageName, b) : [{ lines: b.lines }]));
  let sourceRel = "install.md";
  let expect; // the scaffold line whose printed lines the next commands must equal
  const holdToSource = (lines) => {
    if (lines.length === 0) return;
    commands += lines.length;
    if (expect) {
      const want = expect.printed;
      const got = lines.map((l) => l.text);
      if (got.length !== want.length || got.some((t, k) => t !== want[k])) {
        const k = got.findIndex((t, i) => t !== want[i]);
        const where = k >= 0 ? lines[k] : lines[lines.length - 1];
        const what =
          k < 0
            ? `ends after "${got[got.length - 1]}", before "${want[got.length]}"`
            : k >= want.length
              ? `has "${got[k]}" after the last line it prints`
              : `has "${got[k]}" where it prints "${want[k]}"`;
        failures.push(
          `${pageName}:${where.line}: the commands after "${expect.text}" (line ${expect.line}) differ from what it prints: the block ${what}`,
        );
      }
      expect = undefined;
      return;
    }
    if (sourceRel === undefined) return;
    const srcBlocks = source(sourceRel);
    if (holds(lines.map((l) => l.text), srcBlocks)) return;
    const { line, why } = firstDiffering(lines, srcBlocks);
    failures.push(`${pageName}:${line.line}: the command "${line.text}" differs from ${sourceRel}: it ${why}`);
  };
  blocks.forEach((block, bi) => {
    if (!block.command) return;
    checkedBlocks++;
    parts[bi].forEach((part) => {
      if (!part.scaffold) {
        holdToSource(part.lines);
        return;
      }
      if (expect) {
        failures.push(`${pageName}:${expect.line}: no command follows "${expect.text}" before the next scaffold line`);
        expect = undefined;
      }
      commands++;
      scaffoldLines++;
      const { name, dir } = part.scaffold;
      const want = printed(name, dir);
      sourceRel = `${EXAMPLES}/${name}/README.md`;
      if (!want) {
        failures.push(`${pageName}:${part.line.line}: the command "${part.line.text}" names no example: ${sourceRel} does not exist`);
        sourceRel = undefined;
        return;
      }
      expect = { text: part.line.text, line: part.line.line, printed: want };
    });
  });
  if (expect) {
    failures.push(`${pageName}:${expect.line}: no command block follows "${expect.text}", so the page does not show what it prints`);
  }
}

// --- every other page, the lighter way --------------------------------------------------
function checkLight(file) {
  const pageName = nameOf(file);
  const markdown = read(file);
  joinedForm(pageName, markdown);
  if (!NAMES_SCAFFOLD.test(markdown)) return;
  const blocks = pageBlocks(markdown);
  const parts = blocks.map((b) => (b.command ? split(pageName, b) : [{ lines: b.lines }]));
  blocks.forEach((block, bi) => {
    if (!block.command) return;
    parts[bi].forEach((part, pi) => {
      if (!part.scaffold) return;
      scaffoldLines++;
      const { name, dir } = part.scaffold;
      const want = printed(name, dir);
      if (!want) {
        failures.push(
          `${pageName}:${part.line.line}: the command "${part.line.text}" names no example: ${EXAMPLES}/${name}/README.md does not exist`,
        );
        return;
      }
      const next = after(blocks, parts, bi, pi, false);
      if (next === undefined || next.account) return;
      checkedBlocks++;
      commands += next.lines.length;
      if (next.lines.length === 0) {
        failures.push(`${pageName}:${part.line.line}: the commands after "${part.line.text}" are empty: the next block starts with "${want[0]}"`);
        return;
      }
      const k = next.lines.findIndex((l, i) => i >= want.length || l.text !== want[i]);
      if (k < 0) return;
      const l = next.lines[k];
      failures.push(
        k >= want.length
          ? `${pageName}:${l.line}: the command "${l.text}" follows the last line "${part.line.text}" prints`
          : `${pageName}:${l.line}: the command "${l.text}" is not what "${part.line.text}" prints there: it prints "${want[k]}"`,
      );
    });
  });
}

// pages returns every Markdown page under the docs root the lighter way reads.
function pages(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && !SKIP_DIRS.has(entry.name)) pages(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

checkStrict(opts.page);
let otherPages = 0;
if (!opts.only) {
  for (const file of pages(opts.docsRoot)) {
    if (path.resolve(file) === opts.page) continue;
    otherPages++;
    checkLight(file);
  }
}

const scope = opts.only ? nameOf(opts.page) : `${nameOf(opts.page)} and ${otherPages} other page(s)`;
if (failures.length > 0) {
  for (const f of failures) process.stdout.write(`${f}\n`);
  process.stdout.write(
    `check-getting-started-commands: ${failures.length} command(s) in ${scope} differ from the pages they come from or from what scaffold prints\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `check-getting-started-commands: ${scope}: ${checkedBlocks} command block(s), ${commands} command(s), ${scaffoldLines} scaffold line(s), each as the page it comes from gives it and as scaffold prints it\n`,
);
