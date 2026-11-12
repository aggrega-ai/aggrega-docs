#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Cognitio S.r.l.
//
// check-getting-started-commands.mjs — hold the commands of the Getting started
// page to the pages they come from, every page that scaffolds an example to what
// `aggrega scaffold --example` prints, and the quickstart scripts to their
// examples' pages, so no page and no script can drift from the examples.
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
// A one-command line runs a step of an example with its quickstart script:
// `curl -fsSL https://aggrega.ai/<name>.sh | sh -s -- <step>`, or, in PowerShell,
// `& ([scriptblock]::Create((irm https://aggrega.ai/<name>.ps1))) <step>`, where
// <name> is quickstart- and the rest of an example's name. The example's README
// gives these lines in its section under the level-two heading exactly "Run it
// in one command", up to the next heading of level one or two (a heading inside
// a fenced block is not a heading): that section is their source.
//
// The Getting started page walks the examples, and is read the strictest way:
//
//   - a command block holding a one-command line is held to that section of the
//     example's README, wherever on the page it sits;
//   - before its first scaffold line, every other command block is held to
//     install.md;
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
// more is held. On every page read the lighter way, each one-command line in a
// command block must be a line of its example README's "Run it in one command"
// section, and on an example's own README it must name that example.
//
// The quickstart scripts are held to their examples' READMEs too. The scripts
// held are every <name>.sh and <name>.ps1 a one-command line of an example's
// README names, and every file of the scripts folder named <example>.sh or
// <example>.ps1 after an example with a README. The scripts folder is
// aggrega-cli/packaging/install/ in the directory above the docs root, or
// --scripts DIR. Where the default folder does not exist, as in a checkout of
// the documentation alone, no script is held and the summary line says so; where
// the folder exists, a script a README names that the folder does not hold fails,
// and the summary line names every script held. Each script is read as it is
// written:
//
//   - a step is a function, `step_<N>() {` in a .sh script and
//     `function step_<N> {` in a .ps1 script, ending at a line holding only `}`;
//     inside it every line is blank, a comment, `run <command>` or
//     `require_env <NAME> <value>`, and any other line fails;
//   - the script's steps must be the README's steps: step 1, read from the Build
//     block as for a scaffold line, and each step N above 1 the README gives a
//     command block opening with the line `cd ../<N>`. There must be exactly one
//     such block for each N; a block opening otherwise is not a step's block;
//   - a step's README block is read without its `cd` lines, its comment lines
//     and its `export <NAME>=<value>` lines, and what is left must EQUAL the
//     step's `run` commands, in order;
//   - each `export <NAME>=<value>` line of the block must be a `require_env
//     <NAME> <value>` line of the step. A `require_env` with no export line in
//     its step's block is allowed only where an earlier step's block exports the
//     same name with the same value: the step relies on the value exported at
//     that earlier step, as quickstart-web's step 2 does. The check does not
//     read the page's prose;
//   - from the line `# The machinery that runs a step from the functions above.`
//     to the end, every .sh script held must equal the first one byte for byte,
//     and every .ps1 script the first .ps1 one; a script without that line fails;
//   - above that line, every address a line that is not a comment names after the
//     word "open" — the address the script's last line prints — must be the one
//     the README's step-1 Build block names in its comment
//     `# then open <address> in your browser`, and where the README names one,
//     the script must name it.
//
// Usage:
//   node scripts/check-getting-started-commands.mjs [--page PATH] [--docs-root DIR] [--scripts DIR]
//
//   (no --page)      check getting-started.md under the docs root the strict way,
//                    then every other page the lighter way, then the quickstart
//                    scripts
//   --page PATH      check that one page the strict way, and no other page and no
//                    script
//   --docs-root DIR  the documentation root the sources and pages are read from
//                    (default: the directory above this script)
//   --scripts DIR    the folder the quickstart scripts are read from (default:
//                    aggrega-cli/packaging/install/ in the directory above the
//                    docs root); a folder named here must exist
//   --fenced-blocks FILE
//                    check nothing: print every fenced block FILE holds, as
//                    "block <line> <info>" and then "| <line as written>" for each
//                    line, for scripts/check-fenced-block-parity.sh to compare
//
// Exit status: 0 every page and script holds; 1 a page or a script does not, or
// the Build-block reader is not held to the CLI's reading; 2 the check could not
// run (an argument it does not take, a --scripts folder that does not exist, or
// a page, source, script or tool it cannot read or run).

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
const ONE_COMMAND = [
  [/^curl -fsSL https:\/\/aggrega\.ai\/(quickstart-[a-z0-9][a-z0-9-]*)\.sh \| sh -s -- ([0-9]+)$/, "sh"],
  [/^& \(\[scriptblock\]::Create\(\(irm https:\/\/aggrega\.ai\/(quickstart-[a-z0-9][a-z0-9-]*)\.ps1\)\)\) ([0-9]+)$/, "ps1"],
];
const ONE_COMMAND_SECTION = "Run it in one command";
const MACHINERY = "# The machinery that runs a step from the functions above.";
const EXAMPLES = "language-reference/examples";
const SKIP_DIRS = new Set(["node_modules", "dist", "site", "l10n", "testdata"]);
const HERE = path.dirname(fileURLToPath(import.meta.url));

function usage(message) {
  if (message) process.stderr.write(`check-getting-started-commands: ${message}\n`);
  process.stderr.write("usage: check-getting-started-commands.mjs [--page PATH] [--docs-root DIR] [--scripts DIR]\n");
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { docsRoot: path.resolve(HERE, ".."), page: undefined, scripts: undefined };
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
    else if (flag === "--scripts" && value) opts.scripts = path.resolve(value);
    else usage(`unexpected argument: ${arg}`);
  }
  opts.only = opts.page !== undefined;
  opts.page = path.resolve(opts.page ?? path.join(opts.docsRoot, "getting-started.md"));
  opts.scriptsNamed = opts.scripts !== undefined;
  opts.scripts ??= path.resolve(opts.docsRoot, "..", "aggrega-cli", "packaging", "install");
  if (opts.scriptsNamed && !fs.statSync(opts.scripts, { throwIfNoEntry: false })?.isDirectory()) {
    usage(`--scripts ${opts.scripts} is not a folder`);
  }
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

// printed returns the lines `aggrega scaffold --example <name> [<dir>]` prints to
// run next, blank lines left out, or undefined where the example does not exist.
function printed(name, dir) {
  const lines = buildBlock(name);
  return lines && [`cd ${dir}`, ...lines];
}

const printedCache = new Map();
// buildBlock returns the lines of the example README's Build block as the CLI
// reads it, blank lines left out, or undefined where the example does not exist.
function buildBlock(name) {
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
  return printedCache.get(readme);
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

// --- one-command lines ---------------------------------------------------------------

// oneCommandOf reads one command line: { name, step, script } for a one-command
// line, script being the file it runs, and undefined for any other line.
function oneCommandOf(text) {
  for (const [re, ext] of ONE_COMMAND) {
    const m = text.match(re);
    if (m) return { name: m[1], step: m[2], script: `${m[1]}.${ext}` };
  }
  return undefined;
}

// sectionCommandBlocks returns the command blocks of a Markdown page that sit in
// the section under the level-two heading exactly `title`, up to the next heading
// of level one or two; a line inside a fenced block is never a heading.
//
// It reads a heading by the rule lib/build-commands.awk states for its `heading`
// function, and reads fences by this file's own reader. It cannot call that awk
// reader: the reader returns only sh, bash and shell blocks, and the section's
// PowerShell block is one this check holds.
function sectionCommandBlocks(markdown, title) {
  const inside = new Set();
  for (const b of fencedBlocks(markdown)) {
    const close = b.lines.length > 0 ? b.lines[b.lines.length - 1].line + 1 : b.line + 1;
    for (let n = b.line; n <= close; n++) inside.add(n);
  }
  const ranges = [];
  let open;
  markdown.split(/\r?\n/).forEach((text, index) => {
    const n = index + 1;
    if (inside.has(n)) return;
    const h = text.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/);
    if (!h || h[1].length > 2) return;
    if (open !== undefined) ranges.push([open, n]);
    open = h[1].length === 2 && (h[2] ?? "") === title ? n : undefined;
  });
  if (open !== undefined) ranges.push([open, Infinity]);
  return commandBlocks(markdown).filter((b) => ranges.some(([from, to]) => b.line > from && b.line < to));
}

const oneCommandCache = new Map();
// oneCommandSource returns the command blocks of the example README's "Run it in
// one command" section, or undefined where the example has no README.
function oneCommandSource(name) {
  const readme = path.join(opts.docsRoot, EXAMPLES, name, "README.md");
  if (!fs.existsSync(readme)) return undefined;
  if (!oneCommandCache.has(readme)) oneCommandCache.set(readme, sectionCommandBlocks(read(readme), ONE_COMMAND_SECTION));
  return oneCommandCache.get(readme);
}

// holdOneCommand holds lines, which hold a one-command line naming the example
// `name`, to the example README's "Run it in one command" section, and returns
// whether they hold.
function holdOneCommand(pageName, lines, name) {
  const rel = `${EXAMPLES}/${name}/README.md`;
  const src = oneCommandSource(name);
  if (src === undefined) {
    failures.push(`${pageName}:${lines[0].line}: the command block runs the quickstart script of ${name}, but ${rel} does not exist`);
    return false;
  }
  if (src.length === 0) {
    failures.push(
      `${pageName}:${lines[0].line}: the command block runs the quickstart script of ${name}, but ${rel} has no command block under "## ${ONE_COMMAND_SECTION}"`,
    );
    return false;
  }
  if (holds(lines.map((l) => l.text), src)) return true;
  const { line, why } = firstDiffering(lines, src);
  failures.push(`${pageName}:${line.line}: the command "${line.text}" differs from ${rel}, section "${ONE_COMMAND_SECTION}": it ${why}`);
  return false;
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
    const one = expect === undefined && block.lines.map((l) => oneCommandOf(l.text)).find(Boolean);
    if (one) {
      // A block running a quickstart script is held to that example's README, and
      // leaves the source of the blocks around it as it was.
      commands += block.lines.length;
      holdOneCommand(pageName, block.lines, one.name);
      return;
    }
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
  // An example's own README: language-reference/examples/<example>/README.md.
  const own = pageName.match(new RegExp(`^${EXAMPLES}/([^/]+)/README\\.md$`))?.[1];
  for (const block of commandBlocks(markdown)) {
    for (const l of block.lines) {
      const one = oneCommandOf(l.text);
      if (!one) continue;
      commands++;
      if (own !== undefined && one.name !== own) {
        failures.push(`${pageName}:${l.line}: the command "${l.text}" runs the quickstart script of ${one.name}, on the page of ${own}`);
        continue;
      }
      holdOneCommand(pageName, [l], one.name);
    }
  }
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

// --- the quickstart scripts, held to their examples' READMEs ---------------------------

const byNumber = (a, b) => Number(a) - Number(b);

// parseScript reads a quickstart script as the header above describes: its steps,
// by number, each with its `run` commands and its `require_env` lines; its lines
// from the machinery line to the end; and the addresses its lines above that line
// name after the word "open".
function parseScript(file, ext, scriptName) {
  const lines = read(file).split("\n");
  const opener = ext === "sh" ? /^step_([0-9]+)\(\) \{$/ : /^\s*function step_([0-9]+) \{$/;
  const steps = new Map();
  const opens = [];
  let current;
  let marker;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].replace(/\r$/, "");
    const t = text.trim();
    const n = i + 1;
    if (t === MACHINERY) {
      marker = i;
      break;
    }
    if (current) {
      if (t === "}") {
        current = undefined;
        continue;
      }
      if (t === "" || t.startsWith("#")) continue;
      let m;
      if ((m = t.match(/^run (.+)$/))) current.runs.push({ text: m[1], line: n });
      else if ((m = t.match(/^require_env ([A-Za-z_][A-Za-z0-9_]*) (\S+)$/))) current.envs.push({ name: m[1], value: m[2], line: n });
      else failures.push(`${scriptName}:${n}: step_${current.step} holds "${t}", which is neither "run <command>" nor "require_env <NAME> <value>"`);
      continue;
    }
    const s = text.match(opener);
    if (s) {
      if (steps.has(s[1])) failures.push(`${scriptName}:${n}: step_${s[1]} is defined a second time (first at line ${steps.get(s[1]).line})`);
      current = { step: s[1], line: n, runs: [], envs: [] };
      steps.set(s[1], current);
      continue;
    }
    if (t.startsWith("#")) continue;
    for (const m of text.matchAll(/\bopen (https?:\/\/[^\s'"]+)/g)) opens.push({ url: m[1], line: n });
  }
  if (current) failures.push(`${scriptName}:${current.line}: step_${current.step} has no line holding only "}" before the machinery line`);
  if (marker === undefined) failures.push(`${scriptName}: has no line "${MACHINERY}"`);
  return { steps, opens, tail: marker === undefined ? undefined : lines.slice(marker), tailLine: (marker ?? 0) + 1 };
}

const readmeStepsCache = new Map();
// readmeSteps returns the steps of an example's README: step 1 from its Build
// block, and each step N above 1 from the one command block opening with the line
// `cd ../<N>`, each as { where, lines }.
function readmeSteps(name, rel) {
  if (!readmeStepsCache.has(rel)) readmeStepsCache.set(rel, readReadmeSteps(name, rel));
  return readmeStepsCache.get(rel);
}

function readReadmeSteps(name, rel) {
  const steps = new Map();
  const byStep = new Map();
  for (const b of commandBlocks(read(path.join(opts.docsRoot, rel)))) {
    const m = b.lines[0]?.text.match(/^cd \.\.\/([0-9]+)$/);
    if (!m || m[1] === "1") continue;
    if (!byStep.has(m[1])) byStep.set(m[1], []);
    byStep.get(m[1]).push(b);
  }
  const build = buildBlock(name);
  if (build && build.length > 0) steps.set("1", { where: `the Build block of ${rel}`, lines: build });
  for (const [n, bs] of byStep) {
    if (bs.length > 1) {
      failures.push(
        `${rel}:${bs[1].line}: a second command block opens with "cd ../${n}" (the first is at line ${bs[0].line}), so which block is step ${n}'s is not clear`,
      );
    }
    steps.set(n, { where: `${rel}:${bs[0].line}`, lines: bs[0].lines.map((l) => l.text) });
  }
  return steps;
}

// stepCommands reads a step's README block: the commands left once its cd lines,
// comment lines and export lines are dropped, and its export lines.
function stepCommands(lines) {
  const commands = [];
  const exports = [];
  for (const t of lines) {
    if (/^cd(\s|$)/.test(t) || t.trimStart().startsWith("#")) continue;
    const e = t.match(/^export ([A-Za-z_][A-Za-z0-9_]*)=(\S+)$/);
    if (e) exports.push({ name: e[1], value: e[2] });
    else commands.push(t);
  }
  return { commands, exports };
}

// holdScript holds one quickstart script to its example's README.
function holdScript(name, script, scriptName) {
  const rel = `${EXAMPLES}/${name}/README.md`;
  const readme = readmeSteps(name, rel);
  const exportsOf = new Map([...readme].map(([n, s]) => [n, stepCommands(s.lines).exports]));
  for (const n of [...readme.keys()].sort(byNumber)) {
    if (!script.steps.has(n)) failures.push(`${scriptName}: has no step_${n}, and ${readme.get(n).where} gives step ${n}`);
  }
  for (const [n, step] of [...script.steps].sort(([a], [b]) => byNumber(a, b))) {
    const page = readme.get(n);
    if (!page) {
      failures.push(
        `${scriptName}:${step.line}: step_${n} has no block in ${rel}: ${n === "1" ? "the page has no Build block" : `no command block there opens with "cd ../${n}"`}`,
      );
      continue;
    }
    const { commands: want, exports } = stepCommands(page.lines);
    for (let k = 0; k < Math.max(want.length, step.runs.length); k++) {
      const got = step.runs[k];
      if (got?.text === want[k]) continue;
      failures.push(
        got === undefined
          ? `${scriptName}:${step.line}: step_${n} does not run "${want[k]}", which ${page.where} gives for step ${n}`
          : k >= want.length
            ? `${scriptName}:${got.line}: step_${n} runs "${got.text}" after the last command ${page.where} gives for step ${n}`
            : `${scriptName}:${got.line}: step_${n} runs "${got.text}" where ${page.where} gives "${want[k]}"`,
      );
      break;
    }
    for (const e of exports) {
      if (!step.envs.some((v) => v.name === e.name && v.value === e.value)) {
        failures.push(
          `${scriptName}:${step.line}: step_${n} has no line "require_env ${e.name} ${e.value}", and ${page.where} has the line "export ${e.name}=${e.value}"`,
        );
      }
    }
    for (const v of step.envs) {
      const same = (e) => e.name === v.name && e.value === v.value;
      if (exports.some(same)) continue;
      const earlier = [...exportsOf].some(([m, es]) => Number(m) < Number(n) && es.some(same));
      if (earlier) continue;
      failures.push(
        `${scriptName}:${v.line}: step_${n} requires ${v.name}, but neither ${page.where} nor an earlier step's block has the line "export ${v.name}=${v.value}"`,
      );
    }
  }
  const open = (buildBlock(name) ?? []).map((l) => l.match(/^# then open (\S+) in your browser$/)?.[1]).find(Boolean);
  if (open !== undefined && script.opens.length === 0) {
    failures.push(`${scriptName}: names no address after "open", and the Build block of ${rel} names ${open}`);
  }
  for (const o of script.opens) {
    if (o.url === open) continue;
    failures.push(
      open === undefined
        ? `${scriptName}:${o.line}: names ${o.url} after "open", and the Build block of ${rel} names no address to open`
        : `${scriptName}:${o.line}: names ${o.url} after "open", and the Build block of ${rel} names ${open}`,
    );
  }
}

// holdScripts holds every quickstart script to its example's README, and the
// machinery of the scripts of one language to each other. It returns the names of
// the scripts it held, or a sentence saying why it held none.
function holdScripts() {
  const wanted = new Map(); // script file name -> { name, namedBy }
  const examplesDir = path.join(opts.docsRoot, EXAMPLES);
  const examples = fs
    .readdirSync(examplesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(examplesDir, e.name, "README.md")))
    .map((e) => e.name)
    .sort();
  for (const example of examples) {
    for (const block of oneCommandSource(example)) {
      for (const l of block.lines) {
        const one = oneCommandOf(l.text);
        if (one && !wanted.has(one.script)) wanted.set(one.script, { name: one.name, namedBy: `${EXAMPLES}/${example}/README.md:${l.line}` });
      }
    }
  }
  const folder = path.relative(opts.docsRoot, opts.scripts) || ".";
  if (!fs.statSync(opts.scripts, { throwIfNoEntry: false })?.isDirectory()) {
    return { held: [], note: `no quickstart script was held, as ${folder} does not exist` };
  }
  for (const file of fs.readdirSync(opts.scripts).sort()) {
    const m = file.match(/^(.+)\.(sh|ps1)$/);
    if (m && examples.includes(m[1]) && !wanted.has(file)) wanted.set(file, { name: m[1] });
  }
  const held = [];
  const tails = new Map(); // extension -> the first script of it held, with its machinery
  for (const file of [...wanted.keys()].sort()) {
    const { name, namedBy } = wanted.get(file);
    const scriptPath = path.join(opts.scripts, file);
    const scriptName = path.join(folder, file);
    if (!fs.existsSync(scriptPath)) {
      failures.push(`${namedBy}: runs the script ${file}, which ${folder} does not hold`);
      continue;
    }
    const ext = file.endsWith(".sh") ? "sh" : "ps1";
    const script = parseScript(scriptPath, ext, scriptName);
    held.push(file);
    holdScript(name, script, scriptName);
    if (script.tail === undefined) continue;
    const first = tails.get(ext);
    if (!first) {
      tails.set(ext, { scriptName, script });
      continue;
    }
    const a = first.script.tail;
    const b = script.tail;
    const k = [...Array(Math.max(a.length, b.length)).keys()].find((i) => a[i] !== b[i]);
    if (k !== undefined) {
      failures.push(
        `${scriptName}:${script.tailLine + k}: the machinery differs from ${first.scriptName}'s at its line ${first.script.tailLine + k}: ` +
          (b[k] === undefined ? "it ends there" : a[k] === undefined ? `it has "${b[k]}" after the end of the other` : `"${b[k]}" against "${a[k]}"`),
      );
    }
  }
  if (held.length === 0) return { held, note: `no quickstart script was held: ${folder} holds none the examples' pages run` };
  return { held, note: `${held.length} quickstart script(s) held to their examples' pages, the machinery of each language identical (${held.join(", ")})` };
}

checkStrict(opts.page);
let otherPages = 0;
let scripts;
if (!opts.only) {
  for (const file of pages(opts.docsRoot)) {
    if (path.resolve(file) === opts.page) continue;
    otherPages++;
    checkLight(file);
  }
  scripts = holdScripts();
}

const scope = opts.only ? nameOf(opts.page) : `${nameOf(opts.page)} and ${otherPages} other page(s)`;
if (failures.length > 0) {
  for (const f of failures) process.stdout.write(`${f}\n`);
  process.stdout.write(
    `check-getting-started-commands: ${failures.length} line(s) in ${scope}${scripts ? ` and the quickstart scripts` : ""} differ from the pages they come from or from what scaffold prints\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `check-getting-started-commands: ${scope}: ${checkedBlocks} command block(s), ${commands} command(s), ${scaffoldLines} scaffold line(s), each as the page it comes from gives it and as scaffold prints it${scripts ? `; ${scripts.note}` : ""}\n`,
);
