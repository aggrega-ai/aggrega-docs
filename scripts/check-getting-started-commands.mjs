#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Cognitio S.r.l.
//
// check-getting-started-commands.mjs — hold the commands of the Getting started
// page to the pages they come from, so the page cannot drift from the examples.
//
// The page walks runnable examples, and every command it shows is one the
// example's own page gives. This check reads every command block of the page — a
// fenced block marked sh, bash, shell, zsh, powershell or pwsh — and holds each one
// to its source:
//
//   - a line `aggrega scaffold --example <name> && cd <name>` names the example the
//     blocks after it come from: <name> must be a directory under
//     language-reference/examples/ holding a README.md, and from that line on each
//     block's source is that README;
//   - before any such line, the source is install.md.
//
// A block holds when its lines, blank lines left out, appear in its source as a
// run of consecutive lines of one command block there, in the same order. The
// scaffold line itself is held to the rule above instead. A block that does not
// hold fails the check, naming the page's line and the command: the first command
// its source's command blocks do not carry, or, where each one is carried, the
// first one that does not follow the one before it there.
//
// Usage:
//   node scripts/check-getting-started-commands.mjs [--page PATH] [--docs-root DIR]
//
//   --page PATH      the page to check (default: getting-started.md under the docs root)
//   --docs-root DIR  the documentation root the sources are read from (default: the
//                    directory above this script)
//   --fenced-blocks FILE
//                    check nothing: print every fenced block FILE holds, as
//                    "block <line> <info>" and then "| <line as written>" for each
//                    line, for scripts/check-fenced-block-parity.sh to compare
//
// Exit status: 0 every block holds; 1 a block does not; 2 the check could not run
// (an argument it does not take, or a page or source it cannot read).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMAND_INFO = new Set(["sh", "bash", "shell", "zsh", "powershell", "pwsh"]);
const SCAFFOLD = /^aggrega scaffold --example ([a-z0-9][a-z0-9-]*) && cd ([a-z0-9][a-z0-9-]*)$/;
const EXAMPLES = "language-reference/examples";

function usage(message) {
  if (message) process.stderr.write(`check-getting-started-commands: ${message}\n`);
  process.stderr.write("usage: check-getting-started-commands.mjs [--page PATH] [--docs-root DIR]\n");
  process.exit(2);
}

function parseArgs(argv) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const opts = { docsRoot: path.resolve(here, ".."), page: undefined };
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

// commandBlocks returns every fenced command block of a Markdown page, each as the
// line number of its first line and its lines, blank lines left out.
function commandBlocks(markdown) {
  return fencedBlocks(markdown)
    .filter((block) => COMMAND_INFO.has(block.info))
    .map((block) => ({
      line: block.line,
      lines: block.lines
        .filter((l) => l.text.trim() !== "")
        .map((l) => ({ text: l.text.trimEnd(), line: l.line })),
    }));
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
const fromRoot = path.relative(opts.docsRoot, opts.page);
const pageName = fromRoot && !fromRoot.startsWith("..") ? fromRoot : opts.page;
const sources = new Map();
function source(rel) {
  if (!sources.has(rel)) sources.set(rel, commandBlocks(read(path.join(opts.docsRoot, rel))));
  return sources.get(rel);
}

let sourceRel = "install.md";
const failures = [];
let checked = 0;
let commands = 0;

// check holds the commands of one block that sit between scaffold lines to the
// source in force for them.
function check(lines) {
  if (lines.length === 0) return;
  commands += lines.length;
  // After a scaffold line naming no example there is no source to hold the
  // commands to; that line's own failure already names the cause.
  if (sourceRel === undefined) return;
  const srcBlocks = source(sourceRel);
  if (holds(lines.map((l) => l.text), srcBlocks)) return;
  const { line, why } = firstDiffering(lines, srcBlocks);
  failures.push(`${pageName}:${line.line}: the command "${line.text}" differs from ${sourceRel}: it ${why}`);
}

for (const block of commandBlocks(read(opts.page))) {
  checked++;
  let lines = [];
  for (const l of block.lines) {
    const scaffold = l.text.match(SCAFFOLD);
    if (!scaffold) {
      lines.push(l);
      continue;
    }
    check(lines);
    lines = [];
    commands++;
    const [, name, dir] = scaffold;
    const readme = `${EXAMPLES}/${name}/README.md`;
    sourceRel = readme;
    if (!fs.existsSync(path.join(opts.docsRoot, readme))) {
      failures.push(`${pageName}:${l.line}: the command "${l.text}" names no example: ${readme} does not exist`);
      sourceRel = undefined;
    } else if (dir !== name) {
      failures.push(`${pageName}:${l.line}: the command "${l.text}" changes into ${dir}, but the example is written into ${name}`);
    }
  }
  check(lines);
}

if (failures.length > 0) {
  for (const f of failures) process.stdout.write(`${f}\n`);
  process.stdout.write(
    `check-getting-started-commands: ${failures.length} command(s) in ${checked} command block(s) differ from the pages they come from\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `check-getting-started-commands: ${checked} command block(s), ${commands} command(s), each as the page it comes from gives it\n`,
);
